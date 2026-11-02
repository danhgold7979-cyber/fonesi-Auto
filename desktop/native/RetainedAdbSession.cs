// SOURCE ONLY. Compile together with the unchanged IsolatedAdbServer.cs.
// No native bridge/process launcher is installed by this partial extension.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Net;
using System.Net.Sockets;
using System.Collections.Generic;
using Microsoft.Win32.SafeHandles;

namespace Fonesi.Development.Server
{
    public static partial class IsolatedAdbServer
    {
        public sealed partial class RetainedProvider
        {
            readonly bool diagnostics;
            int diagnosticSlots;
            enum ProgressSlot { ADMISSION, LAUNCH, LAUNCH_END, EXIT, RETIRE_BEGIN, RETIRE_END }
            void Progress(ProgressSlot slot)
            {
                if (!diagnostics) return;
                int bit = 1 << (int)slot, before;
                do { before = Interlocked.CompareExchange(ref diagnosticSlots, 0, 0); if ((before & bit) != 0) return; }
                while (Interlocked.CompareExchange(ref diagnosticSlots, before | bit, before) != before);
                // Fixed first-occurrence telemetry only; never an authority or retirement proof.
                try { Console.Error.WriteLine("HOST_NATIVE_PROGRESS_" + slot.ToString()); } catch { }
            }
            readonly object gate = new object(), cleanupGate = new object();
            readonly string root, owner, executable, executableHash, expectedRelease, expectedBuildGrammar;
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
                internal int workers, port, discoveryCalls;
                internal long lastDiscovery; internal Acquisition acquisition;
                internal VideoState video; internal string videoId;
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
                : this(ownedRunRoot, ownerToken, verifiedExecutable, expectedExeSha256, false) { }
            public RetainedProvider(string ownedRunRoot, string ownerToken, string verifiedExecutable, string expectedExeSha256, bool diagnostics)
                : this(ownedRunRoot, ownerToken, verifiedExecutable, expectedExeSha256, "37.0.1", "DECIMAL_1_20", diagnostics) { }
            public RetainedProvider(string ownedRunRoot, string ownerToken, string verifiedExecutable, string expectedExeSha256, string expectedRelease, string expectedBuildGrammar, bool diagnostics)
            {
                Guid parsed;
                if (!Guid.TryParseExact(ownerToken, "D", out parsed) || parsed.ToString() != ownerToken ||
                    String.IsNullOrEmpty(ownedRunRoot) || String.IsNullOrEmpty(verifiedExecutable) ||
                    !VersionExpectationValid(expectedRelease, expectedBuildGrammar) ||
                    expectedExeSha256 == null || !System.Text.RegularExpressions.Regex.IsMatch(expectedExeSha256, "\\A[0-9a-f]{64}\\z")) throw new ArgumentException("ADMISSION_REJECTED");
                this.expectedRelease = expectedRelease; this.expectedBuildGrammar = expectedBuildGrammar;
                this.diagnostics = diagnostics; root = ownedRunRoot; owner = ownerToken; executable = verifiedExecutable; executableHash = expectedExeSha256;
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
                    Progress(ProgressSlot.ADMISSION); Admission(); Progress(ProgressSlot.LAUNCH); Launch(a); Progress(ProgressSlot.LAUNCH_END); Stopwatch deadline = Stopwatch.StartNew();
                    while (!Stopping(a) && deadline.ElapsedMilliseconds < 30000 && WaitForSingleObject(a.process.hProcess, 0) == WAIT_TIMEOUT) Thread.Sleep(10);
                    observed = !Stopping(a) && WaitForSingleObject(a.process.hProcess, 0) == WAIT_OBJECT_0;
                    if (observed) Progress(ProgressSlot.EXIT);
                } catch { observed = false; } finally { Leave(a); }
                Reply retired = RetireCore(a);
                lock (gate) {
                    if (!a.terminal) return retired;
                    if (!observed || a.exit != 0 || a.stdout == null || a.stderr == null || a.stdout.Truncated || a.stderr.Truncated || a.stdout.Failed || a.stderr.Failed || a.stderr.Snapshot() != "") return Failure("NATIVE_FAILED");
                    if (!VersionOutputMatches(a.stdout.Snapshot(), executable, expectedRelease, expectedBuildGrammar)) return Failure("NATIVE_FAILED");
                    return Facts(a, "VERSION");
                }
            }
            // Pure fixed output grammar; callable by same-assembly managed fixtures, never a launcher.
            internal static bool VersionExpectationValid(string release, string buildGrammar)
            {
                return release != null && release.Length >= 1 && release.Length <= 32 &&
                    System.Text.RegularExpressions.Regex.IsMatch(release, "\\A[0-9]+\\.[0-9]+\\.[0-9]+\\z") &&
                    buildGrammar == "DECIMAL_1_20";
            }
            internal static bool VersionOutputMatches(string output, string executable, string release, string buildGrammar)
            {
                if (!VersionExpectationValid(release, buildGrammar) || output == null || output.Length > 32768 || String.IsNullOrEmpty(executable)) return false;
                string text = output.Replace("\r\n", "\n");
                if (text.EndsWith("\n", StringComparison.Ordinal)) text = text.Substring(0, text.Length - 1);
                string[] lines = text.Split('\n');
                return lines.Length == 4 && lines[0] == "Android Debug Bridge version 1.0.41" &&
                    System.Text.RegularExpressions.Regex.IsMatch(lines[1], "\\AVersion " + System.Text.RegularExpressions.Regex.Escape(release) + "-[0-9]{1,20}\\z") &&
                    String.Equals(lines[2], "Installed as " + executable, StringComparison.OrdinalIgnoreCase) &&
                    System.Text.RegularExpressions.Regex.IsMatch(lines[3], "\\ARunning on Windows [0-9]{1,8}(?:\\.[0-9]{1,8}){1,3}\\z");
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
            public sealed class AcquisitionReply
            {
                readonly Dictionary<string, object> fields;
                internal AcquisitionReply(string status, string code, bool dispatched, bool retired, byte[] payload, long? observed)
                { fields = new Dictionary<string, object>{{"version",1},{"kind","ACQUISITION"},{"status",status},{"code",code},{"dispatched",dispatched},{"operationRetired",retired},{"payloadBase64",payload == null ? null : Convert.ToBase64String(payload)},{"observedAtUtc",observed}}; }
                public IDictionary<string, object> Snapshot() { return new System.Collections.ObjectModel.ReadOnlyDictionary<string,object>(new Dictionary<string,object>(fields)); }
            }
            public sealed class MetadataReply
            {
                readonly Dictionary<string,object> fields;
                internal MetadataReply(QueryReply reply)
                { fields=new Dictionary<string,object>{{"version",1},{"kind","METADATA_QUERY"},{"status",reply.status},{"code",reply.code},{"dispatched",reply.dispatched},{"operationRetired",reply.retired},{"stdoutBase64",reply.metadata==null?null:Convert.ToBase64String(reply.metadata.stdout)},{"stderrBase64",reply.metadata==null?null:Convert.ToBase64String(reply.metadata.stderr)},{"remoteExitCode",reply.metadata==null?null:(object)reply.metadata.remoteExitCode},{"observedAtUtc",reply.observed}}; }
                public IDictionary<string,object> Snapshot(){return new System.Collections.ObjectModel.ReadOnlyDictionary<string,object>(new Dictionary<string,object>(fields));}
            }
            public sealed class InputReply
            {
                readonly Dictionary<string,object> fields;
                internal InputReply(QueryReply reply)
                {fields=new Dictionary<string,object>{{"version",1},{"kind","INPUT_QUERY"},{"status",reply.status},{"code",reply.code},{"dispatched",reply.dispatched},{"operationRetired",reply.retired},{"remoteExitCode",reply.metadata==null?null:(object)reply.metadata.remoteExitCode},{"stdoutEmpty",reply.metadata==null?null:(object)(reply.metadata.stdout.Length==0)},{"stderrEmpty",reply.metadata==null?null:(object)(reply.metadata.stderr.Length==0)},{"observedAtUtc",reply.observed}};}
                public IDictionary<string,object> Snapshot(){return new System.Collections.ObjectModel.ReadOnlyDictionary<string,object>(new Dictionary<string,object>(fields));}
            }
            internal static string InputCommand(string action)
            {
                switch(action){
                    case "HOME":return "input keyboard -d 0 keyevent 3";
                    case "BACK":return "input keyboard -d 0 keyevent 4";
                    case "ENTER":return "input keyboard -d 0 keyevent 66";
                    case "ESCAPE":return "input keyboard -d 0 keyevent 111";
                    case "DPAD_UP":return "input keyboard -d 0 keyevent 19";
                    case "DPAD_DOWN":return "input keyboard -d 0 keyevent 20";
                    case "DPAD_LEFT":return "input keyboard -d 0 keyevent 21";
                    case "DPAD_RIGHT":return "input keyboard -d 0 keyevent 22";
                    case "DPAD_CENTER":return "input keyboard -d 0 keyevent 23";
                    default:throw new IOException("INPUT_REJECTED");
                }
            }
            internal sealed class MetadataBytes
            {
                internal readonly byte[] stdout,stderr;internal readonly int remoteExitCode;
                internal MetadataBytes(byte[] stdout,byte[] stderr,int remoteExitCode){this.stdout=stdout;this.stderr=stderr;this.remoteExitCode=remoteExitCode;}
            }
            internal sealed class QueryReply
            {
                internal readonly string status,code;internal readonly bool dispatched,retired;internal readonly byte[] payload;internal readonly MetadataBytes metadata;internal readonly long? observed;
                internal QueryReply(string status,string code,bool dispatched,bool retired,byte[] payload,MetadataBytes metadata,long? observed){this.status=status;this.code=code;this.dispatched=dispatched;this.retired=retired;this.payload=payload;this.metadata=metadata;this.observed=observed;}
            }
            internal static string MetadataCommand(string field)
            {
                switch(field){
                    case "MODEL":return "getprop ro.product.model";
                    case "MANUFACTURER":return "getprop ro.product.manufacturer";
                    case "OS":return "getprop ro.build.version.release";
                    case "SDK":return "getprop ro.build.version.sdk";
                    case "LOCALE":return "getprop persist.sys.locale";
                    case "RESOLUTION":return "cmd window size";
                    case "DENSITY":return "cmd window density";
                    case "BATTERY":return "dumpsys battery";
                    case "STORAGE":return "df -k /data";
                    default:throw new IOException("METADATA_REJECTED");
                }
            }
            internal static bool MetadataTransport(string value)
            {
                if(value==null||value.Length<1||value.Length>20||value[0]=='0')return false;
                foreach(char c in value)if(c<'0'||c>'9')return false;
                ulong number;return UInt64.TryParse(value,System.Globalization.NumberStyles.None,System.Globalization.CultureInfo.InvariantCulture,out number)&&number>0;
            }
            static void MetadataExact(IDiscoveryChannel channel,DiscoveryBudget budget,byte[] bytes)
            {int offset=0;while(offset<bytes.Length){int n=channel.Receive(bytes,offset,bytes.Length-offset,budget.Remaining());budget.Remaining();if(n<=0||n>bytes.Length-offset)throw new IOException("METADATA_REJECTED");offset+=n;}}
            static void MetadataService(IDiscoveryChannel channel,DiscoveryBudget budget,string service)
            {
                byte[] bytes=Encoding.ASCII.GetBytes(service.Length.ToString("x4",System.Globalization.CultureInfo.InvariantCulture)+service);int offset=0;
                while(offset<bytes.Length){int n=channel.Send(bytes,offset,bytes.Length-offset,budget.Remaining());budget.Remaining();if(n<=0||n>bytes.Length-offset)throw new IOException("METADATA_REJECTED");offset+=n;}
                byte[] ack=new byte[4];MetadataExact(channel,budget,ack);
                // FAIL bytes are never copied to output; reject and close this exact bounded socket.
                if(ack[0]!=79||ack[1]!=75||ack[2]!=65||ack[3]!=89)throw new IOException("METADATA_REJECTED");
            }
            static void MetadataText(byte[] bytes)
            {string text=new UTF8Encoding(false,true).GetString(bytes);if(text.IndexOf('\0')>=0||(text.Length>0&&text[0]=='\ufeff'))throw new IOException("METADATA_REJECTED");}
            internal static MetadataBytes ReadMetadata(IDiscoveryChannel channel,DiscoveryBudget budget,string transportId,string field,Action beforeShell)
            {
                return ReadShell(channel,budget,transportId,MetadataCommand(field),beforeShell,true);
            }
            internal static MetadataBytes ReadInput(IDiscoveryChannel channel,DiscoveryBudget budget,string transportId,string action,Action beforeShell)
            {
                try{return ReadShell(channel,budget,transportId,InputCommand(action),beforeShell,false);}
                catch(IOException error){if(error.Message=="METADATA_REJECTED")throw new IOException("INPUT_REJECTED");throw;}
            }
            // The only callers select a complete fixed literal; this is not a command API.
            static MetadataBytes ReadShell(IDiscoveryChannel channel,DiscoveryBudget budget,string transportId,string command,Action beforeShell,bool textOutput)
            {
                if(!MetadataTransport(transportId)||beforeShell==null)throw new IOException("METADATA_REJECTED");
                MetadataService(channel,budget,"host:transport-id:"+transportId);
                beforeShell();budget.Remaining(); // Actual custody/process/listener fence before the second send.
                MetadataService(channel,budget,"shell,v2,raw:"+command);
                using(MemoryStream stdout=new MemoryStream())using(MemoryStream stderr=new MemoryStream()){
                    int total=0;for(int packets=0;packets<256;packets++){
                        byte[] header=new byte[5];MetadataExact(channel,budget,header);
                        uint length=(uint)header[1]|((uint)header[2]<<8)|((uint)header[3]<<16)|((uint)header[4]<<24);
                        int kind=header[0];if((kind!=1&&kind!=2&&kind!=3)||length>32768||(kind==3&&length!=1)||(kind!=3&&length>32768-total))throw new IOException("METADATA_REJECTED");
                        byte[] payload=new byte[(int)length];MetadataExact(channel,budget,payload);
                        if(kind==3){byte[] extra=new byte[1];int trailing=channel.Receive(extra,0,1,budget.Remaining());budget.Remaining();if(trailing!=0)throw new IOException("METADATA_REJECTED");byte[] output=stdout.ToArray(),error=stderr.ToArray();if(textOutput){MetadataText(output);MetadataText(error);}return new MetadataBytes(output,error,payload[0]);}
                        total+=(int)length;(kind==1?stdout:stderr).Write(payload,0,payload.Length);
                    }
                    throw new IOException("METADATA_REJECTED");
                }
            }
            internal interface IDiscoveryChannel
            {
                int Send(byte[] bytes, int offset, int count, int timeout);
                int Receive(byte[] bytes, int offset, int count, int timeout);
            }
            internal sealed class DiscoveryBudget
            {
                readonly Func<long> clock; readonly Stopwatch elapsed = Stopwatch.StartNew();
                readonly long started, duration, deadline; long last;
                internal DiscoveryBudget(long deadlineUtc) : this(deadlineUtc, UtcMilliseconds) { }
                internal DiscoveryBudget(long deadlineUtc, Func<long> clock)
                {
                    this.clock=clock; started=clock(); last=started; deadline=deadlineUtc; duration=deadline-started;
                    if(started<0 || deadline>9007199254740991L || duration<=0 || duration>30000) throw new IOException("DEADLINE");
                }
                internal int Remaining()
                {
                    long current=clock(); if(current<last) throw new IOException("DEADLINE"); last=current;
                    long remaining=Math.Min(deadline-current,duration-elapsed.ElapsedMilliseconds);
                    if(remaining<=0) throw new IOException("DEADLINE"); return (int)remaining;
                }
                internal long Observed() { Remaining(); return last; }
            }
            static long UtcMilliseconds() { return (DateTime.UtcNow.Ticks-621355968000000000L)/10000; }
            internal static byte[] ReadDevicesList(IDiscoveryChannel channel, DiscoveryBudget budget)
            {
                byte[] request=Encoding.ASCII.GetBytes("000ehost:devices-l"); int sent=0;
                while(sent<request.Length){int n=channel.Send(request,sent,request.Length-sent,budget.Remaining());budget.Remaining();if(n<=0||n>request.Length-sent)throw new IOException("DISCOVERY_REJECTED");sent+=n;}
                byte[] header=new byte[8]; ReadDiscoveryExact(channel,budget,header);
                if(header[0]!=79||header[1]!=75||header[2]!=65||header[3]!=89)throw new IOException("DISCOVERY_REJECTED");
                int length=0;for(int n=4;n<8;n++){int b=header[n],digit=b>=48&&b<=57?b-48:b>=65&&b<=70?b-55:b>=97&&b<=102?b-87:-1;if(digit<0)throw new IOException("DISCOVERY_REJECTED");length=(length<<4)|digit;}
                if(length>32768)throw new IOException("DISCOVERY_REJECTED");
                byte[] payload=new byte[length];ReadDiscoveryExact(channel,budget,payload);
                byte[] extra=new byte[1];int trailing=channel.Receive(extra,0,1,budget.Remaining());budget.Remaining();if(trailing!=0)throw new IOException("DISCOVERY_REJECTED");
                string text=new UTF8Encoding(false,true).GetString(payload);
                if(text.IndexOf('\0')>=0 || (text.Length>0&&text[0]=='\ufeff'))throw new IOException("DISCOVERY_REJECTED");
                return payload;
            }
            static void ReadDiscoveryExact(IDiscoveryChannel channel,DiscoveryBudget budget,byte[] bytes)
            {int offset=0;while(offset<bytes.Length){int n=channel.Receive(bytes,offset,bytes.Length-offset,budget.Remaining());budget.Remaining();if(n<=0||n>bytes.Length-offset)throw new IOException("DISCOVERY_REJECTED");offset+=n;}}
            sealed class SocketDiscoveryChannel : IDiscoveryChannel
            {
                readonly Socket socket;internal SocketDiscoveryChannel(Socket socket){this.socket=socket;}
                public int Send(byte[] bytes,int offset,int count,int timeout){socket.SendTimeout=timeout;return socket.Send(bytes,offset,count,SocketFlags.None);}
                public int Receive(byte[] bytes,int offset,int count,int timeout){socket.ReceiveTimeout=timeout;return socket.Receive(bytes,offset,count,SocketFlags.None);}
            }
            sealed class Acquisition
            {
                internal Socket socket; internal Task connect; internal Task<bool> close;
                internal bool registering=true, closeRequested, workerDone;
            }
            internal static bool DiscoveryLock(object value,Stopwatch deadline,int milliseconds)
            {int remaining=Math.Max(0,milliseconds-(int)Math.Min(Int32.MaxValue,deadline.ElapsedMilliseconds));return Monitor.TryEnter(value,remaining);}
            bool CloseAcquisition(State a) { return CloseAcquisition(a,Stopwatch.StartNew(),0); }
            bool CloseAcquisition(State a,Stopwatch deadline,int milliseconds)
            {
                Acquisition q;if(!DiscoveryLock(gate,deadline,milliseconds))return false;
                try{q=a.acquisition;}finally{Monitor.Exit(gate);}if(q==null)return true;
                if(!DiscoveryLock(q,deadline,milliseconds))return false;
                try{if(q.close==null){q.closeRequested=true;q.close=Task.Run(delegate(){try{q.socket.Dispose();return true;}catch{return false;}});}return true;}
                finally{Monitor.Exit(q);}
            }
            internal static bool DiscoveryWorkRetired(bool registering,bool disposed,bool workerDone,Task connect)
            {if(connect!=null&&connect.IsCompleted&&connect.IsFaulted){AggregateException observed=connect.Exception;}return !registering&&disposed&&workerDone&&(connect==null||connect.IsCompleted);}
            static bool AcquisitionClosed(Acquisition q)
            {return q.close!=null&&q.close.Status==TaskStatus.RanToCompletion&&q.close.Result;}
            bool AcquisitionSettled(State a){return AcquisitionSettled(a,Stopwatch.StartNew(),0);}
            bool AcquisitionSettled(State a,Stopwatch deadline,int milliseconds)
            {
                Acquisition q=a.acquisition;if(q==null)return true;
                if(!DiscoveryLock(q,deadline,milliseconds))return false;
                try{return DiscoveryWorkRetired(q.registering,AcquisitionClosed(q),q.workerDone,q.connect);}finally{Monitor.Exit(q);}
            }
            public AcquisitionReply Discover(Attempt attempt,long deadlineUtc)
            {QueryReply reply=Query(attempt,deadlineUtc,null,null,false);return new AcquisitionReply(reply.status,reply.code,reply.dispatched,reply.retired,reply.payload,reply.observed);}
            public MetadataReply Metadata(Attempt attempt,string transportId,string field,long deadlineUtc)
            {
                if(field==null)return new MetadataReply(new QueryReply("FAILED","METADATA_REJECTED",false,true,null,null,null));
                return new MetadataReply(Query(attempt,deadlineUtc,transportId,field,false));
            }
            public InputReply Input(Attempt attempt,string transportId,string action,long deadlineUtc)
            {
                if(action==null)return new InputReply(new QueryReply("FAILED","INPUT_REJECTED",false,true,null,null,null));
                return new InputReply(Query(attempt,deadlineUtc,transportId,action,true));
            }
            QueryReply Query(Attempt attempt,long deadlineUtc,string transportId,string field,bool input)
            {
                State a=attempt==null?null:attempt.state as State;
                if(!Enter(a,"FOREGROUND",false))return new QueryReply("FAILED","BUSY",false,true,null,null,null);
                Acquisition q=null;byte[] payload=null;MetadataBytes metadata=null;long? observed=null;string code="NATIVE_FAILED";bool dispatched=false;
                try {
                    DiscoveryBudget budget=new DiscoveryBudget(deadlineUtc);
                    if(field!=null){if(deadlineUtc>8640000000000000L||!MetadataTransport(transportId))throw new IOException(input?"INPUT_REJECTED":"METADATA_REJECTED");if(input)InputCommand(field);else MetadataCommand(field);}
                    Admission();SameProfile(a);if(!Live(a)||ProfileWitness(a.android,owner,true)!=a.profileWitness)throw new IOException("ADMISSION_REJECTED");
                    lock(gate){if(a.stopping||a.discoveryCalls>=128||!AcquisitionSettled(a))throw new IOException("ADMISSION_REJECTED");a.discoveryCalls++;q=new Acquisition();q.socket=new Socket(AddressFamily.InterNetwork,SocketType.Stream,ProtocolType.Tcp);a.acquisition=q;}
                    // Registration precedes BeginConnect, including synchronous completion and RETIRE races.
                    try {
                        lock(q){if(q.closeRequested)throw new IOException("CLOSED");dispatched=true;}
                        Task connected=Task.Factory.FromAsync(q.socket.BeginConnect,q.socket.EndConnect,IPAddress.Loopback,a.port,null);
                        lock(q){q.connect=connected;}
                    } finally {lock(q){q.registering=false;}}
                    while(!q.connect.IsCompleted){if(Stopping(a))throw new IOException("CLOSED");q.connect.Wait(Math.Min(10,budget.Remaining()));}
                    q.connect.GetAwaiter().GetResult();budget.Remaining();
                    Admission();SameProfile(a);if(Stopping(a)||!Live(a)||ProfileWitness(a.android,owner,true)!=a.profileWitness)throw new IOException("ADMISSION_REJECTED");
                    if(field==null)payload=ReadDevicesList(new SocketDiscoveryChannel(q.socket),budget);
                    else {
                        Action fence=delegate(){Admission();SameProfile(a);if(Stopping(a)||!Live(a)||ProfileWitness(a.android,owner,true)!=a.profileWitness)throw new IOException("ADMISSION_REJECTED");};
                        metadata=input?ReadInput(new SocketDiscoveryChannel(q.socket),budget,transportId,field,fence):ReadMetadata(new SocketDiscoveryChannel(q.socket),budget,transportId,field,fence);
                    }
                    observed=budget.Observed();
                    while(!CloseAcquisition(a)){budget.Remaining();Thread.Sleep(1);}while(!AcquisitionClosed(q)){budget.Remaining();Thread.Sleep(1);}Admission();SameProfile(a);
                    if(Stopping(a)||!Live(a)||ProfileWitness(a.android,owner,true)!=a.profileWitness||observed.Value<a.lastDiscovery)throw new IOException("ADMISSION_REJECTED");
                    budget.Remaining();code="OK";
                }catch(Exception error){code=error is IOException&&(error.Message=="DEADLINE"||error.Message=="CLOSED"||error.Message=="ADMISSION_REJECTED"||error.Message=="DISCOVERY_REJECTED"||error.Message=="METADATA_REJECTED"||error.Message=="INPUT_REJECTED")?error.Message:error is DecoderFallbackException?(field==null?"DISCOVERY_REJECTED":"METADATA_REJECTED"):"NATIVE_FAILED";payload=null;metadata=null;observed=null;}
                finally {if(q!=null){CloseAcquisition(a);lock(q){q.workerDone=true;}}Leave(a);}
                lock(gate){
                    if(!AcquisitionSettled(a))return new QueryReply("UNRETIRED","UNRETIRED",dispatched,false,null,null,null);
                    if(code=="OK"&&!a.stopping){a.lastDiscovery=observed.Value;return new QueryReply("COMPLETE","OK",true,true,payload,metadata,observed);}
                    return new QueryReply("FAILED",code=="OK"?"CLOSED":code,dispatched,true,null,null,null);
                }
            }
            public Reply Retire(Attempt attempt)
            {
                return RetireCore(attempt == null ? null : attempt.state as State);
            }
            static bool RetirementLock(object value, Stopwatch deadline)
            { return Monitor.TryEnter(value, Math.Max(0, 10000 - (int)Math.Min(10000L, deadline.ElapsedMilliseconds))); }
            Reply RetireCore(State a)
            {
                Progress(ProgressSlot.RETIRE_BEGIN);
                try { return RetireObserved(a); }
                finally { Progress(ProgressSlot.RETIRE_END); }
            }
            Reply RetireObserved(State a)
            {
                Stopwatch deadline = Stopwatch.StartNew();
                if (!RetirementLock(gate, deadline)) return Failure("UNRETIRED");
                try { if (!Exact(a)) return Failure("ADMISSION_REJECTED"); a.stopping = true; }
                finally { Monitor.Exit(gate); }
                if(!CloseAcquisition(a,deadline,10000))return Failure("UNRETIRED"); // Retained close work starts before worker waits.
                if(!RetireVideo(a,deadline))return Failure("UNRETIRED");
                if (!RetirementLock(cleanupGate, deadline)) return Failure("UNRETIRED");
                try {
                    bool workersSettled = false;
                    while (!workersSettled) {
                        if (!RetirementLock(gate, deadline)) return Failure("UNRETIRED");
                        try {
                            workersSettled = a.workers == 0 && AcquisitionSettled(a,deadline,10000);
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
                            if(videoAdmission!=null)videoAdmission.guard.Dispose();
                            a.terminal = true; return Facts(a, a.kind == "FOREGROUND" && a.started ? "STOPPED" : null);
                        } finally { Monitor.Exit(gate); }
                    } catch { return Failure("UNRETIRED"); }
                } finally { Monitor.Exit(cleanupGate); }
            }
        }
    }
}
