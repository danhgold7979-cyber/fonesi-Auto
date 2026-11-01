// SOURCE ONLY parent/outer-Job admission. Compile with the unchanged IsolatedAdbServer partial.
// A Job QUERY handle must never survive admission: even it delays last-handle kill.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Fonesi.Development.Server
{
    public static partial class IsolatedAdbServer
    {
        [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenJobObject(uint access, bool inherit, string name);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr process, out ulong creation, out ulong exit, out ulong kernel, out ulong user);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref uint size);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int infoClass, out JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, uint length, IntPtr returnedLength);

        public sealed class ParentAdmission : IDisposable
        {
            readonly object gate = new object();
            readonly SafeWaitHandle process;
            bool disposed;
            internal ParentAdmission(SafeWaitHandle process) { this.process = process; }
            public bool IsAlive {
                get { lock (gate) { return !disposed && WaitForSingleObject(process.DangerousGetHandle(), 0) == WAIT_TIMEOUT; } }
            }
            // Bound managed delegate: no PowerShell runspace is required on reader workers.
            public Func<bool> Liveness() { return delegate { return IsAlive; }; }
            // A finite poll for a dedicated reader liveness watcher, never reopen-by-PID.
            public bool WaitForDeath(int milliseconds)
            {
                if (milliseconds < 0 || milliseconds > 1000) throw new ArgumentException("ADMISSION_REJECTED");
                lock (gate) {
                    if (disposed) return true;
                    uint result = WaitForSingleObject(process.DangerousGetHandle(), (uint)milliseconds);
                    if (result != WAIT_OBJECT_0 && result != WAIT_TIMEOUT) throw new IOException("ADMISSION_REJECTED");
                    return result == WAIT_OBJECT_0;
                }
            }
            public void Dispose() { lock (gate) { if (!disposed) { disposed = true; process.Dispose(); } } }
        }
        static string ParentImageDigest(string path)
        {
            if (String.IsNullOrEmpty(path) || Path.GetFullPath(path) != path) throw new IOException("ADMISSION_REJECTED");
            PlainDirectory(Path.GetDirectoryName(path));
            if ((File.GetAttributes(path) & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) throw new IOException("ADMISSION_REJECTED");
            using (FileStream file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                FILE_INFO before; Require(GetFileInformationByHandle(file.SafeFileHandle, out before));
                if ((before.Attributes & 0x410) != 0 || before.Links != 1 || file.Length < 1 || file.Length > 536870912) throw new IOException("ADMISSION_REJECTED");
                string digest;
                using (System.Security.Cryptography.SHA256 hash = System.Security.Cryptography.SHA256.Create()) digest = BitConverter.ToString(hash.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
                FILE_INFO after; Require(GetFileInformationByHandle(file.SafeFileHandle, out after));
                if (after.Attributes != before.Attributes || after.Links != 1 || after.Volume != before.Volume || after.IndexHigh != before.IndexHigh || after.IndexLow != before.IndexLow || after.SizeHigh != before.SizeHigh || after.SizeLow != before.SizeLow || after.Write.dwHighDateTime != before.Write.dwHighDateTime || after.Write.dwLowDateTime != before.Write.dwLowDateTime) throw new IOException("ADMISSION_REJECTED");
                return digest;
            }
        }
        // Inputs come only from the verified immutable host-parent receipt, not a request frame.
        public static ParentAdmission OpenParentAdmission(uint parentPid, string creationHex, string imagePath, string imageSha256, string jobName)
        {
            if (parentPid == 0 || creationHex == null || !System.Text.RegularExpressions.Regex.IsMatch(creationHex, "\\A[0-9a-f]{16}\\z") ||
                imageSha256 == null || !System.Text.RegularExpressions.Regex.IsMatch(imageSha256, "\\A[0-9a-f]{64}\\z") ||
                jobName == null || !System.Text.RegularExpressions.Regex.IsMatch(jobName, "\\ALocal\\\\Fonesi-Auto-host-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\z")) throw new IOException("ADMISSION_REJECTED");
            SafeWaitHandle parent = null;
            IntPtr job = IntPtr.Zero;
            try {
                // SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, no terminate/VM/duplicate rights.
                IntPtr raw = OpenProcess(0x00101000, false, parentPid); Require(raw != IntPtr.Zero);
                parent = new SafeWaitHandle(raw, true);
                ulong creation, exit, kernel, user; Require(GetProcessTimes(raw, out creation, out exit, out kernel, out user));
                if (creation.ToString("x16", System.Globalization.CultureInfo.InvariantCulture) != creationHex || WaitForSingleObject(raw, 0) != WAIT_TIMEOUT) throw new IOException("ADMISSION_REJECTED");
                StringBuilder image = new StringBuilder(32768); uint size = (uint)image.Capacity;
                Require(QueryFullProcessImageName(raw, 0, image, ref size));
                if (!String.Equals(image.ToString(), imagePath, StringComparison.OrdinalIgnoreCase) || ParentImageDigest(imagePath) != imageSha256) throw new IOException("ADMISSION_REJECTED");
                job = OpenJobObject(0x0004, false, jobName); Require(job != IntPtr.Zero); // JOB_OBJECT_QUERY only.
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
                Require(QueryInformationJobObject(job, JobObjectExtendedLimitInformation, out limits, (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION)), IntPtr.Zero));
                if (limits.BasicLimitInformation.LimitFlags != KILL_ON_JOB_CLOSE || !AssignedToJob(raw, job)) throw new IOException("ADMISSION_REJECTED");
                using (Process self = Process.GetCurrentProcess()) {
                    if (self.Id == parentPid || !AssignedToJob(self.Handle, job)) throw new IOException("ADMISSION_REJECTED");
                }
                if (WaitForSingleObject(raw, 0) != WAIT_TIMEOUT) throw new IOException("ADMISSION_REJECTED");
                // Close BEFORE returning readiness/authority; never store job in ParentAdmission.
                Close(ref job);
                ParentAdmission admitted = new ParentAdmission(parent); parent = null; return admitted;
            } catch { throw new IOException("ADMISSION_REJECTED"); }
            finally { Close(ref job); if (parent != null) parent.Dispose(); }
        }
    }
}
