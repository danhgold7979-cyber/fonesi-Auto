// Persistence launcher only. Derived from frozen HostProbeNative.cs; see README.md.
// Start suspended, assign to our non-breakaway kill-on-close job, then resume.
// This avoids the child-creation race of Process.Start followed by tree discovery.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace Fonesi.Desktop.Persistence
{
    public sealed class PersistenceProcessResult
    {
        public string Status = "LAUNCH_FAILED";
        public int? ExitCode;
        public string Stdout = "";
        public string Stderr = "";
        public bool StdoutTruncated;
        public bool StderrTruncated;
        public long DurationMs;
        public bool CleanupComplete = true;
        public string Reason;
    }

    public static class PersistenceProcess
    {
        const uint WAIT_OBJECT_0 = 0;
        const uint WAIT_TIMEOUT = 258;
        const uint INFINITE = 0xffffffff;
        const uint CREATE_SUSPENDED = 4;
        const uint CREATE_NO_WINDOW = 0x08000000;
        const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
        const uint STARTF_USESTDHANDLES = 0x100;
        const uint KILL_ON_JOB_CLOSE = 0x2000;
        const int JobObjectExtendedLimitInformation = 9;
        const int JobObjectBasicAccountingInformation = 1;
        static readonly IntPtr InvalidHandle = new IntPtr(-1);

        [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES
        { public int nLength; public IntPtr lpSecurityDescriptor; public int bInheritHandle; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO
        {
            public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
            public uint dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
            public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
        }
        [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX
        { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
        [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION
        { public IntPtr hProcess, hThread; public uint dwProcessId, dwThreadId; }
        [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
            public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
            public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS
        { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
        [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
        }
        [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
        {
            public long TotalUserTime, TotalKernelTime, ThisPeriodTotalUserTime, ThisPeriodTotalKernelTime;
            public uint TotalPageFaultCount, TotalProcesses, ActiveProcesses, TotalTerminatedProcesses;
        }

        [DllImport("kernel32.dll", SetLastError = true)] static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SECURITY_ATTRIBUTES attributes, uint size);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateFile(string name, uint access, uint share, ref SECURITY_ATTRIBUTES security, uint creation, uint flags, IntPtr template);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, uint length);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int infoClass, out JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info, uint length, IntPtr returnedLength);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint code);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateDirectory(string path, IntPtr securityAttributes);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
        [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string applicationName, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string directory, ref STARTUPINFOEX startup, out PROCESS_INFORMATION process);

        // CommandLineToArgvW / Microsoft C runtime quoting, never a shell expression.
        public static string QuoteArgument(string value)
        {
            if (value == null) value = "";
            if (value.IndexOf('\0') >= 0) throw new ArgumentException("NUL_ARGUMENT");
            StringBuilder result = new StringBuilder("\"");
            int slashes = 0;
            foreach (char c in value)
            {
                if (c == '\\') { slashes++; continue; }
                if (c == '"') { result.Append('\\', slashes * 2 + 1); result.Append('"'); }
                else { result.Append('\\', slashes); result.Append(c); }
                slashes = 0;
            }
            result.Append('\\', slashes * 2); result.Append('"');
            return result.ToString();
        }

        sealed class Drain
        {
            readonly StreamReader reader;
            readonly StringBuilder captured = new StringBuilder();
            readonly int limit;
            readonly ManualResetEvent completion;
            readonly object completionGate = new object();
            bool finished, abandoned;
            public bool Truncated;
            public bool Failed;
            public bool Started;
            public Drain(SafeFileHandle handle, int maximum)
            {
                limit = maximum;
                reader = new StreamReader(new FileStream(handle, FileAccess.Read), new UTF8Encoding(false, false), true, 4096);
                try { completion = new ManualResetEvent(false); }
                catch { reader.Dispose(); throw; }
            }
            public void Start()
            {
                // A new managed Thread retains a native thread handle until its
                // finalizer runs even after Join(). Reuse pool workers instead;
                // each per-probe completion handle has explicit ownership.
                if (!ThreadPool.QueueUserWorkItem(delegate(object state) { Read(); })) throw new InvalidOperationException("DRAIN_QUEUE_FAILED");
                Started = true;
            }
            public bool Join(int milliseconds)
            {
                if (!Started) { DisposeReader(); completion.Dispose(); return true; }
                completion.WaitOne(milliseconds);
                lock (completionGate)
                {
                    if (finished) { completion.Dispose(); return true; }
                    // The cleanup deadline remains bounded. If a failed OS read
                    // ever outlives it, its callback owns final event disposal.
                    abandoned = true;
                    return false;
                }
            }
            void Read()
            {
                try
                {
                    char[] block = new char[4096]; int count;
                    while ((count = reader.Read(block, 0, block.Length)) != 0)
                    {
                        lock (captured)
                        {
                            int keep = Math.Min(count, limit - captured.Length);
                            if (keep > 0) captured.Append(block, 0, keep);
                            if (keep < count) Truncated = true;
                        }
                    }
                }
                catch (IOException) { Failed = true; }
                catch (ObjectDisposedException) { Failed = true; }
                finally
                {
                    try { DisposeReader(); }
                    finally
                    {
                        lock (completionGate)
                        {
                            finished = true;
                            completion.Set();
                            if (abandoned) completion.Dispose();
                        }
                    }
                }
            }
            void DisposeReader()
            {
                try { reader.Dispose(); }
                catch (IOException) { Failed = true; }
                catch (ObjectDisposedException) { Failed = true; }
            }
            public string Snapshot() { lock (captured) { return captured.ToString(); } }
        }

        static void Close(ref IntPtr handle)
        { if (handle != IntPtr.Zero && handle != InvalidHandle) CloseHandle(handle); handle = IntPtr.Zero; }
        static Drain TakeDrain(ref IntPtr rawHandle, int maximum)
        {
            SafeFileHandle owned = new SafeFileHandle(rawHandle, true);
            rawHandle = IntPtr.Zero; // Transfer exactly once, even if a constructor throws.
            try { return new Drain(owned, maximum); }
            catch { owned.Dispose(); throw; }
        }
        static void Require(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
        static bool JobEmpty(IntPtr job)
        {
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info;
            return QueryInformationJobObject(job, JobObjectBasicAccountingInformation, out info, (uint)Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)), IntPtr.Zero) && info.ActiveProcesses == 0;
        }

        public static void ReserveDirectory(string directory) { Require(CreateDirectory(directory, IntPtr.Zero)); }

        // BEGIN RETAINED HOST OPT-IN
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr process, out ulong creation, out ulong exit, out ulong kernel, out ulong user);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref uint size);
        public sealed class HostJobContext
        {
            internal readonly string directory, launchId, storeId, ownerToken, readyHash, imageHash, jobName;
            public HostJobContext(string launchDirectory, string launchId, string storeId, string ownerToken, string readySha256, string parentImageSha256, string jobNonce)
            {
                if (!HostUuid(launchId) || !HostUuid(storeId) || !HostUuid(ownerToken) || !HostUuid(jobNonce) || !HostHash(readySha256) || !HostHash(parentImageSha256)) throw new ArgumentException("HOST_CONTEXT_REJECTED");
                HostDirectory(launchDirectory);
                if (Path.GetFileName(launchDirectory) != "launch-" + launchId) throw new ArgumentException("HOST_CONTEXT_REJECTED");
                directory = launchDirectory; this.launchId = launchId; this.storeId = storeId; this.ownerToken = ownerToken;
                readyHash = readySha256; imageHash = parentImageSha256; jobName = "Local\\Fonesi-Auto-host-" + jobNonce;
            }
        }
        static bool HostUuid(string value) { Guid parsed; return value != null && Guid.TryParseExact(value, "D", out parsed) && parsed.ToString() == value; }
        static bool HostHash(string value) { if (value == null || value.Length != 64) return false; foreach (char c in value) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false; return true; }
        static void HostDirectory(string value)
        {
            if (String.IsNullOrEmpty(value) || Path.GetFullPath(value) != value) throw new IOException("HOST_DIRECTORY_REJECTED");
            DirectoryInfo current = new DirectoryInfo(value);
            for (int depth = 0; current != null; current = current.Parent, depth++)
                if (depth > 32 || !current.Exists || (current.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("HOST_DIRECTORY_REJECTED");
        }
        static string HostDigest(string path)
        {
            HostDirectory(Path.GetDirectoryName(path));
            if (Path.GetFullPath(path) != path || (File.GetAttributes(path) & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) throw new IOException("HOST_IMAGE_REJECTED");
            using (FileStream file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                if (file.Length < 1 || file.Length > 536870912) throw new IOException("HOST_IMAGE_REJECTED");
                using (System.Security.Cryptography.SHA256 hash = System.Security.Cryptography.SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
            }
        }
        static string HostJsonString(string value)
        {
            StringBuilder output = new StringBuilder("\"");
            foreach (char c in value) {
                if (c == '"' || c == '\\') output.Append('\\').Append(c);
                else if (c < 32) output.Append("\\u").Append(((int)c).ToString("x4", System.Globalization.CultureInfo.InvariantCulture));
                else output.Append(c);
            }
            return output.Append('"').ToString();
        }
        static string HostMarker(HostJobContext context)
        {
            HostDirectory(context.directory);
            string path = Path.Combine(context.directory, ".owner");
            if ((File.GetAttributes(path) & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) throw new IOException("HOST_OWNER_REJECTED");
            using (FileStream file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                if (file.Length != 36) throw new IOException("HOST_OWNER_REJECTED");
                byte[] bytes = new byte[36]; int offset = 0;
                while (offset < bytes.Length) { int count = file.Read(bytes, offset, bytes.Length - offset); if (count == 0) throw new IOException("HOST_OWNER_REJECTED"); offset += count; }
                string marker = Encoding.ASCII.GetString(bytes); if (!HostUuid(marker) || file.ReadByte() != -1) throw new IOException("HOST_OWNER_REJECTED"); return marker;
            }
        }
        static void WriteHostParent(HostJobContext context, string executable, PROCESS_INFORMATION process, string marker)
        {
            if (HostMarker(context) != marker || HostDigest(executable) != context.imageHash || process.dwProcessId == 0) throw new IOException("HOST_CONTEXT_CHANGED");
            ulong creation, exit, kernel, user; Require(GetProcessTimes(process.hProcess, out creation, out exit, out kernel, out user));
            StringBuilder image = new StringBuilder(32768); uint size = (uint)image.Capacity;
            Require(QueryFullProcessImageName(process.hProcess, 0, image, ref size));
            if (!String.Equals(image.ToString(), executable, StringComparison.OrdinalIgnoreCase)) throw new IOException("HOST_IMAGE_REJECTED");
            string json = "{\"version\":1,\"launchId\":" + HostJsonString(context.launchId) + ",\"storeId\":" + HostJsonString(context.storeId) +
                ",\"ownerToken\":" + HostJsonString(context.ownerToken) + ",\"readySha256\":" + HostJsonString(context.readyHash) + ",\"jobName\":" + HostJsonString(context.jobName) +
                ",\"parentPid\":" + process.dwProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"parentCreationFileTime\":" + HostJsonString(creation.ToString("x16", System.Globalization.CultureInfo.InvariantCulture)) +
                ",\"parentImagePath\":" + HostJsonString(executable) + ",\"parentImageSha256\":" + HostJsonString(context.imageHash) + "}";
            byte[] bytes = new UTF8Encoding(false, true).GetBytes(json); if (bytes.Length > 4096) throw new IOException("HOST_CONTEXT_LIMIT");
            string path = Path.Combine(context.directory, "host-parent.json");
            using (FileStream file = new FileStream(path, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None)) {
                file.Write(bytes, 0, bytes.Length); file.Flush(true); file.Position = 0;
                for (int i = 0; i < bytes.Length; i++) if (file.ReadByte() != bytes[i]) throw new IOException("HOST_CONTEXT_READBACK");
                if (file.ReadByte() != -1) throw new IOException("HOST_CONTEXT_READBACK");
            }
            if (HostMarker(context) != marker) throw new IOException("HOST_CONTEXT_CHANGED");
        }
        public static PersistenceProcessResult RunInteractiveWithHostJob(string executable, string[] arguments, HostJobContext context)
        {
            if (context == null) throw new ArgumentException("HOST_CONTEXT_REJECTED");
            return RunCoreNamed(executable, arguments, INFINITE, 10000, 32768, context);
        }
        // END RETAINED HOST OPT-IN

        // Fixed caller owns executable hash, arguments, environment and persistent lease.
        // Interactive mode deliberately has no application lifetime deadline.
        public static PersistenceProcessResult RunBounded(string executable, string[] arguments, int timeoutMilliseconds)
        {
            if (timeoutMilliseconds != 30000 && timeoutMilliseconds != 120000)
                throw new ArgumentException("INVALID_DEADLINE");
            return RunCore(executable, arguments, (uint)timeoutMilliseconds, 10000, 32768);
        }

        public static PersistenceProcessResult RunInteractive(string executable, string[] arguments)
        { return RunCore(executable, arguments, INFINITE, 10000, 32768); }

        static PersistenceProcessResult RunCore(string executable, string[] arguments, uint timeoutMilliseconds, int cleanupMilliseconds, int maxCharacters)
        { return RunCoreNamed(executable, arguments, timeoutMilliseconds, cleanupMilliseconds, maxCharacters, null); }

        static PersistenceProcessResult RunCoreNamed(string executable, string[] arguments, uint timeoutMilliseconds, int cleanupMilliseconds, int maxCharacters, HostJobContext host)
        {
            PersistenceProcessResult result = new PersistenceProcessResult(); Stopwatch elapsed = Stopwatch.StartNew();
            IntPtr outputRead = IntPtr.Zero, outputWrite = IntPtr.Zero, errorRead = IntPtr.Zero, errorWrite = IntPtr.Zero;
            IntPtr input = IntPtr.Zero, job = IntPtr.Zero, attributes = IntPtr.Zero, handles = IntPtr.Zero;
            bool attributeInitialized = false, assigned = false, started = false;
            PROCESS_INFORMATION process = new PROCESS_INFORMATION(); Drain stdout = null, stderr = null;
            try
            {
                if ((timeoutMilliseconds != 30000 && timeoutMilliseconds != 120000 && timeoutMilliseconds != INFINITE) || cleanupMilliseconds != 10000 || maxCharacters != 32768) throw new ArgumentException("INVALID_LIMIT");
                if (!Path.IsPathRooted(executable) || !String.Equals(Path.GetExtension(executable), ".exe", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("DIRECT_EXECUTABLE_REQUIRED");
                string hostMarker = host == null ? null : HostMarker(host);
                if (host != null && HostDigest(executable) != host.imageHash) throw new IOException("HOST_IMAGE_REJECTED");
                SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES(); security.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); security.bInheritHandle = 1;
                Require(CreatePipe(out outputRead, out outputWrite, ref security, 0));
                Require(CreatePipe(out errorRead, out errorWrite, ref security, 0));
                Require(SetHandleInformation(outputRead, 1, 0)); Require(SetHandleInformation(errorRead, 1, 0));
                input = CreateFile("NUL", 0x80000000, 3, ref security, 3, 0, IntPtr.Zero);
                Require(input != InvalidHandle);
                job = CreateJobObject(IntPtr.Zero, host == null ? null : host.jobName);
                int jobError = Marshal.GetLastWin32Error(); Require(job != IntPtr.Zero);
                if (host != null && jobError == 183) { Close(ref job); throw new IOException("HOST_JOB_EXISTS"); }
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                limits.BasicLimitInformation.LimitFlags = KILL_ON_JOB_CLOSE;
                Require(SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref limits, (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))));
                IntPtr size = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
                attributes = Marshal.AllocHGlobal(size);
                Require(InitializeProcThreadAttributeList(attributes, 1, 0, ref size)); attributeInitialized = true;
                handles = Marshal.AllocHGlobal(IntPtr.Size * 3);
                Marshal.WriteIntPtr(handles, 0, input); Marshal.WriteIntPtr(handles, IntPtr.Size, outputWrite); Marshal.WriteIntPtr(handles, IntPtr.Size * 2, errorWrite);
                Require(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x00020002), handles, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero));
                STARTUPINFOEX startup = new STARTUPINFOEX(); startup.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
                startup.StartupInfo.hStdInput = input; startup.StartupInfo.hStdOutput = outputWrite; startup.StartupInfo.hStdError = errorWrite;
                startup.lpAttributeList = attributes;
                StringBuilder command = new StringBuilder(QuoteArgument(executable));
                foreach (string argument in arguments ?? new string[0]) command.Append(" ").Append(QuoteArgument(argument));
                Require(CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true, CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT, IntPtr.Zero, Path.GetDirectoryName(executable), ref startup, out process));
                started = true;
                Require(AssignProcessToJobObject(job, process.hProcess)); assigned = true;
                if (host != null) WriteHostParent(host, executable, process, hostMarker);
                // Close the parent's write ends so EOF is delivered when owned children exit.
                Close(ref outputWrite); Close(ref errorWrite); Close(ref input);
                stdout = TakeDrain(ref outputRead, maxCharacters);
                stderr = TakeDrain(ref errorRead, maxCharacters);
                stdout.Start(); stderr.Start();
                Require(ResumeThread(process.hThread) != 0xffffffff);
                Close(ref process.hThread);
                uint wait = WaitForSingleObject(process.hProcess, timeoutMilliseconds);
                if (wait == WAIT_TIMEOUT) { result.Status = "TIMEOUT"; result.Reason = "PROCESS_DEADLINE_EXCEEDED"; }
                else
                {
                    Require(wait == WAIT_OBJECT_0);
                    uint exit; Require(GetExitCodeProcess(process.hProcess, out exit));
                    result.ExitCode = unchecked((int)exit); result.Status = exit == 0 ? "SUCCESS" : "NONZERO_EXIT";
                    if (exit != 0) result.Reason = "PROCESS_EXIT_NONZERO";
                }
            }
            catch (Win32Exception error)
            { result.Status = error.NativeErrorCode == 5 ? "ACCESS_DENIED" : "LAUNCH_FAILED"; result.Reason = "WIN32_" + error.NativeErrorCode; }
            catch (Exception error)
            { result.Status = "LAUNCH_FAILED"; result.Reason = "LAUNCH_" + error.GetType().Name; }
            finally
            {
                Stopwatch cleanup = Stopwatch.StartNew();
                // Descendants are always retired, including when their root exits first.
                if (started)
                {
                    if (assigned) TerminateJobObject(job, 1460);
                    else TerminateProcess(process.hProcess, 1460); // Still suspended; no descendants possible.
                    while (cleanup.ElapsedMilliseconds < cleanupMilliseconds)
                    {
                        bool exited = WaitForSingleObject(process.hProcess, 0) == WAIT_OBJECT_0;
                        if (exited && (!assigned || JobEmpty(job))) break;
                        Thread.Sleep(10);
                    }
                    result.CleanupComplete = WaitForSingleObject(process.hProcess, 0) == WAIT_OBJECT_0 && (!assigned || JobEmpty(job));
                }
                Close(ref job); // Kill-on-close is the second owned-process safety net.
                Close(ref outputWrite); Close(ref errorWrite); Close(ref input);
                Close(ref process.hThread); Close(ref process.hProcess);
                Close(ref outputRead); Close(ref errorRead);
                if (stdout != null)
                {
                    bool joined = stdout.Join(Math.Max(0, cleanupMilliseconds - (int)cleanup.ElapsedMilliseconds));
                    result.CleanupComplete &= joined; result.Stdout = stdout.Snapshot(); result.StdoutTruncated = stdout.Truncated;
                    if (joined && stdout.Failed) { result.Status = "CAPTURE_FAILED"; result.Reason = "STDOUT_READ_FAILED"; }
                }
                if (stderr != null)
                {
                    bool joined = stderr.Join(Math.Max(0, cleanupMilliseconds - (int)cleanup.ElapsedMilliseconds));
                    result.CleanupComplete &= joined; result.Stderr = stderr.Snapshot(); result.StderrTruncated = stderr.Truncated;
                    if (joined && stderr.Failed) { result.Status = "CAPTURE_FAILED"; result.Reason = "STDERR_READ_FAILED"; }
                }
                if (!result.CleanupComplete) { result.Status = "CLEANUP_FAILED"; result.Reason = "OWNED_PROCESS_OR_DRAIN_CLEANUP_UNCONFIRMED"; }
                if (attributeInitialized) DeleteProcThreadAttributeList(attributes);
                if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
                if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
                if (result.Status == "SUCCESS" && String.IsNullOrWhiteSpace(result.Stdout) && String.IsNullOrWhiteSpace(result.Stderr)) result.Status = "EMPTY_OUTPUT";
                result.DurationMs = elapsed.ElapsedMilliseconds;
            }
            return result;
        }
    }
}
