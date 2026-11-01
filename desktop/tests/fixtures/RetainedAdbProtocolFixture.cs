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
            public IDictionary<string,object> Retire(object attempt){Check(Object.ReferenceEquals(token,attempt));Interlocked.Increment(ref retires);Retired.Set();if(releaseOnRetire)Release.Set();return Facts(null);}
            internal static IDictionary<string,object> Facts(string observation){return new Dictionary<string,object>{{"version",2},{"kind","INVOCATION"},{"dispatched",true},{"processRetired",true},{"exitCode",0},{"observation",observation}};}
        }
        static void Wait(Func<bool> predicate){for(int i=0;i<1000;i++){if(predicate())return;Thread.Sleep(5);}Check(false);}
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
            return passed;
        }
    }
}
