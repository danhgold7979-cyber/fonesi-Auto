// Development-only retained binary vision owner. No application or ADB authority.
// Generic Win32 custody patterns derived from Auto's PersistenceProcess/RetainedHostAdmission.
// Admission is a trusted, reviewed harness operation; request bytes cannot select paths.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace Fonesi.Development.Vision
{
    public enum VisionProfile { Preprocess, English, Decoder, OcrRequest, OcrResult, Metrics, NestedOwnerCrash, Echo, WriteStall, Oversized, MalformedUtf8, MalformedJson, LateOutput, Crash, Descendant, StderrOversized, AssignFailure, QueryFailure, TerminationFailure, CloseFailure }
    public sealed class VisionResult
    {
        public string Status;
        public bool Retired;
        public int? ExitCode;
        public byte[] Stdout, Stderr;
        public bool StdoutOverflow, StderrOverflow;
        public long? PeakWorkingSetBytes;
        public long ElapsedMilliseconds;
    }
    public sealed class VisionProcess
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
        static string QuoteArgument(string value)
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

        [StructLayout(LayoutKind.Sequential)] struct FILE_INFO
        {
            public uint Attributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
            public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
        }
        [StructLayout(LayoutKind.Sequential)] struct MEMORY_COUNTERS
        {
            public uint cb, PageFaultCount;
            public UIntPtr PeakWorkingSetSize, WorkingSetSize, QuotaPeakPagedPoolUsage, QuotaPagedPoolUsage,
                QuotaPeakNonPagedPoolUsage, QuotaNonPagedPoolUsage, PagefileUsage, PeakPagefileUsage;
        }
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetFileInformationByHandle(SafeFileHandle file, out FILE_INFO info);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle file, StringBuilder path, uint length, uint flags);
        [DllImport("psapi.dll", SetLastError = true)] static extern bool GetProcessMemoryInfo(IntPtr process, ref MEMORY_COUNTERS info, uint length);

        readonly object gate = new object();
        readonly List<AdmissionLease> admission = new List<AdmissionLease>();
        readonly List<IntPtr> deferredClose = new List<IntPtr>();
        readonly HashSet<string> heldDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        readonly HashSet<string> heldFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        static readonly HashSet<VisionProcess> retained = new HashSet<VisionProcess>();
        static bool admissionReserved;
        readonly string rootPath;
        int admittedFileCount;
        long admittedBytes;
        readonly string executable, script, work;
        readonly VisionProfile profile;
        readonly long deadline, started;
        readonly int outputLimit;
        IntPtr job, process, primaryThread;
        bool assigned, launched, begun, retired, observationStopped, injectedFault, treeDead;
        string status = "ADMITTED";
        long drainStarted;
        int? exitCode;
        long? peakWorkingSet;
        BytePipe stdout, stderr, stdin;
        Timer observer;

        // An original absolute monotonic deadline is shared by admission and BOTH stages.
        // Caller creates it before manifest admission; passing a later deadline per stage is forbidden.
        static bool IsNode(VisionProfile value)
        { return value == VisionProfile.Decoder || value == VisionProfile.OcrRequest || value == VisionProfile.OcrResult; }
        public string WorkDirectory { get { return work; } }
        public static long NewDeadline()
        { return checked(Stopwatch.GetTimestamp() + Stopwatch.Frequency * 30); }
        public static long NewMetricsDeadline()
        { return checked(Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5); }

        // Hash keys are fixed relative names, from the separately reviewed immutable manifest.
        // This admission factory is NOT an IPC/request API. The source-owned harness selects profile.
        public static VisionProcess Admit(string root, VisionProfile profile, IDictionary<string, string> hashes, long deadlineTicks)
        {
            lock (retained) {
                if (admissionReserved || retained.Count != 0) throw new InvalidOperationException("SLOT_RESERVED");
                admissionReserved = true;
            }
            try { return new VisionProcess(root, profile, hashes, deadlineTicks); }
            finally { lock (retained) { admissionReserved = false; } }
        }

        VisionProcess(string root, VisionProfile selected, IDictionary<string, string> hashes, long deadlineTicks)
        {
            started = Stopwatch.GetTimestamp(); deadline = deadlineTicks; profile = selected; rootPath = root;
            if (Environment.OSVersion.Platform != PlatformID.Win32NT || IntPtr.Size != 8 ||
                deadline <= started || deadline - started > Stopwatch.Frequency * (profile == VisionProfile.Metrics ? 5 : 30) ||
                !Enum.IsDefined(typeof(VisionProfile), selected)) throw new ArgumentException("ADMISSION_REJECTED");
            outputLimit = profile == VisionProfile.Preprocess ? 16781316 : (IsNode(profile) || profile == VisionProfile.Metrics) ? 131072 : 16384;
            try {
                if (hashes == null || hashes.Count > 50000) throw new IOException("CLOSURE_LIMIT");
                hashes = new Dictionary<string, string>(hashes, StringComparer.Ordinal);
                HoldDirectories(root);
                bool real = profile == VisionProfile.Preprocess || profile == VisionProfile.English;
                string image = profile == VisionProfile.Metrics ? "python/python.exe" : IsNode(profile) ? "tooling/node.exe" : real ? (profile == VisionProfile.Preprocess ? "preprocess-runtime/Scripts/python.exe" : "ocr-runtime/Scripts/python.exe") : "fixture/VisionProcessFixture.exe";
                if (real) {
                    HoldTree(root, "python", hashes);
                    HoldTree(root, profile == VisionProfile.Preprocess ? "preprocess-runtime" : "ocr-runtime", hashes);
                }
                if (profile == VisionProfile.Metrics) HoldTree(root, "python", hashes);
                if (real || IsNode(profile) || profile == VisionProfile.Metrics) HoldTree(root, "source", hashes);
                if (IsNode(profile)) HoldTree(root, "tooling", hashes);
                else if (!real && profile != VisionProfile.Metrics) HoldTree(root, "fixture", hashes);
                executable = HoldFile(root, image, hashes);
                if (profile == VisionProfile.Metrics) script = HoldFile(root, "source/ocr_evaluation_metrics.py", hashes);
                if (IsNode(profile)) script = HoldFile(root, "source/vision-qualification-fixture.mjs", hashes);
                if (real) script = HoldFile(root, profile == VisionProfile.Preprocess ? "source/preprocess_worker.py" : "source/ocr_windows_worker.py", hashes);
                if (profile == VisionProfile.English) {
                    string[] names = { "inference.pdiparams", "inference.json", "inference.yml" };
                    string[] pins = { "3ec8a97ed6cefe8568d3e2ee90bb193299b566a7661aa4fd52d224b96b59f66b", "fd1b6ec722ea841a72d3ba43e527df1d1066d5d7808e0503ee3eec7265188753", "27e91d0582f40168aa218303c76e184bc78fa7a5d105aad0cfbad8458b441067" };
                    for (int i = 0; i < names.Length; i++) {
                        string value; if (!hashes.TryGetValue("model/english/" + names[i], out value) || value != pins[i]) throw new IOException("MODEL_REJECTED");
                    }
                    HoldFile(root, "model/english/inference.pdiparams", hashes);
                    HoldFile(root, "model/english/inference.json", hashes);
                    HoldFile(root, "model/english/inference.yml", hashes);
                }
                string parent = Path.Combine(root, "work"); HoldDirectories(parent);
                work = Path.Combine(parent, Guid.NewGuid().ToString("D"));
                Require(CreateDirectory(work, IntPtr.Zero));
                foreach (string name in new string[] { "home", "tmp", "cache" }) Require(CreateDirectory(Path.Combine(work, name), IntPtr.Zero));
                HoldDirectories(work);
                if (Stopwatch.GetTimestamp() >= deadline) throw new IOException("DEADLINE");
                lock (retained) { retained.Add(this); }
            } catch {
                if (!ReleaseAdmission()) {
                    status = "ADMISSION_CLEANUP_UNCERTAIN"; begun = true; PauseObservation();
                    lock (retained) { retained.Add(this); }
                } else throw;
            }
        }

        void HoldDirectories(string path)
        {
            if (String.IsNullOrEmpty(path) || Path.GetFullPath(path) != path || path.StartsWith(@"\\") || path.IndexOf(':', 2) >= 0)
                throw new IOException("PATH_REJECTED");
            DirectoryInfo cursor = new DirectoryInfo(path);
            for (int depth = 0; cursor != null; depth++, cursor = cursor.Parent) {
                if (depth > 64) throw new IOException("PATH_REJECTED");
                if (heldDirectories.Contains(cursor.FullName)) continue;
                SECURITY_ATTRIBUTES sa = new SECURITY_ATTRIBUTES(); sa.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                // BACKUP_SEMANTICS | OPEN_REPARSE_POINT; no FILE_SHARE_DELETE.
                IntPtr raw = CreateFile(cursor.FullName, 0x80, 3, ref sa, 3, 0x02200000, IntPtr.Zero);
                Require(raw != InvalidHandle);
                SafeFileHandle handle = new SafeFileHandle(raw, false);
                admission.Add(new AdmissionLease(raw, handle));
                FILE_INFO info; Require(GetFileInformationByHandle(handle, out info));
                if ((info.Attributes & 0x400) != 0 || (info.Attributes & 0x10) == 0) throw new IOException("PATH_REJECTED");
                CheckFinal(handle, cursor.FullName); heldDirectories.Add(cursor.FullName);
            }
        }
        static void CheckFinal(SafeFileHandle handle, string expected)
        {
            StringBuilder value = new StringBuilder(32768);
            uint length = GetFinalPathNameByHandle(handle, value, (uint)value.Capacity, 0);
            if (length == 0 || length >= value.Capacity) throw new IOException("PATH_REJECTED");
            string actual = value.ToString(); if (actual.StartsWith(@"\\?\")) actual = actual.Substring(4);
            if (!String.Equals(actual.TrimEnd('\\'), expected.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw new IOException("PATH_REJECTED");
        }
        string HoldFile(string root, string relative, IDictionary<string, string> hashes)
        {
            string expected;
            if (hashes == null || !hashes.TryGetValue(relative, out expected) || expected == null ||
                !System.Text.RegularExpressions.Regex.IsMatch(expected, "\\A[0-9a-f]{64}\\z")) throw new IOException("HASH_REJECTED");
            string path = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
            if (heldFiles.Contains(path)) return path;
            HoldDirectories(Path.GetDirectoryName(path));
            SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES(); security.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
            IntPtr raw = CreateFile(path, 0x80000000, 1, ref security, 3, 0x00200000, IntPtr.Zero);
            Require(raw != InvalidHandle);
            AdmissionLease lease = new AdmissionLease(raw, null); admission.Add(lease);
            FileStream file = new FileStream(new SafeFileHandle(raw, false), FileAccess.Read, 65536, false);
            lease.Resource = file;
            FILE_INFO before, after; Require(GetFileInformationByHandle(file.SafeFileHandle, out before));
            CheckFinal(file.SafeFileHandle, path);
            if ((before.Attributes & 0x410) != 0 || before.Links != 1 || file.Length > 536870912) throw new IOException("FILE_REJECTED");
            if (++admittedFileCount > 50000 || (admittedBytes += file.Length) > 4294967296L) throw new IOException("CLOSURE_LIMIT");
            string digest;
            using (SHA256 hash = SHA256.Create()) {
                byte[] block = new byte[65536]; int count;
                while ((count = file.Read(block, 0, block.Length)) != 0) {
                    if (Stopwatch.GetTimestamp() >= deadline) throw new IOException("DEADLINE");
                    hash.TransformBlock(block, 0, count, block, 0);
                }
                hash.TransformFinalBlock(new byte[0], 0, 0);
                digest = BitConverter.ToString(hash.Hash).Replace("-", "").ToLowerInvariant();
            }
            Require(GetFileInformationByHandle(file.SafeFileHandle, out after));
            if (digest != expected || before.Volume != after.Volume || before.IndexHigh != after.IndexHigh || before.IndexLow != after.IndexLow ||
                before.SizeHigh != after.SizeHigh || before.SizeLow != after.SizeLow || before.Write.dwHighDateTime != after.Write.dwHighDateTime ||
                before.Write.dwLowDateTime != after.Write.dwLowDateTime || after.Links != 1 || before.Attributes != after.Attributes) throw new IOException("FILE_CHANGED");
            heldFiles.Add(path); return path;
        }
        void HoldTree(string root, string relative, IDictionary<string, string> hashes)
        {
            // Enumeration is performed under retained ancestor/directory guards. Every regular
            // file must be in the reviewed closure; no unlisted startup hooks or native payloads.
            string path = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
            HoldDirectories(path);
            Stack<string> pending = new Stack<string>(); pending.Push(relative);
            int entries = 0;
            while (pending.Count != 0) {
                string current = pending.Pop();
                string directory = Path.Combine(root, current.Replace('/', Path.DirectorySeparatorChar));
                HoldDirectories(directory);
                foreach (string entry in Directory.EnumerateFileSystemEntries(directory)) {
                    if (++entries > 60000 || Stopwatch.GetTimestamp() >= deadline) throw new IOException("CLOSURE_LIMIT");
                    FileAttributes attributes = File.GetAttributes(entry);
                    if ((attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("PATH_REJECTED");
                    string child = current + "/" + Path.GetFileName(entry);
                    if ((attributes & FileAttributes.Directory) != 0) { HoldDirectories(entry); pending.Push(child); }
                    else HoldFile(root, child, hashes);
                }
            }
            foreach (string key in hashes.Keys) {
                if (key.StartsWith(relative + "/", StringComparison.Ordinal) &&
                    !heldFiles.Contains(Path.Combine(root, key.Replace('/', Path.DirectorySeparatorChar)))) throw new IOException("CLOSURE_MISSING");
            }
        }

        sealed class BytePipe
        {
            readonly FileStream stream;
            IntPtr rawHandle;
            readonly byte[] input;
            readonly int maximum;
            readonly MemoryStream captured = new MemoryStream();
            readonly Thread thread;
            public volatile bool Failed, Overflow, CloseUncertain;
            bool started;
            public BytePipe(IntPtr handle, byte[] bytes, int limit)
            {
                rawHandle = handle;
                stream = new FileStream(new SafeFileHandle(handle, false), bytes == null ? FileAccess.Read : FileAccess.Write, 4096, false);
                input = bytes; maximum = limit;
                thread = new Thread(Run); thread.IsBackground = true;
            }
            public void Start() { thread.Start(); started = true; }
            public bool Settled { get { return !started || thread.Join(0); } }
            public bool Release()
            {
                if (!Settled) return false;
                try { stream.Dispose(); } catch { Failed = true; return false; }
                CloseUncertain = !TryClose(ref rawHandle);
                return !CloseUncertain;
            }
            public void CloseUnstarted() { if (!started && !Release()) Failed = true; }
            public byte[] Snapshot() { lock (captured) { return captured.ToArray(); } }
            void Run()
            {
                try {
                    if (input != null) { stream.Write(input, 0, input.Length); stream.Flush(); }
                    else {
                        byte[] block = new byte[4096]; int count;
                        while ((count = stream.Read(block, 0, block.Length)) != 0) {
                            lock (captured) {
                                int keep = Math.Min(count, maximum - (int)captured.Length);
                                if (keep > 0) captured.Write(block, 0, keep);
                                if (keep < count) Overflow = true;
                            }
                        }
                    }
                } catch { Failed = true; }
                finally { try { stream.Dispose(); } catch { Failed = true; } if (!TryClose(ref rawHandle)) { Failed = true; CloseUncertain = true; } }
            }
        }
        static BytePipe TakePipe(ref IntPtr handle, byte[] input, int limit)
        { BytePipe pipe = new BytePipe(handle, input, limit); handle = IntPtr.Zero; return pipe; }
        static void Require(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
        static bool TryClose(ref IntPtr handle)
        {
            if (handle == IntPtr.Zero || handle == InvalidHandle) { handle = IntPtr.Zero; return true; }
            if (!CloseHandle(handle)) return false; // retain exact nonzero handle on failure
            handle = IntPtr.Zero; return true;
        }
        void Close(ref IntPtr handle)
        {
            if (TryClose(ref handle)) return;
            deferredClose.Add(handle); handle = IntPtr.Zero;
            status = "HANDLE_CLOSE_UNCERTAIN"; PauseObservation();
            throw new IOException("HANDLE_CLOSE_UNCERTAIN");
        }
        sealed class AdmissionLease
        {
            IntPtr handle;
            public IDisposable Resource;
            public AdmissionLease(IntPtr raw, IDisposable resource) { handle = raw; Resource = resource; }
            public bool Release()
            {
                if (Resource != null) { try { Resource.Dispose(); Resource = null; } catch { return false; } }
                return TryClose(ref handle);
            }
        }
        bool ReleaseAdmission()
        {
            for (int i = admission.Count - 1; i >= 0; i--) {
                if (!admission[i].Release()) return false;
                admission.RemoveAt(i);
            }
            return true;
        }
        void DeferClose(ref IntPtr handle)
        {
            if (TryClose(ref handle)) return;
            deferredClose.Add(handle); handle = IntPtr.Zero; // transfer, never discard
            status = "HANDLE_CLOSE_UNCERTAIN"; PauseObservation();
        }
        bool ReleaseDeferred()
        {
            for (int i = deferredClose.Count - 1; i >= 0; i--) {
                IntPtr raw = deferredClose[i];
                if (!TryClose(ref raw)) return false;
                deferredClose.RemoveAt(i);
            }
            return true;
        }

        string EnvironmentBlock()
        {
            // No inherited PATH, PYTHON*, proxies, vendor flags or user home.
            string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            SortedDictionary<string, string> values = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (profile == VisionProfile.NestedOwnerCrash) values.Add("FONESI_VISION_DEADLINE_TICKS", deadline.ToString(System.Globalization.CultureInfo.InvariantCulture));
            values.Add("FONESI_VISION_ROOT", rootPath); values.Add("FONESI_VISION_JOB", work);
            values.Add("SystemRoot", windows); values.Add("WINDIR", windows);
            values.Add("PATH", Path.Combine(windows, "System32"));
            values.Add("HOME", Path.Combine(work, "home")); values.Add("USERPROFILE", Path.Combine(work, "home"));
            values.Add("TEMP", Path.Combine(work, "tmp")); values.Add("TMP", Path.Combine(work, "tmp"));
            values.Add("PADDLE_PDX_CACHE_HOME", Path.Combine(work, "cache"));
            values.Add("HF_HOME", Path.Combine(work, "cache", "hf"));
            values.Add("PADDLE_PDX_DISABLE_DEVICE_FALLBACK", "True"); values.Add("GLOG_minloglevel", "2");
            values.Add("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True"); values.Add("HF_HUB_OFFLINE", "1");
            values.Add("TRANSFORMERS_OFFLINE", "1"); values.Add("SETUPTOOLS_USE_DISTUTILS", "local");
            foreach (string key in new string[] { "OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS", "OPENCV_FOR_THREADS_NUM" }) values.Add(key, "1");
            StringBuilder block = new StringBuilder();
            foreach (KeyValuePair<string, string> pair in values) block.Append(pair.Key).Append('=').Append(pair.Value).Append('\0');
            return block.Append('\0').ToString();
        }

        public VisionResult Begin(byte[] frame)
        {
            lock (gate) {
                if (begun || retired) throw new InvalidOperationException("SLOT_RESERVED");
                begun = true; // reserve before inspecting/copying caller bytes
                if (frame == null || frame.Length > ((IsNode(profile) || profile == VisionProfile.Metrics) ? 131072 : 16781316) || (profile == VisionProfile.Decoder && frame.Length != 0)) { status = "INPUT_REJECTED"; SafeObserve(); return Snapshot(); }
                byte[] owned = (byte[])frame.Clone();
                IntPtr inputRead = IntPtr.Zero, inputWrite = IntPtr.Zero, outputRead = IntPtr.Zero, outputWrite = IntPtr.Zero;
                IntPtr errorRead = IntPtr.Zero, errorWrite = IntPtr.Zero, attributes = IntPtr.Zero, handles = IntPtr.Zero, environment = IntPtr.Zero;
                bool initialized = false;
                try {
                    if (Stopwatch.GetTimestamp() >= deadline) throw new IOException("DEADLINE");
                    SECURITY_ATTRIBUTES sa = new SECURITY_ATTRIBUTES(); sa.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); sa.bInheritHandle = 1;
                    Require(CreatePipe(out inputRead, out inputWrite, ref sa, 0));
                    Require(CreatePipe(out outputRead, out outputWrite, ref sa, 0));
                    Require(CreatePipe(out errorRead, out errorWrite, ref sa, 0));
                    Require(SetHandleInformation(inputWrite, 1, 0)); Require(SetHandleInformation(outputRead, 1, 0)); Require(SetHandleInformation(errorRead, 1, 0));
                    job = CreateJobObject(IntPtr.Zero, null); Require(job != IntPtr.Zero);
                    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION(); limits.BasicLimitInformation.LimitFlags = KILL_ON_JOB_CLOSE;
                    Require(SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref limits, (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))));
                    IntPtr size = IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
                    attributes = Marshal.AllocHGlobal(size); Require(InitializeProcThreadAttributeList(attributes, 1, 0, ref size)); initialized = true;
                    handles = Marshal.AllocHGlobal(IntPtr.Size * 3);
                    Marshal.WriteIntPtr(handles, 0, inputRead); Marshal.WriteIntPtr(handles, IntPtr.Size, outputWrite); Marshal.WriteIntPtr(handles, IntPtr.Size * 2, errorWrite);
                    Require(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x00020002), handles, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero));
                    STARTUPINFOEX startup = new STARTUPINFOEX(); startup.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX)); startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
                    startup.StartupInfo.hStdInput = inputRead; startup.StartupInfo.hStdOutput = outputWrite; startup.StartupInfo.hStdError = errorWrite; startup.lpAttributeList = attributes;
                    StringBuilder command = new StringBuilder(QuoteArgument(executable));
                    if (IsNode(profile)) {
                        command.Append(" --no-addons ").Append(QuoteArgument(script));
                        if (profile == VisionProfile.OcrRequest) command.Append(" preprocess-reply");
                        if (profile == VisionProfile.OcrResult) command.Append(" ocr-reply");
                    }
                    else if (script != null) command.Append(" -I -B ").Append(QuoteArgument(script));
                    else command.Append(' ').Append(QuoteArgument(profile.ToString()));
                    environment = Marshal.StringToHGlobalUni(EnvironmentBlock());
                    PROCESS_INFORMATION child;
                    Require(CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true, CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT | 0x400,
                        environment, work, ref startup, out child));
                    process = child.hProcess; primaryThread = child.hThread; launched = true;
                    // Source-only synthetic fault seams are reachable only through fixture profiles.
                    if (profile == VisionProfile.AssignFailure) throw new IOException("SYNTHETIC_ASSIGNMENT_FAILURE");
                    Require(AssignProcessToJobObject(job, process)); assigned = true;
                    Close(ref inputRead); Close(ref outputWrite); Close(ref errorWrite);
                    stdout = TakePipe(ref outputRead, null, outputLimit); stderr = TakePipe(ref errorRead, null, 4096); stdin = TakePipe(ref inputWrite, owned, 0);
                    stdout.Start(); stderr.Start(); stdin.Start();
                    if (Stopwatch.GetTimestamp() >= deadline) throw new IOException("DEADLINE");
                    Require(ResumeThread(primaryThread) != 0xffffffff); Close(ref primaryThread);
                    status = "RUNNING";
                    observer = new Timer(delegate(object ignored) { lock (gate) { if (!retired && !observationStopped) SafeObserve(); } }, null, 10, 10);
                } catch { if (!observationStopped) status = Stopwatch.GetTimestamp() >= deadline ? "TIMEOUT" : "LAUNCH_FAILED"; SafeStopOwned(); }
                finally {
                    DeferClose(ref inputRead); DeferClose(ref inputWrite); DeferClose(ref outputRead); DeferClose(ref outputWrite); DeferClose(ref errorRead); DeferClose(ref errorWrite);
                    if (initialized) DeleteProcThreadAttributeList(attributes);
                    if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
                    if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
                    if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
                    if (stdin != null) stdin.CloseUnstarted(); if (stdout != null) stdout.CloseUnstarted(); if (stderr != null) stderr.CloseUnstarted();
                }
                if (!observationStopped) SafeObserve();
                if (!retired && !observationStopped && observer == null)
                    observer = new Timer(delegate(object ignored) { lock (gate) { if (!retired && !observationStopped) SafeObserve(); } }, null, 10, 10);
                return Snapshot();
            }
        }
        bool JobEmpty(out bool known)
        {
            known = true;
            if (profile == VisionProfile.QueryFailure && assigned && !injectedFault) {
                injectedFault = true; known = false; return false;
            }
            if (!assigned) return true;
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info;
            known = QueryInformationJobObject(job, JobObjectBasicAccountingInformation, out info,
                (uint)Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)), IntPtr.Zero);
            return known && info.ActiveProcesses == 0;
        }
        void SafeStopOwned()
        { try { StopOwned(); } catch { status = "OBSERVATION_UNCERTAIN"; PauseObservation(); } }
        void StopOwned()
        {
            if (retired || treeDead) return;
            if (drainStarted == 0) drainStarted = Stopwatch.GetTimestamp();
            if (!launched) return;
            bool known;
            bool empty = JobEmpty(out known);
            if (!known) { PauseObservation(); status = "JOB_QUERY_UNCERTAIN"; return; }
            if (profile == VisionProfile.TerminationFailure && !empty && !injectedFault) {
                injectedFault = true; status = "TERMINATION_UNCERTAIN"; PauseObservation(); return;
            }
            // Do not signal after observed tree absence. Never reopen or signal a PID.
            bool ok = assigned ? (empty || TerminateJobObject(job, 1460)) :
                (WaitForSingleObject(process, 0) == WAIT_OBJECT_0 || TerminateProcess(process, 1460));
            // An unassigned child is still suspended and cannot have descendants.
            if (!ok) { status = "TERMINATION_UNCERTAIN"; PauseObservation(); }
        }
        bool PipesSettled()
        { return (stdin == null || stdin.Settled) && (stdout == null || stdout.Settled) && (stderr == null || stderr.Settled); }
        void RetireIfPossible()
        {
            if (retired || observationStopped || !PipesSettled()) return;
            if (launched && !treeDead) {
                if (WaitForSingleObject(process, 0) != WAIT_OBJECT_0) return;
                bool known; if (!JobEmpty(out known)) { if (!known) { status = "JOB_QUERY_UNCERTAIN"; PauseObservation(); } return; }
                uint code; if (!GetExitCodeProcess(process, out code)) { status = "EXIT_QUERY_UNCERTAIN"; PauseObservation(); return; }
                exitCode = unchecked((int)code);
                MEMORY_COUNTERS memory = new MEMORY_COUNTERS(); memory.cb = (uint)Marshal.SizeOf(typeof(MEMORY_COUNTERS));
                if (GetProcessMemoryInfo(process, ref memory, memory.cb) && memory.PeakWorkingSetSize.ToUInt64() <= Int64.MaxValue)
                    peakWorkingSet = (long)memory.PeakWorkingSetSize.ToUInt64();
                else if (status == "RUNNING") status = "MEMORY_UNAVAILABLE";
                if (status == "RUNNING") status = code == 0 ? "SUCCESS" : "NONZERO_EXIT";
            }
            if (stdin != null && stdin.Failed || stdout != null && stdout.Failed || stderr != null && stderr.Failed) status = "PIPE_FAILED";
            if (stdout != null && stdout.Overflow || stderr != null && stderr.Overflow) status = "OUTPUT_LIMIT";
            treeDead = true; // proven process + Job + threads; independent from handle retirement
            if (!ReleaseDeferred() || (stdin != null && !stdin.Release()) || (stdout != null && !stdout.Release()) ||
                (stderr != null && !stderr.Release()) || !TryClose(ref primaryThread) || !TryCloseProcess() || !TryClose(ref job) || !ReleaseAdmission()) {
                status = "HANDLE_CLOSE_UNCERTAIN"; PauseObservation(); return;
            }
            retired = true;
            if (observer != null) { observer.Dispose(); observer = null; }
            lock (retained) { retained.Remove(this); }
            // Work roots are deliberately preserved for the trusted harness to remove only
            // AFTER Retired. No recursive deletion of vendor-created files in this owner.
        }
        bool TryCloseProcess()
        {
            // Test-only one-shot failure at the actual release seam; do not close or
            // zero the retained process handle. A later explicit Reconcile retries it.
            if (profile == VisionProfile.CloseFailure && process != IntPtr.Zero && !injectedFault) {
                injectedFault = true; return false;
            }
            return TryClose(ref process);
        }
        void PauseObservation()
        {
            observationStopped = true;
            if (observer != null) { observer.Dispose(); observer = null; }
        }
        void SafeObserve()
        {
            try { Observe(); }
            catch { status = "OBSERVATION_UNCERTAIN"; PauseObservation(); }
        }
        void Observe()
        {
            if (retired || observationStopped) return;
            if ((stdin != null && stdin.CloseUncertain) || (stdout != null && stdout.CloseUncertain) || (stderr != null && stderr.CloseUncertain)) {
                status = "HANDLE_CLOSE_UNCERTAIN"; PauseObservation(); return;
            }
            if (!launched || treeDead) { RetireIfPossible(); return; }
            uint wait = WaitForSingleObject(process, 0);
            if (wait != WAIT_OBJECT_0 && wait != WAIT_TIMEOUT) { status = "PROCESS_QUERY_UNCERTAIN"; PauseObservation(); return; }
            bool known; bool empty = JobEmpty(out known);
            if (!known) { status = "JOB_QUERY_UNCERTAIN"; PauseObservation(); return; }
            if (status == "RUNNING") {
                if (stdout != null && stdout.Overflow || stderr != null && stderr.Overflow) status = "OUTPUT_LIMIT";
                else if (stdin != null && stdin.Failed || stdout != null && stdout.Failed || stderr != null && stderr.Failed) status = "PIPE_FAILED";
                else if (Stopwatch.GetTimestamp() >= deadline) status = "TIMEOUT";
                else if (wait == WAIT_OBJECT_0 && !empty) status = "DESCENDANT_UNRETIRED";
                if (status != "RUNNING") SafeStopOwned();
            }
            RetireIfPossible();
            if (!retired && drainStarted != 0 && Stopwatch.GetTimestamp() - drainStarted >= Stopwatch.Frequency * 5) {
                PauseObservation(); // retain handles; only explicit Reconcile continues
                if (observer != null) { observer.Dispose(); observer = null; }
            }
        }
        VisionResult Snapshot()
        {
            VisionResult result = new VisionResult(); result.Status = status; result.Retired = retired; result.ExitCode = exitCode;
            // Never expose provisional bytes while any owned resource remains live/unknown.
            result.Stdout = !retired || stdout == null ? new byte[0] : stdout.Snapshot(); result.Stderr = !retired || stderr == null ? new byte[0] : stderr.Snapshot();
            result.StdoutOverflow = stdout != null && stdout.Overflow; result.StderrOverflow = stderr != null && stderr.Overflow;
            result.PeakWorkingSetBytes = peakWorkingSet; result.ElapsedMilliseconds = (Stopwatch.GetTimestamp() - started) * 1000 / Stopwatch.Frequency;
            return result;
        }
        public VisionResult Poll() { lock (gate) { if (begun && !observationStopped) SafeObserve(); return Snapshot(); } }
        public VisionResult Cancel()
        {
            lock (gate) {
                if (!retired) { status = "CANCELLED"; SafeStopOwned(); if (!observationStopped) SafeObserve(); }
                return Snapshot();
            }
        }
        public VisionResult Reconcile(int milliseconds)
        {
            if (milliseconds < 0 || milliseconds > 5000) throw new ArgumentException("RECONCILE_BOUND");
            Stopwatch elapsed = Stopwatch.StartNew();
            lock (gate) {
                if (!retired && observationStopped && drainStarted != 0) drainStarted = Stopwatch.GetTimestamp();
            }
            do {
                lock (gate) {
                    if (retired) return Snapshot();
                    observationStopped = false;
                    try {
                        if (!ReleaseDeferred() ||
                            (stdin != null && stdin.CloseUncertain && (!stdin.Settled || !stdin.Release())) ||
                            (stdout != null && stdout.CloseUncertain && (!stdout.Settled || !stdout.Release())) ||
                            (stderr != null && stderr.CloseUncertain && (!stderr.Settled || !stderr.Release()))) {
                            status = "HANDLE_CLOSE_UNCERTAIN"; PauseObservation(); return Snapshot();
                        }
                    } catch { status = "HANDLE_CLOSE_UNCERTAIN"; PauseObservation(); return Snapshot(); }
                    if (status != "RUNNING") SafeStopOwned();
                    if (!observationStopped) SafeObserve();
                    if (retired || observationStopped || elapsed.ElapsedMilliseconds >= milliseconds) return Snapshot();
                }
                Thread.Sleep(10);
            } while (true);
        }
    }
}
