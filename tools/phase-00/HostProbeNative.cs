// P0-01 only. No packages; compiled by Windows PowerShell 5.1 Add-Type.
// Start suspended, assign to our non-breakaway kill-on-close job, then resume.
// This avoids the child-creation race of Process.Start followed by tree discovery.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace Fonesi.Phase00
{
    public sealed class ProbeResult
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

    public static class NativeProbe
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

        public static ProbeResult Run(string executable, string[] arguments, int timeoutMilliseconds, int cleanupMilliseconds, int maxCharacters)
        { return RunCore(executable, arguments, null, timeoutMilliseconds, cleanupMilliseconds, maxCharacters); }

        public static ProbeResult RunCmd(string interpreter, string batchFile, string[] arguments, int timeoutMilliseconds, int cleanupMilliseconds, int maxCharacters)
        {
            // CMD uses its own grammar, not the C runtime parser used by .exe files.
            string extension = Path.GetExtension(batchFile);
            if (!Path.IsPathRooted(batchFile) || (!String.Equals(extension, ".cmd", StringComparison.OrdinalIgnoreCase) && !String.Equals(extension, ".bat", StringComparison.OrdinalIgnoreCase))) throw new ArgumentException("BATCH_PATH_REQUIRED");
            Regex unsafeCharacters = new Regex("[\"%!?&|<>^()\\r\\n\\x00]");
            if (unsafeCharacters.IsMatch(batchFile)) throw new ArgumentException("CMD_UNSAFE_CHARACTER");
            StringBuilder tail = new StringBuilder(" /d /s /v:off /c \"\"").Append(batchFile).Append('"');
            foreach (string argument in arguments ?? new string[0])
            {
                string value = argument ?? "";
                if (unsafeCharacters.IsMatch(value)) throw new ArgumentException("CMD_UNSAFE_CHARACTER");
                tail.Append(" \"").Append(value).Append('"');
            }
            tail.Append('"');
            return RunCore(interpreter, null, tail.ToString(), timeoutMilliseconds, cleanupMilliseconds, maxCharacters);
        }

        static ProbeResult RunCore(string executable, string[] arguments, string commandTail, int timeoutMilliseconds, int cleanupMilliseconds, int maxCharacters)
        {
            ProbeResult result = new ProbeResult(); Stopwatch elapsed = Stopwatch.StartNew();
            IntPtr outputRead = IntPtr.Zero, outputWrite = IntPtr.Zero, errorRead = IntPtr.Zero, errorWrite = IntPtr.Zero;
            IntPtr input = IntPtr.Zero, job = IntPtr.Zero, attributes = IntPtr.Zero, handles = IntPtr.Zero;
            bool attributeInitialized = false, assigned = false, started = false;
            PROCESS_INFORMATION process = new PROCESS_INFORMATION(); Drain stdout = null, stderr = null;
            try
            {
                if (timeoutMilliseconds < 1 || cleanupMilliseconds < 1 || maxCharacters < 1) throw new ArgumentException("INVALID_LIMIT");
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
                if (commandTail != null) command.Append(commandTail);
                else foreach (string argument in arguments ?? new string[0]) command.Append(" ").Append(QuoteArgument(argument));
                Require(CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true, CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT, IntPtr.Zero, Path.GetDirectoryName(executable), ref startup, out process));
                started = true;
                Require(AssignProcessToJobObject(job, process.hProcess)); assigned = true;
                // Close the parent's write ends so EOF is delivered when owned children exit.
                Close(ref outputWrite); Close(ref errorWrite); Close(ref input);
                stdout = TakeDrain(ref outputRead, maxCharacters);
                stderr = TakeDrain(ref errorRead, maxCharacters);
                stdout.Start(); stderr.Start();
                Require(ResumeThread(process.hThread) != 0xffffffff);
                Close(ref process.hThread);
                uint wait = WaitForSingleObject(process.hProcess, (uint)timeoutMilliseconds);
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
