// Managed-memory test entry ONLY; not run by source assertions. No native provider or host effects.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using Fonesi.Development.Server;
namespace Fonesi.Tests
{
    public static class RetainedAdbProtocolFixture
    {
        const string Session = "11111111-1111-4111-8111-111111111111", Attempt = "22222222-2222-4222-8222-222222222222";
        static byte[] Frame(long request, string operation) { return Encoding.ASCII.GetBytes("{\"version\":1,\"sessionId\":\"" + Session + "\",\"requestId\":" + request + ",\"attemptId\":\"" + Attempt + "\",\"operation\":\"" + operation + "\"}\n"); }
        static void Check(bool value) { if (!value) throw new InvalidOperationException("MANAGED_FIXTURE_FAILED"); }
        sealed class Input : Stream
        {
            readonly Queue<byte> bytes = new Queue<byte>(); readonly object gate = new object(); bool eof; internal volatile bool waiting;
            internal void Feed(byte[] value) { lock(gate) { waiting=false;foreach(byte b in value) bytes.Enqueue(b); Monitor.PulseAll(gate); } }
            internal void End() { lock(gate) { eof=true;Monitor.PulseAll(gate); } }
            public override int ReadByte() { lock(gate) { while(bytes.Count==0&&!eof){waiting=true;Monitor.Wait(gate);}return bytes.Count==0?-1:bytes.Dequeue(); } }
            public override int Read(byte[] b,int o,int n) { int x=ReadByte();if(x<0)return 0;b[o]=(byte)x;return 1; }
            public override bool CanRead {get{return true;}} public override bool CanWrite{get{return false;}} public override bool CanSeek{get{return false;}}
            public override long Length{get{throw new NotSupportedException();}} public override long Position{get{throw new NotSupportedException();}set{throw new NotSupportedException();}}
            public override void Flush(){} public override long Seek(long o,SeekOrigin s){throw new NotSupportedException();} public override void SetLength(long n){throw new NotSupportedException();} public override void Write(byte[] b,int o,int n){throw new NotSupportedException();}
        }
        sealed class Output : MemoryStream
        {
            internal readonly ManualResetEvent Entered=new ManualResetEvent(false), Release=new ManualResetEvent(true);
            internal readonly ManualResetEvent FlushEntered=new ManualResetEvent(false), FlushRelease=new ManualResetEvent(true);
            internal int count;
            public override void Flush(){FlushEntered.Set();FlushRelease.WaitOne();base.Flush();}
            public override void Write(byte[] b,int o,int n){Entered.Set();Release.WaitOne();lock(this){base.Write(b,o,n);Interlocked.Increment(ref count);}}
        }
        sealed class Provider : RetainedAdbProtocol.IProvider
        {
            internal readonly object token=new object();internal int reserves,versions,retires;
            internal bool releaseOnRetire=true; internal IDictionary<string,object> versionResult;
            internal readonly ManualResetEvent Entered=new ManualResetEvent(false),Release=new ManualResetEvent(true),Retired=new ManualResetEvent(false);
            public object Reserve(string kind){Check(kind=="VERSION");Interlocked.Increment(ref reserves);return token;}
            public IDictionary<string,object> Version(object attempt){Check(Object.ReferenceEquals(token,attempt));Interlocked.Increment(ref versions);Entered.Set();Release.WaitOne();return versionResult ?? Facts("VERSION");}
            public IDictionary<string,object> StartForeground(object attempt){throw new InvalidOperationException();}
            public IDictionary<string,object> Health(object attempt){throw new InvalidOperationException();}
            public IDictionary<string,object> Discover(object attempt,long deadlineUtc){throw new InvalidOperationException();}
            public IDictionary<string,object> Retire(object attempt){Check(Object.ReferenceEquals(token,attempt));Interlocked.Increment(ref retires);Retired.Set();if(releaseOnRetire)Release.Set();return Facts(null);}
            internal static IDictionary<string,object> Facts(string observation){return new Dictionary<string,object>{{"version",2},{"kind","INVOCATION"},{"dispatched",true},{"processRetired",true},{"exitCode",0},{"observation",observation}};}
        }
        static void Wait(Func<bool> predicate){for(int i=0;i<1000;i++){if(predicate())return;Thread.Sleep(5);}Check(false);}
        // New pure parser groups: separate from the eight historical protocol groups.
        // No provider instance, reserve, process, native API, profile or socket is used here.
        public static int RunVersionExpectations()
        {
            string executable = @"C:\owned\runtime\adb.exe";
            foreach(string release in new string[]{"37.0.1","36.0.0"}) {
                string output = "Android Debug Bridge version 1.0.41\nVersion " + release + "-12345678901234567890\nInstalled as " + executable + "\nRunning on Windows 10.0.20348\n";
                Check(IsolatedAdbServer.RetainedProvider.VersionOutputMatches(output, executable, release, "DECIMAL_1_20"));
                Check(IsolatedAdbServer.RetainedProvider.VersionOutputMatches(output.Replace("\n","\r\n"), executable, release, "DECIMAL_1_20"));
                Check(!IsolatedAdbServer.RetainedProvider.VersionOutputMatches(output, executable, release=="37.0.1"?"36.0.0":"37.0.1", "DECIMAL_1_20"));
                foreach(string changed in new string[]{output.Replace("1.0.41","1.0.42"),output.Replace("-12345678901234567890","-123456789012345678901"),output.Replace("-12345678901234567890","-"),output.Replace("-12345678901234567890","-x"),output.Replace("Installed as " + executable,"Installed as C:\\other\\adb.exe"),output.Replace("Running on Windows","Running on Linux"),output+"\n",output+"private",new string('x',32769)})
                    Check(!IsolatedAdbServer.RetainedProvider.VersionOutputMatches(changed, executable, release, "DECIMAL_1_20"));
            }
            foreach(string release in new string[]{null,"","37.0","37.0.1\n","37.0.1.*","37.0.1|36.0.0","٣٧.0.1",new string('1',33)+".0.1"})
                Check(!IsolatedAdbServer.RetainedProvider.VersionExpectationValid(release,"DECIMAL_1_20"));
            foreach(string grammar in new string[]{null,"","DECIMAL_1_20\n","[0-9]+","ANY"})
                Check(!IsolatedAdbServer.RetainedProvider.VersionExpectationValid("37.0.1",grammar));
            return 2;
        }
        class ServerProvider : RetainedAdbProtocol.IProvider
        {
            internal readonly object token = new object(); internal int reserves, starts, healths, retires;
            internal readonly ManualResetEvent Entered = new ManualResetEvent(false), Release = new ManualResetEvent(true), Retired = new ManualResetEvent(false);
            internal IDictionary<string,object> startResult;
            public object Reserve(string kind) { Check(kind == "FOREGROUND"); Interlocked.Increment(ref reserves); return token; }
            public IDictionary<string,object> Version(object attempt) { throw new InvalidOperationException(); }
            public IDictionary<string,object> StartForeground(object attempt) { Check(Object.ReferenceEquals(token,attempt)); Interlocked.Increment(ref starts); Entered.Set(); Release.WaitOne(); return startResult ?? (Retired.WaitOne(0) ? TerminalFacts() : SessionFacts("STARTED")); }
            public IDictionary<string,object> Health(object attempt) { Check(Object.ReferenceEquals(token,attempt)); Interlocked.Increment(ref healths); Entered.Set(); Release.WaitOne(); return Retired.WaitOne(0) ? TerminalFacts() : SessionFacts("HEALTHY"); }
            public virtual IDictionary<string,object> Discover(object attempt,long deadlineUtc){throw new InvalidOperationException();}
            public virtual IDictionary<string,object> Retire(object attempt) { Check(Object.ReferenceEquals(token,attempt)); Interlocked.Increment(ref retires); Retired.Set(); Release.Set(); return SessionFacts("STOPPED"); }
            internal static IDictionary<string,object> TerminalFacts() { IDictionary<string,object> facts=SessionFacts("STOPPED");facts["observation"]=null;return facts; }
            internal static IDictionary<string,object> SessionFacts(string observation) { bool stopped=observation=="STOPPED";return new Dictionary<string,object>{{"version",2},{"kind","SESSION"},{"dispatched",true},{"jobState",stopped?"RETIRED":"LIVE"},{"exitCode",stopped?(object)1460:null},{"endpointState",stopped?"ABSENT":"OWNED"},{"observation",observation}}; }
        }
        // Fixture-only bounded scheduling: BUSY is permitted before remote Flush/worker settlement.
        // Production callers never replay. Every BUSY here proves zero provider handoff.
        static long AwaitHealth(Input input, Output output, ServerProvider provider, ref long nextRequest)
        {
            System.Diagnostics.Stopwatch budget=System.Diagnostics.Stopwatch.StartNew();
            int beforeHealth=Interlocked.CompareExchange(ref provider.healths,0,0);
            for(int attempt=0;attempt<64&&budget.ElapsedMilliseconds<5000;attempt++) {
                int beforeOutput=Interlocked.CompareExchange(ref output.count,0,0);
                long request=nextRequest++;input.Feed(Frame(request,"HEALTH"));
                while(budget.ElapsedMilliseconds<5000 && Interlocked.CompareExchange(ref provider.healths,0,0)==beforeHealth && Interlocked.CompareExchange(ref output.count,0,0)==beforeOutput) Thread.Sleep(1);
                int health=Interlocked.CompareExchange(ref provider.healths,0,0);
                if(health!=beforeHealth){Check(health==beforeHealth+1);return request;}
                Check(Interlocked.CompareExchange(ref output.count,0,0)==beforeOutput+1);
                string text;lock(output){text=Encoding.ASCII.GetString(output.ToArray());}
                string[] frames=text.Split(new char[]{'\n'},StringSplitOptions.RemoveEmptyEntries);
                string expected="{\"version\":1,\"sessionId\":\""+Session+"\",\"requestId\":"+request+",\"attemptId\":\""+Attempt+"\",\"operation\":\"HEALTH\",\"result\":{\"code\":\"BUSY\"}}";
                Check(frames.Length==beforeOutput+1&&frames[frames.Length-1]==expected&&Interlocked.CompareExchange(ref provider.healths,0,0)==beforeHealth);
                Thread.Sleep(5);
            }
            Check(false);return 0;
        }
        // Source-authored only until separately compiled/run. All providers are memory-only.
        public static int RunServer()
        {
            int groups=0;
            {ServerProvider p=new ServerProvider();Input i=new Input();Output o=new Output();i.Feed(Frame(1,"VERSION"));i.End();RetainedAdbProtocol.RunResult r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;},false,"SERVER_ONLY");Check(!r.Clean&&p.reserves==0);}groups++;
            // Wait for actual reader ordinary/output settlement, not merely response LF/Flush entry.
            {ServerProvider p=new ServerProvider();Input i=new Input();Output o=new Output();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;},false,"SERVER_ONLY");});t.IsBackground=true;t.Start();
             i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});long next=2;
             long healthRequest=AwaitHealth(i,o,p,ref next);Wait(delegate{return o.count==healthRequest;});
             Check(p.reserves==1&&p.starts==1&&p.healths==1);long retireRequest=next++;i.Feed(Frame(retireRequest,"RETIRE"));Wait(delegate{return o.count==retireRequest;});i.End();Check(t.Join(5000)&&r.Clean&&p.retires==1);string text=Encoding.ASCII.GetString(o.ToArray());Check(text.Contains("\"observation\":\"STARTED\"")&&text.Contains("\"observation\":\"HEALTHY\"")&&text.Contains("\"exitCode\":1460"));}groups++;
            // Pending START can be retired without waiting for its ordinary worker.
            {ServerProvider p=new ServerProvider();p.Release.Reset();Input i=new Input();Output o=new Output();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;},false,"SERVER_ONLY");});t.IsBackground=true;t.Start();i.Feed(Frame(1,"START"));Check(p.Entered.WaitOne(5000));i.Feed(Frame(2,"RETIRE"));Check(p.Retired.WaitOne(5000));Wait(delegate{return o.count==2;});i.End();Check(t.Join(5000)&&r!=null);Check(p.reserves==1&&p.retires==1);}groups++;
            // Pre-Flush HEALTH is a bounded BUSY reply, never a provider handoff.
            {ServerProvider p=new ServerProvider();Input i=new Input();Output o=new Output();o.FlushRelease.Reset();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;},false,"SERVER_ONLY");});t.IsBackground=true;t.Start();i.Feed(Frame(1,"START"));Check(o.FlushEntered.WaitOne(5000));i.Feed(Frame(2,"HEALTH"));Wait(delegate{return i.waiting;});Check(p.healths==0);o.FlushRelease.Set();Wait(delegate{return o.count==2;});Check(Encoding.ASCII.GetString(o.ToArray()).Contains("\"code\":\"BUSY\""));i.Feed(Frame(3,"RETIRE"));Wait(delegate{return o.count==3;});i.End();Check(t.Join(5000)&&r.Clean);}groups++;
            // Saturated START+BUSY output must not postpone cleanup or invent a third frame.
            {ServerProvider p=new ServerProvider();Input i=new Input();Output o=new Output();o.FlushRelease.Reset();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;},false,"SERVER_ONLY");});t.IsBackground=true;t.Start();i.Feed(Frame(1,"START"));Check(o.FlushEntered.WaitOne(5000));i.Feed(Frame(2,"HEALTH"));Wait(delegate{return i.waiting;});i.Feed(Frame(3,"RETIRE"));Check(p.Retired.WaitOne(5000));Thread.Sleep(50);Check(p.healths==0&&t.IsAlive);i.End();o.FlushRelease.Set();Check(t.Join(5000)&&!r.Clean&&r.Code=="OUTPUT_FAILED"&&o.count==2);}groups++;
            // Invalid SESSION facts are never serialized as successful health/start.
            foreach(string bad in new string[]{"INVOCATION","EXTRA","WRONG_OBSERVATION","LIVE_EXIT"}) {
                ServerProvider p=new ServerProvider();p.startResult=ServerProvider.SessionFacts("STARTED");
                if(bad=="INVOCATION")p.startResult=Provider.Facts("VERSION");else if(bad=="EXTRA")p.startResult["private"]=true;else if(bad=="WRONG_OBSERVATION")p.startResult["observation"]="HEALTHY";else p.startResult["exitCode"]=0;
                Input i=new Input();Output o=new Output();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;},false,"SERVER_ONLY");});t.IsBackground=true;t.Start();i.Feed(Frame(1,"START"));Check(p.Retired.WaitOne(5000));i.End();Check(t.Join(5000)&&!r.Clean&&p.retires==1);
            }groups++;
            // HEALTH in flight is independently cleanup-preemptible; no second reservation.
            {ServerProvider p=new ServerProvider();Input i=new Input();Output o=new Output();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;},false,"SERVER_ONLY");});t.IsBackground=true;t.Start();i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});p.Entered.Reset();p.Release.Reset();long next=2;AwaitHealth(i,o,p,ref next);Check(p.Entered.WaitOne(5000));long retireRequest=next++;i.Feed(Frame(retireRequest,"RETIRE"));Check(p.Retired.WaitOne(5000));Wait(delegate{return o.count==retireRequest;});i.End();Check(t.Join(5000)&&r.Clean&&p.reserves==1&&p.healths==1&&p.retires==1);}groups++;
            // Parent loss during START triggers retained cleanup, never clean ordinary publication.
            {ServerProvider p=new ServerProvider();p.Release.Reset();Input i=new Input();Output o=new Output();int live=1;RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return Interlocked.CompareExchange(ref live,1,1)==1;},false,"SERVER_ONLY");});t.IsBackground=true;t.Start();i.Feed(Frame(1,"START"));Check(p.Entered.WaitOne(5000));Interlocked.Exchange(ref live,0);Check(p.Retired.WaitOne(5000));i.End();Check(t.Join(5000)&&!r.Clean&&p.reserves==1&&p.retires==1);}groups++;
            // A second START cannot create another native attempt in this server session.
            {ServerProvider p=new ServerProvider();Input i=new Input();Output o=new Output();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;},false,"SERVER_ONLY");});t.IsBackground=true;t.Start();i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});i.Feed(Frame(2,"START"));Check(p.Retired.WaitOne(5000));i.End();Check(t.Join(5000)&&!r.Clean&&p.reserves==1&&p.starts==1);}groups++;
            return groups;
        }
        sealed class ByteChannel : IsolatedAdbServer.RetainedProvider.IDiscoveryChannel
        {
            readonly byte[] input;int offset;internal readonly MemoryStream sent=new MemoryStream();internal int step=1;internal long now=1000,advance;internal bool missingEof;
            internal ByteChannel(byte[] bytes){input=bytes;}
            public int Send(byte[] bytes,int start,int count,int timeout){now+=advance;int n=Math.Min(count,step);sent.Write(bytes,start,n);return n;}
            public int Receive(byte[] bytes,int start,int count,int timeout){now+=advance;if(offset==input.Length){if(missingEof)throw new IOException();return 0;}int n=Math.Min(Math.Min(count,step),input.Length-offset);Array.Copy(input,offset,bytes,start,n);offset+=n;return n;}
        }
        static byte[] DiscoveryFrame(long request,long deadline){return Encoding.ASCII.GetBytes("{\"version\":2,\"sessionId\":\""+Session+"\",\"requestId\":"+request+",\"attemptId\":\""+Attempt+"\",\"operation\":\"DISCOVER\",\"deadlineUtc\":"+deadline+"}\n");}
        static long DiscoveryNow(){return (DateTime.UtcNow.Ticks-621355968000000000L)/10000;}
        static byte[] DecodeList(ByteChannel channel){return IsolatedAdbServer.RetainedProvider.ReadDevicesList(channel,new IsolatedAdbServer.RetainedProvider.DiscoveryBudget(31000,delegate{return channel.now;}));}
        sealed class DiscoveryProvider : ServerProvider
        {
            internal int queries;internal readonly ManualResetEvent QueryEntered=new ManualResetEvent(false),QueryRelease=new ManualResetEvent(true),QueryDone=new ManualResetEvent(false);
            public override IDictionary<string,object> Discover(object attempt,long deadlineUtc){Check(Object.ReferenceEquals(token,attempt));Interlocked.Increment(ref queries);QueryEntered.Set();QueryRelease.WaitOne();try{return new Dictionary<string,object>{{"version",1},{"kind","ACQUISITION"},{"status","COMPLETE"},{"code","OK"},{"dispatched",true},{"operationRetired",true},{"payloadBase64",""},{"observedAtUtc",DiscoveryNow()}};}finally{QueryDone.Set();}}
            public override IDictionary<string,object> Retire(object attempt){QueryRelease.Set();if(queries>0)Check(QueryDone.WaitOne(5000));return base.Retire(attempt);}
        }
        // Read-only reflection of actual private settlement avoids a timing guess or product test hook.
        sealed class ManagedReader
        {
            readonly object reader,gate;readonly Type type;internal readonly Thread thread;internal RetainedAdbProtocol.RunResult result;
            const System.Reflection.BindingFlags Flags=System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic;
            internal ManagedReader(Input input,Output output,RetainedAdbProtocol.IProvider provider){type=typeof(RetainedAdbProtocol).GetNestedType("Reader",System.Reflection.BindingFlags.NonPublic);reader=Activator.CreateInstance(type,Flags,null,new object[]{input,output,Session,provider,new Func<bool>(delegate{return true;}),false,"SERVER_ONLY"},null);gate=type.GetField("gate",Flags).GetValue(reader);thread=new Thread(delegate(){result=(RetainedAdbProtocol.RunResult)type.GetMethod("Run",Flags).Invoke(reader,null);});thread.IsBackground=true;thread.Start();}
            internal void Settled(){Wait(delegate{lock(gate){if((int)type.GetField("outstanding",Flags).GetValue(reader)!=0)return false;object current=type.GetField("current",Flags).GetValue(reader);if(current==null)return false;Type t=current.GetType();Thread ordinary=(Thread)t.GetField("ordinary",Flags).GetValue(current);return ordinary!=null&&ordinary.Join(0);}});}
        }
        public static int RunDiscovery()
        {
            int groups=0;long deadline=DiscoveryNow()+30000;
            {byte[] frame=DiscoveryFrame(2,deadline);RetainedAdbProtocol.Request r=RetainedAdbProtocol.Parse(frame,Session,1);Check(r!=null&&r.Version==2&&r.DeadlineUtc==deadline);Check(RetainedAdbProtocol.Parse(frame,Session,2)==null);Check(RetainedAdbProtocol.Parse(DiscoveryFrame(3,DiscoveryNow()-1),Session,2)==null);Check(RetainedAdbProtocol.Parse(DiscoveryFrame(3,DiscoveryNow()+60000),Session,2)==null);Check(RetainedAdbProtocol.Parse(Encoding.ASCII.GetBytes(Encoding.ASCII.GetString(frame).Replace("\"version\":2","\"version\":2,\"version\":2")),Session,1)==null);}groups++;
            foreach(string payload in new string[]{"","serial\tdevice transport_id:1\n","same\toffline\nsame\tunauthorized\n"}){byte[] bytes=Encoding.UTF8.GetBytes(payload);ByteChannel channel=new ByteChannel(Encoding.UTF8.GetBytes("OKAY"+bytes.Length.ToString("x4")+payload));Check(Encoding.UTF8.GetString(DecodeList(channel))==payload);Check(Encoding.ASCII.GetString(channel.sent.ToArray())=="000ehost:devices-l");}groups++;
            foreach(string wire in new string[]{"FAIL0000","NOPE0000","OKAYzzzz","OKAY8001","OKAY0001","OKAY0000x","OKAY"}){bool rejected=false;try{DecodeList(new ByteChannel(Encoding.ASCII.GetBytes(wire)));}catch{rejected=true;}Check(rejected);}groups++;
            foreach(byte[] payload in new byte[][]{new byte[]{0},new byte[]{239,187,191},new byte[]{255},new byte[]{195}}){byte[] header=Encoding.ASCII.GetBytes("OKAY"+payload.Length.ToString("x4"));byte[] wire=new byte[header.Length+payload.Length];Array.Copy(header,wire,header.Length);Array.Copy(payload,0,wire,header.Length,payload.Length);bool rejected=false;try{DecodeList(new ByteChannel(wire));}catch{rejected=true;}Check(rejected);}
            {ByteChannel channel=new ByteChannel(Encoding.ASCII.GetBytes("OKAY0000"));channel.advance=2000;bool rejected=false;try{DecodeList(channel);}catch{rejected=true;}Check(rejected);channel=new ByteChannel(Encoding.ASCII.GetBytes("OKAY0000"));channel.missingEof=true;rejected=false;try{DecodeList(channel);}catch{rejected=true;}Check(rejected);}groups++;
            {DiscoveryProvider p=new DiscoveryProvider();Input i=new Input();Output o=new Output();i.Feed(DiscoveryFrame(1,DiscoveryNow()+30000));i.End();RetainedAdbProtocol.RunResult r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;});Check(!r.Clean&&p.reserves==0&&p.queries==0);}groups++;
            {DiscoveryProvider p=new DiscoveryProvider();Input i=new Input();Output o=new Output();ManagedReader reader=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});reader.Settled();i.Feed(DiscoveryFrame(2,DiscoveryNow()+30000));Wait(delegate{return o.count==2;});reader.Settled();Check(p.queries==1&&p.retires==0&&p.reserves==1);Check(Encoding.ASCII.GetString(o.ToArray()).Contains("\"kind\":\"ACQUISITION\""));i.End();Check(reader.thread.Join(5000)&&reader.result.Clean&&p.retires==1);}groups++;
            {DiscoveryProvider p=new DiscoveryProvider();p.QueryRelease.Reset();Input i=new Input();Output o=new Output();ManagedReader reader=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});reader.Settled();i.Feed(DiscoveryFrame(2,DiscoveryNow()+30000));Check(p.QueryEntered.WaitOne(5000));i.Feed(Frame(3,"RETIRE"));Check(p.Retired.WaitOne(5000));Wait(delegate{return o.count==3;});i.End();Check(reader.thread.Join(5000)&&reader.result.Clean&&p.queries==1&&p.retires==1);}groups++;
            {System.Threading.Tasks.TaskCompletionSource<bool> connect=new System.Threading.Tasks.TaskCompletionSource<bool>();Check(!IsolatedAdbServer.RetainedProvider.DiscoveryWorkRetired(false,true,true,connect.Task));connect.SetException(new IOException());Check(IsolatedAdbServer.RetainedProvider.DiscoveryWorkRetired(false,true,true,connect.Task));Check(!IsolatedAdbServer.RetainedProvider.DiscoveryWorkRetired(true,true,true,connect.Task));Check(!IsolatedAdbServer.RetainedProvider.DiscoveryWorkRetired(false,true,false,connect.Task));
             object held=new object();ManualResetEvent entered=new ManualResetEvent(false),release=new ManualResetEvent(false);Thread holder=new Thread(delegate(){lock(held){entered.Set();release.WaitOne();}});holder.IsBackground=true;holder.Start();Check(entered.WaitOne(5000));System.Diagnostics.Stopwatch budget=System.Diagnostics.Stopwatch.StartNew();try{Check(!IsolatedAdbServer.RetainedProvider.DiscoveryLock(held,budget,5));Check(!IsolatedAdbServer.RetainedProvider.DiscoveryLock(held,budget,5));}finally{release.Set();Check(holder.Join(5000));}}groups++;
            return groups;
        }
        public static int RunAll()
        {
            int passed=0;
            Check(RetainedAdbProtocol.Parse(Frame(1,"VERSION"),Session,0)!=null);
            Check(RetainedAdbProtocol.Parse(Frame(1,"VERSION"),Session,1)==null);
            foreach(string raw in new string[]{Encoding.ASCII.GetString(Frame(1,"VERSION")).Replace("\"version\":1","\"version\":1,\"version\":1"),Encoding.ASCII.GetString(Frame(1,"VERSION")).Replace("\n","\r\n"),Encoding.ASCII.GetString(Frame(1,"VERSION"))+"\n",Encoding.ASCII.GetString(Frame(1,"VERSION")).Replace("\"requestId\":1","\"requestId\":01")}) Check(RetainedAdbProtocol.Parse(Encoding.ASCII.GetBytes(raw),Session,0)==null);passed++;
            foreach(string forbidden in new string[]{"START","HEALTH"}){Provider p=new Provider();Input i=new Input();Output o=new Output();i.Feed(Frame(1,forbidden));i.End();RetainedAdbProtocol.RunResult r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;});Check(!r.Clean&&p.reserves==0&&p.versions==0&&p.retires==0);}passed++;
            {Provider p=new Provider();Input i=new Input();Output o=new Output();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;});});t.IsBackground=true;t.Start();foreach(byte b in Frame(1,"VERSION"))i.Feed(new byte[]{b});Wait(delegate{return o.count==1;});i.End();Check(t.Join(5000)&&r.Clean&&p.reserves==1&&p.versions==1);Check(Encoding.ASCII.GetString(o.ToArray()).Contains("\"observation\":\"VERSION\""));}passed++;
            {Provider p=new Provider();p.Release.Reset();Input i=new Input();Output o=new Output();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;});});t.IsBackground=true;t.Start();i.Feed(Frame(1,"VERSION"));Check(p.Entered.WaitOne(5000));i.Feed(Frame(2,"RETIRE"));Check(p.Retired.WaitOne(5000));Wait(delegate{return o.count==2;});i.End();Check(t.Join(5000)&&r.Clean&&p.reserves==1&&p.retires==1);}passed++;
            {Provider p=new Provider();Input i=new Input();Output o=new Output();o.Release.Reset();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;});});t.IsBackground=true;t.Start();i.Feed(Frame(1,"VERSION"));Check(o.Entered.WaitOne(5000));i.End();Thread.Sleep(50);Check(t.IsAlive&&r==null);o.Release.Set();Check(t.Join(5000)&&r.Clean);}passed++;
            {Provider p=new Provider();p.Release.Reset();Input i=new Input();Output o=new Output();int live=1;RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return Interlocked.CompareExchange(ref live,1,1)==1;});});t.IsBackground=true;t.Start();i.Feed(Frame(1,"VERSION"));Check(p.Entered.WaitOne(5000));Interlocked.Exchange(ref live,0);Check(p.Retired.WaitOne(5000));i.End();Check(t.Join(5000)&&!r.Clean&&p.retires==1);}passed++;
            {Provider p=new Provider();Input i=new Input();Output o=new Output();o.FlushRelease.Reset();RetainedAdbProtocol.RunResult r=null;Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;});});t.IsBackground=true;t.Start();i.Feed(Frame(1,"VERSION"));Check(o.FlushEntered.WaitOne(5000));i.Feed(Encoding.ASCII.GetBytes(Encoding.ASCII.GetString(Frame(2,"VERSION")).Replace(Attempt,"33333333-3333-4333-8333-333333333333")));Thread.Sleep(50);Check(p.reserves==1&&t.IsAlive);o.FlushRelease.Set();Wait(delegate{return o.count==2;});i.End();Check(t.Join(5000)&&r.Clean&&p.reserves==2);}passed++;
            // Latest completion, not an earlier cleanup snapshot, governs succession.
            foreach(string late in new string[]{"ERROR","NONTERMINAL","NULL_EXIT"}) {
                Provider p=new Provider();p.releaseOnRetire=false;p.Release.Reset();
                if(late=="ERROR")p.versionResult=new Dictionary<string,object>{{"code","NATIVE_FAILED"}};
                else {p.versionResult=Provider.Facts(null);p.versionResult["exitCode"]=null;if(late=="NONTERMINAL")p.versionResult["processRetired"]=false;}
                Input i=new Input();Output o=new Output();RetainedAdbProtocol.RunResult r=null;
                Thread t=new Thread(delegate(){r=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;});});t.IsBackground=true;t.Start();
                i.Feed(Frame(1,"VERSION"));Check(p.Entered.WaitOne(5000));i.Feed(Frame(2,"RETIRE"));Wait(delegate{return o.count==1;});
                i.Feed(Encoding.ASCII.GetBytes(Encoding.ASCII.GetString(Frame(3,"VERSION")).Replace(Attempt,"33333333-3333-4333-8333-333333333333")));
                Wait(delegate{return i.waiting;});p.Release.Set();Wait(delegate{return o.count==2;});Thread.Sleep(50);Check(p.reserves==1&&t.IsAlive&&r==null);
                p.versionResult=null;i.Feed(Frame(4,"RETIRE"));Wait(delegate{return o.count==4;});i.End();
                Check(t.Join(5000)&&r.Clean&&p.reserves==2&&p.retires==2);
            }passed++;
            // Fixed telemetry subcase: two requests still emit each slot once; old overload stays silent.
            foreach(bool diagnostics in new bool[]{false,true}) {
                TextWriter originalError=Console.Error;StringWriter error=new StringWriter();
                try {
                    Console.SetError(error);Provider p=new Provider();Input i=new Input();Output o=new Output();RetainedAdbProtocol.RunResult r=null;
                    Thread t=new Thread(delegate(){r=diagnostics ? RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;},true) : RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;});});t.IsBackground=true;t.Start();
                    i.Feed(Frame(1,"VERSION"));Wait(delegate{return o.count==1;});
                    i.Feed(Encoding.ASCII.GetBytes(Encoding.ASCII.GetString(Frame(2,"VERSION")).Replace(Attempt,"33333333-3333-4333-8333-333333333333")));Wait(delegate{return o.count==2;});i.End();
                    Check(t.Join(5000)&&r.Clean&&p.reserves==2);
                    string[] lines=error.ToString().Replace("\r\n","\n").Split(new char[]{'\n'},StringSplitOptions.RemoveEmptyEntries);
                    Check(lines.Length==(diagnostics?4:0));
                    if(diagnostics){string[] expected=new string[]{"REQUEST_ACCEPTED","PROVIDER_ENTERED","RESPONSE_WRITE","RESPONSE_FLUSH"};for(int n=0;n<4;n++)Check(lines[n]=="HOST_READER_PROGRESS_"+expected[n]);}
                } finally { Console.SetError(originalError); }
            }
            return passed;
        }
    }
}
