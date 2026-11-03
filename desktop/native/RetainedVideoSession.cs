// Owned headless video producer. Source only until the exact managed/native gate is reviewed.
// Compile with IsolatedAdbServer.cs, RetainedAdbSession.cs and RetainedAdbProtocol.cs.
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

namespace Fonesi.Development.Server
{
    public static partial class IsolatedAdbServer
    {
        public sealed partial class RetainedProvider
        {
            internal const string VideoProtocol = "AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1";
            internal const int VideoArtifactLimit = 8388608, VideoPacketLimit = 8388608;
            const long VideoSafe = 9007199254740991L;
            static bool VideoUuid(string s) { Guid id; return s != null && s.Length == 36 && Guid.TryParseExact(s,"D",out id) && id.ToString() == s; }
            static bool VideoHash(string s) { return s != null && Regex.IsMatch(s,"\\A[0-9a-f]{64}\\z"); }
            static string VNumber(long n) { return n.ToString(CultureInfo.InvariantCulture); }
            static string VString(string s) { if(s == null)return "null"; foreach(char c in s)if(c < 32 || c > 126 || c == '"' || c == '\\')throw new IOException("ADMISSION_REJECTED"); return "\""+s+"\""; }
            static string VideoPath(string id) { if(!VideoUuid(id))throw new IOException("ADMISSION_REJECTED");return "/data/local/tmp/fonesi-video-"+id; }
            internal static string VideoCreateCommand(string id) { return "umask 077 && mkdir "+VideoPath(id); }
            internal static string VideoCleanupCommand(string id) { string p=VideoPath(id); return "rm -f "+p+"/server.jar && rmdir "+p; }
            internal static string VideoLaunchCommand(string id,int scid,string nonce)
            {
                if(scid<0 || !VideoHash(nonce))throw new IOException("ADMISSION_REJECTED");
                return "CLASSPATH="+VideoPath(id)+"/server.jar exec app_process / com.genymobile.scrcpy.Server 5.0.1"+
                    " video=true audio=false control=false display_id=0 tunnel_forward=true cleanup=false power_on=false power_off_on_close=false"+
                    " show_touches=false stay_awake=false screen_off_timeout=-1 clipboard_autosync=false downsize_on_error=false"+
                    " send_device_meta=false send_dummy_byte=true send_stream_meta=true send_frame_meta=true video_codec=h264"+
                    " scid="+scid.ToString("x8",CultureInfo.InvariantCulture)+" auto_video_nonce="+nonce;
            }
            // Internal fixed-I/O seam for same-assembly fixtures. No production registration/injection API.
            internal interface IVideoChannel
            {
                int Read(byte[] bytes,int offset,int count,int timeout);
                void Write(byte[] bytes,int offset,int count,Func<int> remaining);
                void Close();
                bool Retired { get; }
            }
            internal interface IVideoIo
            {
                void Fence(bool cleanup);
                IVideoChannel Open(string service,bool cleanup,Func<int> remaining);
                Stream Artifact();
                void Intent();
                void Settlement(IDictionary<string,object> facts);
                void Cancel();
                void CloseAll();
                void Complete();
                bool Retired { get; }
            }
            internal sealed class VideoState
            {
                readonly object sync = new object();
                readonly IVideoIo io; readonly RetainedAdbProtocol.VideoMedia media; readonly string id,nonce,hash; readonly int scid,artifactBytes;
                readonly long deadline; readonly Stopwatch life=Stopwatch.StartNew(); readonly long admitted;
                long lastClock,revision,sessionPackets,mediaPackets,encodedBytes; long geometryId,configCounter,activeConfig,packetId,lastPts=-1,lastMedia=-1; int? width,height;
                string state="PREPARING",code="OK",directory="NONE",upload="NONE",launch="NONE",cleanup="NOT_REQUIRED";
                bool observed,stop,unknown,localRetired,bindReady,intentWritten,settlementWritten,workerDone,shellDone,shellExit;
                int shellExitCode; long stopAt=-1; Thread worker,shell; IVideoChannel video,shellChannel;
                readonly ManualResetEvent ready;
                IDictionary<string,object> cached,completion;Task cancellation;int cancelRequested;bool cleaned;
                internal VideoState(IVideoIo io,string id,string nonce,int scid,int bytes,string hash,long deadline) : this(io,id,nonce,scid,bytes,hash,deadline,null) {}
                internal VideoState(IVideoIo io,string id,string nonce,int scid,int bytes,string hash,long deadline,RetainedAdbProtocol.VideoMedia media)
                {
                    if(io==null||!VideoUuid(id)||!VideoHash(nonce)||!VideoHash(hash)||scid<0||bytes<1||bytes>VideoArtifactLimit)throw new IOException("ADMISSION_REJECTED");
                    this.io=io;this.media=media;this.id=id;this.nonce=nonce;this.scid=scid;artifactBytes=bytes;this.hash=hash;this.deadline=deadline;
                    admitted=UtcMilliseconds();lastClock=admitted;if(deadline>8640000000000000L||deadline<=admitted||deadline-admitted>30000)throw new IOException("DEADLINE_EXCEEDED");ready=new ManualResetEvent(false);cached=Capture();
                }
                void Changed() { if(revision>=VideoSafe){unknown=true;stop=true;state="UNCERTAIN";code="OUTCOME_UNKNOWN";throw new IOException("OUTCOME_UNKNOWN");}revision++;cached=Capture(); }
                int Remaining(bool cleanupWork)
                {
                    lock(sync){long now=UtcMilliseconds();if(now<lastClock)throw new IOException("DEADLINE_EXCEEDED");lastClock=now;
                        long remaining=cleanupWork?10000-(life.ElapsedMilliseconds-stopAt):Math.Min(deadline-now,deadline-admitted-life.ElapsedMilliseconds);
                        if(!cleanupWork&&(stop||Interlocked.CompareExchange(ref cancelRequested,0,0)!=0))throw new IOException("CLOSED");if(remaining<=0)throw new IOException("DEADLINE_EXCEEDED");return (int)Math.Min(1000,remaining);}
                }
                int StreamTime()
                { lock(sync){if(stop||Interlocked.CompareExchange(ref cancelRequested,0,0)!=0||media!=null&&media.Stopped)throw new IOException("CLOSED");
                    if(media==null)return observed?1000:Remaining(false);if(lastMedia<0)return Remaining(false);
                    long left=30000-(life.ElapsedMilliseconds-lastMedia);if(left<=0)throw new IOException("DEADLINE_EXCEEDED");return (int)Math.Min(1000,left);} }
                IDictionary<string,object> Capture()
                {return new ReadOnlyDictionary<string,object>(new Dictionary<string,object>{
                    {"sessionId",id},{"snapshotRevision",revision},{"state",state},{"code",code},{"streamObserved",observed},
                    {"sessionPackets",sessionPackets},{"mediaPackets",mediaPackets},{"encodedBytes",encodedBytes},
                    {"lastWidth",width},{"lastHeight",height},{"directory",directory},{"upload",upload},{"launch",launch},
                    {"localRetired",localRetired},{"cleanup",cleanup}});}
                static bool ThreadRetired(Thread t){return t==null||((t.ThreadState&System.Threading.ThreadState.Unstarted)==0&&t.Join(0));}
                bool CancelRetired(){Task task=Interlocked.CompareExchange(ref cancellation,null,null);if(task!=null&&task.IsFaulted){AggregateException observed=task.Exception;}return task!=null&&task.Status==TaskStatus.RanToCompletion;}
                internal IDictionary<string,object> Snapshot()
                {
                    // No external callback or blocking lock on STATUS. Final retirement is published only by
                    // an observer which has joined the actual producer; the producer never retires itself.
                    if(Monitor.TryEnter(sync,0))try{
                        if(completion!=null&&workerDone&&ThreadRetired(worker)&&CancelRetired()){
                            state=(string)completion["state"];code=(string)completion["code"];cleanup=(string)completion["cleanup"];localRetired=(bool)completion["localRetired"];completion=null;Changed();
                        }
                    }finally{Monitor.Exit(sync);}
                    return Interlocked.CompareExchange(ref cached,null,null);
                }
                internal bool Clean {get{Snapshot();if(!Monitor.TryEnter(sync,0))return false;try{return workerDone&&ThreadRetired(worker)&&CancelRetired()&&localRetired&&!unknown&&(!intentWritten||settlementWritten)&&(directory=="NONE"||cleanup=="CLEANED")&&(launch=="NONE"||launch=="EXITED");}finally{Monitor.Exit(sync);}}}
                internal bool Done {get{if(!Monitor.TryEnter(sync,0))return false;try{return workerDone&&ThreadRetired(worker)&&CancelRetired();}finally{Monitor.Exit(sync);}}}
                internal bool StopExpired {get{long at=Interlocked.Read(ref stopAt);return at>=0&&life.ElapsedMilliseconds-at>=10000;}}
                internal void Start()
                {lock(sync){if(worker!=null)throw new IOException("BUSY");worker=new Thread(SafeRun);worker.IsBackground=true;worker.Start();}}
                internal IDictionary<string,object> AwaitStarted()
                {while(!ready.WaitOne(10)){try{Remaining(false);}catch{RequestStop();break;}}return Snapshot();}
                void StartCancellation()
                {
                    if(Interlocked.CompareExchange(ref cancellation,null,null)!=null)return;
                    Task cancel=new Task(delegate(){io.Cancel();});if(Interlocked.CompareExchange(ref cancellation,cancel,null)==null)cancel.Start();
                }
                internal bool TryRequestStop(Stopwatch budget,int milliseconds)
                {
                    Interlocked.Exchange(ref cancelRequested,1);Interlocked.CompareExchange(ref stopAt,life.ElapsedMilliseconds,-1);
                    int remaining=Math.Max(0,milliseconds-(int)Math.Min(Int32.MaxValue,budget.ElapsedMilliseconds));
                    if(!Monitor.TryEnter(sync,remaining)){StartCancellation();return false;}
                    try{if(!stop){stop=true;if(state!="UNCERTAIN"&&state!="CLOSED")state="STOPPING";Changed();}ready.Set();}
                    finally{Monitor.Exit(sync);}
                    // Successful preemption is already visible before cancellation invokes I/O callbacks.
                    // Failed lock admission still starts retained cancellation but cannot return a clean receipt.
                    StartCancellation();return true;
                }
                internal void RequestStop(){TryRequestStop(Stopwatch.StartNew(),0);}
                internal IDictionary<string,object> Stop(){return Stop(Stopwatch.StartNew());}
                internal IDictionary<string,object> Stop(Stopwatch budget)
                {if(!TryRequestStop(budget,10000))throw new IOException("UNRETIRED");while(!Done&&!StopExpired&&budget.ElapsedMilliseconds<10000)Thread.Sleep(5);return Snapshot();}
                void Fail(string failure,bool uncertain)
                {lock(sync){unknown|=uncertain;code=unknown?"OUTCOME_UNKNOWN":failure;state=unknown?"UNCERTAIN":"FAILED";Changed();ready.Set();}}
                static bool Timeout(Exception e) {SocketException s=e as SocketException;return s!=null&&(s.SocketErrorCode==SocketError.TimedOut||s.SocketErrorCode==SocketError.WouldBlock);}
                static void Exact(IVideoChannel c,byte[] bytes,int offset,int count,Func<int> timeout)
                {int end=offset+count;while(offset<end){int n;try{n=c.Read(bytes,offset,end-offset,timeout());}catch(Exception e){if(Timeout(e))continue;throw;}if(n<=0||n>end-offset)throw new IOException("PROTOCOL_FAILED");offset+=n;}}
                static uint Little(byte[] b,int o) {return (uint)b[o]|((uint)b[o+1]<<8)|((uint)b[o+2]<<16)|((uint)b[o+3]<<24);}
                static uint Big(byte[] b,int o) {return ((uint)b[o]<<24)|((uint)b[o+1]<<16)|((uint)b[o+2]<<8)|b[o+3];}
                static byte[] SyncHeader(string id,uint size) {byte[] b=new byte[8];Encoding.ASCII.GetBytes(id,0,4,b,0);b[4]=(byte)size;b[5]=(byte)(size>>8);b[6]=(byte)(size>>16);b[7]=(byte)(size>>24);return b;}
                void Send(IVideoChannel c,string kind,byte[] payload,bool cleanupWork)
                {byte[] h=SyncHeader(kind,(uint)payload.Length);c.Write(h,0,h.Length,delegate(){return Remaining(cleanupWork);});if(payload.Length>0)c.Write(payload,0,payload.Length,delegate(){return Remaining(cleanupWork);});}
                int ShellDrain(IVideoChannel c,bool foreground,bool cleanupWork)
                {
                    byte[] header=new byte[5],scratch=new byte[16384];int total=0,markerAt=0;bool lineOther=false;bool exit=false;int result=-1;byte[] marker=Encoding.ASCII.GetBytes("AUTOVID1_READY");
                    Func<int> time=delegate(){if(!foreground)return Remaining(cleanupWork);lock(sync){if(stop)return Remaining(true);return media==null?(observed?1000:Remaining(false)):StreamTime();}};
                    for(;;){
                        Exact(c,header,0,5,time);uint size=Little(header,1);int kind=header[0];
                        if(kind==3){if(size!=1||exit)throw new IOException("PROTOCOL_FAILED");Exact(c,scratch,0,1,time);result=scratch[0];exit=true;break;}
                        if((kind!=1&&kind!=2)||size>65536-total)throw new IOException("REMOTE_FAILED");
                        total+=(int)size;while(size>0){int n=(int)Math.Min((uint)scratch.Length,size);Exact(c,scratch,0,n,time);
                            if(foreground&&kind==1)for(int j=0;j<n;j++){byte ch=scratch[j];if(ch==10){if(!lineOther&&markerAt==marker.Length)lock(sync){if(bindReady)throw new IOException("PROTOCOL_FAILED");bindReady=true;}markerAt=0;lineOther=false;}else if(!lineOther){if(markerAt<marker.Length&&ch==marker[markerAt])markerAt++;else lineOther=true;}}
                            size-=(uint)n;}
                    }
                    for(;;){int n;try{n=c.Read(scratch,0,1,time());}catch(Exception e){if(Timeout(e))continue;throw;}if(n!=0)throw new IOException("PROTOCOL_FAILED");break;}
                    return result;
                }
                void RetireChannel(IVideoChannel c,bool cleanupWork)
                {c.Close();while(!c.Retired){Remaining(cleanupWork);Thread.Sleep(1);}Remaining(cleanupWork);}
                int FixedShell(string command,bool cleanupWork)
                {io.Fence(cleanupWork);IVideoChannel c=io.Open("shell,v2,raw:"+command,cleanupWork,delegate(){return Remaining(cleanupWork);});try{return ShellDrain(c,false,cleanupWork);}finally{RetireChannel(c,cleanupWork);}}
                void Upload()
                {
                    io.Fence(false);IVideoChannel c=io.Open("sync:",false,delegate(){return Remaining(false);});byte[] scratch=new byte[65536];
                    try{lock(sync){upload="PARTIAL";Changed();}Send(c,"SEND",Encoding.ASCII.GetBytes(VideoPath(id)+"/server.jar,33152"),false);
                        using(Stream file=io.Artifact())using(SHA256 digest=SHA256.Create()){
                            int left=artifactBytes;while(left>0){io.Fence(false);int n=file.Read(scratch,0,Math.Min(left,scratch.Length));if(n<=0)throw new IOException("ADMISSION_REJECTED");digest.TransformBlock(scratch,0,n,scratch,0);byte[] h=SyncHeader("DATA",(uint)n);c.Write(h,0,8,delegate(){return Remaining(false);});c.Write(scratch,0,n,delegate(){return Remaining(false);});left-=n;}
                            if(file.ReadByte()!=-1)throw new IOException("ADMISSION_REJECTED");digest.TransformFinalBlock(new byte[0],0,0);if(Hex(digest.Hash)!=hash)throw new IOException("ADMISSION_REJECTED");
                        }
                        byte[] done=SyncHeader("DONE",0);c.Write(done,0,8,delegate(){return Remaining(false);});byte[] response=new byte[8];Exact(c,response,0,8,delegate(){return Remaining(false);});if(Encoding.ASCII.GetString(response,0,4)!="OKAY"||Little(response,4)!=0)throw new IOException("DEPLOYMENT_FAILED");Send(c,"QUIT",new byte[0],false);
                    }finally{RetireChannel(c,false);}
                    io.Fence(false);c=io.Open("sync:",false,delegate(){return Remaining(false);});
                    try{Send(c,"RECV",Encoding.ASCII.GetBytes(VideoPath(id)+"/server.jar"),false);int total=0;using(SHA256 digest=SHA256.Create()){
                        for(;;){byte[] h=new byte[8];Exact(c,h,0,8,delegate(){return Remaining(false);});string kind=Encoding.ASCII.GetString(h,0,4);uint n=Little(h,4);if(kind=="DONE"){if(n!=0||total!=artifactBytes)throw new IOException("DEPLOYMENT_FAILED");break;}
                            if(kind!="DATA"||n==0||n>65536||n>artifactBytes-total)throw new IOException("DEPLOYMENT_FAILED");Exact(c,scratch,0,(int)n,delegate(){return Remaining(false);});digest.TransformBlock(scratch,0,(int)n,scratch,0);total+=(int)n;}
                        digest.TransformFinalBlock(new byte[0],0,0);if(Hex(digest.Hash)!=hash)throw new IOException("DEPLOYMENT_FAILED");}
                        Send(c,"QUIT",new byte[0],false);lock(sync){upload="VERIFIED";Changed();}
                    }finally{RetireChannel(c,false);}
                }
                internal static string Hex(byte[] value){StringBuilder b=new StringBuilder(value.Length*2);foreach(byte x in value)b.Append(x.ToString("x2",CultureInfo.InvariantCulture));return b.ToString();}
                void DrainVideo()
                {
                    byte[] preamble=new byte[41];Exact(video,preamble,0,41,StreamTime);
                    if(preamble[0]!=0||Encoding.ASCII.GetString(preamble,1,8)!="AUTOVID1")throw new IOException("PROTOCOL_FAILED");
                    for(int n=0;n<32;n++)if(preamble[n+9]!=Byte.Parse(nonce.Substring(n*2,2),NumberStyles.HexNumber,CultureInfo.InvariantCulture))throw new IOException("PROTOCOL_FAILED");
                    byte[] codec=new byte[4];Exact(video,codec,0,4,StreamTime);if(Big(codec,0)!=0x68323634)throw new IOException("PROTOCOL_FAILED");
                    byte[] h=new byte[12],scratch=new byte[media==null?65536:32768];
                    for(;;){Exact(video,h,0,12,StreamTime);uint high=Big(h,0),lo=Big(h,4),size=Big(h,8);
                        if((high&0x80000000)!=0){if(high!=0x80000000||lo==0||lo>16384||size==0||size>16384)throw new IOException("PROTOCOL_FAILED");
                            if(media!=null&&(lo>4096||size>4096||(long)lo*size>8388608))throw new IOException("PROTOCOL_FAILED");
                            lock(sync){if(sessionPackets>=VideoSafe||geometryId>=VideoSafe)throw new IOException("PROTOCOL_FAILED");sessionPackets++;width=(int)lo;height=(int)size;if(media!=null){geometryId++;activeConfig=0;lastPts=-1;}Changed();}
                            if(media!=null)media.Emit(geometryId,0,0,"SESSION",null,0,0,(int)lo,(int)size,scratch,0,StreamTime);continue;}
                        if(size==0||size>VideoPacketLimit)throw new IOException("PROTOCOL_FAILED");
                        lock(sync){if(!width.HasValue)throw new IOException("PROTOCOL_FAILED");}
                        bool config=(high&0x40000000)!=0;long? pts=null;string kind=null;
                        if(media!=null){
                            if(packetId>=VideoSafe)throw new IOException("PROTOCOL_FAILED");packetId++;
                            if(config){if(high!=0x40000000||lo!=0||size>65536||configCounter>=VideoSafe)throw new IOException("PROTOCOL_FAILED");activeConfig=++configCounter;lastPts=-1;kind="CONFIG";}
                            else{if(activeConfig==0)throw new IOException("PROTOCOL_FAILED");long stamp=((long)(high&0x1fffffff)<<32)|lo;if(stamp>VideoSafe||stamp<=lastPts)throw new IOException("PROTOCOL_FAILED");pts=stamp;lastPts=stamp;kind=(high&0x20000000)!=0?"KEY":"DELTA";}
                        }
                        uint left=size;int offset=0;while(left>0){int n=(int)Math.Min((uint)scratch.Length,left);Exact(video,scratch,0,n,StreamTime);
                            if(media!=null)media.Emit(geometryId,activeConfig,packetId,kind,pts,(int)size,offset,width.Value,height.Value,scratch,n,StreamTime);
                            left-=(uint)n;offset+=n;}
                        lock(sync){if(mediaPackets>=VideoSafe||encodedBytes>VideoSafe-size)throw new IOException("PROTOCOL_FAILED");mediaPackets++;encodedBytes+=size;observed=true;if(media!=null&&!config)lastMedia=life.ElapsedMilliseconds;if(!stop){state="RECEIVING";code="OK";}Changed();if(media==null||!config)ready.Set();}
                    }
                }
                void SafeRun()
                {
                    try{Run();}catch{
                        try{io.Cancel();io.CloseAll();}catch{}
                        lock(sync){unknown=true;localRetired=false;state="UNCERTAIN";code="OUTCOME_UNKNOWN";if(revision<VideoSafe)revision++;cached=Capture();workerDone=true;ready.Set();}
                    }
                }
                void Run()
                {
                    try{
                        Remaining(false);io.Fence(false);io.Intent();lock(sync){intentWritten=true;}Remaining(false);io.Fence(false);lock(sync){directory="UNKNOWN";cleanup="PENDING";Changed();}
                        int created=FixedShell(VideoCreateCommand(id),false);if(created!=0){lock(sync){directory="NONE";cleanup="NOT_REQUIRED";Changed();}throw new IOException("DEPLOYMENT_FAILED");}
                        lock(sync){directory="CREATED";Changed();}Upload();io.Fence(false);Remaining(false);
                        lock(sync){state="STARTING";launch="UNKNOWN";Changed();}
                        shellChannel=io.Open("shell,v2,raw:"+VideoLaunchCommand(id,scid,nonce),false,delegate(){return Remaining(false);});
                        lock(sync){launch="STARTED";Changed();shell=new Thread(delegate(){try{int exit=ShellDrain(shellChannel,true,false);lock(sync){shellExit=true;shellExitCode=exit;launch="EXITED";Changed();}}catch{lock(sync){unknown=true;launch="UNKNOWN";Changed();}}finally{shellChannel.Close();lock(sync){shellDone=true;}RequestStop();}});shell.IsBackground=true;shell.Start();}
                        while(true){lock(sync){if(bindReady)break;if(shellDone)throw new IOException("REMOTE_FAILED");}Remaining(false);Thread.Sleep(5);}
                        io.Fence(false);video=io.Open("localabstract:scrcpy_"+scid.ToString("x8",CultureInfo.InvariantCulture),false,delegate(){return Remaining(false);});DrainVideo();
                    }catch(Exception e){bool stopping;lock(sync){stopping=stop;}string failure=e is IOException&&Array.IndexOf(new string[]{"CLOSED","DEADLINE_EXCEEDED","ADMISSION_REJECTED","STALE_TARGET","DEPLOYMENT_FAILED","PROTOCOL_FAILED","REMOTE_FAILED"},e.Message)>=0?e.Message:"REMOTE_FAILED";
                        // A deliberate video close is not unknown remote retirement; await the foreground receipt below.
                        if(!stopping){bool uncertain;lock(sync){uncertain=directory=="UNKNOWN"||launch=="UNKNOWN";}Fail(failure,uncertain);}
                    }
                    finally{
                        RequestStop();if(video!=null)video.Close();
                        while(shell!=null&&!ThreadRetired(shell)){lock(sync){if(life.ElapsedMilliseconds-stopAt>=10000)break;}Thread.Sleep(5);}
                        if(shell!=null&&!ThreadRetired(shell)){if(shellChannel!=null)shellChannel.Close();lock(sync){unknown=true;launch="UNKNOWN";}}
                        // Every actual I/O close/connect obligation is retained; cleanup never races an unretired upload.
                        io.CloseAll();while(!io.Retired||!CancelRetired()){lock(sync){if(life.ElapsedMilliseconds-stopAt>=10000)break;}Thread.Sleep(5);}
                        bool mayClean;lock(sync){mayClean=directory=="CREATED"&&(launch=="NONE"||launch=="EXITED")&&ThreadRetired(shell)&&io.Retired&&CancelRetired();}
                        if(mayClean){try{if(FixedShell(VideoCleanupCommand(id),true)!=0)throw new IOException("DEPLOYMENT_FAILED");io.CloseAll();while(!io.Retired||!CancelRetired()){Remaining(true);Thread.Sleep(1);}lock(sync){cleaned=true;}}catch{lock(sync){cleanup="UNKNOWN";unknown=true;}}}
                        IDictionary<string,object> proof;
                        lock(sync){if(!observed&&launch=="EXITED"&&code=="OK")code="REMOTE_FAILED";if(shellExit&&shellExitCode!=0&&code=="OK")code="REMOTE_FAILED";
                            bool ioRetired=io.Retired&&ThreadRetired(shell)&&CancelRetired();if(!ioRetired||directory=="UNKNOWN"||launch=="UNKNOWN"||(directory=="CREATED"&&!cleaned))unknown=true;
                            string finalState=unknown?"UNCERTAIN":code=="OK"||code=="CLOSED"?"CLOSED":"FAILED";
                            string finalCode=unknown?"OUTCOME_UNKNOWN":code=="OK"||code=="CLOSED"?"CLOSED":code;
                            Dictionary<string,object> candidate=new Dictionary<string,object>(Capture());candidate["state"]=finalState;candidate["code"]=finalCode;candidate["localRetired"]=ioRetired;candidate["cleanup"]=cleaned?"CLEANED":cleanup;
                            proof=new ReadOnlyDictionary<string,object>(candidate);state=unknown?"UNCERTAIN":"STOPPING";code=finalCode;localRetired=false;Changed();}
                        // Journal proof partition: fixed native I/O/foreground exit/cleanup facts only.
                        // Trusted root cleanup ALSO requires helper process/output/producer retirement; this
                        // write does not assert that its own publishing worker has already returned.
                        if(intentWritten){try{io.Settlement(proof);lock(sync){settlementWritten=true;}}catch{lock(sync){unknown=true;state="UNCERTAIN";code="OUTCOME_UNKNOWN";Changed();}}}
                        try{io.Complete();}catch{lock(sync){unknown=true;state="UNCERTAIN";code="OUTCOME_UNKNOWN";Changed();}}
                        lock(sync){if(unknown){Dictionary<string,object> failed=new Dictionary<string,object>(proof);failed["state"]="UNCERTAIN";failed["code"]="OUTCOME_UNKNOWN";failed["localRetired"]=false;if((string)failed["cleanup"]=="CLEANED")failed["cleanup"]="UNKNOWN";completion=new ReadOnlyDictionary<string,object>(failed);}else completion=proof;}
                        lock(sync){workerDone=true;ready.Set();}
                    }
                }
            }
            sealed class VideoAdmission
            {
                internal readonly string launchId,storeId,sessionId,path,hash,manifest;
                internal readonly long installationRevision; internal readonly int bytes;
                internal readonly FileStream guard; internal readonly FILE_INFO identity;
                internal VideoAdmission(string launchId,string storeId,string sessionId,string path,int bytes,string hash,string manifest,long installationRevision)
                {
                    this.launchId=launchId;this.storeId=storeId;this.sessionId=sessionId;this.path=path;this.bytes=bytes;this.hash=hash;this.manifest=manifest;this.installationRevision=installationRevision;
                    guard=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read);
                    try{FILE_INFO f;if(!GetFileInformationByHandle(guard.SafeFileHandle,out f)||(f.Attributes&0x400)!=0||f.Links!=1||guard.Length!=bytes)throw new IOException("ADMISSION_REJECTED");identity=f;
                        using(SHA256 digest=SHA256.Create()){if(VideoState.Hex(digest.ComputeHash(guard))!=hash)throw new IOException("ADMISSION_REJECTED");}guard.Position=0;
                    }catch{guard.Dispose();throw;}
                }
                internal Stream Open()
                {FILE_INFO now;if(guard.SafeFileHandle.IsClosed||!GetFileInformationByHandle(guard.SafeFileHandle,out now)||now.Volume!=identity.Volume||now.IndexHigh!=identity.IndexHigh||now.IndexLow!=identity.IndexLow||now.Links!=1||guard.Length!=bytes)throw new IOException("ADMISSION_REJECTED");
                    FileStream file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read);try{FILE_INFO next;if(!GetFileInformationByHandle(file.SafeFileHandle,out next)||next.Volume!=identity.Volume||next.IndexHigh!=identity.IndexHigh||next.IndexLow!=identity.IndexLow||file.Length!=bytes)throw new IOException("ADMISSION_REJECTED");return file;}catch{file.Dispose();throw;}}
            }
            VideoAdmission videoAdmission;
            // Bootstrap-only, immutable before the first Reserve. No late artifact registration or alternate path.
            public void ConfigureVideo(string launchId,string storeId,string hostSessionId,string artifactId,string artifactPath,int bytes,string sha256,string protocolId,string pairManifestSha256,long installationRevision)
            {
                lock(gate){if(current!=null||generation!=0||videoAdmission!=null||!VideoUuid(launchId)||!VideoUuid(storeId)||!VideoUuid(hostSessionId)||artifactId!=sha256||!VideoHash(sha256)||!VideoHash(pairManifestSha256)||protocolId!=VideoProtocol||installationRevision<1||installationRevision>VideoSafe||bytes<1||bytes>VideoArtifactLimit||artifactPath==null||!Path.IsPathRooted(artifactPath)||Path.GetFullPath(artifactPath)!=artifactPath||Path.GetFileName(artifactPath)!="server.jar"||Path.GetFileName(Path.GetDirectoryName(artifactPath))!="video")throw new IOException("ADMISSION_REJECTED");
                    Admission();PlainDirectory(Path.GetDirectoryName(artifactPath));videoAdmission=new VideoAdmission(launchId,storeId,hostSessionId,artifactPath,bytes,sha256,pairManifestSha256,installationRevision);}
            }
            internal static void VideoWriteAll(IDiscoveryChannel channel,byte[] bytes,int offset,int count,Func<int> remaining)
            {int end=offset+count;while(offset<end){int n=channel.Send(bytes,offset,end-offset,remaining());remaining();if(n<=0||n>end-offset)throw new IOException("PROTOCOL_FAILED");offset+=n;}}
            internal static void WaitVideoConnect(Task pending,Func<int> remaining)
            {remaining();while(!pending.IsCompleted)pending.Wait(Math.Min(10,remaining()));pending.GetAwaiter().GetResult();remaining();}
            sealed class NativeVideoChannel : IVideoChannel
            {
                internal bool foreground,cleanup; internal Socket socket;
                Task connect,close;volatile bool registering=true;int closeRequested;
                internal void Connect(int port,Func<int> remaining)
                {
                    try{remaining();if(Interlocked.CompareExchange(ref closeRequested,0,0)!=0)throw new IOException("CLOSED");
                        // Channel registration precedes even socket allocation; no native allocation occurs under the inventory lock.
                        socket=new Socket(AddressFamily.InterNetwork,SocketType.Stream,ProtocolType.Tcp);
                        if(Interlocked.CompareExchange(ref closeRequested,0,0)!=0)throw new IOException("CLOSED");
                        Task pending=Task.Factory.FromAsync(socket.BeginConnect,socket.EndConnect,IPAddress.Loopback,port,null);Interlocked.Exchange(ref connect,pending);
                        WaitVideoConnect(pending,remaining);
                    }finally{registering=false;}
                }
                public int Read(byte[] b,int o,int n,int timeout){socket.ReceiveTimeout=timeout;return socket.Receive(b,o,n,SocketFlags.None);}
                public void Write(byte[] b,int o,int n,Func<int> remaining){VideoWriteAll(new SocketDiscoveryChannel(socket),b,o,n,remaining);}
                public void Close(){Interlocked.Exchange(ref closeRequested,1);if(Interlocked.CompareExchange(ref close,null,null)!=null)return;Task pending=new Task(delegate(){while(registering&&Interlocked.CompareExchange(ref socket,null,null)==null)Thread.Sleep(1);Socket owned=Interlocked.CompareExchange(ref socket,null,null);if(owned!=null)owned.Dispose();while(registering)Thread.Sleep(1);});if(Interlocked.CompareExchange(ref close,pending,null)==null)pending.Start();}
                public bool Retired {get{Task c=Interlocked.CompareExchange(ref connect,null,null),d=Interlocked.CompareExchange(ref close,null,null);if(c!=null&&c.IsFaulted){AggregateException observed=c.Exception;}if(d!=null&&d.IsFaulted){AggregateException observed=d.Exception;}return !registering&&(c==null||c.IsCompleted)&&d!=null&&d.Status==TaskStatus.RanToCompletion;}}
            }
            sealed class NativeVideoIo : IVideoIo
            {
                readonly RetainedProvider provider;readonly State attempt;readonly VideoAdmission artifact;
                readonly string attemptId,videoId,transportId,nonce;readonly int scid;readonly long epoch,admitted,deadline;
                readonly List<NativeVideoChannel> channels=new List<NativeVideoChannel>(); readonly object sync=new object();volatile bool cancelled;
                SafeFileHandle rootGuard;FILE_INFO rootIdentity;
                internal NativeVideoIo(RetainedProvider provider,State attempt,VideoAdmission artifact,string attemptId,string videoId,string transportId,long hostEpoch,int scid,string nonce,long deadline)
                {
                    this.provider=provider;this.attempt=attempt;this.artifact=artifact;this.attemptId=attemptId;this.videoId=videoId;this.transportId=transportId;epoch=hostEpoch;this.scid=scid;this.nonce=nonce;this.deadline=deadline;admitted=UtcMilliseconds();
                }
                public void Fence(bool cleanup)
                {
                    if(cancelled&&!cleanup)throw new IOException("CLOSED");provider.Admission();provider.SameProfile(attempt);
                    // Lazy native root acquisition runs only inside the already registered VideoState worker.
                    if(rootGuard==null){SECURITY_ATTRIBUTES security=new SECURITY_ATTRIBUTES();security.nLength=System.Runtime.InteropServices.Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));IntPtr raw=CreateFile(provider.root,0x80,3,ref security,3,0x02000000,IntPtr.Zero);Require(raw!=InvalidHandle);rootGuard=new SafeFileHandle(raw,true);if(!GetFileInformationByHandle(rootGuard,out rootIdentity)||(rootIdentity.Attributes&0x400)!=0)throw new IOException("ADMISSION_REJECTED");}
                    FILE_INFO now;if(rootGuard.IsClosed||!GetFileInformationByHandle(rootGuard,out now)||now.Volume!=rootIdentity.Volume||now.IndexHigh!=rootIdentity.IndexHigh||now.IndexLow!=rootIdentity.IndexLow)throw new IOException("ADMISSION_REJECTED");
                    lock(provider.gate){if(!provider.Exact(attempt)||attempt.terminal||(!cleanup&&attempt.stopping)||!provider.Live(attempt)||ProfileWitness(attempt.android,provider.owner,true)!=attempt.profileWitness)throw new IOException("STALE_TARGET");}
                }
                static void SmartService(NativeVideoChannel channel,string service,Func<int> remaining)
                {
                    byte[] bytes=Encoding.ASCII.GetBytes(service.Length.ToString("x4",CultureInfo.InvariantCulture)+service);channel.Write(bytes,0,bytes.Length,remaining);byte[] ack=new byte[4];int at=0;
                    while(at<4){int n=channel.Read(ack,at,4-at,remaining());remaining();if(n<=0||n>4-at)throw new IOException("PROTOCOL_FAILED");at+=n;}
                    if(ack[0]!=79||ack[1]!=75||ack[2]!=65||ack[3]!=89)throw new IOException("REMOTE_FAILED");
                }
                public IVideoChannel Open(string service,bool cleanup,Func<int> remaining)
                {
                    remaining();Fence(cleanup);remaining();NativeVideoChannel c;
                    if(!Monitor.TryEnter(sync,remaining()))throw new IOException("DEADLINE_EXCEEDED");try{if(channels.Count>=8||cancelled&&!cleanup)throw new IOException("ADMISSION_REJECTED");c=new NativeVideoChannel();c.foreground=service.StartsWith("shell,v2,raw:CLASSPATH=",StringComparison.Ordinal);c.cleanup=cleanup;channels.Add(c);}finally{Monitor.Exit(sync);}
                    try{c.Connect(attempt.port,remaining);Fence(cleanup);remaining();SmartService(c,"host:transport-id:"+transportId,remaining);Fence(cleanup);remaining();
                        if(cancelled&&!cleanup)throw new IOException("CLOSED");SmartService(c,service,remaining);return c;
                    }catch{c.Close();throw;}
                }
                public Stream Artifact(){Fence(false);return artifact.Open();}
                string Common()
                {return "{\"version\":1,\"launchId\":"+VString(artifact.launchId)+",\"storeId\":"+VString(artifact.storeId)+",\"ownerToken\":"+VString(provider.owner)+",\"hostSessionId\":"+VString(artifact.sessionId)+",\"attemptId\":"+VString(attemptId)+",\"videoId\":"+VString(videoId)+",\"transportId\":"+VString(transportId)+",\"hostEpoch\":"+VNumber(epoch)+",\"installationRevision\":"+VNumber(artifact.installationRevision)+",\"artifactSha256\":"+VString(artifact.hash)+",\"protocolId\":"+VString(VideoProtocol);}
                void Write(string name,string json)
                {ExactOwner(provider.root,provider.owner);byte[] bytes=Encoding.UTF8.GetBytes(json);if(bytes.Length>8192)throw new IOException("ADMISSION_REJECTED");
                    using(FileStream file=new FileStream(Path.Combine(provider.root,name),FileMode.CreateNew,FileAccess.Write,FileShare.None)){file.Write(bytes,0,bytes.Length);file.Flush(true);}ExactOwner(provider.root,provider.owner);}
                public void Intent()
                {Fence(false);string nonceHash;using(SHA256 d=SHA256.Create())nonceHash=VideoState.Hex(d.ComputeHash(Encoding.ASCII.GetBytes(nonce)));
                    Write("video-intent.json",Common()+",\"remoteDirectory\":"+VString(VideoPath(videoId))+",\"scid\":"+VNumber(scid)+",\"nonceSha256\":"+VString(nonceHash)+",\"admittedUtc\":"+VNumber(admitted)+",\"deadlineUtc\":"+VNumber(deadline)+"}");}
                public void Settlement(IDictionary<string,object> f)
                {Write("video-settlement.json",Common()+",\"directory\":"+VString((string)f["directory"])+",\"upload\":"+VString((string)f["upload"])+",\"launch\":"+VString((string)f["launch"])+",\"localRetired\":"+((bool)f["localRetired"]?"true":"false")+",\"cleanup\":"+VString((string)f["cleanup"])+",\"streamObserved\":"+((bool)f["streamObserved"]?"true":"false")+",\"code\":"+VString((string)f["code"])+"}");}
                public void Cancel(){cancelled=true;NativeVideoChannel[] copy;lock(sync){copy=channels.ToArray();}foreach(NativeVideoChannel c in copy)if(!c.foreground&&!c.cleanup)c.Close();}
                public void Complete(){if(rootGuard!=null)rootGuard.Dispose();}
                public void CloseAll(){NativeVideoChannel[] copy;lock(sync){copy=channels.ToArray();}foreach(NativeVideoChannel c in copy)c.Close();}
                public bool Retired {get{if(!Monitor.TryEnter(sync,0))return false;try{foreach(NativeVideoChannel c in channels)if(!c.Retired)return false;return true;}finally{Monitor.Exit(sync);}}}
            }
            // Fresh v7 owners replace only the exact terminal native record. Legacy start remains single-use.
            public object VideoOwner(Attempt attempt)
            { if(!Monitor.TryEnter(gate,0))throw new IOException("BUSY");try{State a=attempt==null?null:attempt.state as State;if(!Exact(a))throw new IOException("ADMISSION_REJECTED");return a.video;}finally{Monitor.Exit(gate);} }
            public bool VideoOwnerClean(Attempt attempt,object expectedOwner)
            { if(!Monitor.TryEnter(gate,0))return false;try{State a=attempt==null?null:attempt.state as State;if(!Exact(a)||a.stopping||!Object.ReferenceEquals(a.video,expectedOwner))return false;return a.video==null||a.video.Clean;}finally{Monitor.Exit(gate);} }
            public object VideoReserveFresh(Attempt attempt,object expectedOwner,string attemptId,string videoId,string transportId,long hostEpoch,long deadlineUtc,string artifactId,int scid,string nonceHex,RetainedAdbProtocol.VideoMedia media)
            {
                State a=attempt==null?null:attempt.state as State;
                if(!VideoUuid(attemptId)||!VideoUuid(videoId)||!MetadataTransport(transportId)||hostEpoch<1||hostEpoch>VideoSafe||!VideoHash(nonceHex)||scid<0||media==null)throw new IOException("ADMISSION_REJECTED");
                if(!Enter(a,"FOREGROUND",false))return null;
                try{lock(gate){if(videoAdmission==null||videoAdmission.hash!=artifactId||a.stopping||!Object.ReferenceEquals(a.video,expectedOwner)||a.video!=null&&!a.video.Clean||!media.Matches(videoAdmission.sessionId,attemptId,videoId))return null;
                    NativeVideoIo io=new NativeVideoIo(this,a,videoAdmission,attemptId,videoId,transportId,hostEpoch,scid,nonceHex,deadlineUtc);
                    VideoState v=new VideoState(io,videoId,nonceHex,scid,videoAdmission.bytes,videoAdmission.hash,deadlineUtc,media);
                    a.video=v;a.videoId=videoId;media.BindStop(v.RequestStop);return v;
                }}finally{Leave(a);}
            }
            public IDictionary<string,object> VideoStartReserved(Attempt attempt,object owner)
            {
                State a=attempt==null?null:attempt.state as State;VideoState v=owner as VideoState;
                if(v==null||a==null)throw new IOException("ADMISSION_REJECTED");
                // A registered candidate must still run its cancellation/settlement path when
                // parent retirement races the reserve/start boundary. Never abandon an unstarted owner.
                lock(gate){if(!Object.ReferenceEquals(a.video,v))throw new IOException("ADMISSION_REJECTED");if(!Exact(a)||a.stopping)v.RequestStop();v.Start();}
                return v.AwaitStarted();
            }
            public IDictionary<string,object> VideoStart(Attempt attempt,string attemptId,string videoId,string transportId,long hostEpoch,long deadlineUtc,string artifactId,int scid,string nonceHex)
            {return VideoStartCore(attempt,attemptId,videoId,transportId,hostEpoch,deadlineUtc,artifactId,scid,nonceHex,null);}
            public IDictionary<string,object> VideoStartMedia(Attempt attempt,string attemptId,string videoId,string transportId,long hostEpoch,long deadlineUtc,string artifactId,int scid,string nonceHex,RetainedAdbProtocol.VideoMedia media)
            {if(media==null)throw new IOException("ADMISSION_REJECTED");return VideoStartCore(attempt,attemptId,videoId,transportId,hostEpoch,deadlineUtc,artifactId,scid,nonceHex,media);}
            IDictionary<string,object> VideoStartCore(Attempt attempt,string attemptId,string videoId,string transportId,long hostEpoch,long deadlineUtc,string artifactId,int scid,string nonceHex,RetainedAdbProtocol.VideoMedia media)
            {
                State a=attempt==null?null:attempt.state as State;
                if(!VideoUuid(attemptId)||!VideoUuid(videoId)||!MetadataTransport(transportId)||hostEpoch<1||hostEpoch>VideoSafe||!VideoHash(nonceHex)||scid<0)throw new IOException("ADMISSION_REJECTED");
                if(!Enter(a,"FOREGROUND",false))throw new IOException("BUSY");
                try{VideoState v;lock(gate){if(videoAdmission==null||videoAdmission.hash!=artifactId||a.video!=null||a.stopping||media!=null&&!media.Matches(videoAdmission.sessionId,attemptId,videoId))throw new IOException("ADMISSION_REJECTED");
                        NativeVideoIo io=new NativeVideoIo(this,a,videoAdmission,attemptId,videoId,transportId,hostEpoch,scid,nonceHex,deadlineUtc);
                        v=new VideoState(io,videoId,nonceHex,scid,videoAdmission.bytes,videoAdmission.hash,deadlineUtc,media);a.video=v;a.videoId=videoId;if(media!=null)media.BindStop(v.RequestStop);v.Start();}
                    return v.AwaitStarted();
                }finally{Leave(a);}
            }
            public IDictionary<string,object> VideoStatus(Attempt attempt,string videoId)
            {if(!Monitor.TryEnter(gate,0))throw new IOException("BUSY");try{State a=attempt==null?null:attempt.state as State;if(!Exact(a)||a.video==null||a.videoId!=videoId)throw new IOException("ADMISSION_REJECTED");return a.video.Snapshot();}finally{Monitor.Exit(gate);}}
            public IDictionary<string,object> VideoStop(Attempt attempt,string videoId)
            {return VideoStopMedia(attempt,videoId,Stopwatch.StartNew());}
            public IDictionary<string,object> VideoStopMedia(Attempt attempt,string videoId,Stopwatch budget)
            {if(budget==null)throw new IOException("ADMISSION_REJECTED");VideoState v;if(!RetirementLock(gate,budget))throw new IOException("UNRETIRED");try{State a=attempt==null?null:attempt.state as State;if(!Exact(a)||a.video==null||a.videoId!=videoId)throw new IOException("ADMISSION_REJECTED");v=a.video;}finally{Monitor.Exit(gate);}return v.Stop(budget);}
            bool RetireVideo(State a,Stopwatch deadline)
            {VideoState v;if(!RetirementLock(gate,deadline))return false;try{v=a.video;}finally{Monitor.Exit(gate);}if(v==null)return true;if(!v.TryRequestStop(deadline,10000))return false;while(!v.Done){if(deadline.ElapsedMilliseconds>=10000||v.StopExpired)return false;Thread.Sleep(5);}return v.Clean;}
        }
    }
}
