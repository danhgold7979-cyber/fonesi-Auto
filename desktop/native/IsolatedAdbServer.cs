// Hosted P2-02 development only. Process custody/capture derived from PersistenceProcess.cs.
// Start suspended, assign to our non-breakaway kill-on-close job, then resume.
// This avoids the child-creation race of Process.Start followed by tree discovery.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Net;
using System.Net.Sockets;
using System.Collections.Generic;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;

namespace Fonesi.Development.Server
{
    public sealed class ServerProcessResult
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
        public string Phase = "ADMISSION";
        public bool Launched, ListenerOwned, HealthObserved, EndpointReleased;
        public bool ForcedStop, DeadlineObserved, PrematureDeathObserved;
    }

    public static partial class IsolatedAdbServer
    {
        const uint WAIT_OBJECT_0 = 0;
        const uint WAIT_TIMEOUT = 258;
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

        static ServerProcessResult RunCore(string executable, int port, string scenario, string runRoot)
        {
            const int cleanupMilliseconds = 10000, maxCharacters = 32768;
            ServerProcessResult result = new ServerProcessResult(); Stopwatch elapsed = Stopwatch.StartNew();
            IntPtr environment = IntPtr.Zero;
            IntPtr outputRead = IntPtr.Zero, outputWrite = IntPtr.Zero, errorRead = IntPtr.Zero, errorWrite = IntPtr.Zero;
            IntPtr input = IntPtr.Zero, job = IntPtr.Zero, attributes = IntPtr.Zero, handles = IntPtr.Zero;
            bool attributeInitialized = false, assigned = false, started = false;
            PROCESS_INFORMATION process = new PROCESS_INFORMATION(); Drain stdout = null, stderr = null;
            try
            {
                if (ListenerOwner(port) != 0) { result.Status = "ENDPOINT_REFUSED"; result.Reason = "ENDPOINT_OCCUPIED"; return result; }
                string[] arguments = new string[] { "-L", "tcp:127.0.0.1:" + port, "server", "nodaemon" };
                environment = EnvironmentBlock(runRoot);
                if (!Path.IsPathRooted(executable) || !String.Equals(Path.GetExtension(executable), ".exe", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("DIRECT_EXECUTABLE_REQUIRED");
                result.Phase = "LAUNCH";
                SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES(); security.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); security.bInheritHandle = 1;
                Require(CreatePipe(out outputRead, out outputWrite, ref security, 0));
                Require(CreatePipe(out errorRead, out errorWrite, ref security, 0));
                Require(SetHandleInformation(outputRead, 1, 0)); Require(SetHandleInformation(errorRead, 1, 0));
                input = CreateFile("NUL", 0x80000000, 3, ref security, 3, 0, IntPtr.Zero);
                Require(input != InvalidHandle);
                job = CreateJobObject(IntPtr.Zero, null); Require(job != IntPtr.Zero);
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
                Require(CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true, CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT | 0x400, environment, Path.GetDirectoryName(executable), ref startup, out process));
                started = true;
                Require(AssignProcessToJobObject(job, process.hProcess)); assigned = true;
                // Close the parent's write ends so EOF is delivered when owned children exit.
                Close(ref outputWrite); Close(ref errorWrite); Close(ref input);
                stdout = TakeDrain(ref outputRead, maxCharacters);
                stderr = TakeDrain(ref errorRead, maxCharacters);
                stdout.Start(); stderr.Start();
                Require(ResumeThread(process.hThread) != 0xffffffff);
                Close(ref process.hThread);
                result.Launched = true; result.Phase = "LISTENER";
                while (elapsed.ElapsedMilliseconds < 30000)
                {
                    if (WaitForSingleObject(process.hProcess, 0) != WAIT_TIMEOUT) throw new InvalidOperationException("EARLY_EXIT");
                    uint listener = ListenerOwner(port);
                    if (listener != 0)
                    {
                        if (listener != process.dwProcessId) throw new InvalidOperationException("FOREIGN_LISTENER");
                        Require(AssignedToJob(process.hProcess, job));
                        result.ListenerOwned = true;
                        result.Phase = "HEALTH";
                        result.HealthObserved = Health(port, process.hProcess, process.dwProcessId);
                        break;
                    }
                    Thread.Sleep(10);
                }
                if (!result.HealthObserved) throw new InvalidOperationException("HEALTH_DEADLINE");
                if (scenario == "timeout")
                {
                    result.Phase = "DEADLINE";
                    while (elapsed.ElapsedMilliseconds < 30000)
                    {
                        if (WaitForSingleObject(process.hProcess, 0) != WAIT_TIMEOUT || ListenerOwner(port) != process.dwProcessId)
                            throw new InvalidOperationException("CUSTODY_CHANGED");
                        Thread.Sleep(10);
                    }
                    result.DeadlineObserved = true;
                }
                if (scenario == "death")
                {
                    result.Phase = "DEATH";
                    Require(TerminateJobObject(job, 1460));
                    result.PrematureDeathObserved = WaitForSingleObject(process.hProcess, 5000) == WAIT_OBJECT_0;
                    if (!result.PrematureDeathObserved) throw new InvalidOperationException("DEATH_UNCONFIRMED");
                }
                result.ForcedStop = true;
                result.Status = "NONZERO_EXIT";

            }
            catch (Win32Exception error)
            { result.Status = error.NativeErrorCode == 5 ? "ACCESS_DENIED" : "LAUNCH_FAILED"; result.Reason = "NATIVE_FAILED"; }
            catch (Exception error)
            { result.Status = "LAUNCH_FAILED"; result.Reason = FixedReason(error); }
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
                if (started && result.CleanupComplete)
                {
                    uint exit;
                    if (GetExitCodeProcess(process.hProcess, out exit)) result.ExitCode = unchecked((int)exit);
                    else result.CleanupComplete = false;
                }
                try { result.EndpointReleased = ListenerOwner(port) == 0; }
                catch { result.EndpointReleased = false; }
                if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
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

namespace Fonesi.Development.Server
{
    public sealed class ServerRunResult
    {
        public ServerProcessResult Healthy, Death, Timeout;
        public bool CollisionRefused, CollisionOwnerUnchanged, CollisionEndpointReleased, NativeProfileOwned;
        public bool ExistingProfileRefused, ProfileCleaned, SuppressionConfigured;
        public string Failure = "SERVER_FAILED";
        public string Phase = "ADMISSION", Reason = "UNCLASSIFIED";
    }
    public static partial class IsolatedAdbServer
    {
        [DllImport("iphlpapi.dll", SetLastError = true)] static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool order, int family, int tableClass, uint reserved);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool answer);
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHGetKnownFolderPath(ref Guid folder, uint flags, IntPtr token, out IntPtr path);
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHGetFolderPath(IntPtr window, int folder, IntPtr token, uint flags, StringBuilder path);
        [StructLayout(LayoutKind.Sequential)] struct FILE_INFO
        {
            public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
            public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
        }
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FILE_INFO info);
        static string FixedReason(Exception error)
        {
            string[] known = new string[] { "DIRECTORY_REJECTED", "FILE_REJECTED", "FILE_CHANGED", "OWNER_REJECTED", "PROFILE_REJECTED", "PROFILE_CHANGED", "INVENTORY_REJECTED", "LISTENER_TABLE_REJECTED", "LISTENER_TABLE_CHANGED", "LISTENER_ADDRESS_REJECTED", "LISTENER_DUPLICATE", "HEALTH_EOF", "HEALTH_DEADLINE", "HEALTH_REJECTED", "HEALTH_LENGTH", "HEALTH_VERSION", "CUSTODY_CHANGED", "EARLY_EXIT", "FOREIGN_LISTENER", "DEATH_UNCONFIRMED", "ADMISSION_REJECTED", "BINARY_CHANGED", "COLLISION_FAILED", "RESERVATION_FAILED" };
            foreach (string literal in known) if (error.Message == literal) return literal;
            return "UNCLASSIFIED";
        }
        static bool AssignedToJob(IntPtr process, IntPtr job) { bool answer; return IsProcessInJob(process, job, out answer) && answer; }
        static void PlainDirectory(string path)
        {
            if (!String.Equals(Path.GetFullPath(path).TrimEnd('\\'), path.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw new IOException("DIRECTORY_REJECTED");
            DirectoryInfo current = new DirectoryInfo(path);
            for (int depth = 0; current != null; depth++, current = current.Parent)
            {
                if (depth > 32 || !current.Exists || (current.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("DIRECTORY_REJECTED");
            }
        }
        static byte[] Bytes(string path, int limit)
        {
            if ((File.GetAttributes(path) & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) throw new IOException("FILE_REJECTED");
            using (FileStream file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                FILE_INFO info; Require(GetFileInformationByHandle(file.SafeFileHandle, out info));
                if ((info.Attributes & 0x410) != 0 || info.Links != 1 || file.Length < 1 || file.Length > limit) throw new IOException("FILE_REJECTED");
                byte[] data = new byte[(int)file.Length]; int done = 0;
                while (done < data.Length) { int n = file.Read(data, done, data.Length - done); if (n == 0) throw new IOException("FILE_CHANGED"); done += n; }
                if (file.ReadByte() != -1) throw new IOException("FILE_CHANGED");
                FILE_INFO after; Require(GetFileInformationByHandle(file.SafeFileHandle, out after));
                if (after.Attributes != info.Attributes || after.Links != 1 || after.Volume != info.Volume || after.IndexHigh != info.IndexHigh || after.IndexLow != info.IndexLow || after.SizeHigh != info.SizeHigh || after.SizeLow != info.SizeLow || after.Write.dwHighDateTime != info.Write.dwHighDateTime || after.Write.dwLowDateTime != info.Write.dwLowDateTime) throw new IOException("FILE_CHANGED");
                return data;
            }
        }
        static string Digest(byte[] bytes) { using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
        static void ExactOwner(string root, string token)
        {
            Guid parsed;
            if (!Guid.TryParseExact(token, "D", out parsed) || parsed.ToString() != token) throw new IOException("OWNER_REJECTED");
            PlainDirectory(root);
            if (Encoding.ASCII.GetString(Bytes(Path.Combine(root, ".owner"), 36)) != token) throw new IOException("OWNER_REJECTED");
        }
        static bool ReserveAbsentProfile(string path)
        {
            PlainDirectory(Path.GetDirectoryName(path));
            // Win32 CreateDirectory is the exclusive absent-entry admission, including dangling entries.
            if (CreateDirectory(path, IntPtr.Zero)) { PlainDirectory(path); return true; }
            if (Marshal.GetLastWin32Error() == 183) return false;
            throw new IOException("PROFILE_REJECTED");
        }
        static string NativeProfile()
        {
            Guid profile = new Guid("5E6C858F-0E22-4760-9AFE-EA3317B67173"); IntPtr value;
            if (SHGetKnownFolderPath(ref profile, 0, IntPtr.Zero, out value) != 0) throw new IOException("PROFILE_REJECTED");
            string result;
            try { result = Marshal.PtrToStringUni(value); } finally { Marshal.FreeCoTaskMem(value); }
            StringBuilder legacy = new StringBuilder(32768);
            if (SHGetFolderPath(IntPtr.Zero, 0x28, IntPtr.Zero, 0, legacy) != 0 || !String.Equals(result, legacy.ToString(), StringComparison.OrdinalIgnoreCase)) throw new IOException("PROFILE_REJECTED");
            PlainDirectory(result); return result;
        }
        static string[] Names(string root, int maximum)
        {
            PlainDirectory(root); List<string> result = new List<string>();
            foreach (string entry in Directory.EnumerateFileSystemEntries(root))
            { if (result.Count == maximum) throw new IOException("INVENTORY_REJECTED"); result.Add(Path.GetFileName(entry)); }
            result.Sort(StringComparer.Ordinal); return result.ToArray();
        }
        static string ProfileWitness(string profile, string token, bool requireKeys)
        {
            string[] names = Names(profile, 3);
            string expected = requireKeys ? ".fonesi-server-owner,adbkey,adbkey.pub" : ".fonesi-server-owner";
            if (String.Join(",", names) != expected || Encoding.ASCII.GetString(Bytes(Path.Combine(profile, ".fonesi-server-owner"), 36)) != token) throw new IOException("PROFILE_CHANGED");
            if (!requireKeys) return token;
            byte[] privateKey = Bytes(Path.Combine(profile, "adbkey"), 32768), publicKey = Bytes(Path.Combine(profile, "adbkey.pub"), 32768);
            try { if ((long)privateKey.Length + publicKey.Length + 36 > 65536) throw new IOException("PROFILE_CHANGED"); return Digest(privateKey) + Digest(publicKey); }
            finally { Array.Clear(privateKey, 0, privateKey.Length); Array.Clear(publicKey, 0, publicKey.Length); }
        }
        static IntPtr EnvironmentBlock(string runRoot)
        {
            string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            PlainDirectory(windows); PlainDirectory(Path.Combine(runRoot, "profile"));
            SortedDictionary<string, string> env = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            env.Add("SystemRoot", windows); env.Add("WINDIR", windows); env.Add("PATH", Path.Combine(windows, "System32"));
            env.Add("TEMP", Path.Combine(runRoot, "profile")); env.Add("TMP", Path.Combine(runRoot, "profile"));
            env.Add("ADB_USB", "0"); env.Add("ADB_EMU", "0"); env.Add("ADB_MDNS", "0");
            env.Add("ANDROID_ADB_LOG_PATH", Path.Combine(runRoot, "adb.log"));
            StringBuilder block = new StringBuilder(); foreach (KeyValuePair<string, string> item in env) block.Append(item.Key).Append('=').Append(item.Value).Append('\0');
            block.Append('\0'); return Marshal.StringToHGlobalUni(block.ToString());
        }
        static uint ListenerOwner(int port)
        {
            int size = 0; uint first = GetExtendedTcpTable(IntPtr.Zero, ref size, false, 2, 3, 0);
            if (first != 122 || size < 4 || size > 1048576) throw new IOException("LISTENER_TABLE_REJECTED");
            IntPtr table = Marshal.AllocHGlobal(size);
            try
            {
                if (GetExtendedTcpTable(table, ref size, false, 2, 3, 0) != 0) throw new IOException("LISTENER_TABLE_CHANGED");
                int count = Marshal.ReadInt32(table);
                if (count < 0 || count > 32768 || 4L + count * 24L > size) throw new IOException("LISTENER_TABLE_REJECTED");
                uint owner = 0;
                for (int i = 0; i < count; i++)
                {
                    int offset = 4 + i * 24; uint address = unchecked((uint)Marshal.ReadInt32(table, offset + 4));
                    uint rawPort = unchecked((uint)Marshal.ReadInt32(table, offset + 8)); int candidate = (int)(((rawPort & 255) << 8) | ((rawPort >> 8) & 255));
                    if (candidate != port) continue;
                    // A wildcard listener is a collision, never acceptable custody.
                    if (address != 0x0100007f) throw new IOException("LISTENER_ADDRESS_REJECTED");
                    uint found = unchecked((uint)Marshal.ReadInt32(table, offset + 20));
                    if (owner != 0 || found == 0) throw new IOException("LISTENER_DUPLICATE"); owner = found;
                }
                return owner;
            }
            finally { Marshal.FreeHGlobal(table); }
        }
        static byte[] Receive(Socket socket, int length)
        {
            byte[] bytes = new byte[length]; int offset = 0;
            while (offset != length) { int n = socket.Receive(bytes, offset, length - offset, SocketFlags.None); if (n == 0) throw new IOException("HEALTH_EOF"); offset += n; }
            return bytes;
        }
        static bool Health(int port, IntPtr process, uint pid)
        {
            if (WaitForSingleObject(process, 0) != WAIT_TIMEOUT || ListenerOwner(port) != pid) throw new IOException("CUSTODY_CHANGED");
            using (Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp))
            {
                socket.ReceiveTimeout = 2000; socket.SendTimeout = 2000;
                IAsyncResult pending = socket.BeginConnect(IPAddress.Loopback, port, null, null);
                try { if (!pending.AsyncWaitHandle.WaitOne(2000)) throw new IOException("HEALTH_DEADLINE"); socket.EndConnect(pending); }
                finally { pending.AsyncWaitHandle.Close(); }
                if (WaitForSingleObject(process, 0) != WAIT_TIMEOUT || ListenerOwner(port) != pid) throw new IOException("CUSTODY_CHANGED");
                byte[] request = Encoding.ASCII.GetBytes("000chost:version");
                int sent = 0; while (sent < request.Length) { int n = socket.Send(request, sent, request.Length - sent, SocketFlags.None); if (n == 0) throw new IOException("HEALTH_EOF"); sent += n; }
                if (Encoding.ASCII.GetString(Receive(socket, 4)) != "OKAY") throw new IOException("HEALTH_REJECTED");
                string length = Encoding.ASCII.GetString(Receive(socket, 4));
                // This request returns exactly four hexadecimal version bytes, not arbitrary payload.
                if (length != "0004") throw new IOException("HEALTH_LENGTH");
                string version = Encoding.ASCII.GetString(Receive(socket, 4));
                foreach (char c in version) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) throw new IOException("HEALTH_VERSION");
                if (version == "0000") throw new IOException("HEALTH_VERSION");
                return WaitForSingleObject(process, 0) == WAIT_TIMEOUT && ListenerOwner(port) == pid;
            }
        }
        static int FreePort()
        {
            TcpListener reservation = new TcpListener(IPAddress.Loopback, 0); reservation.ExclusiveAddressUse = true;
            reservation.Start(1); int port = ((IPEndPoint)reservation.LocalEndpoint).Port; reservation.Stop(); return port;
        }
        static bool Good(ServerProcessResult value)
        {
            return value != null && value.Status == "NONZERO_EXIT" && value.ExitCode.HasValue && value.ExitCode.Value != 0 && value.CleanupComplete && !value.StdoutTruncated && !value.StderrTruncated && value.ListenerOwned && value.HealthObserved && value.EndpointReleased && value.ForcedStop;
        }
        // Only fixed hosted test entry; no arbitrary argv, socket destination, home path or stop target.
        public static ServerRunResult Run(string executable, string runRoot, string token, string expectedExeSha256)
        {
            ServerRunResult result = new ServerRunResult(); string android = null; bool reserved = false;
            SafeFileHandle directoryGuard = null;
            try
            {
                ExactOwner(runRoot, token);
                if (Environment.OSVersion.Platform != PlatformID.Win32NT || !Environment.Is64BitOperatingSystem || executable != Path.Combine(runRoot, "candidate", "platform-tools", "adb.exe")) throw new IOException("ADMISSION_REJECTED");
                PlainDirectory(Path.GetDirectoryName(executable));
                if (expectedExeSha256.Length != 64 || Digest(Bytes(executable, 16777216)) != expectedExeSha256) throw new IOException("BINARY_CHANGED");
                result.Phase = "COLLISION";
                // Occupied endpoint refuses before profile creation or child launch.
                TcpListener collision = new TcpListener(IPAddress.Loopback, 0); collision.ExclusiveAddressUse = true; int collisionPort = 0;
                try
                {
                    collision.Start(1); int port = ((IPEndPoint)collision.LocalEndpoint).Port; collisionPort = port;
                    uint owner = ListenerOwner(port);
                    ServerProcessResult refused = RunCore(executable, port, "occupied", runRoot);
                    result.CollisionRefused = owner == (uint)Process.GetCurrentProcess().Id && refused.Status == "ENDPOINT_REFUSED" && !refused.Launched && refused.CleanupComplete;
                    result.CollisionOwnerUnchanged = result.CollisionRefused && ListenerOwner(port) == owner && collision.Server.IsBound;
                }
                finally { collision.Stop(); }
                result.CollisionEndpointReleased = collisionPort != 0 && ListenerOwner(collisionPort) == 0;
                if (!result.CollisionRefused || !result.CollisionOwnerUnchanged || !result.CollisionEndpointReleased) throw new IOException("COLLISION_FAILED");
                result.Phase = "PROFILE";
                android = Path.Combine(NativeProfile(), ".android");
                if (!ReserveAbsentProfile(android)) { result.Failure = "PROFILE_REJECTED"; result.Reason = "PROFILE_REJECTED"; return result; }
                reserved = true;
                SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES(); security.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                IntPtr rawGuard = CreateFile(android, 0x80, 3, ref security, 3, 0x02000000, IntPtr.Zero);
                Require(rawGuard != InvalidHandle); directoryGuard = new SafeFileHandle(rawGuard, true);
                using (FileStream marker = new FileStream(Path.Combine(android, ".fonesi-server-owner"), FileMode.CreateNew, FileAccess.Write, FileShare.None))
                { byte[] bytes = Encoding.ASCII.GetBytes(token); marker.Write(bytes, 0, bytes.Length); marker.Flush(true); }
                ProfileWitness(android, token, false); result.NativeProfileOwned = true;
                result.ExistingProfileRefused = !ReserveAbsentProfile(android) && ProfileWitness(android, token, false) == token;
                if (!result.ExistingProfileRefused) throw new IOException("RESERVATION_FAILED");
                result.SuppressionConfigured = true;
                result.Phase = "HEALTHY";
                result.Healthy = RunCore(executable, FreePort(), "healthy", runRoot);
                if (!Good(result.Healthy)) { result.Reason = result.Healthy.Reason ?? "UNCLASSIFIED"; return result; }
                string witness = ProfileWitness(android, token, true);
                result.Phase = "DEATH";
                result.Death = RunCore(executable, FreePort(), "death", runRoot);
                if (!Good(result.Death) || !result.Death.PrematureDeathObserved) { result.Reason = result.Death.Reason ?? "UNCLASSIFIED"; return result; }
                if (ProfileWitness(android, token, true) != witness) throw new IOException("PROFILE_CHANGED");
                result.Phase = "TIMEOUT";
                result.Timeout = RunCore(executable, FreePort(), "timeout", runRoot);
                if (!Good(result.Timeout) || !result.Timeout.DeadlineObserved) { result.Reason = result.Timeout.Reason ?? "UNCLASSIFIED"; return result; }
                if (ProfileWitness(android, token, true) != witness) throw new IOException("PROFILE_CHANGED");
                ExactOwner(runRoot, token);
                if (Digest(Bytes(executable, 16777216)) != expectedExeSha256) throw new IOException("BINARY_CHANGED");
                result.Phase = "CLEANUP";
                // All native operations are retired, all entries verified before first deletion.
                if (ProfileWitness(android, token, true) != witness) throw new IOException("PROFILE_CHANGED");
                File.Delete(Path.Combine(android, "adbkey")); File.Delete(Path.Combine(android, "adbkey.pub"));
                ProfileWitness(android, token, false);
                File.Delete(Path.Combine(android, ".fonesi-server-owner"));
                directoryGuard.Dispose(); directoryGuard = null; Directory.Delete(android, false);
                result.ProfileCleaned = true; result.Failure = null;
            }
            catch (Exception error) { result.Reason = FixedReason(error); if (reserved) result.Failure = "SERVER_FAILED"; else result.Failure = "PREFLIGHT_FAILED"; }
            finally { if (directoryGuard != null) directoryGuard.Dispose(); }
            // No failure cleanup: incomplete keys, changed ownership, or uncertain jobs preserve evidence.
            return result;
        }
    }
}
