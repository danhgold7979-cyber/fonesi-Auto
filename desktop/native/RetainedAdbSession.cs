// SOURCE ONLY. Compile together with the unchanged IsolatedAdbServer.cs.
// No native bridge/process launcher is installed by this partial extension.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using Microsoft.Win32.SafeHandles;

namespace Fonesi.Development.Server
{
    public static partial class IsolatedAdbServer
    {
        public sealed class RetainedProvider
        {
            readonly object gate = new object(), cleanupGate = new object();
            readonly string root, owner, executable, executableHash;
            long generation;
            State current;
            public sealed class Attempt
            {
                internal readonly object state;
                internal Attempt(object state) { this.state = state; }
            }
            sealed class State
            {
                internal readonly RetainedProvider provider;
                internal readonly long generation;
                internal readonly string kind;
                internal bool stopping, entered, terminal, started, assigned, profileReserved;
                internal int workers, port;
                internal bool stdoutJoinAttempted, stdoutJoined, stderrJoinAttempted, stderrJoined;
                internal IntPtr job;
                internal PROCESS_INFORMATION process;
                internal Drain stdout, stderr;
                internal string android, profileWitness;
                internal SafeFileHandle profileGuard;
                internal FILE_INFO profileIdentity;
                internal int? exit;
                internal State(RetainedProvider provider, long generation, string kind)
                { this.provider = provider; this.generation = generation; this.kind = kind; }
            }
            // Only fixed keys are serialized. No private handles, streams, paths or exception text.
            public sealed class Reply
            {
                readonly Dictionary<string, object> fields;
                internal Reply(Dictionary<string, object> fields) { this.fields = fields; }
                public IDictionary<string, object> Snapshot() { return new System.Collections.ObjectModel.ReadOnlyDictionary<string, object>(new Dictionary<string, object>(fields)); }
            }
            static Reply Failure(string code) { return new Reply(new Dictionary<string, object> { { "code", code } }); }
            static string AdmissionFailure(Exception error)
            {
                string code = error.Message;
                return code == "PROFILE_REJECTED" || code == "BINARY_CHANGED" || code == "ADMISSION_REJECTED" || code == "ENDPOINT_REJECTED" ? code : "NATIVE_FAILED";
            }
            Reply Facts(State a, string observation)
            {
                Dictionary<string, object> f = new Dictionary<string, object> {
                    { "version", 2 }, { "kind", a.kind == "VERSION" ? "INVOCATION" : "SESSION" },
                    { "dispatched", a.started }, { "exitCode", a.exit }, { "observation", observation }
                };
                if (a.kind == "VERSION") f.Add("processRetired", a.terminal);
                else { f.Add("jobState", a.terminal ? "RETIRED" : "LIVE"); f.Add("endpointState", a.terminal ? "ABSENT" : "OWNED"); }
                return new Reply(f);
            }
            public RetainedProvider(string ownedRunRoot, string ownerToken, string verifiedExecutable, string expectedExeSha256)
            {
                Guid parsed;
                if (!Guid.TryParseExact(ownerToken, "D", out parsed) || parsed.ToString() != ownerToken ||
                    String.IsNullOrEmpty(ownedRunRoot) || String.IsNullOrEmpty(verifiedExecutable) ||
                    expectedExeSha256 == null || !System.Text.RegularExpressions.Regex.IsMatch(expectedExeSha256, "\\A[0-9a-f]{64}\\z")) throw new ArgumentException("ADMISSION_REJECTED");
                root = ownedRunRoot; owner = ownerToken; executable = verifiedExecutable; executableHash = expectedExeSha256;
            }
            bool Exact(State a) { return a != null && Object.ReferenceEquals(a.provider, this) && Object.ReferenceEquals(current, a) && a.generation == generation; }
            public Attempt Reserve(string kind)
            {
                lock (gate) {
                    if ((kind != "VERSION" && kind != "FOREGROUND") || (current != null && !current.terminal) || generation == Int64.MaxValue) throw new InvalidOperationException("BUSY");
                    current = new State(this, ++generation, kind); return new Attempt(current);
                }
            }
            void Admission()
            {
                ExactOwner(root, owner);
                if (Environment.OSVersion.Platform != PlatformID.Win32NT || !Environment.Is64BitOperatingSystem ||
                    !Path.IsPathRooted(executable) || Path.GetFullPath(executable) != executable || Path.GetExtension(executable) != ".exe") throw new IOException("ADMISSION_REJECTED");
                PlainDirectory(Path.GetDirectoryName(executable));
                if (Digest(Bytes(executable, 16777216)) != executableHash) throw new IOException("BINARY_CHANGED");
            }
            void Profile(State a)
            {
                a.android = Path.Combine(NativeProfile(), ".android");
                if (!ReserveAbsentProfile(a.android)) throw new IOException("PROFILE_REJECTED");
                a.profileReserved = true;
                SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES(); security.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                IntPtr raw = CreateFile(a.android, 0x80, 3, ref security, 3, 0x02000000, IntPtr.Zero);
                Require(raw != InvalidHandle); a.profileGuard = new SafeFileHandle(raw, true);
                Require(GetFileInformationByHandle(a.profileGuard, out a.profileIdentity));
                using (FileStream marker = new FileStream(Path.Combine(a.android, ".fonesi-server-owner"), FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                    byte[] bytes = Encoding.ASCII.GetBytes(owner); marker.Write(bytes, 0, bytes.Length); marker.Flush(true);
                }
                ProfileWitness(a.android, owner, false);
            }
            void SameProfile(State a)
            {
                if (a.profileGuard == null || a.profileGuard.IsClosed || a.profileGuard.IsInvalid) throw new IOException("PROFILE_CHANGED");
                FILE_INFO now; Require(GetFileInformationByHandle(a.profileGuard, out now));
                if (now.Volume != a.profileIdentity.Volume || now.IndexHigh != a.profileIdentity.IndexHigh || now.IndexLow != a.profileIdentity.IndexLow || (now.Attributes & 0x400) != 0) throw new IOException("PROFILE_CHANGED");
                PlainDirectory(a.android);
            }
            // Shared interop/Drain/quoting implementations are reused, not redeclared.
            void Launch(State a)
            {
                IntPtr outputRead = IntPtr.Zero, outputWrite = IntPtr.Zero, errorRead = IntPtr.Zero, errorWrite = IntPtr.Zero;
                IntPtr input = IntPtr.Zero, attributes = IntPtr.Zero, handles = IntPtr.Zero, environment = IntPtr.Zero;
                bool initialized = false;
                try {
                    SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES(); security.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); security.bInheritHandle = 1;
                    Require(CreatePipe(out outputRead, out outputWrite, ref security, 0)); Require(CreatePipe(out errorRead, out errorWrite, ref security, 0));
                    Require(SetHandleInformation(outputRead, 1, 0)); Require(SetHandleInformation(errorRead, 1, 0));
                    input = CreateFile("NUL", 0x80000000, 3, ref security, 3, 0, IntPtr.Zero); Require(input != InvalidHandle);
                    a.job = CreateJobObject(IntPtr.Zero, null); Require(a.job != IntPtr.Zero);
                    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION(); limits.BasicLimitInformation.LimitFlags = KILL_ON_JOB_CLOSE;
                    Require(SetInformationJobObject(a.job, JobObjectExtendedLimitInformation, ref limits, (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))));
                    IntPtr size = IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size); attributes = Marshal.AllocHGlobal(size);
                    Require(InitializeProcThreadAttributeList(attributes, 1, 0, ref size)); initialized = true;
                    handles = Marshal.AllocHGlobal(IntPtr.Size * 3); Marshal.WriteIntPtr(handles, 0, input); Marshal.WriteIntPtr(handles, IntPtr.Size, outputWrite); Marshal.WriteIntPtr(handles, IntPtr.Size * 2, errorWrite);
                    Require(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x00020002), handles, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero));
                    STARTUPINFOEX startup = new STARTUPINFOEX(); startup.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX)); startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
                    startup.StartupInfo.hStdInput = input; startup.StartupInfo.hStdOutput = outputWrite; startup.StartupInfo.hStdError = errorWrite; startup.lpAttributeList = attributes;
                    environment = EnvironmentBlock(root);
                    string[] arguments = a.kind == "VERSION" ? new string[] { "version" } : new string[] { "-L", "tcp:127.0.0.1:" + a.port, "server", "nodaemon" };
                    StringBuilder command = new StringBuilder(QuoteArgument(executable)); foreach (string arg in arguments) command.Append(" ").Append(QuoteArgument(arg));
                    lock (gate) {
                        if (a.stopping) throw new InvalidOperationException("CLOSED");
                        Require(CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true, CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT | 0x400, environment, Path.GetDirectoryName(executable), ref startup, out a.process));
                        a.started = true;
                        Require(AssignProcessToJobObject(a.job, a.process.hProcess)); a.assigned = true;
                    }
                    Close(ref outputWrite); Close(ref errorWrite); Close(ref input);
                    a.stdout = TakeDrain(ref outputRead, 32768); a.stderr = TakeDrain(ref errorRead, 32768); a.stdout.Start(); a.stderr.Start();
                    lock (gate) {
                        if (a.stopping) throw new InvalidOperationException("CLOSED");
                        Require(ResumeThread(a.process.hThread) != 0xffffffff); Close(ref a.process.hThread);
                    }
                } finally {
                    Close(ref outputWrite); Close(ref errorWrite); Close(ref input); Close(ref outputRead); Close(ref errorRead);
                    if (initialized) DeleteProcThreadAttributeList(attributes);
                    if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes); if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles); if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
                }
            }
            bool Enter(State a, string kind, bool initial)
            {
                lock (gate) {
                    if (!Exact(a) || a.kind != kind || a.stopping || a.terminal || a.workers != 0 || (initial ? a.entered : !a.entered || !a.started)) return false;
                    if (initial) a.entered = true; a.workers++; return true;
                }
            }
            void Leave(State a) { lock (gate) { a.workers--; Monitor.PulseAll(gate); } }
            bool Stopping(State a) { lock (gate) { return a.stopping; } }
            bool Live(State a) { return WaitForSingleObject(a.process.hProcess, 0) == WAIT_TIMEOUT && AssignedToJob(a.process.hProcess, a.job) && ListenerOwner(a.port) == a.process.dwProcessId; }
            public Reply Version(Attempt attempt)
            {
                State a = attempt == null ? null : attempt.state as State;
                lock (gate) { if (!Exact(a)) return Failure("ADMISSION_REJECTED"); }
                return VersionCore(a);
            }
            Reply VersionCore(State a)
            {
                if (!Enter(a, "VERSION", true)) return Failure("BUSY");
                bool observed = false;
                try {
                    Admission(); Launch(a); Stopwatch deadline = Stopwatch.StartNew();
                    while (!Stopping(a) && deadline.ElapsedMilliseconds < 30000 && WaitForSingleObject(a.process.hProcess, 0) == WAIT_TIMEOUT) Thread.Sleep(10);
                    observed = !Stopping(a) && WaitForSingleObject(a.process.hProcess, 0) == WAIT_OBJECT_0;
                } catch { observed = false; } finally { Leave(a); }
                Reply retired = RetireCore(a);
                lock (gate) {
                    if (!a.terminal) return retired;
                    if (!observed || a.exit != 0 || a.stdout == null || a.stderr == null || a.stdout.Truncated || a.stderr.Truncated || a.stdout.Failed || a.stderr.Failed || a.stderr.Snapshot() != "") return Failure("NATIVE_FAILED");
                    string text = a.stdout.Snapshot().Replace("\r\n", "\n"); if (text.EndsWith("\n", StringComparison.Ordinal)) text = text.Substring(0, text.Length - 1);
                    string[] lines = text.Split('\n');
                    if (lines.Length != 4 || !System.Text.RegularExpressions.Regex.IsMatch(lines[0], "\\AAndroid Debug Bridge version [0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4}\\z") ||
                        !System.Text.RegularExpressions.Regex.IsMatch(lines[1], "\\AVersion 37\\.0\\.1-[0-9]{1,20}\\z") ||
                        !String.Equals(lines[2], "Installed as " + executable, StringComparison.OrdinalIgnoreCase) ||
                        !System.Text.RegularExpressions.Regex.IsMatch(lines[3], "\\ARunning on Windows [0-9]{1,8}(?:\\.[0-9]{1,8}){1,3}\\z")) return Failure("NATIVE_FAILED");
                    return Facts(a, "VERSION");
                }
            }
            public Reply StartForeground(Attempt attempt)
            {
                State a = attempt == null ? null : attempt.state as State;
                lock (gate) { if (!Exact(a)) return Failure("ADMISSION_REJECTED"); }
                return StartForegroundCore(a);
            }
            Reply StartForegroundCore(State a)
            {
                if (!Enter(a, "FOREGROUND", true)) return Failure("BUSY");
                bool observed = false; string failure = "NATIVE_FAILED";
                try {
                    Admission(); a.port = FreePort(); if (ListenerOwner(a.port) != 0) throw new IOException("ENDPOINT_REJECTED");
                    lock (gate) { if (a.stopping) throw new IOException("CLOSED"); Profile(a); } Launch(a);
                    Stopwatch deadline = Stopwatch.StartNew();
                    while (!Stopping(a) && deadline.ElapsedMilliseconds < 30000) {
                        if (WaitForSingleObject(a.process.hProcess, 0) != WAIT_TIMEOUT) break;
                        uint listener = ListenerOwner(a.port);
                        if (listener != 0) { if (!Live(a)) break; observed = IsolatedAdbServer.Health(a.port, a.process.hProcess, a.process.dwProcessId) && Live(a); break; }
                        Thread.Sleep(10);
                    }
                    if (observed) { SameProfile(a); a.profileWitness = ProfileWitness(a.android, owner, true); Admission(); }
                } catch (Exception error) { observed = false; failure = AdmissionFailure(error); } finally { Leave(a); }
                lock (gate) { if (observed && !a.stopping) return Facts(a, "STARTED"); }
                RetireCore(a); return Failure(a.terminal ? failure : "UNRETIRED");
            }
            public Reply Health(Attempt attempt)
            {
                State a = attempt == null ? null : attempt.state as State;
                lock (gate) { if (!Exact(a)) return Failure("ADMISSION_REJECTED"); }
                return HealthCore(a);
            }
            Reply HealthCore(State a)
            {
                if (!Enter(a, "FOREGROUND", false)) return Failure("BUSY");
                bool observed = false;
                try { Admission(); SameProfile(a); observed = Live(a) && IsolatedAdbServer.Health(a.port, a.process.hProcess, a.process.dwProcessId) && Live(a) && ProfileWitness(a.android, owner, true) == a.profileWitness; }
                catch { observed = false; } finally { Leave(a); }
                lock (gate) { if (observed && !a.stopping) return Facts(a, "HEALTHY"); }
                return Failure("UNRETIRED");
            }
            public Reply Retire(Attempt attempt)
            {
                return RetireCore(attempt == null ? null : attempt.state as State);
            }
            static bool RetirementLock(object value, Stopwatch deadline)
            { return Monitor.TryEnter(value, Math.Max(0, 10000 - (int)Math.Min(10000L, deadline.ElapsedMilliseconds))); }
            Reply RetireCore(State a)
            {
                Stopwatch deadline = Stopwatch.StartNew();
                if (!RetirementLock(gate, deadline)) return Failure("UNRETIRED");
                try { if (!Exact(a)) return Failure("ADMISSION_REJECTED"); a.stopping = true; }
                finally { Monitor.Exit(gate); }
                if (!RetirementLock(cleanupGate, deadline)) return Failure("UNRETIRED");
                try {
                    bool workersSettled = false;
                    while (!workersSettled) {
                        if (!RetirementLock(gate, deadline)) return Failure("UNRETIRED");
                        try {
                            workersSettled = a.workers == 0;
                            if (workersSettled && a.terminal) {
                                try { ExactOwner(root, owner); }
                                catch { return Failure("UNRETIRED"); }
                                if (deadline.ElapsedMilliseconds >= 10000) return Failure("UNRETIRED");
                                return Facts(a, a.kind == "FOREGROUND" && a.started ? "STOPPED" : null);
                            }
                        } finally { Monitor.Exit(gate); }
                        if (!workersSettled) {
                            if (deadline.ElapsedMilliseconds >= 10000) return Failure("UNRETIRED");
                            Thread.Sleep(Math.Min(10, Math.Max(1, 10000 - (int)deadline.ElapsedMilliseconds)));
                        }
                    }
                    try {
                        if (a.started) {
                            if (a.assigned) { if (!JobEmpty(a.job)) Require(TerminateJobObject(a.job, 1460)); }
                            else if (WaitForSingleObject(a.process.hProcess, 0) != WAIT_OBJECT_0) Require(TerminateProcess(a.process.hProcess, 1460)); // Never resumed before assignment.
                            while (deadline.ElapsedMilliseconds < 10000 && (WaitForSingleObject(a.process.hProcess, 0) != WAIT_OBJECT_0 || (a.assigned && !JobEmpty(a.job)))) Thread.Sleep(10);
                            if (WaitForSingleObject(a.process.hProcess, 0) != WAIT_OBJECT_0 || (a.assigned && !JobEmpty(a.job))) return Failure("UNRETIRED");
                            uint exit; Require(GetExitCodeProcess(a.process.hProcess, out exit)); a.exit = unchecked((int)exit);
                        }
                        if (a.stdout != null && !a.stdoutJoined) {
                            if (a.stdoutJoinAttempted) return Failure("UNRETIRED");
                            a.stdoutJoinAttempted = true;
                            a.stdoutJoined = a.stdout.Join(Math.Max(0, 10000 - (int)deadline.ElapsedMilliseconds));
                            if (!a.stdoutJoined) return Failure("UNRETIRED");
                        }
                        if (a.stderr != null && !a.stderrJoined) {
                            if (a.stderrJoinAttempted) return Failure("UNRETIRED");
                            a.stderrJoinAttempted = true;
                            a.stderrJoined = a.stderr.Join(Math.Max(0, 10000 - (int)deadline.ElapsedMilliseconds));
                            if (!a.stderrJoined) return Failure("UNRETIRED");
                        }
                        if (a.port != 0 && ListenerOwner(a.port) != 0) return Failure("UNRETIRED");
                        ExactOwner(root, owner);
                        if (a.profileReserved) {
                            SameProfile(a);
                            string[] names = Names(a.android, 3);
                            bool keys = String.Join(",", names) == ".fonesi-server-owner,adbkey,adbkey.pub";
                            string witness = ProfileWitness(a.android, owner, keys);
                            if (a.profileWitness != null && witness != a.profileWitness) return Failure("UNRETIRED");
                            if (keys) { File.Delete(Path.Combine(a.android, "adbkey")); File.Delete(Path.Combine(a.android, "adbkey.pub")); }
                            ProfileWitness(a.android, owner, false); File.Delete(Path.Combine(a.android, ".fonesi-server-owner"));
                            a.profileGuard.Dispose(); a.profileGuard = null; Directory.Delete(a.android, false); a.profileReserved = false;
                        }
                        ExactOwner(root, owner);
                        if (deadline.ElapsedMilliseconds >= 10000 || !RetirementLock(gate, deadline)) return Failure("UNRETIRED");
                        try {
                            Close(ref a.process.hThread); Close(ref a.process.hProcess); Close(ref a.job);
                            a.terminal = true; return Facts(a, a.kind == "FOREGROUND" && a.started ? "STOPPED" : null);
                        } finally { Monitor.Exit(gate); }
                    } catch { return Failure("UNRETIRED"); }
                } finally { Monitor.Exit(cleanupGate); }
            }
        }
    }
}
