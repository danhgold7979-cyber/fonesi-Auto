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
            public IDictionary<string,object> Metadata(object attempt,string transportId,string field,long deadlineUtc){throw new InvalidOperationException();}
            public IDictionary<string,object> Input(object attempt,string transportId,string action,long deadlineUtc){throw new InvalidOperationException();}
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
            public virtual IDictionary<string,object> Metadata(object attempt,string transportId,string field,long deadlineUtc){throw new InvalidOperationException();}
            public virtual IDictionary<string,object> Input(object attempt,string transportId,string action,long deadlineUtc){throw new InvalidOperationException();}
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
            internal void Failed(string code){Wait(delegate{lock(gate){return (string)type.GetField("failure",Flags).GetValue(reader)==code;}});}
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
        static byte[] MetadataFrame(long request,string field,string transport,long deadline)
        {return Encoding.ASCII.GetBytes("{\"version\":3,\"sessionId\":\""+Session+"\",\"requestId\":"+request+",\"attemptId\":\""+Attempt+"\",\"operation\":\"METADATA\",\"field\":\""+field+"\",\"transportId\":\""+transport+"\",\"deadlineUtc\":"+deadline+"}\n");}
        static byte[] Packet(int kind,byte[] payload)
        {byte[] result=new byte[payload.Length+5];result[0]=(byte)kind;uint n=(uint)payload.Length;for(int i=0;i<4;i++)result[i+1]=(byte)(n>>(8*i));Array.Copy(payload,0,result,5,payload.Length);return result;}
        static byte[] Bytes(params byte[][] parts)
        {using(MemoryStream value=new MemoryStream()){foreach(byte[] part in parts)value.Write(part,0,part.Length);return value.ToArray();}}
        static byte[] Shell(byte[] stdout,byte[] stderr,int exit)
        {return Bytes(Encoding.ASCII.GetBytes("OKAYOKAY"),Packet(1,stdout),Packet(2,stderr),Packet(3,new byte[]{(byte)exit}));}
        static IsolatedAdbServer.RetainedProvider.MetadataBytes DecodeMetadata(ByteChannel channel,string field,string transport,Action fence)
        {return IsolatedAdbServer.RetainedProvider.ReadMetadata(channel,new IsolatedAdbServer.RetainedProvider.DiscoveryBudget(31000,delegate{return channel.now;}),transport,field,fence);}
        static void RejectMetadata(byte[] bytes)
        {bool rejected=false;try{DecodeMetadata(new ByteChannel(bytes),"MODEL","1",delegate{});}catch{rejected=true;}Check(rejected);}
        sealed class MetadataProvider : ServerProvider
        {
            internal int metadataCalls,discoveryCalls;internal bool unknown,earlyRetire;
            internal string stdout="",stderr="",discoveryFault="";internal int remoteExit;
            internal readonly ManualResetEvent QueryEntered=new ManualResetEvent(false),QueryRelease=new ManualResetEvent(true),QueryDone=new ManualResetEvent(false);
            public override IDictionary<string,object> Metadata(object attempt,string transportId,string field,long deadlineUtc)
            {Check(Object.ReferenceEquals(token,attempt)&&transportId=="1"&&field=="MODEL");Interlocked.Increment(ref metadataCalls);QueryEntered.Set();QueryRelease.WaitOne();try{return new Dictionary<string,object>{{"version",1},{"kind","METADATA_QUERY"},{"status",unknown?"UNRETIRED":"COMPLETE"},{"code",unknown?"UNRETIRED":"OK"},{"dispatched",true},{"operationRetired",!unknown},{"stdoutBase64",unknown?null:stdout},{"stderrBase64",unknown?null:stderr},{"remoteExitCode",unknown?null:(object)remoteExit},{"observedAtUtc",unknown?null:(object)DiscoveryNow()}};}finally{QueryDone.Set();}}
            public override IDictionary<string,object> Discover(object attempt,long deadlineUtc)
            {Check(Object.ReferenceEquals(token,attempt));Interlocked.Increment(ref discoveryCalls);if(unknown){QueryEntered.Set();QueryRelease.WaitOne();}try{if(discoveryFault=="THROW")throw new IOException();if(discoveryFault=="MALFORMED")return new Dictionary<string,object>{{"private",true}};return new Dictionary<string,object>{{"version",1},{"kind","ACQUISITION"},{"status",unknown?"UNRETIRED":"COMPLETE"},{"code",unknown?"UNRETIRED":"OK"},{"dispatched",true},{"operationRetired",!unknown},{"payloadBase64",unknown?null:""},{"observedAtUtc",unknown?null:(object)DiscoveryNow()}};}finally{QueryDone.Set();}}
            public override IDictionary<string,object> Retire(object attempt)
            {if(!earlyRetire){QueryRelease.Set();if(metadataCalls>0)Check(QueryDone.WaitOne(5000));}return base.Retire(attempt);}
        }
        public static int RunMetadata()
        {
            int groups=0;long deadline=DiscoveryNow()+30000;
            string[] fields={"MODEL","MANUFACTURER","OS","SDK","LOCALE","RESOLUTION","DENSITY","BATTERY","STORAGE"};
            string[] commands={"getprop ro.product.model","getprop ro.product.manufacturer","getprop ro.build.version.release","getprop ro.build.version.sdk","getprop persist.sys.locale","cmd window size","cmd window density","dumpsys battery","df -k /data"};
            for(int n=0;n<fields.Length;n++){Check(IsolatedAdbServer.RetainedProvider.MetadataCommand(fields[n])==commands[n]);RetainedAdbProtocol.Request r=RetainedAdbProtocol.Parse(MetadataFrame(2,fields[n],"18446744073709551615",deadline),Session,1);Check(r!=null&&r.Version==3&&r.Field==fields[n]&&r.TransportId=="18446744073709551615");}
            foreach(string transport in new string[]{"0","01","-1","18446744073709551616","1\n","1;id"})Check(RetainedAdbProtocol.Parse(MetadataFrame(2,"MODEL",transport,deadline),Session,1)==null);
            foreach(string field in new string[]{"GETPROP","MODEL x","BATTERY unplug"})Check(RetainedAdbProtocol.Parse(MetadataFrame(2,field,"1",deadline),Session,1)==null);
            Check(RetainedAdbProtocol.Parse(MetadataFrame(2,"MODEL","1",deadline),Session,2)==null);Check(RetainedAdbProtocol.Parse(MetadataFrame(2,"MODEL","1",8640000000000001L),Session,1)==null);groups++;
            foreach(int step in new int[]{1,4096})foreach(int exit in new int[]{0,7}){ByteChannel c=new ByteChannel(Shell(Encoding.UTF8.GetBytes("Fixture"),Encoding.UTF8.GetBytes("warning"),exit));c.step=step;int checks=0;IsolatedAdbServer.RetainedProvider.MetadataBytes result=DecodeMetadata(c,"MODEL","1",delegate{checks++;Check(Encoding.ASCII.GetString(c.sent.ToArray())=="0013host:transport-id:1");});Check(checks==1&&result.remoteExitCode==exit&&Encoding.UTF8.GetString(result.stdout)=="Fixture"&&Encoding.UTF8.GetString(result.stderr)=="warning");Check(Encoding.ASCII.GetString(c.sent.ToArray())=="0013host:transport-id:1"+"0025shell,v2,raw:getprop ro.product.model");}groups++;
            foreach(byte[] invalid in new byte[][]{Encoding.ASCII.GetBytes("FAIL0000"),Encoding.ASCII.GetBytes("OKAYFAIL0000"),Encoding.ASCII.GetBytes("OKAYOKAY"),Bytes(Encoding.ASCII.GetBytes("OKAYOKAY"),Packet(4,new byte[0])),Bytes(Encoding.ASCII.GetBytes("OKAYOKAY"),Packet(3,new byte[0])),Bytes(Encoding.ASCII.GetBytes("OKAYOKAY"),Packet(3,new byte[]{0,0})),Bytes(Shell(new byte[0],new byte[0],0),Packet(3,new byte[]{0})),Bytes(Encoding.ASCII.GetBytes("OKAYOKAY"),new byte[]{1,1,0,0,0}),Bytes(Encoding.ASCII.GetBytes("OKAYOKAY"),new byte[]{1,0,0,1,0})})RejectMetadata(invalid);groups++;
            foreach(byte[] invalid in new byte[][]{new byte[]{0},new byte[]{255},new byte[]{195},new byte[]{239,187,191}}){RejectMetadata(Shell(invalid,new byte[0],0));RejectMetadata(Shell(new byte[0],invalid,0));}groups++;
            {byte[] maximum=Encoding.ASCII.GetBytes(new string('x',32768));ByteChannel c=new ByteChannel(Shell(maximum,new byte[0],0));c.step=4096;Check(DecodeMetadata(c,"MODEL","1",delegate{}).stdout.Length==32768);RejectMetadata(Shell(maximum,new byte[]{120},0));RejectMetadata(Shell(new byte[32769],new byte[0],0));using(MemoryStream many=new MemoryStream()){byte[] ack=Encoding.ASCII.GetBytes("OKAYOKAY");many.Write(ack,0,ack.Length);for(int n=0;n<256;n++){byte[] part=Packet(1,new byte[0]);many.Write(part,0,part.Length);}byte[] end=Packet(3,new byte[]{0});many.Write(end,0,end.Length);RejectMetadata(many.ToArray());}}groups++;
            {ByteChannel c=new ByteChannel(Shell(new byte[0],new byte[0],0));c.advance=2000;bool rejected=false;try{DecodeMetadata(c,"MODEL","1",delegate{});}catch{rejected=true;}Check(rejected);c=new ByteChannel(Shell(new byte[0],new byte[0],0));c.missingEof=true;rejected=false;try{DecodeMetadata(c,"MODEL","1",delegate{});}catch{rejected=true;}Check(rejected);c=new ByteChannel(Shell(new byte[0],new byte[0],0));rejected=false;try{DecodeMetadata(c,"MODEL","1",delegate{throw new IOException();});}catch{rejected=true;}Check(rejected&&Encoding.ASCII.GetString(c.sent.ToArray())=="0013host:transport-id:1");}groups++;
            {MetadataProvider p=new MetadataProvider();Input i=new Input();Output o=new Output();i.Feed(MetadataFrame(1,"MODEL","1",DiscoveryNow()+30000));i.End();RetainedAdbProtocol.RunResult result=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;});Check(!result.Clean&&p.reserves==0&&p.metadataCalls==0);}groups++;
            {MetadataProvider p=new MetadataProvider();p.stdout=Convert.ToBase64String(Encoding.ASCII.GetBytes("x"));p.stderr=Convert.ToBase64String(Encoding.ASCII.GetBytes(new string('y',32767)));p.remoteExit=7;Input i=new Input();Output o=new Output();ManagedReader r=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});r.Settled();i.Feed(MetadataFrame(2,"MODEL","1",DiscoveryNow()+30000));Wait(delegate{return o.count==2;});r.Settled();string[] lines=Encoding.ASCII.GetString(o.ToArray()).Split('\n');Check(lines[1].Length<65536&&lines[1].Contains("\"version\":3")&&lines[1].Contains("\"kind\":\"METADATA_QUERY\"")&&lines[1].Contains("\"remoteExitCode\":7")&&p.retires==0);i.End();Check(r.thread.Join(5000)&&r.result.Clean&&p.retires==1);}groups++;
            {MetadataProvider p=new MetadataProvider();Input i=new Input();Output o=new Output();ManagedReader r=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});r.Settled();for(int n=0;n<128;n++){long request=n+2;i.Feed(n%2==0?MetadataFrame(request,"MODEL","1",DiscoveryNow()+30000):DiscoveryFrame(request,DiscoveryNow()+30000));Wait(delegate{return o.count==request;});r.Settled();}i.Feed(MetadataFrame(130,"MODEL","1",DiscoveryNow()+30000));Check(p.Retired.WaitOne(5000));i.End();Check(r.thread.Join(5000)&&!r.result.Clean&&p.metadataCalls==64&&p.discoveryCalls==64);}groups++;
            {MetadataProvider p=new MetadataProvider();p.QueryRelease.Reset();Input i=new Input();Output o=new Output();ManagedReader r=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});r.Settled();i.Feed(MetadataFrame(2,"MODEL","1",DiscoveryNow()+30000));Check(p.QueryEntered.WaitOne(5000));i.Feed(Frame(3,"RETIRE"));Check(p.Retired.WaitOne(5000));i.End();Check(r.thread.Join(5000)&&r.result.Clean&&p.metadataCalls==1&&p.retires==1);}groups++;
            foreach(string late in new string[]{"METADATA","DISCOVER","THROW","MALFORMED"}){MetadataProvider p=new MetadataProvider();p.QueryRelease.Reset();p.earlyRetire=true;p.unknown=true;p.discoveryFault=late;Input i=new Input();Output o=new Output();ManagedReader r=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});r.Settled();i.Feed(late=="METADATA"?MetadataFrame(2,"MODEL","1",DiscoveryNow()+30000):DiscoveryFrame(2,DiscoveryNow()+30000));Check(p.QueryEntered.WaitOne(5000));i.Feed(Frame(3,"RETIRE"));Wait(delegate{return o.count==2&&p.retires==1;});p.QueryRelease.Set();Wait(delegate{return p.retires==2;});i.End();Check(r.thread.Join(5000)&&!r.result.Clean&&p.metadataCalls+p.discoveryCalls==1);}groups++;
            {MetadataProvider p=new MetadataProvider();Input i=new Input();Output o=new Output();ManagedReader r=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});r.Settled();o.FlushEntered.Reset();o.FlushRelease.Reset();i.Feed(MetadataFrame(2,"MODEL","1",DiscoveryNow()+30000));Check(o.FlushEntered.WaitOne(5000));i.Feed(Frame(3,"HEALTH"));Wait(delegate{return i.waiting;});i.Feed(Frame(4,"RETIRE"));Check(p.Retired.WaitOne(5000));r.Failed("OUTPUT_FAILED");i.End();o.FlushRelease.Set();Check(r.thread.Join(5000)&&!r.result.Clean&&r.result.Code=="OUTPUT_FAILED"&&p.metadataCalls==1&&p.healths==0&&o.count==3);}groups++;
            return groups;
        }
        static byte[] InputFrame(long request,string action,string transport,long deadline)
        {return Encoding.ASCII.GetBytes("{\"version\":4,\"sessionId\":\""+Session+"\",\"requestId\":"+request+",\"attemptId\":\""+Attempt+"\",\"operation\":\"INPUT\",\"action\":\""+action+"\",\"transportId\":\""+transport+"\",\"deadlineUtc\":"+deadline+"}\n");}
        static IsolatedAdbServer.RetainedProvider.MetadataBytes DecodeInput(ByteChannel channel,string action,Action fence)
        {return IsolatedAdbServer.RetainedProvider.ReadInput(channel,new IsolatedAdbServer.RetainedProvider.DiscoveryBudget(31000,delegate{return channel.now;}),"1",action,fence);}
        static void RejectInput(byte[] bytes)
        {bool rejected=false;try{DecodeInput(new ByteChannel(bytes),"HOME",delegate{});}catch{rejected=true;}Check(rejected);}
        static void RejectInputFacts(IDictionary<string,object> facts)
        {
            RetainedAdbProtocol.Request request=RetainedAdbProtocol.Parse(InputFrame(1,"HOME","1",DiscoveryNow()+30000),Session,0);
            if(facts.ContainsKey("observedAtUtc")&&facts["observedAtUtc"] is long&&(long)facts["observedAtUtc"]==1000){facts=new Dictionary<string,object>(facts);facts["observedAtUtc"]=request.AdmittedUtc;}
            bool rejected=false;try{typeof(RetainedAdbProtocol).GetMethod("InputSnapshot",System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.NonPublic).Invoke(null,new object[]{facts,request});}catch(System.Reflection.TargetInvocationException error){rejected=error.InnerException is InvalidDataException;}Check(rejected);
        }
        sealed class InputProvider : ServerProvider
        {
            internal int inputs,metadataCalls,discoveryCalls;internal bool unknown,earlyRetire,stdoutEmpty=true,stderrEmpty=true;internal int remoteExit;internal string fault="";
            internal readonly ManualResetEvent QueryEntered=new ManualResetEvent(false),QueryRelease=new ManualResetEvent(true),QueryDone=new ManualResetEvent(false);
            public override IDictionary<string,object> Input(object attempt,string transportId,string action,long deadlineUtc)
            {Check(Object.ReferenceEquals(token,attempt)&&transportId=="1"&&action=="HOME");Interlocked.Increment(ref inputs);QueryEntered.Set();QueryRelease.WaitOne();try{if(fault=="THROW")throw new IOException();if(fault=="MALFORMED")return new Dictionary<string,object>{{"raw","private"}};return new Dictionary<string,object>{{"version",1},{"kind","INPUT_QUERY"},{"status",unknown?"UNRETIRED":"COMPLETE"},{"code",unknown?"UNRETIRED":"OK"},{"dispatched",true},{"operationRetired",!unknown},{"remoteExitCode",unknown?null:(object)remoteExit},{"stdoutEmpty",unknown?null:(object)stdoutEmpty},{"stderrEmpty",unknown?null:(object)stderrEmpty},{"observedAtUtc",unknown?null:(object)DiscoveryNow()}};}finally{QueryDone.Set();}}
            public override IDictionary<string,object> Metadata(object attempt,string transportId,string field,long deadlineUtc)
            {Check(Object.ReferenceEquals(token,attempt));Interlocked.Increment(ref metadataCalls);return new Dictionary<string,object>{{"version",1},{"kind","METADATA_QUERY"},{"status","COMPLETE"},{"code","OK"},{"dispatched",true},{"operationRetired",true},{"stdoutBase64",""},{"stderrBase64",""},{"remoteExitCode",0},{"observedAtUtc",DiscoveryNow()}};}
            public override IDictionary<string,object> Discover(object attempt,long deadlineUtc)
            {Check(Object.ReferenceEquals(token,attempt));Interlocked.Increment(ref discoveryCalls);return new Dictionary<string,object>{{"version",1},{"kind","ACQUISITION"},{"status","COMPLETE"},{"code","OK"},{"dispatched",true},{"operationRetired",true},{"payloadBase64",""},{"observedAtUtc",DiscoveryNow()}};}
            public override IDictionary<string,object> Retire(object attempt)
            {if(!earlyRetire){QueryRelease.Set();if(inputs>0)Check(QueryDone.WaitOne(5000));}return base.Retire(attempt);}
        }
        // Twelve pure codec / fake-provider groups. No real provider or socket is constructed.
        public static int RunInput()
        {
            int groups=0;long deadline=DiscoveryNow()+30000;
            string[] actions={"HOME","BACK","ENTER","ESCAPE","DPAD_UP","DPAD_DOWN","DPAD_LEFT","DPAD_RIGHT","DPAD_CENTER"};
            string[] numbers={"3","4","66","111","19","20","21","22","23"};
            for(int n=0;n<actions.Length;n++){Check(IsolatedAdbServer.RetainedProvider.InputCommand(actions[n])=="input keyboard -d 0 keyevent "+numbers[n]);RetainedAdbProtocol.Request r=RetainedAdbProtocol.Parse(InputFrame(2,actions[n],"18446744073709551615",deadline),Session,1);Check(r!=null&&r.Version==4&&r.Action==actions[n]);}
            foreach(string action in new string[]{"TAP","SWIPE","TEXT","HOME;id","HOME\n","3"}){Check(RetainedAdbProtocol.Parse(InputFrame(2,action,"1",deadline),Session,1)==null);bool refused=false;try{IsolatedAdbServer.RetainedProvider.InputCommand(action);}catch{refused=true;}Check(refused);}
            foreach(string transport in new string[]{"0","01","18446744073709551616","1\n","1;id"})Check(RetainedAdbProtocol.Parse(InputFrame(2,"HOME",transport,deadline),Session,1)==null);
            byte[] canonical=InputFrame(2,"HOME","1",deadline);Check(RetainedAdbProtocol.Parse(canonical,Session,2)==null);foreach(string raw in new string[]{Encoding.ASCII.GetString(canonical).Replace("\"version\":4","\"version\":4,\"version\":4"),Encoding.ASCII.GetString(canonical).Replace("\n","\r\n"),Encoding.ASCII.GetString(canonical)+"\n"})Check(RetainedAdbProtocol.Parse(Encoding.ASCII.GetBytes(raw),Session,1)==null);Check(RetainedAdbProtocol.Parse(InputFrame(2,"HOME","1",8640000000000001L),Session,1)==null);groups++;
            for(int n=0;n<actions.Length;n++)foreach(int step in new int[]{1,4096})foreach(int exit in new int[]{0,255}){ByteChannel c=new ByteChannel(Shell(new byte[0],new byte[0],exit));c.step=step;int checks=0;IsolatedAdbServer.RetainedProvider.MetadataBytes result=DecodeInput(c,actions[n],delegate{checks++;Check(Encoding.ASCII.GetString(c.sent.ToArray())=="0013host:transport-id:1");});string service="shell,v2,raw:input keyboard -d 0 keyevent "+numbers[n];Check(checks==1&&result.remoteExitCode==exit&&result.stdout.Length==0&&result.stderr.Length==0);Check(Encoding.ASCII.GetString(c.sent.ToArray())=="0013host:transport-id:1"+service.Length.ToString("x4")+service);}groups++;
            foreach(byte[] invalid in new byte[][]{Encoding.ASCII.GetBytes("FAIL0000"),Encoding.ASCII.GetBytes("OKAYFAIL0000"),Encoding.ASCII.GetBytes("OKAYOKAY"),Bytes(Encoding.ASCII.GetBytes("OKAYOKAY"),Packet(4,new byte[0])),Bytes(Encoding.ASCII.GetBytes("OKAYOKAY"),Packet(3,new byte[0])),Bytes(Encoding.ASCII.GetBytes("OKAYOKAY"),Packet(3,new byte[]{0,0})),Bytes(Shell(new byte[0],new byte[0],0),new byte[]{0}),Bytes(Encoding.ASCII.GetBytes("OKAYOKAY"),new byte[]{1,1,0,0,0})})RejectInput(invalid);groups++;
            {ByteChannel c=new ByteChannel(Shell(new byte[]{0,255},new byte[]{195},7));IsolatedAdbServer.RetainedProvider.MetadataBytes bytes=DecodeInput(c,"HOME",delegate{});IsolatedAdbServer.RetainedProvider.InputReply reply=new IsolatedAdbServer.RetainedProvider.InputReply(new IsolatedAdbServer.RetainedProvider.QueryReply("COMPLETE","OK",true,true,null,bytes,1000));IDictionary<string,object> facts=reply.Snapshot();Check(facts.Count==10&&!(bool)facts["stdoutEmpty"]&&!(bool)facts["stderrEmpty"]&&(int)facts["remoteExitCode"]==7&&!facts.ContainsKey("stdoutBase64"));bytes.stdout[0]=120;Check(!(bool)reply.Snapshot()["stdoutEmpty"]);bool immutable=false;try{facts["code"]="private";}catch{immutable=true;}Check(immutable);
             foreach(string key in new string[]{"version","kind","status","code","dispatched","operationRetired","remoteExitCode","stdoutEmpty","stderrEmpty","observedAtUtc"}){Dictionary<string,object> bad=new Dictionary<string,object>(facts);bad[key]="private";RejectInputFacts(bad);}
             Dictionary<string,object> extra=new Dictionary<string,object>(facts);extra.Add("raw","private");RejectInputFacts(extra);
             foreach(int exit in new int[]{-1,256}){Dictionary<string,object> bad=new Dictionary<string,object>(facts);bad["remoteExitCode"]=exit;RejectInputFacts(bad);}
            }groups++;
            {ByteChannel c=new ByteChannel(Shell(new byte[32768],new byte[0],0));c.step=4096;Check(DecodeInput(c,"HOME",delegate{}).stdout.Length==32768);RejectInput(Shell(new byte[32768],new byte[1],0));RejectInput(Shell(new byte[32769],new byte[0],0));using(MemoryStream many=new MemoryStream()){byte[] ack=Encoding.ASCII.GetBytes("OKAYOKAY");many.Write(ack,0,ack.Length);for(int n=0;n<256;n++){byte[] part=Packet(1,new byte[0]);many.Write(part,0,part.Length);}byte[] end=Packet(3,new byte[]{0});many.Write(end,0,end.Length);RejectInput(many.ToArray());}}groups++;
            {ByteChannel c=new ByteChannel(Shell(new byte[0],new byte[0],0));c.advance=2000;bool rejected=false;try{DecodeInput(c,"HOME",delegate{});}catch{rejected=true;}Check(rejected);c=new ByteChannel(Shell(new byte[0],new byte[0],0));c.missingEof=true;rejected=false;try{DecodeInput(c,"HOME",delegate{});}catch{rejected=true;}Check(rejected);c=new ByteChannel(Shell(new byte[0],new byte[0],0));rejected=false;try{DecodeInput(c,"HOME",delegate{throw new IOException();});}catch{rejected=true;}Check(rejected&&Encoding.ASCII.GetString(c.sent.ToArray())=="0013host:transport-id:1");}groups++;
            {InputProvider p=new InputProvider();Input i=new Input();Output o=new Output();i.Feed(InputFrame(1,"HOME","1",DiscoveryNow()+30000));i.End();RetainedAdbProtocol.RunResult result=RetainedAdbProtocol.Run(i,o,Session,p,delegate{return true;});Check(!result.Clean&&p.reserves==0&&p.inputs==0);}groups++;
            foreach(int exit in new int[]{0,7}){InputProvider p=new InputProvider();p.remoteExit=exit;p.stdoutEmpty=exit==0;p.stderrEmpty=exit==0;Input i=new Input();Output o=new Output();ManagedReader r=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});r.Settled();i.Feed(InputFrame(2,"HOME","1",DiscoveryNow()+30000));Wait(delegate{return o.count==2;});r.Settled();string[] lines=Encoding.ASCII.GetString(o.ToArray()).Split('\n');Check(lines[1].Length<65536&&lines[1].Contains("\"version\":4")&&lines[1].Contains("\"kind\":\"INPUT_QUERY\"")&&lines[1].Contains("\"remoteExitCode\":"+exit)&&!lines[1].Contains("Base64")&&!lines[1].Contains("observation")&&p.retires==0);i.End();Check(r.thread.Join(5000)&&r.result.Clean&&p.retires==1);}groups++;
            {InputProvider p=new InputProvider();Input i=new Input();Output o=new Output();ManagedReader r=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});r.Settled();for(int n=0;n<128;n++){long request=n+2;i.Feed(n%3==0?InputFrame(request,"HOME","1",DiscoveryNow()+30000):n%3==1?MetadataFrame(request,"MODEL","1",DiscoveryNow()+30000):DiscoveryFrame(request,DiscoveryNow()+30000));Wait(delegate{return o.count==request;});r.Settled();}i.Feed(InputFrame(130,"HOME","1",DiscoveryNow()+30000));Check(p.Retired.WaitOne(5000));i.End();Check(r.thread.Join(5000)&&!r.result.Clean&&p.inputs==43&&p.metadataCalls==43&&p.discoveryCalls==42);}groups++;
            {InputProvider p=new InputProvider();p.QueryRelease.Reset();Input i=new Input();Output o=new Output();ManagedReader r=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});r.Settled();i.Feed(InputFrame(2,"HOME","1",DiscoveryNow()+30000));Check(p.QueryEntered.WaitOne(5000));i.Feed(Frame(3,"RETIRE"));Check(p.Retired.WaitOne(5000));i.End();Check(r.thread.Join(5000)&&r.result.Clean&&p.inputs==1&&p.retires==1);}groups++;
            foreach(string fault in new string[]{"UNRETIRED","THROW","MALFORMED"}){InputProvider p=new InputProvider();p.QueryRelease.Reset();p.earlyRetire=true;p.unknown=true;p.fault=fault;Input i=new Input();Output o=new Output();ManagedReader r=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});r.Settled();i.Feed(InputFrame(2,"HOME","1",DiscoveryNow()+30000));Check(p.QueryEntered.WaitOne(5000));i.Feed(Frame(3,"RETIRE"));Wait(delegate{return o.count==2&&p.retires==1;});p.QueryRelease.Set();Wait(delegate{return p.retires==2;});i.End();Check(r.thread.Join(5000)&&!r.result.Clean&&p.inputs==1);}groups++;
            {InputProvider p=new InputProvider();Input i=new Input();Output o=new Output();ManagedReader r=new ManagedReader(i,o,p);i.Feed(Frame(1,"START"));Wait(delegate{return o.count==1;});r.Settled();o.FlushEntered.Reset();o.FlushRelease.Reset();i.Feed(InputFrame(2,"HOME","1",DiscoveryNow()+30000));Check(o.FlushEntered.WaitOne(5000));i.Feed(Frame(3,"HEALTH"));Wait(delegate{return i.waiting;});i.Feed(Frame(4,"RETIRE"));Check(p.Retired.WaitOne(5000));r.Failed("OUTPUT_FAILED");i.End();o.FlushRelease.Set();Check(r.thread.Join(5000)&&!r.result.Clean&&p.inputs==1&&p.healths==0&&o.count==3);}groups++;
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
        sealed class VideoChannel : IsolatedAdbServer.RetainedProvider.IVideoChannel
        {
            readonly object gate=new object();readonly Queue<byte> bytes=new Queue<byte>();internal readonly MemoryStream written=new MemoryStream();
            internal bool eof,closed,holdRetirement;internal Action onClose;internal int maximumRead=3;
            internal VideoChannel(byte[] data,bool eof){Feed(data);this.eof=eof;}
            internal void Feed(byte[] data){lock(gate){foreach(byte b in data)bytes.Enqueue(b);Monitor.PulseAll(gate);}}
            internal void End(){lock(gate){eof=true;Monitor.PulseAll(gate);}}
            public int Read(byte[] b,int o,int n,int timeout){lock(gate){while(bytes.Count==0&&!eof&&!closed){if(!Monitor.Wait(gate,timeout))throw new System.Net.Sockets.SocketException((int)System.Net.Sockets.SocketError.TimedOut);}if(closed)return 0;int size=Math.Min(Math.Min(n,maximumRead),bytes.Count);for(int j=0;j<size;j++)b[o+j]=bytes.Dequeue();return size;}}
            public void Write(byte[] b,int o,int n,Func<int> remaining){remaining();lock(gate){if(closed)throw new IOException("CLOSED");written.Write(b,o,n);}}
            public void Close(){Action call=null;lock(gate){if(!closed){closed=true;call=onClose;Monitor.PulseAll(gate);}}if(call!=null)call();}
            public bool Retired {get{lock(gate)return closed&&!holdRetirement;}}
        }
        static byte[] VideoJoin(params byte[][] parts){using(MemoryStream m=new MemoryStream()){foreach(byte[] p in parts)m.Write(p,0,p.Length);return m.ToArray();}}
        static byte[] VideoShell(byte kind,byte[] payload){byte[] h={kind,(byte)payload.Length,(byte)(payload.Length>>8),(byte)(payload.Length>>16),(byte)(payload.Length>>24)};return VideoJoin(h,payload);}
        static byte[] VideoSync(string kind,byte[] payload){byte[] k=Encoding.ASCII.GetBytes(kind),h={k[0],k[1],k[2],k[3],(byte)payload.Length,(byte)(payload.Length>>8),0,0};return VideoJoin(h,payload);}
        static string VideoHash(byte[] bytes){using(System.Security.Cryptography.SHA256 h=System.Security.Cryptography.SHA256.Create()){StringBuilder b=new StringBuilder();foreach(byte v in h.ComputeHash(bytes))b.Append(v.ToString("x2"));return b.ToString();}}
        sealed class VideoIo : IsolatedAdbServer.RetainedProvider.IVideoIo
        {
            readonly object videoGate=new object();
            internal readonly byte[] artifact={1,2,3,4};internal readonly List<string> services=new List<string>();internal readonly List<VideoChannel> channels=new List<VideoChannel>();
            internal readonly ManualResetEvent intentEntered=new ManualResetEvent(false),intentRelease=new ManualResetEvent(true),settlementEntered=new ManualResetEvent(false),settlementRelease=new ManualResetEvent(true),completeEntered=new ManualResetEvent(false),completeRelease=new ManualResetEvent(true);
            internal bool intent,completed,failUpload,badReadback,badNonce,hugePacket,creationUnknown,creationCollision,loseFence,holdCleanup;
            internal int cleanups,cancels,holdCloseStage;internal byte[] mediaOverride;internal IDictionary<string,object> settlement;VideoChannel shell;int syncs;
            public void Fence(bool cleanup){if(loseFence)throw new IOException("ADMISSION_REJECTED");}
            public Stream Artifact(){return new MemoryStream(artifact,false);}
            public void Intent(){intentEntered.Set();intentRelease.WaitOne();intent=true;}
            public void Settlement(IDictionary<string,object> f){settlement=f;settlementEntered.Set();settlementRelease.WaitOne();}
            public void Complete(){completeEntered.Set();completeRelease.WaitOne();completed=true;}
            public IsolatedAdbServer.RetainedProvider.IVideoChannel Open(string service,bool cleanup,Func<int> remaining)
            {
                remaining();lock(videoGate){services.Add(service);}VideoChannel c;
                if(service.StartsWith("shell,v2,raw:umask",StringComparison.Ordinal))c=new VideoChannel(creationUnknown?new byte[0]:VideoShell(3,new byte[]{(byte)(creationCollision?1:0)}),true);
                else if(service=="sync:"){
                    syncs++;if(syncs==1)c=new VideoChannel(Encoding.ASCII.GetBytes(failUpload?"FAIL\0\0\0\0":"OKAY\0\0\0\0"),true);
                    else c=new VideoChannel(VideoJoin(VideoSync("DATA",badReadback?new byte[]{4,3,2,1}:artifact),Encoding.ASCII.GetBytes("DONE\0\0\0\0")),true);
                }else if(service.StartsWith("shell,v2,raw:CLASSPATH=",StringComparison.Ordinal)){
                    shell=new VideoChannel(VideoShell(1,Encoding.ASCII.GetBytes("AUTOVID1_READY\n")),false);c=shell;
                }else if(service.StartsWith("localabstract:",StringComparison.Ordinal)){
                    byte[] prefix=new byte[41];Encoding.ASCII.GetBytes("AUTOVID1",0,8,prefix,1);if(badNonce)prefix[9]=1;
                    byte[] codec={0x68,0x32,0x36,0x34},session={0x80,0,0,0,0,0,0,100,0,0,0,200};
                    byte[] packet={0,0,0,0,0,0,0,1,0,0,0,1,7};if(hugePacket){packet[8]=1;packet[12]=0;}
                    c=new VideoChannel(VideoJoin(prefix,codec,session,mediaOverride??packet),false);c.onClose=delegate(){shell.Feed(VideoShell(3,new byte[]{0}));shell.End();};
                }else if(service.StartsWith("shell,v2,raw:rm -f",StringComparison.Ordinal)){cleanups++;c=new VideoChannel(holdCleanup?new byte[0]:VideoShell(3,new byte[]{0}),!holdCleanup);}
                else throw new IOException("UNEXPECTED_VIDEO_SERVICE");
                lock(videoGate){channels.Add(c);if(holdCloseStage==channels.Count)c.holdRetirement=true;}return c;
            }
            public void Cancel(){Interlocked.Increment(ref cancels);lock(videoGate){foreach(VideoChannel c in channels)if(!Object.ReferenceEquals(c,shell))c.Close();}}
            public void CloseAll(){lock(videoGate){foreach(VideoChannel c in channels)c.Close();}}
            public bool Retired {get{lock(videoGate){foreach(VideoChannel c in channels)if(!c.Retired)return false;return true;}}}
        }
        sealed class VideoProvider : ServerProvider, RetainedAdbProtocol.IVideoProvider
        {
            internal readonly ManualResetEvent VideoEntered=new ManualResetEvent(false),VideoRelease=new ManualResetEvent(true);
            internal int videoStarts,videoStops;internal string videoId;
            IDictionary<string,object> VideoFacts(bool closed){return new Dictionary<string,object>{{"sessionId",videoId},{"snapshotRevision",closed?2L:1L},{"state",closed?"CLOSED":"RECEIVING"},{"code",closed?"CLOSED":"OK"},{"streamObserved",true},{"sessionPackets",1L},{"mediaPackets",1L},{"encodedBytes",1L},{"lastWidth",100},{"lastHeight",200},{"directory","CREATED"},{"upload","VERIFIED"},{"launch",closed?"EXITED":"STARTED"},{"localRetired",closed},{"cleanup",closed?"CLEANED":"PENDING"}};}
            public IDictionary<string,object> VideoStart(object attempt,string attemptId,string id,string transport,long epoch,long deadline,string artifact,int scid,string nonce){Check(Object.ReferenceEquals(attempt,token));videoId=id;Interlocked.Increment(ref videoStarts);VideoEntered.Set();VideoRelease.WaitOne();return VideoFacts(videoStops>0);}
            public IDictionary<string,object> VideoStatus(object attempt,string id){Check(id==videoId);return VideoFacts(videoStops>0);}
            public IDictionary<string,object> VideoStop(object attempt,string id){Check(id==videoId);Interlocked.Increment(ref videoStops);VideoRelease.Set();return VideoFacts(true);}
        }
        static byte[] VideoFrame(long request,string operation)
        {string id="33333333-3333-4333-8333-333333333333";string raw="{\"version\":5,\"requestId\":"+request+",\"sessionId\":\""+Session+"\",\"attemptId\":\""+Attempt+"\",\"kind\":\""+operation+"\",\"videoId\":\""+id+"\"";
            if(operation=="VIDEO_START")raw+=",\"transportId\":\"7\",\"hostEpoch\":1,\"deadlineUtc\":"+(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+30000)+",\"artifactId\":\""+new string('a',64)+"\",\"scid\":1,\"nonceHex\":\""+new string('0',64)+"\"";
            return Encoding.ASCII.GetBytes(raw+"}\n");}
        static IsolatedAdbServer.RetainedProvider.VideoState VideoSession(VideoIo io)
        {return new IsolatedAdbServer.RetainedProvider.VideoState(io,"33333333-3333-4333-8333-333333333333",new string('0',64),1,io.artifact.Length,VideoHash(io.artifact),DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+30000);}
        // Additional pure/fake path groups. Authored only: no compile, network, ADB, Java or phone execution.
        public static int RunVideo()
        {
            int passed=0;string id="33333333-3333-4333-8333-333333333333";
            Check(IsolatedAdbServer.RetainedProvider.VideoCreateCommand(id)=="umask 077 && mkdir /data/local/tmp/fonesi-video-"+id);
            Check(IsolatedAdbServer.RetainedProvider.VideoCleanupCommand(id)=="rm -f /data/local/tmp/fonesi-video-"+id+"/server.jar && rmdir /data/local/tmp/fonesi-video-"+id);
            Check(!IsolatedAdbServer.RetainedProvider.VideoLaunchCommand(id,1,new string('0',64)).Contains(" &"));passed++;
            bool rejected=false;try{IsolatedAdbServer.RetainedProvider.VideoCreateCommand(id+"\n");}catch{rejected=true;}Check(rejected);passed++;
            {VideoIo io=new VideoIo();var v=VideoSession(io);v.Start();var r=v.AwaitStarted();Check((bool)r["streamObserved"]&&(string)r["state"]=="RECEIVING");v.Stop();Check(v.Clean&&io.cleanups==1&&io.intent&&io.completed&&(string)io.settlement["launch"]=="EXITED");passed++;}
            foreach(string variant in new[]{"nonce","size","readback","upload","collision","creationUnknown"}){
                VideoIo io=new VideoIo();io.badNonce=variant=="nonce";io.hugePacket=variant=="size";io.badReadback=variant=="readback";io.failUpload=variant=="upload";io.creationCollision=variant=="collision";io.creationUnknown=variant=="creationUnknown";
                var v=VideoSession(io);v.Start();v.AwaitStarted();v.Stop();Wait(delegate{return v.Done;});var r=v.Snapshot();Check(!(bool)r["streamObserved"]);
                if(variant=="creationUnknown")Check(!v.Clean&&(string)r["directory"]=="UNKNOWN"&&io.cleanups==0);
                else Check(v.Clean&&io.cleanups==(variant=="collision"?0:1));passed++;
            }
            {VideoIo io=new VideoIo();io.intentRelease.Reset();var v=VideoSession(io);v.Start();Check(io.intentEntered.WaitOne(5000));v.RequestStop();Check(io.services.Count==0);io.intentRelease.Set();Wait(delegate{return v.Done;});Check(v.Clean&&io.services.Count==0&&(string)v.Snapshot()["launch"]=="NONE");passed++;}
            {VideoIo io=new VideoIo();io.loseFence=true;var v=VideoSession(io);v.Start();v.AwaitStarted();Wait(delegate{return v.Done;});Check(!io.intent&&io.services.Count==0&&v.Clean);passed++;}
            {long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();string frame="{\"version\":5,\"requestId\":1,\"sessionId\":\""+Session+"\",\"attemptId\":\""+Attempt+"\",\"kind\":\"VIDEO_START\",\"videoId\":\""+id+"\",\"transportId\":\"7\",\"hostEpoch\":1,\"deadlineUtc\":"+(now+30000)+",\"artifactId\":\""+new string('a',64)+"\",\"scid\":1,\"nonceHex\":\""+new string('0',64)+"\"}\n";Check(RetainedAdbProtocol.Parse(Encoding.ASCII.GetBytes(frame),Session,0)!=null);Check(RetainedAdbProtocol.Parse(Encoding.ASCII.GetBytes(frame.Replace("\"hostEpoch\":1","\"hostEpoch\":0")),Session,0)==null);passed++;}
            // v5 cleanup preempts an actual held START provider call and retains both writer/worker obligations.
            {VideoProvider p=new VideoProvider();p.VideoRelease.Reset();Input input=new Input();Output output=new Output();RetainedAdbProtocol.RunResult result=null;
                Thread thread=new Thread(delegate(){result=RetainedAdbProtocol.Run(input,output,Session,p,delegate{return true;},false,"SERVER_ONLY");});thread.IsBackground=true;thread.Start();input.Feed(Frame(1,"START"));Wait(delegate{return output.count==1&&input.waiting;});input.Feed(VideoFrame(2,"VIDEO_START"));Check(p.VideoEntered.WaitOne(5000));input.Feed(VideoFrame(3,"VIDEO_STOP"));Wait(delegate{return output.count==3&&input.waiting;});Check(p.videoStops==1&&p.videoStarts==1);input.End();Check(thread.Join(5000)&&result.Clean);passed++;}
            // VERSION_ONLY refuses v5 before reserve/provider effects.
            {VideoProvider p=new VideoProvider();Input input=new Input();Output output=new Output();input.Feed(VideoFrame(1,"VIDEO_START"));input.End();var result=RetainedAdbProtocol.Run(input,output,Session,p,delegate{return true;});Check(!result.Clean&&p.reserves==0&&p.videoStarts==0);passed++;}
            // Actual final journal publication/root-handle completion is retained, not public retirement.
            foreach(bool holdSettlement in new[]{true,false}){
                VideoIo io=new VideoIo();if(holdSettlement)io.settlementRelease.Reset();else io.completeRelease.Reset();var v=VideoSession(io);v.Start();Check((bool)v.AwaitStarted()["streamObserved"]);v.RequestStop();
                Check((holdSettlement?io.settlementEntered:io.completeEntered).WaitOne(5000));var held=v.Snapshot();Check(!(bool)held["localRetired"]&&(string)held["state"]=="STOPPING"&&(string)held["cleanup"]=="PENDING"&&!v.Clean&&!v.Done);
                Check((bool)io.settlement["localRetired"]);v.RequestStop();Check(io.cancels==1);
                (holdSettlement?io.settlementRelease:io.completeRelease).Set();Wait(delegate{return v.Done;});var terminal=v.Snapshot();Check(v.Clean&&(bool)terminal["localRetired"]&&(string)terminal["state"]=="CLOSED"&&Convert.ToInt64(terminal["snapshotRevision"])>Convert.ToInt64(held["snapshotRevision"]));passed++;
            }
            // Each exact channel close must settle before the next remote stage, including upload->readback.
            foreach(int stage in new[]{1,2}){
                VideoIo io=new VideoIo();io.holdCloseStage=stage;var v=VideoSession(io);v.Start();Wait(delegate{return io.channels.Count>=stage&&io.channels[stage-1].closed;});Check(io.services.Count==stage);io.channels[stage-1].holdRetirement=false;Check((bool)v.AwaitStarted()["streamObserved"]);v.Stop();Check(v.Clean);passed++;
            }
            // Held state locks cannot consume an unbounded cleanup admission/status wait.
            {VideoIo io=new VideoIo();var v=VideoSession(io);object sync=typeof(IsolatedAdbServer.RetainedProvider.VideoState).GetField("sync",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).GetValue(v);ManualResetEvent entered=new ManualResetEvent(false),release=new ManualResetEvent(false);Thread holder=new Thread(delegate(){lock(sync){entered.Set();release.WaitOne();}});holder.IsBackground=true;holder.Start();Check(entered.WaitOne(5000));var timer=System.Diagnostics.Stopwatch.StartNew();Check(!v.TryRequestStop(timer,25));Check(timer.ElapsedMilliseconds<1000&&!v.Done&&!v.Clean&&!(bool)v.Snapshot()["localRetired"]);release.Set();Check(holder.Join(5000));v.Start();Wait(delegate{return v.Done;});Check(v.Clean&&io.services.Count==0);passed++;}
            // Shared production partial-send helper consumes one original remaining clock across every send.
            {ByteChannel c=new ByteChannel(new byte[0]);c.advance=60;bool expired=false;try{IsolatedAdbServer.RetainedProvider.VideoWriteAll(c,new byte[4],0,4,delegate(){long left=1100-c.now;if(left<=0)throw new IOException("DEADLINE_EXCEEDED");return (int)left;});}catch(IOException){expired=true;}Check(expired&&c.sent.Length==2);passed++;}
            // Shared production connect wait cannot renew a deadline after actual connect completion.
            {var pending=new System.Threading.Tasks.TaskCompletionSource<bool>();long now=1000;Thread complete=new Thread(delegate(){now=1101;pending.SetResult(true);});complete.IsBackground=true;complete.Start();Check(complete.Join(5000));bool expired=false;try{IsolatedAdbServer.RetainedProvider.WaitVideoConnect(pending.Task,delegate(){if(now>=1100)throw new IOException("DEADLINE_EXCEEDED");return (int)(1100-now);});}catch(IOException){expired=true;}Check(expired);passed++;}
            // Repeated STOP shares the first cancellation; it cannot close a later cleanup channel.
            {VideoIo io=new VideoIo();io.holdCleanup=true;var v=VideoSession(io);v.Start();Check((bool)v.AwaitStarted()["streamObserved"]);v.RequestStop();Wait(delegate{return io.cleanups==1&&io.channels.Count==6;});VideoChannel cleanup=io.channels[5];Check(!cleanup.closed);v.RequestStop();v.RequestStop();Check(io.cancels==1&&!cleanup.closed);cleanup.Feed(VideoShell(3,new byte[]{0}));cleanup.End();Wait(delegate{return v.Done;});Check(v.Clean);passed++;}
            // Invalid admission is rejected before any I/O resource/fence/journal entry can occur.
            {VideoIo io=new VideoIo();bool refused=false;try{new IsolatedAdbServer.RetainedProvider.VideoState(io,id,new string('0',64),1,4,VideoHash(io.artifact),DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-1);}catch(IOException){refused=true;}Check(refused&&io.services.Count==0&&!io.intent&&!io.completed&&io.channels.Count==0);passed++;}
            return passed;
        }

        static byte[] MediaRequest(long request,string operation){return Encoding.ASCII.GetBytes(Encoding.ASCII.GetString(VideoFrame(request,operation)).Replace("\"version\":5","\"version\":6"));}
        static byte[] MediaCredit(long credit){return Encoding.ASCII.GetBytes("{\"version\":6,\"sessionId\":\""+Session+"\",\"attemptId\":\""+Attempt+"\",\"kind\":\"VIDEO_CREDIT\",\"videoId\":\"33333333-3333-4333-8333-333333333333\",\"creditId\":"+credit+"}\n");}
        static byte[] EncodedPacket(uint high,uint low,byte[] payload){byte[] h=new byte[12];uint[] words={high,low,(uint)payload.Length};for(int n=0;n<3;n++){h[n*4]=(byte)(words[n]>>24);h[n*4+1]=(byte)(words[n]>>16);h[n*4+2]=(byte)(words[n]>>8);h[n*4+3]=(byte)words[n];}return VideoJoin(h,payload);}
        static int MediaTime(){return 100;}
        sealed class MediaProvider : ServerProvider,RetainedAdbProtocol.IVideoMediaProvider
        {
            internal readonly ManualResetEvent VideoEntered=new ManualResetEvent(false),Install=new ManualResetEvent(true);
            internal volatile bool stopped;internal int emissions,stopCalls;RetainedAdbProtocol.VideoMedia media;
            IDictionary<string,object> Facts(){bool observed=emissions>=3;return new Dictionary<string,object>{{"sessionId","33333333-3333-4333-8333-333333333333"},{"snapshotRevision",stopped?2L:1L},{"state",stopped?"CLOSED":"RECEIVING"},{"code",stopped?"CLOSED":"OK"},{"streamObserved",observed},{"sessionPackets",observed?1L:0L},{"mediaPackets",observed?2L:0L},{"encodedBytes",observed?2L:0L},{"lastWidth",observed?(object)100:null},{"lastHeight",observed?(object)200:null},{"directory",observed?"CREATED":"NONE"},{"upload",observed?"VERIFIED":"NONE"},{"launch",observed?(stopped?"EXITED":"STARTED"):"NONE"},{"localRetired",stopped},{"cleanup",observed?(stopped?"CLEANED":"PENDING"):"NOT_REQUIRED"}};}
            public IDictionary<string,object> VideoStart(object a,string aid,string id,string tid,long epoch,long deadline,string artifact,int scid,string nonce){throw new InvalidOperationException();}
            public IDictionary<string,object> VideoStartMedia(object a,string aid,string id,string tid,long epoch,long deadline,string artifact,int scid,string nonce,RetainedAdbProtocol.VideoMedia m){media=m;VideoEntered.Set();Install.WaitOne();m.BindStop(delegate(){stopped=true;});if(stopped)return Facts();
                m.Emit(1,0,0,"SESSION",null,0,0,100,200,new byte[0],0,MediaTime);Interlocked.Increment(ref emissions);
                m.Emit(1,1,1,"CONFIG",null,1,0,100,200,new byte[]{7},1,MediaTime);Interlocked.Increment(ref emissions);
                m.Emit(1,1,2,"KEY",1,1,0,100,200,new byte[]{8},1,MediaTime);Interlocked.Increment(ref emissions);return Facts();}
            public IDictionary<string,object> VideoStatus(object a,string id){return Facts();}
            public IDictionary<string,object> VideoStop(object a,string id){stopped=true;Interlocked.Increment(ref stopCalls);return Facts();}
            public IDictionary<string,object> VideoStopMedia(object a,string id,System.Diagnostics.Stopwatch budget){Check(budget.ElapsedMilliseconds<10000);return VideoStop(a,id);}
            public override IDictionary<string,object> Retire(object a){if(media!=null)media.Cancel();return base.Retire(a);}
        }
        // Fixture-only inspection of the actual private Reader's callback-free settled state.
        // This avoids assuming that observing Write bytes means Flush/bookkeeping/worker exit completed.
        static object MediaReader(Input input,Output output,MediaProvider provider)
        {Type type=typeof(RetainedAdbProtocol).GetNestedType("Reader",System.Reflection.BindingFlags.NonPublic);return Activator.CreateInstance(type,System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic,null,new object[]{input,output,Session,provider,new Func<bool>(delegate{return true;}),false,"SERVER_ONLY"},null);}
        static RetainedAdbProtocol.RunResult RunMediaReader(object reader)
        {return (RetainedAdbProtocol.RunResult)reader.GetType().GetMethod("Run",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).Invoke(reader,null);}
        static bool MediaIdle(object reader)
        {Type type=reader.GetType();var flags=System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic;object gate=type.GetField("gate",flags).GetValue(reader);lock(gate){if((int)type.GetField("outstanding",flags).GetValue(reader)!=0)return false;object attempt=type.GetField("current",flags).GetValue(reader);if(attempt==null)return false;foreach(string name in new[]{"ordinary","cleanup","videoCleanup"}){Thread thread=(Thread)attempt.GetType().GetField(name,flags).GetValue(attempt);if(thread!=null&&!thread.Join(0))return false;}return true;}}
        // v6 source-authored memory/fake groups only. No native provider, codec or device execution.
        public static int RunVideoMedia()
        {
            int passed=0;string id="33333333-3333-4333-8333-333333333333";
            {var start=RetainedAdbProtocol.Parse(MediaRequest(1,"VIDEO_START"),Session,0);Check(start!=null&&start.Version==6);Check(RetainedAdbProtocol.Parse(MediaRequest(2,"VIDEO_STOP"),Session,1).Version==6);Check(RetainedAdbProtocol.Parse(Encoding.ASCII.GetBytes(Encoding.ASCII.GetString(MediaRequest(1,"VIDEO_START")).Replace("\"version\":6","\"version\":7")),Session,0)==null);passed++;}
            {string a,v;long c;Check(RetainedAdbProtocol.ParseCredit(MediaCredit(1),Session,out a,out v,out c)&&a==Attempt&&v==id&&c==1);Check(RetainedAdbProtocol.Parse(MediaCredit(1),Session,0)==null);foreach(string bad in new[]{Encoding.ASCII.GetString(MediaCredit(0)),Encoding.ASCII.GetString(MediaCredit(1)).Replace("}\n",",\"extra\":1}\n"),Encoding.ASCII.GetString(MediaCredit(1)).Replace("\n","\r\n"),Encoding.ASCII.GetString(MediaCredit(1)).Replace(Session,Attempt)})Check(!RetainedAdbProtocol.ParseCredit(Encoding.ASCII.GetBytes(bad),Session,out a,out v,out c));passed++;}
            // Early ACK cannot release held writer completion or allow scratch/next record reuse.
            {RetainedAdbProtocol.VideoMedia m=null;ManualResetEvent queued=new ManualResetEvent(false);long flight=0;byte[] record=null;
                m=new RetainedAdbProtocol.VideoMedia(Session,Attempt,id,delegate(byte[] b,RetainedAdbProtocol.VideoMedia sink,long c,Func<int> time){record=b;flight=c;queued.Set();});Check(!m.Credit(2)&&m.Credit(1)&&!m.Credit(1));
                Thread t=new Thread(delegate(){m.Emit(1,0,0,"SESSION",null,0,0,100,200,new byte[0],0,MediaTime);});t.IsBackground=true;t.Start();Check(queued.WaitOne(5000)&&flight==1&&record[0]==0&&Encoding.ASCII.GetString(record,1,7)=="AVMED01");Check(m.Credit(2)&&!m.Credit(2));Check(!t.Join(20));m.Written(1,true);Check(t.Join(5000));m.Cancel();passed++;}
            // Flush without ACK permits the current return, not a second emission.
            {int writes=0;RetainedAdbProtocol.VideoMedia m=new RetainedAdbProtocol.VideoMedia(Session,Attempt,id,delegate(byte[] b,RetainedAdbProtocol.VideoMedia sink,long c,Func<int> time){Interlocked.Increment(ref writes);sink.Written(c,true);});Check(m.Credit(1));m.Emit(1,0,0,"SESSION",null,0,0,100,200,new byte[0],0,MediaTime);Thread t=new Thread(delegate(){m.Emit(1,1,1,"CONFIG",null,1,0,100,200,new byte[]{1},1,MediaTime);});t.IsBackground=true;t.Start();Check(!t.Join(20)&&writes==1);Check(m.Credit(2));Check(t.Join(5000)&&writes==2);m.Cancel();passed++;}
            {int stopped=0,writes=0;RetainedAdbProtocol.VideoMedia m=new RetainedAdbProtocol.VideoMedia(Session,Attempt,id,delegate(byte[] b,RetainedAdbProtocol.VideoMedia sink,long c,Func<int> time){writes++;});m.Cancel();m.Cancel();m.BindStop(delegate(){stopped++;});bool failed=false;try{m.Emit(1,0,0,"SESSION",null,0,0,100,200,new byte[0],0,MediaTime);}catch(IOException){failed=true;}Check(failed&&stopped==1&&writes==0&&!m.Credit(1));passed++;}
            {RetainedAdbProtocol.VideoMedia m=new RetainedAdbProtocol.VideoMedia(Session,Attempt,id,delegate(byte[] b,RetainedAdbProtocol.VideoMedia sink,long c,Func<int> time){Check(sink.Credit(c+1));sink.Written(c,false);});Check(m.Credit(1));bool failed=false;try{m.Emit(1,0,0,"SESSION",null,0,0,100,200,new byte[0],0,MediaTime);}catch(IOException){failed=true;}Check(failed&&m.Stopped);passed++;}
            foreach(int variant in new[]{0,1,2,3}){int writes=0;RetainedAdbProtocol.VideoMedia m=new RetainedAdbProtocol.VideoMedia(Session,Attempt,id,delegate(byte[] b,RetainedAdbProtocol.VideoMedia sink,long c,Func<int> time){writes++;});m.Credit(1);bool failed=false;try{m.Emit(1,variant==0?0:1,1,"CONFIG",variant==1?(long?)1:null,variant==2?65537:1,0,variant==3?4097:100,200,new byte[]{1},1,MediaTime);}catch(IOException){failed=true;}Check(failed&&writes==0);passed++;}
            // Real VideoState fake-I/O path: CONFIG may advance without SESSION; historical counts include CONFIG.
            {VideoIo io=new VideoIo();io.mediaOverride=VideoJoin(EncodedPacket(0x40000000,0,new byte[]{7}),EncodedPacket(0x40000000,0,new byte[]{9}),EncodedPacket(0x20000000,1,new byte[]{8}));List<string> headers=new List<string>();RetainedAdbProtocol.VideoMedia m=new RetainedAdbProtocol.VideoMedia(Session,Attempt,id,delegate(byte[] b,RetainedAdbProtocol.VideoMedia sink,long c,Func<int> time){int n=(b[8]<<24)|(b[9]<<16)|(b[10]<<8)|b[11];headers.Add(Encoding.ASCII.GetString(b,16,n));Check(sink.Credit(c+1));sink.Written(c,true);});m.Credit(1);var v=new IsolatedAdbServer.RetainedProvider.VideoState(io,id,new string('0',64),1,4,VideoHash(io.artifact),DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+30000,m);m.BindStop(v.RequestStop);v.Start();var facts=v.AwaitStarted();Check((bool)facts["streamObserved"]&&Convert.ToInt64(facts["mediaPackets"])==3&&headers.Count==4&&headers[2].Contains("\"configId\":2")&&headers[3].Contains("\"configId\":2"));m.Cancel();v.Stop();Check(v.Clean);passed++;}
            foreach(bool malformedConfig in new[]{false,true}){VideoIo io=new VideoIo();io.mediaOverride=EncodedPacket(malformedConfig?0x40000000u:0x20000000u,1,new byte[]{8});RetainedAdbProtocol.VideoMedia m=new RetainedAdbProtocol.VideoMedia(Session,Attempt,id,delegate(byte[] b,RetainedAdbProtocol.VideoMedia sink,long c,Func<int> time){Check(sink.Credit(c+1));sink.Written(c,true);});m.Credit(1);var v=new IsolatedAdbServer.RetainedProvider.VideoState(io,id,new string('0',64),1,4,VideoHash(io.artifact),DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+30000,m);m.BindStop(v.RequestStop);v.Start();v.AwaitStarted();v.Stop();Check(v.Clean&&!(bool)v.Snapshot()["streamObserved"]);passed++;}
            // Actual Reader: successor credit arrives while the real output Flush is held.
            {MediaProvider p=new MediaProvider();Input input=new Input();Output output=new Output();RetainedAdbProtocol.RunResult result=null;object reader=MediaReader(input,output,p);Thread run=new Thread(delegate(){result=RunMediaReader(reader);});run.IsBackground=true;run.Start();input.Feed(Frame(1,"START"));Wait(delegate{return output.count==1&&input.waiting&&MediaIdle(reader);});output.FlushRelease.Reset();output.FlushEntered.Reset();input.Feed(MediaRequest(2,"VIDEO_START"));Check(p.VideoEntered.WaitOne(5000));input.Feed(MediaCredit(1));Check(output.FlushEntered.WaitOne(5000));input.Feed(MediaCredit(2));Wait(delegate{return input.waiting;});Check(p.emissions==0&&output.count==2);output.FlushRelease.Set();Wait(delegate{return output.count==3;});input.Feed(MediaCredit(3));Wait(delegate{return output.count>=4;});input.Feed(MediaCredit(4));Wait(delegate{return output.count==5&&input.waiting&&MediaIdle(reader);});input.Feed(MediaRequest(3,"VIDEO_STOP"));Wait(delegate{return output.count==6&&input.waiting&&MediaIdle(reader);});input.End();Check(run.Join(5000)&&result.Clean&&p.stopCalls==1);passed++;}
            // Reader owns cancellation before provider installation; late bind cannot launch or emit.
            {MediaProvider p=new MediaProvider();p.Install.Reset();Input input=new Input();Output output=new Output();RetainedAdbProtocol.RunResult result=null;object reader=MediaReader(input,output,p);Thread run=new Thread(delegate(){result=RunMediaReader(reader);});run.IsBackground=true;run.Start();input.Feed(Frame(1,"START"));Wait(delegate{return output.count==1&&input.waiting&&MediaIdle(reader);});input.Feed(MediaRequest(2,"VIDEO_START"));Check(p.VideoEntered.WaitOne(5000));input.Feed(MediaRequest(3,"VIDEO_STOP"));Wait(delegate{return input.waiting;});Check(p.stopCalls==0);p.Install.Set();Wait(delegate{return output.count==3&&input.waiting&&MediaIdle(reader);});Check(p.emissions==0&&p.stopped&&p.stopCalls==1);input.End();Check(run.Join(5000)&&result.Clean);passed++;}
            // Counter exhaustion is a refusal before another record, never wrap/reuse.
            {int writes=0;RetainedAdbProtocol.VideoMedia m=new RetainedAdbProtocol.VideoMedia(Session,Attempt,id,delegate(byte[] b,RetainedAdbProtocol.VideoMedia sink,long c,Func<int> time){writes++;});m.Credit(1);typeof(RetainedAdbProtocol.VideoMedia).GetField("next",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).SetValue(m,9007199254740991L);bool refused=false;try{m.Emit(1,0,0,"SESSION",null,0,0,100,200,new byte[0],0,MediaTime);}catch(IOException){refused=true;}Check(refused&&writes==0);passed++;}
            // A stopped partial packet cannot reuse or emit the remainder while its write is unsettled.
            {ManualResetEvent entered=new ManualResetEvent(false);int writes=0;RetainedAdbProtocol.VideoMedia m=new RetainedAdbProtocol.VideoMedia(Session,Attempt,id,delegate(byte[] b,RetainedAdbProtocol.VideoMedia sink,long c,Func<int> time){writes++;entered.Set();});m.Credit(1);bool cancelled=false;Thread t=new Thread(delegate(){try{m.Emit(1,1,1,"KEY",1,65536,0,100,200,new byte[32768],32768,MediaTime);}catch(IOException){cancelled=true;}});t.IsBackground=true;t.Start();Check(entered.WaitOne(5000));m.Cancel();Check(t.Join(5000)&&cancelled&&writes==1&&!m.Credit(2));m.Written(1,true);Check(m.Stopped);passed++;}
            // STOP effects bypass held media Flush; actual output remains retained and no third slot appears.
            {MediaProvider p=new MediaProvider();Input input=new Input();Output output=new Output();RetainedAdbProtocol.RunResult result=null;object reader=MediaReader(input,output,p);Thread run=new Thread(delegate(){result=RunMediaReader(reader);});run.IsBackground=true;run.Start();input.Feed(Frame(1,"START"));Wait(delegate{return output.count==1&&input.waiting&&MediaIdle(reader);});output.FlushRelease.Reset();output.FlushEntered.Reset();input.Feed(MediaRequest(2,"VIDEO_START"));Check(p.VideoEntered.WaitOne(5000));input.Feed(MediaCredit(1));Check(output.FlushEntered.WaitOne(5000));input.Feed(MediaCredit(2));input.Feed(MediaRequest(3,"VIDEO_STOP"));Wait(delegate{return p.stopCalls==1;});Check(p.stopped&&!run.Join(20)&&output.count==2);output.FlushRelease.Set();input.End();Check(run.Join(5000)&&result!=null&&!result.Clean&&p.retires==1);passed++;}
            return passed;
        }

    }
}
