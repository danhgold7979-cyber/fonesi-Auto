// Source-only materialization owner; NOT execution approval or a product process service.
// Custody derived from VisionProcess.cs SHA256 f59725c0259813e8f62cf515b29ec750b66f78db3ab40943dd95f65fdd6bd038.
// That owner's Managed campaign does NOT establish execution evidence for this new policy.
// Fixed four-step bootstrap only; original helpers and inference owner remain unchanged.
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

namespace Fonesi.Development.VisionBootstrap
{
    public enum HostStagingProfile { Prepare, Bundle, Freeze }
    public enum BootstrapProfile { CreatePreprocess, CreateOcr, InstallPreprocess, InstallOcr }
    public sealed class BootstrapResult
    {
        public string Status;
        public bool Retired;
        public int? ExitCode;
        public byte[] Stdout, Stderr;
        public bool StdoutOverflow, StderrOverflow;
        public long? PeakWorkingSetBytes;
        public long ElapsedMilliseconds;
        public string HostToolSha256, HostFileVersion, ExpectedPythonVersion;
    }
    public sealed class VisionBootstrapProcess
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
        [DllImport("kernel32.dll", SetLastError = true)] static extern uint GetFileType(SafeFileHandle file);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle file, StringBuilder path, uint length, uint flags);
        [DllImport("psapi.dll", SetLastError = true)] static extern bool GetProcessMemoryInfo(IntPtr process, ref MEMORY_COUNTERS info, uint length);

        readonly object gate = new object();
        readonly List<AdmissionLease> admission = new List<AdmissionLease>();
        readonly List<IntPtr> deferredClose = new List<IntPtr>();
        readonly HashSet<string> heldDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        readonly HashSet<string> heldFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        static readonly HashSet<VisionBootstrapProcess> retained = new HashSet<VisionBootstrapProcess>();
        static bool admissionReserved;
        readonly string rootPath;
        int admittedFileCount;
        long admittedBytes;
        readonly string executable, work;
        readonly string[] arguments;
        readonly StagingCustody custody;
        readonly BootstrapProfile profile;
        readonly bool hostOperation;
        readonly HostStagingProfile hostProfile;
        readonly string hostIndexHash, hostToolHash, hostFileVersion, expectedPythonVersion;
        readonly long deadline, started;
        readonly int outputLimit;
        IntPtr job, process, primaryThread;
        bool assigned, launched, begun, retired, observationStopped, treeDead;
        string status = "ADMITTED";
        long drainStarted;
        int? exitCode;
        long? peakWorkingSet;
        BytePipe stdout, stderr, stdin;
        Timer observer;

        public const string CandidateRoot = @"D:\a\_temp\fonesi-p4-windows-candidate-v1";
        public const string AcquisitionRoot = @"D:\a\_temp\fonesi-p4-windows-acquisition-v1";
        public const string EvidenceRoot = @"D:\a\_temp\fonesi-p4-materialization-evidence-v1";
        const string ParentRoot = @"D:\a\_temp";
        const string WindowsRoot = @"C:\Windows";
        static StagingCustody staging;
        static EvidenceCustody evidence;
        public string WorkDirectory { get { return work; } }
        // 600 seconds useful work plus at most 10 seconds initial safety observation.
        // Explicit later reconciliation never authorizes more child work or a fresh retry.
        public static long NewOverallDeadline()
        { return checked(Stopwatch.GetTimestamp() + Stopwatch.Frequency * 600); }

        // Keep this custody alive across extraction, ALL four children and final inventory.
        // A failed release retains the same object/handles and must be explicitly retried.
        public sealed class StagingCustody
        {
            readonly VisionBootstrapProcess holder;
            internal readonly long OverallDeadline;
            internal int NextProfile, HostStep;
            internal bool Failed;
            bool ready, released;
            internal StagingCustody(long deadlineTicks)
            {
                OverallDeadline = deadlineTicks;
                holder = new VisionBootstrapProcess();
            }
            internal void Reserve()
            {
                holder.HoldDirectories(ParentRoot);
                holder.HoldDirectories(WindowsRoot);
                holder.HoldDirectories(Path.Combine(WindowsRoot, "System32"));
                Require(CreateDirectory(CandidateRoot, IntPtr.Zero)); holder.HoldDirectories(CandidateRoot);
                Require(CreateDirectory(AcquisitionRoot, IntPtr.Zero)); holder.HoldDirectories(AcquisitionRoot);
                Require(CreateDirectory(Path.Combine(CandidateRoot, "work"), IntPtr.Zero));
                holder.HoldDirectories(Path.Combine(CandidateRoot, "work"));
                Require(CreateDirectory(Path.Combine(AcquisitionRoot, "work"), IntPtr.Zero));
                holder.HoldDirectories(Path.Combine(AcquisitionRoot, "work")); ready = true;
            }
            public bool Ready { get { lock (retained) { return ready && !released && !Failed && Stopwatch.GetTimestamp() < OverallDeadline; } } }
            public bool Release()
            {
                lock (retained) {
                    if (released) return true;
                    if (admissionReserved || retained.Count != 0) return false;
                    ready = false;
                    try { if (!holder.ReleaseAdmission()) return false; } catch { return false; }
                    released = true; staging = null; return true;
                }
            }
        }
        VisionBootstrapProcess() { }
        public static StagingCustody ReserveStaging(long overallDeadlineTicks)
        {
            long now = Stopwatch.GetTimestamp();
            if (Environment.OSVersion.Platform != PlatformID.Win32NT || IntPtr.Size != 8 ||
                overallDeadlineTicks <= now || overallDeadlineTicks - now > Stopwatch.Frequency * 600 ||
                Environment.GetFolderPath(Environment.SpecialFolder.Windows) != WindowsRoot) throw new ArgumentException("STAGING_REJECTED");
            lock (retained) {
                if (staging != null || admissionReserved || retained.Count != 0) throw new InvalidOperationException("SLOT_RESERVED");
                staging = new StagingCustody(overallDeadlineTicks);
                try { staging.Reserve(); }
                catch { staging.Failed = true; } // return retained failed custody for explicit Release
                return staging;
            }
        }
        // Metadata export only, after all process/staging custody is reconciled. The
        // wrapper validates closed JSON schemas and supplies held/revalidated inventory
        // bytes. This owner never opens a caller path, traverses a tree or deletes data.
        // Release means resource retirement; only Completed also permits an upload marker.
        public sealed class EvidenceCustody
        {
            readonly VisionBootstrapProcess holder = new VisionBootstrapProcess();
            readonly List<EvidenceDirectory> directories = new List<EvidenceDirectory>();
            readonly Dictionary<string, EvidenceFile> files = new Dictionary<string, EvidenceFile>(StringComparer.Ordinal);
            bool ready, failed, releaseStarted, released, completeBeforeRelease, completed;

            sealed class EvidenceDirectory
            {
                public string Path;
                public SafeFileHandle Handle;
                public FILE_INFO Identity;
            }
            sealed class EvidenceFile
            {
                public FileStream Stream;
                public FILE_INFO Identity;
                public string Sha256;
                public int Length;
            }

            internal EvidenceCustody() { retained.Add(holder); }
            internal void Reserve()
            {
                try {
                    // Admit fixed ancestors top-down, before creating the fresh root.
                    HoldDirectory(@"D:\"); HoldDirectory(@"D:\a"); HoldDirectory(ParentRoot);
                    Require(CreateDirectory(EvidenceRoot, IntPtr.Zero));
                    HoldDirectory(EvidenceRoot);
                    CheckOutputs(); ready = true;
                } catch { failed = true; } // retain even a partially reserved custody
            }
            public bool Ready { get { lock (retained) { return ready && !failed && !releaseStarted; } } }
            public bool Completed { get { lock (retained) { return completed; } } }

            static int Limit(string name)
            {
                if (name == "materialization-report.json" || name == "evidence-manifest.json") return 65536;
                if (name == "installed-inventory.json") return 16777216;
                throw new ArgumentException("EVIDENCE_NAME_REJECTED");
            }
            void HoldDirectory(string path)
            {
                SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES(); security.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                // READ_ATTRIBUTES, SHARE_READ | SHARE_WRITE, OPEN_EXISTING,
                // BACKUP_SEMANTICS | OPEN_REPARSE_POINT, never SHARE_DELETE.
                IntPtr raw = CreateFile(path, 0x80, 3, ref security, 3, 0x02200000, IntPtr.Zero);
                Require(raw != InvalidHandle);
                AdmissionLease lease = new AdmissionLease(raw, null); holder.admission.Add(lease);
                SafeFileHandle handle = new SafeFileHandle(raw, false); lease.Resource = handle;
                FILE_INFO info; Require(GetFileInformationByHandle(handle, out info));
                if (GetFileType(handle) != 1 || (info.Attributes & 0x400) != 0 || (info.Attributes & 0x10) == 0)
                    throw new IOException("EVIDENCE_DIRECTORY_REJECTED");
                CheckFinal(handle, path);
                directories.Add(new EvidenceDirectory { Path = path, Handle = handle, Identity = info });
            }
            static bool SameIdentity(FILE_INFO before, FILE_INFO after)
            {
                return before.Volume == after.Volume && before.IndexHigh == after.IndexHigh && before.IndexLow == after.IndexLow &&
                    before.Attributes == after.Attributes && before.Links == after.Links;
            }
            static bool SameFile(FILE_INFO before, FILE_INFO after)
            {
                return SameIdentity(before, after) && before.SizeHigh == after.SizeHigh && before.SizeLow == after.SizeLow &&
                    before.Write.dwHighDateTime == after.Write.dwHighDateTime && before.Write.dwLowDateTime == after.Write.dwLowDateTime;
            }
            static string Digest(byte[] bytes)
            {
                using (SHA256 hash = SHA256.Create())
                    return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
            }
            static string Digest(FileStream file)
            {
                file.Position = 0;
                using (SHA256 hash = SHA256.Create())
                    return BitConverter.ToString(hash.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
            }
            static FILE_INFO InspectFile(string name, FileStream file, int length)
            {
                FILE_INFO info; Require(GetFileInformationByHandle(file.SafeFileHandle, out info));
                CheckFinal(file.SafeFileHandle, Path.Combine(EvidenceRoot, name));
                if (GetFileType(file.SafeFileHandle) != 1 || (info.Attributes & 0x450) != 0 || info.Links != 1 ||
                    info.SizeHigh != 0 || info.SizeLow != length || file.Length != length || length > Limit(name))
                    throw new IOException("EVIDENCE_FILE_REJECTED");
                return info;
            }
            void CheckOutputs()
            {
                foreach (EvidenceDirectory directory in directories) {
                    FILE_INFO current; Require(GetFileInformationByHandle(directory.Handle, out current));
                    CheckFinal(directory.Handle, directory.Path);
                    if (!SameIdentity(directory.Identity, current)) throw new IOException("EVIDENCE_DIRECTORY_CHANGED");
                }
                int entries = 0;
                foreach (string path in Directory.EnumerateFileSystemEntries(EvidenceRoot)) {
                    string name = Path.GetFileName(path);
                    if (++entries > 3 || !files.ContainsKey(name) || path != Path.Combine(EvidenceRoot, name))
                        throw new IOException("EVIDENCE_OUTPUT_REJECTED");
                }
                if (entries != files.Count) throw new IOException("EVIDENCE_OUTPUT_MISSING");
                foreach (KeyValuePair<string, EvidenceFile> pair in files) {
                    EvidenceFile file = pair.Value;
                    FILE_INFO before = InspectFile(pair.Key, file.Stream, file.Length);
                    string digest = Digest(file.Stream);
                    FILE_INFO after = InspectFile(pair.Key, file.Stream, file.Length);
                    if (!SameFile(file.Identity, before) || !SameFile(before, after) || digest != file.Sha256)
                        throw new IOException("EVIDENCE_FILE_CHANGED");
                }
            }
            public string Write(string name, byte[] bytes)
            {
                lock (retained) {
                    if (!Ready) throw new InvalidOperationException("EVIDENCE_NOT_READY");
                    try {
                        int maximum = Limit(name);
                        if (bytes == null || bytes.Length == 0 || bytes.Length > maximum || files.ContainsKey(name))
                            throw new ArgumentException("EVIDENCE_BYTES_REJECTED");
                        // No caller-owned array survives admission. The returned digest is
                        // independently computed from resulting flushed, held file bytes.
                        byte[] owned = (byte[])bytes.Clone(); string expected = Digest(owned);
                        CheckOutputs();
                        SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES(); security.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                        // READ | WRITE, SHARE_READ only, CREATE_NEW, OPEN_REPARSE_POINT.
                        IntPtr raw = CreateFile(Path.Combine(EvidenceRoot, name), 0xc0000000, 1, ref security, 1, 0x00200000, IntPtr.Zero);
                        Require(raw != InvalidHandle);
                        AdmissionLease lease = new AdmissionLease(raw, null); holder.admission.Add(lease);
                        FileStream file = new FileStream(new SafeFileHandle(raw, false), FileAccess.ReadWrite, 65536, false);
                        lease.Resource = file;
                        InspectFile(name, file, 0);
                        file.Write(owned, 0, owned.Length); file.Flush(true);
                        FILE_INFO before = InspectFile(name, file, owned.Length);
                        string digest = Digest(file);
                        FILE_INFO after = InspectFile(name, file, owned.Length);
                        if (!SameFile(before, after) || digest != expected) throw new IOException("EVIDENCE_WRITE_CHANGED");
                        files.Add(name, new EvidenceFile { Stream = file, Identity = after, Sha256 = digest, Length = owned.Length });
                        CheckOutputs(); return digest;
                    } catch { failed = true; ready = false; throw; }
                }
            }
            public bool Release()
            {
                lock (retained) {
                    if (released) return true;
                    if (admissionReserved || staging != null || retained.Count != 1 || !retained.Contains(holder)) return false;
                    ready = false;
                    if (!releaseStarted) {
                        releaseStarted = true;
                        try {
                            if (!failed) {
                                CheckOutputs();
                                completeBeforeRelease = files.ContainsKey("materialization-report.json") && files.ContainsKey("evidence-manifest.json");
                            }
                        } catch { failed = true; }
                    }
                    // A partial close may expose already closed outputs. A later close
                    // retry retires custody but cannot promote that export to Completed.
                    try { if (!holder.ReleaseAdmission()) { failed = true; return false; } }
                    catch { failed = true; return false; }
                    released = true; completed = completeBeforeRelease && !failed;
                    retained.Remove(holder); evidence = null; return true;
                }
            }
        }
        public static EvidenceCustody ReserveEvidence()
        {
            if (Environment.OSVersion.Platform != PlatformID.Win32NT || IntPtr.Size != 8 ||
                Environment.GetFolderPath(Environment.SpecialFolder.Windows) != WindowsRoot) throw new ArgumentException("EVIDENCE_REJECTED");
            lock (retained) {
                if (evidence != null || staging != null || admissionReserved || retained.Count != 0) throw new InvalidOperationException("SLOT_RESERVED");
                evidence = new EvidenceCustody(); evidence.Reserve(); return evidence;
            }
        }
        // Trusted manifest bootstrap only: no caller executable, argv, cwd or env.
        public static VisionBootstrapProcess Admit(StagingCustody custody, BootstrapProfile profile,
            IDictionary<string, string> candidateHashes, IDictionary<string, string> acquisitionHashes)
        {
            lock (retained) {
                if (admissionReserved || retained.Count != 0) throw new InvalidOperationException("SLOT_RESERVED");
                if (custody == null || custody != staging || !custody.Ready || custody.HostStep != 2 || (int)profile != custody.NextProfile ||
                    !Enum.IsDefined(typeof(BootstrapProfile), profile)) throw new ArgumentException("ORDER_REJECTED");
                admissionReserved = true;
            }
            try { return new VisionBootstrapProcess(custody, profile, candidateHashes, acquisitionHashes); }
            catch { lock (retained) { custody.Failed = true; } throw; }
            finally { lock (retained) { admissionReserved = false; } }
        }
        VisionBootstrapProcess(StagingCustody owner, BootstrapProfile selected, IDictionary<string, string> hashes,
            IDictionary<string, string> acquisitionHashes)
        {
            started = Stopwatch.GetTimestamp(); custody = owner; profile = selected; rootPath = CandidateRoot;
            deadline = Math.Min(owner.OverallDeadline, checked(started + Stopwatch.Frequency * 120));
            outputLimit = 65536;
            try {
                if (deadline <= started || hashes == null || hashes.Count > 50000 || acquisitionHashes == null || acquisitionHashes.Count > 1000)
                    throw new IOException("ADMISSION_REJECTED");
                hashes = new Dictionary<string, string>(hashes, StringComparer.Ordinal);
                acquisitionHashes = new Dictionary<string, string>(acquisitionHashes, StringComparer.Ordinal);
                HoldDirectories(CandidateRoot); HoldDirectories(AcquisitionRoot);
                HoldTree(CandidateRoot, "python", hashes);
                bool preprocess = profile == BootstrapProfile.CreatePreprocess || profile == BootstrapProfile.InstallPreprocess;
                bool create = profile == BootstrapProfile.CreatePreprocess || profile == BootstrapProfile.CreateOcr;
                string target = preprocess ? "preprocess-runtime" : "ocr-runtime";
                if (create) {
                    string destination = Path.Combine(CandidateRoot, target);
                    if (Directory.Exists(destination) || File.Exists(destination)) throw new IOException("DESTINATION_EXISTS");
                    executable = HoldFile(CandidateRoot, "python/python.exe", hashes);
                    arguments = new string[] { "-I", "-B", "-m", "venv", "--without-pip", "--copies", "--without-scm-ignore-files",
                        "--prompt", preprocess ? "fonesi-p4-preprocess-v1" : "fonesi-p4-ocr-v1", destination };
                } else {
                    // Do NOT read-hold writable target site-packages. Pin only its launch
                    // originals/config, plus the entire immutable base/pip/wheel closure.
                    HoldInitialVenv(target, hashes);
                    executable = HoldFile(CandidateRoot, target + "/Scripts/python.exe", hashes);
                    HoldFile(CandidateRoot, target + "/pyvenv.cfg", hashes);
                    string wheelhouse = preprocess ? "preprocess-wheelhouse" : "ocr-wheelhouse";
                    string lockPath = "locks/" + (preprocess ? "preprocess" : "ocr") + "-requirements-windows.lock";
                    string expectedLock = preprocess ? "3a855aa577e4e21615eb9a2ab3741f4ee3c71ea86c31e1d2a069518c301ea4ff" : "adad5582bcdee77451031e1ec3cf9ebc2d9b0cd60ad423bcb0891f62a913fc84";
                    string lockHash;
                    if (!acquisitionHashes.TryGetValue(lockPath, out lockHash) || lockHash != expectedLock) throw new IOException("LOCK_REJECTED");
                    HoldTree(AcquisitionRoot, wheelhouse, acquisitionHashes);
                    string admittedLock = HoldFile(AcquisitionRoot, lockPath, acquisitionHashes);
                    string runner = HoldFile(CandidateRoot, "python/Lib/site-packages/pip/__pip-runner__.py", hashes);
                    arguments = new string[] { "-I", "-B", runner, "--isolated", "--disable-pip-version-check", "install", "--no-index", "--no-deps",
                        "--require-hashes", "--only-binary=:all:", "--no-compile", "--no-cache-dir", "--no-warn-script-location",
                        "--find-links", Path.Combine(AcquisitionRoot, wheelhouse), "-r", admittedLock };
                }
                // Explicit operational namespace outside candidate: never wheelhouse input or code exclusion.
                string parent = Path.Combine(AcquisitionRoot, "work"); HoldDirectories(parent);
                work = Path.Combine(parent, Guid.NewGuid().ToString("D")); Require(CreateDirectory(work, IntPtr.Zero));
                foreach (string name in new string[] { "home", "tmp", "appdata", "localappdata" }) {
                    string directory = Path.Combine(work, name); Require(CreateDirectory(directory, IntPtr.Zero)); HoldDirectories(directory);
                }
                HoldDirectories(work);
                if (Stopwatch.GetTimestamp() >= deadline) throw new IOException("DEADLINE");
                lock (retained) { retained.Add(this); }
            } catch {
                owner.Failed = true;
                if (!ReleaseAdmission()) {
                    status = "ADMISSION_CLEANUP_UNCERTAIN"; begun = true; PauseObservation();
                    lock (retained) { retained.Add(this); }
                } else throw;
            }
        }

        // Host tools remain the existing trusted CI base, not an exact stdlib/DLL closure.
        public sealed class HostToolContext
        {
            public readonly string ToolCacheRoot, PythonVersion, PythonSha256, CheckoutRoot, NpmVersion;
            public HostToolContext(string toolCacheRoot, string pythonVersion, string pythonSha256, string checkoutRoot, string npmVersion)
            {
                ToolCacheRoot = toolCacheRoot; PythonVersion = pythonVersion; PythonSha256 = pythonSha256;
                CheckoutRoot = checkoutRoot; NpmVersion = npmVersion;
            }
        }
        static readonly string[] HostSourceNames = {
            "windows_vision_host.py", "windows_vision_catalog.py", "windows_vision_materialize.py", "windows_vision_prepare.py",
            "windows_materialization_catalog.json", "windows_python_members.json", "preprocess-requirements-windows.lock",
            "ocr-requirements-windows.lock", "source-index.json"
        };
        static readonly string[] BundleSourceNames = {
            "desktop/scripts/stage-vision-source.mjs", "desktop/scripts/verify-dependencies.mjs", "desktop/scripts/build-manifest.mjs",
            "desktop/package.json", "desktop/package-lock.json", "desktop/dependency-review.json", "desktop/biome-review.json",
            "desktop/build/.verified-build.json", "desktop/verification/vision-qualification-fixture.mjs", "desktop/verification/ocr_evaluation_metrics.py",
            "desktop/src/main/capture-contract.ts", "desktop/src/main/preprocess-contract.ts", "desktop/src/main/input-contract.ts", "desktop/src/main/adb-discovery.ts",
            "desktop/vision/preprocess_worker.py", "desktop/vision/ocr_windows_worker.py", "desktop/node_modules/esbuild/package.json",
            "desktop/node_modules/esbuild/lib/main.js", "desktop/node_modules/@esbuild/win32-x64/package.json", "desktop/node_modules/@esbuild/win32-x64/esbuild.exe",
            "tools/phase-00/desktop-stack-lab/package-lock.json", "tools/phase-00/desktop-stack-lab/dependency-review.json"
        };
        public static string[] BundleSourcePaths { get { return (string[])BundleSourceNames.Clone(); } }
        const string HostNodeHash = "d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5";
        const string HostBootstrap = "import runpy,sys;sys.path.insert(0,r'D:\\a\\_temp\\fonesi-p4-windows-acquisition-v1\\host-source');runpy.run_path(r'D:\\a\\_temp\\fonesi-p4-windows-acquisition-v1\\host-source\\windows_vision_host.py',run_name='__main__')";
        public static VisionBootstrapProcess AdmitHost(StagingCustody custody, HostStagingProfile profile, HostToolContext context,
            IDictionary<string, string> hostSourceHashes, IDictionary<string, string> bundleSourceHashes)
        {
            lock (retained) {
                if (admissionReserved || retained.Count != 0) throw new InvalidOperationException("SLOT_RESERVED");
                bool order = custody != null && custody == staging && custody.Ready &&
                    ((profile == HostStagingProfile.Prepare && custody.HostStep == 0 && custody.NextProfile == 0) ||
                    (profile == HostStagingProfile.Bundle && custody.HostStep == 1 && custody.NextProfile == 0) ||
                    (profile == HostStagingProfile.Freeze && custody.HostStep == 2 && custody.NextProfile == 4));
                if (!order) throw new ArgumentException("ORDER_REJECTED");
                admissionReserved = true;
            }
            try { return new VisionBootstrapProcess(custody, profile, context, hostSourceHashes, bundleSourceHashes); }
            catch { lock (retained) { custody.Failed = true; } throw; }
            finally { lock (retained) { admissionReserved = false; } }
        }
        static bool HasEntries(string directory)
        {
            // foreach disposes the native directory enumerator even on early return.
            foreach (string entry in Directory.EnumerateFileSystemEntries(directory)) return true;
            return false;
        }
        static Dictionary<string, string> ExactMap(IDictionary<string, string> source, string[] names)
        {
            if (source == null || source.Count != names.Length) throw new IOException("HOST_SOURCE_MAP");
            Dictionary<string, string> copy = new Dictionary<string, string>(source, StringComparer.Ordinal);
            foreach (string name in names) {
                string hash;
                if (!copy.TryGetValue(name, out hash) || hash == null || !System.Text.RegularExpressions.Regex.IsMatch(hash, "\\A[0-9a-f]{64}\\z")) throw new IOException("HOST_SOURCE_MAP");
            }
            return copy;
        }
        VisionBootstrapProcess(StagingCustody owner, HostStagingProfile selected, HostToolContext context,
            IDictionary<string, string> hostSourceHashes, IDictionary<string, string> bundleSourceHashes)
        {
            started = Stopwatch.GetTimestamp(); custody = owner; hostOperation = true; hostProfile = selected; rootPath = CandidateRoot;
            deadline = selected == HostStagingProfile.Prepare ? owner.OverallDeadline : Math.Min(owner.OverallDeadline, checked(started + Stopwatch.Frequency * 120));
            outputLimit = 65536;
            try {
                if (deadline <= started || context == null || String.IsNullOrEmpty(context.ToolCacheRoot) || String.IsNullOrEmpty(context.CheckoutRoot) ||
                    context.ToolCacheRoot != Environment.GetEnvironmentVariable("RUNNER_TOOL_CACHE") || context.CheckoutRoot != Environment.GetEnvironmentVariable("GITHUB_WORKSPACE") ||
                    context.PythonVersion == null || !System.Text.RegularExpressions.Regex.IsMatch(context.PythonVersion, "\\A3\\.12\\.[0-9]{1,3}\\z") ||
                    (context.NpmVersion != "11.9.0" && context.NpmVersion != "11.19.1")) throw new IOException("HOST_CONTEXT_REJECTED");
                HoldDirectories(context.ToolCacheRoot); HoldDirectories(context.CheckoutRoot);
                HoldDirectories(CandidateRoot); HoldDirectories(AcquisitionRoot);
                Dictionary<string, string> helper = ExactMap(hostSourceHashes, HostSourceNames);
                string helperRoot = Path.Combine(AcquisitionRoot, "host-source"); HoldDirectories(helperRoot);
                int sourceCount = 0;
                foreach (string entry in Directory.EnumerateFileSystemEntries(helperRoot)) {
                    if (++sourceCount > HostSourceNames.Length || !helper.ContainsKey(Path.GetFileName(entry))) throw new IOException("HOST_SOURCE_MAP");
                    HoldFile(helperRoot, Path.GetFileName(entry), helper);
                }
                if (sourceCount != HostSourceNames.Length) throw new IOException("HOST_SOURCE_MAP");
                hostIndexHash = helper["source-index.json"];
                if (selected == HostStagingProfile.Prepare) {
                    foreach (string entry in Directory.EnumerateFileSystemEntries(AcquisitionRoot))
                        if (entry != helperRoot && entry != Path.Combine(AcquisitionRoot, "work")) throw new IOException("PREPARE_NOT_FRESH");
                    foreach (string entry in Directory.EnumerateFileSystemEntries(CandidateRoot))
                        if (entry != Path.Combine(CandidateRoot, "work")) throw new IOException("PREPARE_NOT_FRESH");
                    if (HasEntries(Path.Combine(AcquisitionRoot, "work")) ||
                        HasEntries(Path.Combine(CandidateRoot, "work"))) throw new IOException("PREPARE_NOT_FRESH");
                }
                string toolRelative;
                if (selected == HostStagingProfile.Bundle) {
                    toolRelative = "node/24.22.1/x64/node.exe"; hostToolHash = HostNodeHash;
                    Dictionary<string, string> bundle = ExactMap(bundleSourceHashes, BundleSourceNames);
                    foreach (string name in BundleSourceNames) HoldFile(context.CheckoutRoot, name, bundle);
                    arguments = new string[] { Path.Combine(context.CheckoutRoot, "desktop", "scripts", "stage-vision-source.mjs"), context.NpmVersion };
                } else {
                    toolRelative = "Python/" + context.PythonVersion + "/x64/python.exe"; hostToolHash = context.PythonSha256;
                    expectedPythonVersion = context.PythonVersion;
                    string toolDirectory = Path.Combine(context.ToolCacheRoot, "Python", context.PythonVersion, "x64");
                    HoldDirectories(toolDirectory);
                    foreach (string entry in Directory.EnumerateFileSystemEntries(toolDirectory))
                        if (Path.GetFileName(entry).EndsWith("._pth", StringComparison.OrdinalIgnoreCase)) throw new IOException("HOST_STARTUP_OVERRIDE");
                    arguments = new string[] { "-I", "-S", "-B", "-c", HostBootstrap };
                }
                Dictionary<string, string> toolPins = new Dictionary<string, string>(StringComparer.Ordinal); toolPins.Add(toolRelative, hostToolHash);
                executable = HoldFile(context.ToolCacheRoot, toolRelative, toolPins);
                string version = FileVersionInfo.GetVersionInfo(executable).FileVersion;
                if (version != null && (version.Length > 128 || System.Text.RegularExpressions.Regex.IsMatch(version, "[^ -~]"))) throw new IOException("HOST_VERSION_METADATA");
                hostFileVersion = version; // null means unavailable, not verified version
                string parent = Path.Combine(AcquisitionRoot, "work"); HoldDirectories(parent);
                work = Path.Combine(parent, Guid.NewGuid().ToString("D")); Require(CreateDirectory(work, IntPtr.Zero));
                foreach (string name in new string[] { "home", "tmp", "appdata", "localappdata" }) {
                    string directory = Path.Combine(work, name); Require(CreateDirectory(directory, IntPtr.Zero)); HoldDirectories(directory);
                }
                HoldDirectories(work);
                if (Stopwatch.GetTimestamp() >= deadline) throw new IOException("DEADLINE");
                lock (retained) { retained.Add(this); }
            } catch {
                owner.Failed = true;
                if (!ReleaseAdmission()) {
                    status = "ADMISSION_CLEANUP_UNCERTAIN"; begun = true; PauseObservation();
                    lock (retained) { retained.Add(this); }
                } else throw;
            }
        }

        void HoldInitialVenv(string target, IDictionary<string, string> hashes)
        {
            // Fresh --without-pip output only. No imported/startup payload is allowed
            // in the writable destination before installation; generated files are
            // inventoried by the host after retirement, never normalized/deleted here.
            // Inspected pinned archive Lib/venv/__init__.py (6bb44af4...db5ef):
            // normal-GIL setup_python copies two nt launchers; install_scripts selects
            // common + nt (NOT posix), excludes venv*.exe/.pdb. Exactly eight files.
            HashSet<string> allowed = new HashSet<string>(StringComparer.Ordinal) {
                "pyvenv.cfg", "Scripts/python.exe", "Scripts/pythonw.exe", "Scripts/Activate.ps1",
                "Scripts/activate", "Scripts/activate.bat", "Scripts/deactivate.bat",
                "Scripts/activate.fish"
            };
            HashSet<string> directories = new HashSet<string>(StringComparer.Ordinal) {
                "", "Include", "Lib", "Lib/site-packages", "Scripts"
            };
            Stack<string> pending = new Stack<string>(); pending.Push("");
            int count = 0;
            while (pending.Count != 0) {
                string relative = pending.Pop();
                string directory = Path.Combine(CandidateRoot, target, relative.Replace('/', Path.DirectorySeparatorChar));
                HoldDirectories(directory);
                foreach (string entry in Directory.EnumerateFileSystemEntries(directory)) {
                    if (++count > 32 || Stopwatch.GetTimestamp() >= deadline) throw new IOException("VENV_INITIAL_REJECTED");
                    string name = (relative.Length == 0 ? "" : relative + "/") + Path.GetFileName(entry);
                    FileAttributes attributes = File.GetAttributes(entry);
                    if ((attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("VENV_INITIAL_REJECTED");
                    if ((attributes & FileAttributes.Directory) != 0) {
                        if (!directories.Contains(name)) throw new IOException("VENV_INITIAL_REJECTED");
                        pending.Push(name);
                    } else {
                        if (!allowed.Contains(name)) throw new IOException("VENV_INITIAL_REJECTED");
                        HoldFile(CandidateRoot, target + "/" + name, hashes);
                    }
                }
            }
            foreach (string name in allowed) {
                if (!heldFiles.Contains(Path.Combine(CandidateRoot, target, name.Replace('/', Path.DirectorySeparatorChar)))) throw new IOException("VENV_INITIAL_MISSING");
            }
            foreach (string name in directories) {
                if (!heldDirectories.Contains(Path.Combine(CandidateRoot, target, name.Replace('/', Path.DirectorySeparatorChar)))) throw new IOException("VENV_INITIAL_MISSING");
            }
            foreach (string key in hashes.Keys) {
                if (key.StartsWith(target + "/", StringComparison.Ordinal) &&
                    !heldFiles.Contains(Path.Combine(CandidateRoot, key.Replace('/', Path.DirectorySeparatorChar)))) throw new IOException("CLOSURE_MISSING");
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
            if (!String.Equals(actual.TrimEnd('\\'), expected.TrimEnd('\\'), StringComparison.Ordinal)) throw new IOException("PATH_REJECTED");
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
            SortedDictionary<string, string> values = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            values.Add("SystemRoot", WindowsRoot); values.Add("WINDIR", WindowsRoot);
            values.Add("PATH", Path.Combine(WindowsRoot, "System32"));
            values.Add("HOME", Path.Combine(work, "home")); values.Add("USERPROFILE", Path.Combine(work, "home"));
            values.Add("APPDATA", Path.Combine(work, "appdata")); values.Add("LOCALAPPDATA", Path.Combine(work, "localappdata"));
            values.Add("TEMP", Path.Combine(work, "tmp")); values.Add("TMP", Path.Combine(work, "tmp"));
            if (!hostOperation) {
                values.Add("SOURCE_DATE_EPOCH", "946684800"); values.Add("PIP_CONFIG_FILE", "NUL");
                values.Add("PIP_DISABLE_PIP_VERSION_CHECK", "1"); values.Add("PIP_NO_INPUT", "1");
            }
            if (!hostOperation || hostProfile != HostStagingProfile.Bundle) {
                values.Add("PYTHONDONTWRITEBYTECODE", "1"); values.Add("PYTHONNOUSERSITE", "1");
            }
            if (hostOperation && hostProfile != HostStagingProfile.Bundle) {
                values.Add("FONESI_VISION_HOST_STAGE", hostProfile == HostStagingProfile.Prepare ? "PREPARE" : "FREEZE");
                values.Add("FONESI_VISION_HOST_INDEX_SHA256", hostIndexHash);
            }
            StringBuilder block = new StringBuilder();
            foreach (KeyValuePair<string, string> pair in values) block.Append(pair.Key).Append('=').Append(pair.Value).Append('\0');
            return block.Append('\0').ToString();
        }

        public BootstrapResult Begin()
        {
            lock (gate) {
                if (begun || retired) throw new InvalidOperationException("SLOT_RESERVED");
                begun = true; // reserve before inspecting/copying caller bytes
                byte[] owned = new byte[0]; // bootstrap has no caller stdin or command channel
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
                    foreach (string argument in arguments) command.Append(" ").Append(QuoteArgument(argument));
                    environment = Marshal.StringToHGlobalUni(EnvironmentBlock());
                    PROCESS_INFORMATION child;
                    Require(CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true, CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT | 0x400,
                        environment, work, ref startup, out child));
                    process = child.hProcess; primaryThread = child.hThread; launched = true;
                    Require(AssignProcessToJobObject(job, process)); assigned = true;
                    Close(ref inputRead); Close(ref outputWrite); Close(ref errorWrite);
                    stdout = TakePipe(ref outputRead, null, outputLimit); stderr = TakePipe(ref errorRead, null, outputLimit); stdin = TakePipe(ref inputWrite, owned, 0);
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
            lock (retained) {
                retained.Remove(this);
                if (status == "SUCCESS") { if (hostOperation) custody.HostStep++; else custody.NextProfile++; }
                else custody.Failed = true;
            }
            // Work roots are deliberately preserved for the trusted harness to remove only
            // AFTER Retired. No recursive deletion of vendor-created files in this owner.
        }
        bool TryCloseProcess() { return TryClose(ref process); }
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
            if (!retired && drainStarted != 0 && Stopwatch.GetTimestamp() - drainStarted >= Stopwatch.Frequency * 10) {
                PauseObservation(); // retain handles; only explicit Reconcile continues
                if (observer != null) { observer.Dispose(); observer = null; }
            }
        }
        BootstrapResult Snapshot()
        {
            BootstrapResult result = new BootstrapResult(); result.Status = status; result.Retired = retired; result.ExitCode = exitCode;
            // Never expose provisional bytes while any owned resource remains live/unknown.
            result.Stdout = !retired || stdout == null ? new byte[0] : stdout.Snapshot(); result.Stderr = !retired || stderr == null ? new byte[0] : stderr.Snapshot();
            result.StdoutOverflow = stdout != null && stdout.Overflow; result.StderrOverflow = stderr != null && stderr.Overflow;
            result.HostToolSha256 = hostToolHash; result.HostFileVersion = hostFileVersion; result.ExpectedPythonVersion = expectedPythonVersion;
            result.PeakWorkingSetBytes = peakWorkingSet; result.ElapsedMilliseconds = (Stopwatch.GetTimestamp() - started) * 1000 / Stopwatch.Frequency;
            return result;
        }
        public BootstrapResult Poll() { lock (gate) { if (begun && !observationStopped) SafeObserve(); return Snapshot(); } }
        public BootstrapResult Cancel()
        {
            lock (gate) {
                if (!retired) { status = "CANCELLED"; SafeStopOwned(); if (!observationStopped) SafeObserve(); }
                return Snapshot();
            }
        }
        public BootstrapResult Reconcile(int milliseconds)
        {
            if (milliseconds < 0 || milliseconds > 10000) throw new ArgumentException("RECONCILE_BOUND");
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
