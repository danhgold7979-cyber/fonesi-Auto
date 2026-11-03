// Fixed private VERSION_ONLY / SERVER_ONLY reader. Compile with exact pinned IsolatedAdbServer/RetainedAdbSession sources.
// Source implementation and managed-fixture seam, not evidence of native execution.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Fonesi.Development.Server
{
    public static class RetainedAdbProtocol
    {
        public const int FrameLimit = 65536, AttemptLimit = 128, OutputLimit = 2;
        public const int OperationMilliseconds = 30000, RetirementMilliseconds = 10000, CloseMilliseconds = 120000;
        const long SafeInteger = 9007199254740991L;
        static readonly Regex Uuid = new Regex("\\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\z", RegexOptions.CultureInvariant);
        static readonly Regex RequestPattern = new Regex("\\A\\{\"version\":1,\"sessionId\":\"([0-9a-f-]{36})\",\"requestId\":([1-9][0-9]{0,15}),\"attemptId\":\"([0-9a-f-]{36})\",\"operation\":\"(VERSION|START|HEALTH|RETIRE)\"\\}\\n\\z", RegexOptions.CultureInvariant);
        static readonly Regex DiscoveryPattern = new Regex("\\A\\{\"version\":2,\"sessionId\":\"([0-9a-f-]{36})\",\"requestId\":([1-9][0-9]{0,15}),\"attemptId\":\"([0-9a-f-]{36})\",\"operation\":\"DISCOVER\",\"deadlineUtc\":([1-9][0-9]{0,15})\\}\\n\\z", RegexOptions.CultureInvariant);
        static readonly Regex MetadataPattern = new Regex("\\A\\{\"version\":3,\"sessionId\":\"([0-9a-f-]{36})\",\"requestId\":([1-9][0-9]{0,15}),\"attemptId\":\"([0-9a-f-]{36})\",\"operation\":\"METADATA\",\"field\":\"(MODEL|MANUFACTURER|OS|SDK|LOCALE|RESOLUTION|DENSITY|BATTERY|STORAGE)\",\"transportId\":\"([1-9][0-9]{0,19})\",\"deadlineUtc\":([1-9][0-9]{0,15})\\}\\n\\z", RegexOptions.CultureInvariant);
        static readonly Regex InputPattern = new Regex("\\A\\{\"version\":4,\"sessionId\":\"([0-9a-f-]{36})\",\"requestId\":([1-9][0-9]{0,15}),\"attemptId\":\"([0-9a-f-]{36})\",\"operation\":\"INPUT\",\"action\":\"(HOME|BACK|ENTER|ESCAPE|DPAD_UP|DPAD_DOWN|DPAD_LEFT|DPAD_RIGHT|DPAD_CENTER)\",\"transportId\":\"([1-9][0-9]{0,19})\",\"deadlineUtc\":([1-9][0-9]{0,15})\\}\\n\\z", RegexOptions.CultureInvariant);
        static readonly Regex VideoStartPattern = new Regex(@"\A\{""version"":(?:5|6),""requestId"":([1-9][0-9]{0,15}),""sessionId"":""([0-9a-f-]{36})"",""attemptId"":""([0-9a-f-]{36})"",""kind"":""VIDEO_START"",""videoId"":""([0-9a-f-]{36})"",""transportId"":""([1-9][0-9]{0,19})"",""hostEpoch"":([1-9][0-9]{0,15}),""deadlineUtc"":([1-9][0-9]{0,15}),""artifactId"":""([0-9a-f]{64})"",""scid"":(0|[1-9][0-9]{0,9}),""nonceHex"":""([0-9a-f]{64})""\}\n\z", RegexOptions.CultureInvariant);
        static readonly Regex VideoControlPattern = new Regex(@"\A\{""version"":(?:5|6),""requestId"":([1-9][0-9]{0,15}),""sessionId"":""([0-9a-f-]{36})"",""attemptId"":""([0-9a-f-]{36})"",""kind"":""(VIDEO_STATUS|VIDEO_STOP)"",""videoId"":""([0-9a-f-]{36})""\}\n\z", RegexOptions.CultureInvariant);
        static readonly Regex RecoveryStartPattern = new Regex(@"\A\{""version"":7,""requestId"":([1-9][0-9]{0,15}),""sessionId"":""([0-9a-f-]{36})"",""attemptId"":""([0-9a-f-]{36})"",""kind"":""VIDEO_START"",""videoId"":""([0-9a-f-]{36})"",""videoOrdinal"":([1-9][0-9]{0,2}),""previousVideoId"":(null|""[0-9a-f-]{36}""),""transportId"":""([1-9][0-9]{0,19})"",""hostEpoch"":([1-9][0-9]{0,15}),""deadlineUtc"":([1-9][0-9]{0,15}),""artifactId"":""([0-9a-f]{64})"",""scid"":(0|[1-9][0-9]{0,9}),""nonceHex"":""([0-9a-f]{64})""\}\n\z", RegexOptions.CultureInvariant);
        static readonly Regex RecoveryControlPattern = new Regex(@"\A\{""version"":7,""requestId"":([1-9][0-9]{0,15}),""sessionId"":""([0-9a-f-]{36})"",""attemptId"":""([0-9a-f-]{36})"",""kind"":""(VIDEO_STATUS|VIDEO_STOP)"",""videoId"":""([0-9a-f-]{36})"",""videoOrdinal"":([1-9][0-9]{0,2})\}\n\z", RegexOptions.CultureInvariant);
        static readonly string[] Errors = { "ADMISSION_REJECTED", "BINARY_CHANGED", "PROFILE_REJECTED", "ENDPOINT_REJECTED", "BUSY", "CLOSED", "NATIVE_FAILED", "UNRETIRED" };
        public interface IProvider
        {
            object Reserve(string kind);
            IDictionary<string, object> Version(object attempt);
            IDictionary<string, object> StartForeground(object attempt);
            IDictionary<string, object> Health(object attempt);
            IDictionary<string, object> Discover(object attempt, long deadlineUtc);
            IDictionary<string, object> Metadata(object attempt, string transportId, string field, long deadlineUtc);
            IDictionary<string, object> Input(object attempt,string transportId,string action,long deadlineUtc);
            IDictionary<string, object> Retire(object attempt);
        }
        public interface IVideoProvider
        {
            IDictionary<string,object> VideoStart(object attempt,string attemptId,string videoId,string transportId,long hostEpoch,long deadlineUtc,string artifactId,int scid,string nonceHex);
            IDictionary<string,object> VideoStatus(object attempt,string videoId);
            IDictionary<string,object> VideoStop(object attempt,string videoId);
        }
        public interface IVideoMediaProvider : IVideoProvider
        { IDictionary<string,object> VideoStartMedia(object attempt,string attemptId,string videoId,string transportId,long hostEpoch,long deadlineUtc,string artifactId,int scid,string nonceHex,VideoMedia media); IDictionary<string,object> VideoStopMedia(object attempt,string videoId,Stopwatch budget); }
        public interface IVideoRecoveryProvider : IVideoMediaProvider
        {
            object VideoOwner(object attempt);
            bool VideoOwnerClean(object attempt, object expectedOwner);
            object VideoReserveFresh(object attempt, object expectedOwner, string attemptId, string videoId, string transportId, long hostEpoch, long deadlineUtc, string artifactId, int scid, string nonceHex, VideoMedia media);
            IDictionary<string,object> VideoStartReserved(object attempt, object owner);
        }
        public sealed class NativeProvider : IProvider, IVideoRecoveryProvider
        {
            readonly IsolatedAdbServer.RetainedProvider provider;
            public NativeProvider(IsolatedAdbServer.RetainedProvider provider)
            { if (provider == null) throw new ArgumentException("ADMISSION_REJECTED"); this.provider = provider; }
            public object Reserve(string kind)
            { if (kind != "VERSION" && kind != "FOREGROUND") throw new ArgumentException("ADMISSION_REJECTED"); return provider.Reserve(kind); }
            public IDictionary<string, object> Version(object attempt)
            { return provider.Version(attempt as IsolatedAdbServer.RetainedProvider.Attempt).Snapshot(); }
            public IDictionary<string, object> StartForeground(object attempt)
            { return provider.StartForeground(attempt as IsolatedAdbServer.RetainedProvider.Attempt).Snapshot(); }
            public IDictionary<string, object> Health(object attempt)
            { return provider.Health(attempt as IsolatedAdbServer.RetainedProvider.Attempt).Snapshot(); }
            public IDictionary<string, object> Discover(object attempt, long deadlineUtc)
            { return provider.Discover(attempt as IsolatedAdbServer.RetainedProvider.Attempt, deadlineUtc).Snapshot(); }
            public IDictionary<string, object> Metadata(object attempt,string transportId,string field,long deadlineUtc)
            {return provider.Metadata(attempt as IsolatedAdbServer.RetainedProvider.Attempt,transportId,field,deadlineUtc).Snapshot();}
            public IDictionary<string,object> Input(object attempt,string transportId,string action,long deadlineUtc)
            {return provider.Input(attempt as IsolatedAdbServer.RetainedProvider.Attempt,transportId,action,deadlineUtc).Snapshot();}
            public IDictionary<string,object> VideoStart(object attempt,string attemptId,string videoId,string transportId,long hostEpoch,long deadlineUtc,string artifactId,int scid,string nonceHex)
            {return provider.VideoStart(attempt as IsolatedAdbServer.RetainedProvider.Attempt,attemptId,videoId,transportId,hostEpoch,deadlineUtc,artifactId,scid,nonceHex);}
            public IDictionary<string,object> VideoStartMedia(object attempt,string attemptId,string videoId,string transportId,long hostEpoch,long deadlineUtc,string artifactId,int scid,string nonceHex,VideoMedia media)
            {return provider.VideoStartMedia(attempt as IsolatedAdbServer.RetainedProvider.Attempt,attemptId,videoId,transportId,hostEpoch,deadlineUtc,artifactId,scid,nonceHex,media);}
            public IDictionary<string,object> VideoStatus(object attempt,string videoId)
            {return provider.VideoStatus(attempt as IsolatedAdbServer.RetainedProvider.Attempt,videoId);}
            public IDictionary<string,object> VideoStopMedia(object attempt,string videoId,Stopwatch budget)
            {return provider.VideoStopMedia(attempt as IsolatedAdbServer.RetainedProvider.Attempt,videoId,budget);}
            public IDictionary<string,object> VideoStop(object attempt,string videoId)
            {return provider.VideoStop(attempt as IsolatedAdbServer.RetainedProvider.Attempt,videoId);}
            public object VideoOwner(object attempt) { return provider.VideoOwner(attempt as IsolatedAdbServer.RetainedProvider.Attempt); }
            public bool VideoOwnerClean(object attempt, object expectedOwner) { return provider.VideoOwnerClean(attempt as IsolatedAdbServer.RetainedProvider.Attempt,expectedOwner); }
            public object VideoReserveFresh(object attempt,object expectedOwner,string attemptId,string videoId,string transportId,long hostEpoch,long deadlineUtc,string artifactId,int scid,string nonceHex,VideoMedia media)
            { return provider.VideoReserveFresh(attempt as IsolatedAdbServer.RetainedProvider.Attempt,expectedOwner,attemptId,videoId,transportId,hostEpoch,deadlineUtc,artifactId,scid,nonceHex,media); }
            public IDictionary<string,object> VideoStartReserved(object attempt,object owner) { return provider.VideoStartReserved(attempt as IsolatedAdbServer.RetainedProvider.Attempt,owner); }
            public IDictionary<string, object> Retire(object attempt)
            { return provider.Retire(attempt as IsolatedAdbServer.RetainedProvider.Attempt).Snapshot(); }
        }
        public sealed class Request
        {
            public readonly string SessionId, AttemptId, Operation, Field, TransportId, Action;
            public readonly string VideoId, ArtifactId, NonceHex; public readonly int Scid; public readonly long HostEpoch;
            public readonly long RequestId, DeadlineUtc;
            public readonly int Version;
            public readonly int VideoOrdinal; public readonly string PreviousVideoId;
            internal readonly long AdmittedUtc; readonly Stopwatch budget=Stopwatch.StartNew();
            internal bool DiscoveryDeadline(out long effective)
            {long now=(DateTime.UtcNow.Ticks-621355968000000000L)/10000;long remaining=Math.Min(DeadlineUtc-now,DeadlineUtc-AdmittedUtc-budget.ElapsedMilliseconds);effective=now+Math.Max(0,remaining);return now>=AdmittedUtc&&remaining>0;}
            internal Request(string session, long request, string attempt, string operation)
            { SessionId = session; RequestId = request; AttemptId = attempt; Operation = operation; Version=1; DeadlineUtc=0; }
            internal Request(string session,long request,string attempt,long deadline,long admitted)
            { SessionId=session;RequestId=request;AttemptId=attempt;Operation="DISCOVER";Version=2;DeadlineUtc=deadline;AdmittedUtc=admitted; }
            internal Request(string session,long request,string attempt,string field,string transportId,long deadline,long admitted)
            {SessionId=session;RequestId=request;AttemptId=attempt;Operation="METADATA";Field=field;TransportId=transportId;Version=3;DeadlineUtc=deadline;AdmittedUtc=admitted;}
            internal Request(string session,long request,string attempt,string action,string transportId,long deadline,long admitted,bool input)
            {SessionId=session;RequestId=request;AttemptId=attempt;Operation="INPUT";Action=action;TransportId=transportId;Version=4;DeadlineUtc=deadline;AdmittedUtc=admitted;}
            internal Request(string session,long request,string attempt,string operation,string video,string transport,long epoch,long deadline,string artifact,int scid,string nonce,long admitted,int version=5,int videoOrdinal=0,string previousVideoId=null)
            {VideoOrdinal=videoOrdinal;PreviousVideoId=previousVideoId;SessionId=session;RequestId=request;AttemptId=attempt;Operation=operation;VideoId=video;TransportId=transport;HostEpoch=epoch;DeadlineUtc=deadline;ArtifactId=artifact;Scid=scid;NonceHex=nonce;AdmittedUtc=admitted;Version=version;}

        }
        public static Request Parse(byte[] frame, string sessionId, long previousRequestId)
        {
            if (frame == null || frame.Length < 2 || frame.Length > FrameLimit || sessionId == null || !Uuid.IsMatch(sessionId)) return null;
            for (int n = 0; n < frame.Length; n++) if (frame[n] > 127 || frame[n] == 13 || (frame[n] == 10 && n != frame.Length - 1)) return null;
            string text=Encoding.ASCII.GetString(frame);Match discovery=DiscoveryPattern.Match(text);long request,deadline;
            Match rs=RecoveryStartPattern.Match(text), rc=RecoveryControlPattern.Match(text);
            if(rs.Success||rc.Success){Match r=rs.Success?rs:rc;int ordinal,scid=0;long epoch=0;long now=(DateTime.UtcNow.Ticks-621355968000000000L)/10000;
                if(r.Groups[2].Value!=sessionId||!Uuid.IsMatch(r.Groups[3].Value)||!Int64.TryParse(r.Groups[1].Value,NumberStyles.None,CultureInfo.InvariantCulture,out request)||request<=previousRequestId||request>SafeInteger)return null;
                if(rs.Success){string previous=r.Groups[6].Value=="null"?null:r.Groups[6].Value.Substring(1,36);
                    if(!Uuid.IsMatch(r.Groups[4].Value)||!Int32.TryParse(r.Groups[5].Value,out ordinal)||ordinal>128||previous!=null&&!Uuid.IsMatch(previous)||!IsolatedAdbServer.RetainedProvider.MetadataTransport(r.Groups[7].Value)||!Int64.TryParse(r.Groups[8].Value,out epoch)||epoch>SafeInteger||!Int64.TryParse(r.Groups[9].Value,out deadline)||deadline>8640000000000000L||deadline<=now||deadline-now>30000||!Int32.TryParse(r.Groups[11].Value,out scid)||scid<0)return null;
                    return new Request(sessionId,request,r.Groups[3].Value,"VIDEO_START",r.Groups[4].Value,r.Groups[7].Value,epoch,deadline,r.Groups[10].Value,scid,r.Groups[12].Value,now,7,ordinal,previous);}
                if(!Uuid.IsMatch(r.Groups[5].Value)||!Int32.TryParse(r.Groups[6].Value,out ordinal)||ordinal>128)return null;
                return new Request(sessionId,request,r.Groups[3].Value,r.Groups[4].Value,r.Groups[5].Value,null,0,0,null,0,null,now,7,ordinal);
            }
            Match vs=VideoStartPattern.Match(text), vc=VideoControlPattern.Match(text);
            if(vs.Success||vc.Success){Match v=vs.Success?vs:vc;long epoch=0;int scid=0;long now=(DateTime.UtcNow.Ticks-621355968000000000L)/10000;
                if(v.Groups[2].Value!=sessionId||!Uuid.IsMatch(v.Groups[3].Value)||!Int64.TryParse(v.Groups[1].Value,NumberStyles.None,CultureInfo.InvariantCulture,out request)||request<=previousRequestId||request>SafeInteger)return null;
                if(vs.Success){if(!Uuid.IsMatch(v.Groups[4].Value)||!IsolatedAdbServer.RetainedProvider.MetadataTransport(v.Groups[5].Value)||!Int64.TryParse(v.Groups[6].Value,out epoch)||epoch>SafeInteger||!Int64.TryParse(v.Groups[7].Value,out deadline)||deadline>8640000000000000L||deadline<=now||deadline-now>30000||!Int32.TryParse(v.Groups[9].Value,out scid)||scid<0)return null;
                    return new Request(sessionId,request,v.Groups[3].Value,"VIDEO_START",v.Groups[4].Value,v.Groups[5].Value,epoch,deadline,v.Groups[8].Value,scid,v.Groups[10].Value,now,text.StartsWith("{\"version\":6,",StringComparison.Ordinal)?6:5);}
                if(!Uuid.IsMatch(v.Groups[5].Value))return null;return new Request(sessionId,request,v.Groups[3].Value,v.Groups[4].Value,v.Groups[5].Value,null,0,0,null,0,null,now,text.StartsWith("{\"version\":6,",StringComparison.Ordinal)?6:5);
            }
            Match input=InputPattern.Match(text);
            if(input.Success){
                long now=(DateTime.UtcNow.Ticks-621355968000000000L)/10000;
                if(input.Groups[1].Value!=sessionId||!Uuid.IsMatch(input.Groups[3].Value)||
                   !Int64.TryParse(input.Groups[2].Value,NumberStyles.None,CultureInfo.InvariantCulture,out request)||request<=previousRequestId||request>SafeInteger||
                   !IsolatedAdbServer.RetainedProvider.MetadataTransport(input.Groups[5].Value)||
                   !Int64.TryParse(input.Groups[6].Value,NumberStyles.None,CultureInfo.InvariantCulture,out deadline)||deadline>8640000000000000L||deadline<=now||deadline-now>30000)return null;
                return new Request(sessionId,request,input.Groups[3].Value,input.Groups[4].Value,input.Groups[5].Value,deadline,now,true);
            }
            Match metadata=MetadataPattern.Match(text);
            if(metadata.Success){
                long now=(DateTime.UtcNow.Ticks-621355968000000000L)/10000;
                if(metadata.Groups[1].Value!=sessionId||!Uuid.IsMatch(metadata.Groups[3].Value)||
                   !Int64.TryParse(metadata.Groups[2].Value,NumberStyles.None,CultureInfo.InvariantCulture,out request)||request<=previousRequestId||request>SafeInteger||
                   !IsolatedAdbServer.RetainedProvider.MetadataTransport(metadata.Groups[5].Value)||
                   !Int64.TryParse(metadata.Groups[6].Value,NumberStyles.None,CultureInfo.InvariantCulture,out deadline)||deadline>8640000000000000L||deadline<=now||deadline-now>30000)return null;
                return new Request(sessionId,request,metadata.Groups[3].Value,metadata.Groups[4].Value,metadata.Groups[5].Value,deadline,now);
            }
            if(discovery.Success){
                long now=(DateTime.UtcNow.Ticks-621355968000000000L)/10000;
                if(discovery.Groups[1].Value!=sessionId||!Uuid.IsMatch(discovery.Groups[3].Value)||
                   !Int64.TryParse(discovery.Groups[2].Value,NumberStyles.None,CultureInfo.InvariantCulture,out request)||request<=previousRequestId||request>SafeInteger||
                   !Int64.TryParse(discovery.Groups[4].Value,NumberStyles.None,CultureInfo.InvariantCulture,out deadline)||deadline>SafeInteger||deadline<=now||deadline-now>30000)return null;
                return new Request(sessionId,request,discovery.Groups[3].Value,deadline,now);
            }
            Match m = RequestPattern.Match(text);
            if (!m.Success || m.Groups[1].Value != sessionId || !Uuid.IsMatch(m.Groups[3].Value) ||
                !Int64.TryParse(m.Groups[2].Value, NumberStyles.None, CultureInfo.InvariantCulture, out request) || request <= previousRequestId || request > SafeInteger) return null;
            return new Request(sessionId, request, m.Groups[3].Value, m.Groups[4].Value);
        }
        static readonly Regex CreditPattern=new Regex(@"\A\{""version"":6,""sessionId"":""([0-9a-f-]{36})"",""attemptId"":""([0-9a-f-]{36})"",""kind"":""VIDEO_CREDIT"",""videoId"":""([0-9a-f-]{36})"",""creditId"":([1-9][0-9]{0,15})\}\n\z",RegexOptions.CultureInvariant);
        internal static bool ParseCredit(byte[] frame,string session,out string attempt,out string video,out long credit)
        {
            attempt=null;video=null;credit=0;if(frame==null||frame.Length>FrameLimit)return false;
            foreach(byte b in frame)if(b>127||b==13)return false;
            Match m=CreditPattern.Match(Encoding.ASCII.GetString(frame));
            if(!m.Success||m.Groups[1].Value!=session||!Uuid.IsMatch(m.Groups[2].Value)||!Uuid.IsMatch(m.Groups[3].Value)||!Int64.TryParse(m.Groups[4].Value,NumberStyles.None,CultureInfo.InvariantCulture,out credit)||credit>SafeInteger)return false;
            attempt=m.Groups[2].Value;video=m.Groups[3].Value;return true;
        }
        static readonly Regex RecoveryCreditPattern=new Regex(@"\A\{""version"":7,""sessionId"":""([0-9a-f-]{36})"",""attemptId"":""([0-9a-f-]{36})"",""kind"":""VIDEO_CREDIT"",""videoId"":""([0-9a-f-]{36})"",""videoOrdinal"":([1-9][0-9]{0,2}),""creditId"":([1-9][0-9]{0,15})\}\n\z",RegexOptions.CultureInvariant);
        internal static bool ParseRecoveryCredit(byte[] frame,string session,out string attempt,out string video,out int ordinal,out long credit)
        {
            attempt=null;video=null;ordinal=0;credit=0;if(frame==null||frame.Length>FrameLimit)return false;
            foreach(byte b in frame)if(b>127||b==13)return false;
            Match m=RecoveryCreditPattern.Match(Encoding.ASCII.GetString(frame));
            if(!m.Success||m.Groups[1].Value!=session||!Uuid.IsMatch(m.Groups[2].Value)||!Uuid.IsMatch(m.Groups[3].Value)||!Int32.TryParse(m.Groups[4].Value,out ordinal)||ordinal>128||!Int64.TryParse(m.Groups[5].Value,NumberStyles.None,CultureInfo.InvariantCulture,out credit)||credit>SafeInteger)return false;
            attempt=m.Groups[2].Value;video=m.Groups[3].Value;return true;
        }
        // Only Reader creates this fixed media handoff. No public constructor/producer registration.
        public sealed class VideoMedia
        {
            readonly object sync=new object();readonly string session,attempt,video;
            readonly Action<byte[],VideoMedia,long,Func<int>> enqueue;
            long next=1,flight;bool initial,ack,flushed,stopped,failed,startFinished;Action stopOwner;
            internal VideoMedia(string session,string attempt,string video,Action<byte[],VideoMedia,long,Func<int>> enqueue)
            {if(!Uuid.IsMatch(session??"")||!Uuid.IsMatch(attempt??"")||!Uuid.IsMatch(video??"")||enqueue==null)throw new IOException("ADMISSION_REJECTED");this.session=session;this.attempt=attempt;this.video=video;this.enqueue=enqueue;}
            internal bool Matches(string sessionId,string attemptId,string videoId){return session==sessionId&&attempt==attemptId&&video==videoId;}
            internal bool Stopped {get{lock(sync)return stopped;}}
            internal bool RetiredCredit(long value) { lock(sync)return stopped&&value>=1&&value<=Math.Max(next,flight==0?1:flight+1); }
            internal void BindStop(Action action){bool cancel;lock(sync){if(stopOwner!=null)throw new IOException("PROTOCOL_FAILED");stopOwner=action;cancel=stopped;Monitor.PulseAll(sync);}if(cancel)action();}
            internal void StartFinished(){lock(sync){startFinished=true;Monitor.PulseAll(sync);}}
            internal bool OwnerReady {get{lock(sync)return stopOwner!=null;}}
            internal bool StartDone {get{lock(sync)return startFinished;}}
            internal void Cancel(){Action action;lock(sync){if(stopped)return;stopped=true;action=stopOwner;Monitor.PulseAll(sync);}if(action!=null)action();}
            internal bool Credit(long value)
            {lock(sync){if(stopped||failed)return false;if(!initial){if(value!=1)return false;initial=true;Monitor.PulseAll(sync);return true;}
                if(flight==0||flight>=SafeInteger||value!=flight+1||ack)return false;ack=true;Advance();Monitor.PulseAll(sync);return true;}}
            void Advance(){if(flight!=0&&flushed&&ack){next=flight+1;flight=0;flushed=false;ack=false;}}
            internal void Written(long credit,bool success)
            {lock(sync){if(flight!=credit||flushed){failed=true;stopped=true;}else if(!success){failed=true;stopped=true;}else{flushed=true;Advance();}Monitor.PulseAll(sync);}}
            static void Big(byte[] b,int offset,int value){b[offset]=(byte)(value>>24);b[offset+1]=(byte)(value>>16);b[offset+2]=(byte)(value>>8);b[offset+3]=(byte)value;}
            internal void Emit(long geometry,long config,long packet,string kind,long? pts,int total,int offset,int width,int height,byte[] payload,int count,Func<int> remaining)
            {
                if(geometry<1||geometry>SafeInteger||config<0||config>SafeInteger||packet<0||packet>SafeInteger||Array.IndexOf(new[]{"SESSION","CONFIG","KEY","DELTA"},kind)<0||width<1||height<1||width>4096||height>4096||(long)width*height>8388608||count<0||count>32768||payload==null||count>payload.Length||total<0||total>8388608||offset<0||offset>total||count>total-offset)throw new IOException("PROTOCOL_FAILED");
                if(kind=="SESSION"?(config!=0||packet!=0||pts!=null||total!=0||offset!=0||count!=0):(packet<1||config<1||total<1||offset>=total||count<1||count!=Math.Min(32768,total-offset)||(kind=="CONFIG"?(pts!=null||total>65536):(pts==null||pts<0||pts>SafeInteger))))throw new IOException("PROTOCOL_FAILED");
                long credit;for(;;){remaining();lock(sync){if(stopped||failed)throw new IOException("CLOSED");if(initial&&flight==0){if(next>=SafeInteger)throw new IOException("PROTOCOL_FAILED");credit=next;flight=credit;flushed=false;ack=false;break;}Monitor.Wait(sync,5);}}
                string header="{\"version\":1,\"sessionId\":\""+session+"\",\"attemptId\":\""+attempt+"\",\"videoId\":\""+video+"\",\"creditId\":"+credit.ToString(CultureInfo.InvariantCulture)+",\"geometryId\":"+geometry.ToString(CultureInfo.InvariantCulture)+",\"configId\":"+config.ToString(CultureInfo.InvariantCulture)+",\"packetId\":"+packet.ToString(CultureInfo.InvariantCulture)+",\"kind\":\""+kind+"\",\"ptsUs\":"+(pts.HasValue?pts.Value.ToString(CultureInfo.InvariantCulture):"null")+",\"totalBytes\":"+total.ToString(CultureInfo.InvariantCulture)+",\"offset\":"+offset.ToString(CultureInfo.InvariantCulture)+",\"width\":"+width.ToString(CultureInfo.InvariantCulture)+",\"height\":"+height.ToString(CultureInfo.InvariantCulture)+"}";
                byte[] h=Encoding.ASCII.GetBytes(header);if(h.Length>1024)throw new IOException("PROTOCOL_FAILED");byte[] record=new byte[16+h.Length+count];Encoding.ASCII.GetBytes("AVMED01",0,7,record,1);Big(record,8,h.Length);Big(record,12,count);Buffer.BlockCopy(h,0,record,16,h.Length);Buffer.BlockCopy(payload,0,record,16+h.Length,count);
                try{enqueue(record,this,credit,remaining);}catch{Written(credit,false);throw;}
                // Scratch/record ownership lasts through actual writer completion; ACK alone never releases it.
                for(;;){remaining();lock(sync){if(failed||stopped)throw new IOException("CLOSED");if(flight!=credit||flushed)return;Monitor.Wait(sync,5);}}
            }
        }
        public sealed class RunResult
        {
            public readonly bool Clean;
            public readonly string Code;
            internal RunResult(bool clean, string code) { Clean = clean; Code = code; }
        }
        internal sealed class RecoveryBudget
        {
            internal int Used, ReservedOrdinal, Notice=1; internal bool Closed;
            internal bool Charge(int ordinal,bool reservedStatus,bool install,out bool quota)
            {
                quota=false;int reserved=ReservedOrdinal==0?0:1;
                if(reservedStatus&&ReservedOrdinal==ordinal){ReservedOrdinal=0;Used++;return true;}
                if(Closed)return false;
                int needed=install?2:1;
                if(Used+reserved+Notice+needed<=128){Used++;if(install)ReservedOrdinal=ordinal;return true;}
                if(Notice==0)return false;Notice=0;Used++;Closed=true;quota=true;return true;
            }
            internal void Release(int ordinal){if(ReservedOrdinal==ordinal)ReservedOrdinal=0;}
        }
        sealed class RecoveryVideo
        {
            internal readonly string id,previous; internal readonly int ordinal;
            internal readonly VideoMedia media; internal readonly object expectedOwner;
            internal object nativeOwner; internal bool owned,clean,cleanupReceipt,cleanupPending,cancelled;
            internal RecoveryVideo previousRecord; internal RecoveryWork startWork; internal Stopwatch stopBudget; internal long revision;
            internal string refusal; internal Facts snapshot;
            internal RecoveryVideo(Request r,VideoMedia media,object expectedOwner)
            {id=r.VideoId;previous=r.PreviousVideoId;ordinal=r.VideoOrdinal;this.media=media;this.expectedOwner=expectedOwner;}
        }
        sealed class RecoveryWork
        {
            internal Thread thread; internal readonly long started; internal readonly bool cleanup;
            internal RecoveryWork(long started,bool cleanup){this.started=started;this.cleanup=cleanup;}
        }
        sealed class RecoveryResponse
        {
            internal readonly Request request; internal readonly Facts facts; internal readonly RecoveryVideo video; internal readonly bool cleanup;
            internal RecoveryResponse(Request request,Facts facts,RecoveryVideo video,bool cleanup){this.request=request;this.facts=facts;this.video=video;this.cleanup=cleanup;}
        }
        sealed class Attempt
        {
            internal readonly string id; internal readonly object token;
            internal Thread ordinary, cleanup, videoCleanup;
            internal bool terminal, cleanupIssued, retiring, publicationStarted, live;
            internal int healthCalls, discoveryCalls, queryRetirementGeneration, videoCalls; internal string videoId;
            internal int frames; internal int videoVersion; internal VideoMedia media;
            internal long ordinaryStarted, cleanupStarted, videoCleanupStarted;
            internal readonly RecoveryBudget recoveryBudget=new RecoveryBudget();
            internal readonly Dictionary<int,RecoveryVideo> recoveryVideos=new Dictionary<int,RecoveryVideo>();
            internal readonly HashSet<string> recoveryIds=new HashSet<string>(StringComparer.Ordinal),recoveryNonces=new HashSet<string>(StringComparer.Ordinal);
            internal readonly HashSet<int> recoveryScids=new HashSet<int>();
            internal int recoveryNext=1; internal RecoveryVideo recoveryCurrent;
            internal Request recoveryOrdinary; internal RecoveryResponse recoveryResponse,recoveryCleanupResponse;
            internal long recoveryResponseStarted;
            internal readonly List<RecoveryWork> recoveryWorkers=new List<RecoveryWork>();
            internal Attempt(string id, object token) { this.id = id; this.token = token; }
        }
        sealed class Frame
        {
            internal readonly byte[] bytes; internal readonly Attempt attempt; internal readonly VideoMedia media; internal readonly long credit; internal readonly RecoveryResponse recovery;
            internal Frame(byte[] bytes, Attempt attempt) : this(bytes,attempt,null,0) {}
            internal Frame(byte[] bytes,Attempt attempt,RecoveryResponse recovery) : this(bytes,attempt,null,0){this.recovery=recovery;}
            internal Frame(byte[] bytes,Attempt attempt,VideoMedia media,long credit){this.bytes=bytes;this.attempt=attempt;this.media=media;this.credit=credit;}
        }
        sealed class Facts
        {
            internal readonly string json; internal readonly bool terminal, live, queryUnknown;
            internal Facts(string json, bool terminal) : this(json, terminal, false) { }
            internal Facts(string json, bool terminal, bool live) : this(json,terminal,live,false) { }
            internal Facts(string json,bool terminal,bool live,bool queryUnknown){this.json=json;this.terminal=terminal;this.live=live;this.queryUnknown=queryUnknown;}
        }
        static bool SessionExit(object value)
        {
            if (value == null) return true;
            if (!(value is int) && !(value is long) && !(value is uint)) return false;
            long number = Convert.ToInt64(value, CultureInfo.InvariantCulture);
            return number >= -2147483648L && number <= 4294967295L;
        }
        static Facts Snapshot(IDictionary<string, object> input, bool server, string operation)
        {
            if (input == null) throw new InvalidDataException();
            Dictionary<string, object> v = new Dictionary<string, object>();
            foreach (KeyValuePair<string, object> pair in input) { if (v.Count == 7 || v.ContainsKey(pair.Key)) throw new InvalidDataException(); v.Add(pair.Key, pair.Value); }
            if (v.Count == 1 && v.ContainsKey("code") && v["code"] is string && Array.IndexOf(Errors, (string)v["code"]) >= 0)
                return new Facts("{\"code\":\"" + (string)v["code"] + "\"}", false);
            if (server) {
                string[] sessionKeys = { "version", "kind", "dispatched", "jobState", "exitCode", "endpointState", "observation" };
                if (v.Count != sessionKeys.Length) throw new InvalidDataException();
                foreach (string key in sessionKeys) if (!v.ContainsKey(key)) throw new InvalidDataException();
                if (!(v["version"] is int) || (int)v["version"] != 2 || !(v["kind"] is string) || (string)v["kind"] != "SESSION" ||
                    !(v["dispatched"] is bool) || !(v["jobState"] is string) || !(v["endpointState"] is string) ||
                    !SessionExit(v["exitCode"]) || (v["observation"] != null && !(v["observation"] is string))) throw new InvalidDataException();
                string job = (string)v["jobState"], endpoint = (string)v["endpointState"], observation = v["observation"] as string;
                bool dispatchedSession = (bool)v["dispatched"];
                if (Array.IndexOf(new string[]{"LIVE","RETIRED","UNKNOWN"}, job) < 0 ||
                    Array.IndexOf(new string[]{"OWNED","ABSENT","UNKNOWN"}, endpoint) < 0 ||
                    (job == "LIVE" && v["exitCode"] != null) || (!dispatchedSession && (observation != null || v["exitCode"] != null))) throw new InvalidDataException();
                bool terminalSession = job == "RETIRED" && endpoint == "ABSENT" && (dispatchedSession ? v["exitCode"] != null : v["exitCode"] == null);
                string expected = operation == "START" ? "STARTED" : operation == "HEALTH" ? "HEALTHY" : "STOPPED";
                if (observation != null && (observation != expected || !dispatchedSession ||
                    (operation == "RETIRE" ? !terminalSession : job != "LIVE" || endpoint != "OWNED" || v["exitCode"] != null))) throw new InvalidDataException();
                string sessionExit = v["exitCode"] == null ? "null" : Convert.ToInt64(v["exitCode"], CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
                return new Facts("{\"version\":2,\"kind\":\"SESSION\",\"dispatched\":" + (dispatchedSession ? "true" : "false") +
                    ",\"jobState\":\"" + job + "\",\"exitCode\":" + sessionExit + ",\"endpointState\":\"" + endpoint +
                    "\",\"observation\":" + (observation == null ? "null" : "\"" + observation + "\"") + "}", terminalSession,
                    observation != null && operation != "RETIRE");
            }
            string[] keys = { "version", "kind", "dispatched", "processRetired", "exitCode", "observation" };
            if (v.Count != keys.Length) throw new InvalidDataException(); foreach (string key in keys) if (!v.ContainsKey(key)) throw new InvalidDataException();
            if (!(v["version"] is int) || (int)v["version"] != 2 || !(v["kind"] is string) || (string)v["kind"] != "INVOCATION" ||
                !(v["dispatched"] is bool) || !(v["processRetired"] is bool) ||
                (v["exitCode"] != null && !(v["exitCode"] is int)) ||
                (v["observation"] != null && (!(v["observation"] is string) || (string)v["observation"] != "VERSION"))) throw new InvalidDataException();
            bool dispatched = (bool)v["dispatched"], retired = (bool)v["processRetired"];
            if ((!dispatched && (v["exitCode"] != null || v["observation"] != null)) || (!retired && v["exitCode"] != null)) throw new InvalidDataException();
            string exit = v["exitCode"] == null ? "null" : ((int)v["exitCode"]).ToString(CultureInfo.InvariantCulture);
            return new Facts("{\"version\":2,\"kind\":\"INVOCATION\",\"dispatched\":" + (dispatched ? "true" : "false") +
                ",\"processRetired\":" + (retired ? "true" : "false") + ",\"exitCode\":" + exit + ",\"observation\":" +
                (v["observation"] == null ? "null" : "\"VERSION\"") + "}", retired && (dispatched ? v["exitCode"] != null : v["exitCode"] == null && v["observation"] == null));
        }
        static Facts AcquisitionSnapshot(IDictionary<string,object> input,Request request)
        {
            string[] keys={"version","kind","status","code","dispatched","operationRetired","payloadBase64","observedAtUtc"};
            if(input==null||input.Count!=keys.Length)throw new InvalidDataException();foreach(string key in keys)if(!input.ContainsKey(key))throw new InvalidDataException();
            if(!(input["version"] is int)||(int)input["version"]!=1||!(input["kind"] is string)||(string)input["kind"]!="ACQUISITION"||!(input["status"] is string)||!(input["code"] is string)||!(input["dispatched"] is bool)||!(input["operationRetired"] is bool))throw new InvalidDataException();
            string status=(string)input["status"],code=(string)input["code"],payload=input["payloadBase64"] as string;bool dispatched=(bool)input["dispatched"],retired=(bool)input["operationRetired"];
            string encoded="null",time="null";
            if(status=="COMPLETE"){
                if(code!="OK"||!dispatched||!retired||payload==null||payload.Length>43692||!(input["observedAtUtc"] is long))throw new InvalidDataException();
                long observed=(long)input["observedAtUtc"];if(observed<request.AdmittedUtc||observed>request.DeadlineUtc)throw new InvalidDataException();
                byte[] bytes=Convert.FromBase64String(payload);if(bytes.Length>32768||Convert.ToBase64String(bytes)!=payload)throw new InvalidDataException();
                string text=new UTF8Encoding(false,true).GetString(bytes);if(text.IndexOf('\0')>=0||(text.Length>0&&text[0]=='\ufeff'))throw new InvalidDataException();
                encoded="\""+payload+"\"";time=observed.ToString(CultureInfo.InvariantCulture);
            }else{
                if(input["payloadBase64"]!=null||input["observedAtUtc"]!=null)throw new InvalidDataException();
                if(status=="UNRETIRED"){if(code!="UNRETIRED"||retired)throw new InvalidDataException();}
                else if(status!="FAILED"||!retired||Array.IndexOf(new string[]{"ADMISSION_REJECTED","BUSY","CLOSED","DEADLINE","DISCOVERY_REJECTED","NATIVE_FAILED"},code)<0)throw new InvalidDataException();
            }
            return new Facts("{\"version\":1,\"kind\":\"ACQUISITION\",\"status\":\""+status+"\",\"code\":\""+code+"\",\"dispatched\":"+(dispatched?"true":"false")+",\"operationRetired\":"+(retired?"true":"false")+",\"payloadBase64\":"+encoded+",\"observedAtUtc\":"+time+"}",false,status=="COMPLETE",status=="UNRETIRED");
        }
        static Facts AcquisitionFailure(string code)
        { return new Facts("{\"version\":1,\"kind\":\"ACQUISITION\",\"status\":\"FAILED\",\"code\":\""+code+"\",\"dispatched\":false,\"operationRetired\":true,\"payloadBase64\":null,\"observedAtUtc\":null}",false); }
        static Facts MetadataSnapshot(IDictionary<string,object> input,Request request)
        {
            string[] keys={"version","kind","status","code","dispatched","operationRetired","stdoutBase64","stderrBase64","remoteExitCode","observedAtUtc"};
            Dictionary<string,object> v=new Dictionary<string,object>();if(input==null)throw new InvalidDataException();
            foreach(KeyValuePair<string,object> pair in input){if(v.Count==10||v.ContainsKey(pair.Key))throw new InvalidDataException();v.Add(pair.Key,pair.Value);}
            if(v.Count!=10)throw new InvalidDataException();foreach(string key in keys)if(!v.ContainsKey(key))throw new InvalidDataException();
            if(!(v["version"] is int)||(int)v["version"]!=1||!(v["kind"] is string)||(string)v["kind"]!="METADATA_QUERY"||!(v["status"] is string)||!(v["code"] is string)||!(v["dispatched"] is bool)||!(v["operationRetired"] is bool))throw new InvalidDataException();
            string status=(string)v["status"],code=(string)v["code"],stdout=v["stdoutBase64"] as string,stderr=v["stderrBase64"] as string;
            bool dispatched=(bool)v["dispatched"],retired=(bool)v["operationRetired"];string output="null",error="null",exit="null",time="null";
            if(status=="COMPLETE"){
                if(code!="OK"||!dispatched||!retired||stdout==null||stderr==null||stdout.Length+stderr.Length>43696||!(v["remoteExitCode"] is int)||(int)v["remoteExitCode"]<0||(int)v["remoteExitCode"]>255||!(v["observedAtUtc"] is long))throw new InvalidDataException();
                long observed=(long)v["observedAtUtc"];if(observed<request.AdmittedUtc||observed>request.DeadlineUtc||observed>8640000000000000L)throw new InvalidDataException();
                byte[] a=Convert.FromBase64String(stdout),b=Convert.FromBase64String(stderr);if(a.Length+b.Length>32768||Convert.ToBase64String(a)!=stdout||Convert.ToBase64String(b)!=stderr)throw new InvalidDataException();
                foreach(byte[] bytes in new byte[][]{a,b}){string text=new UTF8Encoding(false,true).GetString(bytes);if(text.IndexOf('\0')>=0||(text.Length>0&&text[0]=='\ufeff'))throw new InvalidDataException();}
                output="\""+stdout+"\"";error="\""+stderr+"\"";exit=((int)v["remoteExitCode"]).ToString(CultureInfo.InvariantCulture);time=observed.ToString(CultureInfo.InvariantCulture);
            }else{
                if(v["stdoutBase64"]!=null||v["stderrBase64"]!=null||v["remoteExitCode"]!=null||v["observedAtUtc"]!=null)throw new InvalidDataException();
                if(status=="UNRETIRED"){if(code!="UNRETIRED"||retired)throw new InvalidDataException();}
                else if(status!="FAILED"||!retired||Array.IndexOf(new string[]{"ADMISSION_REJECTED","BUSY","CLOSED","DEADLINE","METADATA_REJECTED","NATIVE_FAILED"},code)<0)throw new InvalidDataException();
            }
            string json="{\"version\":1,\"kind\":\"METADATA_QUERY\",\"status\":\""+status+"\",\"code\":\""+code+"\",\"dispatched\":"+(dispatched?"true":"false")+",\"operationRetired\":"+(retired?"true":"false")+",\"stdoutBase64\":"+output+",\"stderrBase64\":"+error+",\"remoteExitCode\":"+exit+",\"observedAtUtc\":"+time+"}";
            return new Facts(json,false,status=="COMPLETE",status=="UNRETIRED");
        }
        static Facts MetadataFailure(string code,bool unknown)
        {return new Facts("{\"version\":1,\"kind\":\"METADATA_QUERY\",\"status\":\""+(unknown?"UNRETIRED":"FAILED")+"\",\"code\":\""+code+"\",\"dispatched\":"+(unknown?"true":"false")+",\"operationRetired\":"+(unknown?"false":"true")+",\"stdoutBase64\":null,\"stderrBase64\":null,\"remoteExitCode\":null,\"observedAtUtc\":null}",false,false,unknown);}
        static Facts InputSnapshot(IDictionary<string,object> input,Request request)
        {
            string[] keys={"version","kind","status","code","dispatched","operationRetired","remoteExitCode","stdoutEmpty","stderrEmpty","observedAtUtc"};
            Dictionary<string,object> v=new Dictionary<string,object>();if(input==null)throw new InvalidDataException();
            foreach(KeyValuePair<string,object> pair in input){if(v.Count==10||v.ContainsKey(pair.Key))throw new InvalidDataException();v.Add(pair.Key,pair.Value);}
            if(v.Count!=10)throw new InvalidDataException();foreach(string key in keys)if(!v.ContainsKey(key))throw new InvalidDataException();
            if(!(v["version"] is int)||(int)v["version"]!=1||!(v["kind"] is string)||(string)v["kind"]!="INPUT_QUERY"||!(v["status"] is string)||!(v["code"] is string)||!(v["dispatched"] is bool)||!(v["operationRetired"] is bool))throw new InvalidDataException();
            string status=(string)v["status"],code=(string)v["code"];bool dispatched=(bool)v["dispatched"],retired=(bool)v["operationRetired"];
            string output="null",error="null",exit="null",time="null";
            if(status=="COMPLETE"){
                if(code!="OK"||!dispatched||!retired||!(v["stdoutEmpty"] is bool)||!(v["stderrEmpty"] is bool)||!(v["remoteExitCode"] is int)||(int)v["remoteExitCode"]<0||(int)v["remoteExitCode"]>255||!(v["observedAtUtc"] is long))throw new InvalidDataException();
                long observed=(long)v["observedAtUtc"];if(observed<request.AdmittedUtc||observed>request.DeadlineUtc||observed>8640000000000000L)throw new InvalidDataException();
                output=(bool)v["stdoutEmpty"]?"true":"false";error=(bool)v["stderrEmpty"]?"true":"false";exit=((int)v["remoteExitCode"]).ToString(CultureInfo.InvariantCulture);time=observed.ToString(CultureInfo.InvariantCulture);
            }else{
                if(v["stdoutEmpty"]!=null||v["stderrEmpty"]!=null||v["remoteExitCode"]!=null||v["observedAtUtc"]!=null)throw new InvalidDataException();
                if(status=="UNRETIRED"){if(code!="UNRETIRED"||retired)throw new InvalidDataException();}
                else if(status!="FAILED"||!retired||Array.IndexOf(new string[]{"ADMISSION_REJECTED","BUSY","CLOSED","DEADLINE","INPUT_REJECTED","NATIVE_FAILED"},code)<0)throw new InvalidDataException();
            }
            string json="{\"version\":1,\"kind\":\"INPUT_QUERY\",\"status\":\""+status+"\",\"code\":\""+code+"\",\"dispatched\":"+(dispatched?"true":"false")+",\"operationRetired\":"+(retired?"true":"false")+",\"remoteExitCode\":"+exit+",\"stdoutEmpty\":"+output+",\"stderrEmpty\":"+error+",\"observedAtUtc\":"+time+"}";
            return new Facts(json,false,status=="COMPLETE",status=="UNRETIRED");
        }
        static Facts InputFailure(string code,bool unknown)
        {return new Facts("{\"version\":1,\"kind\":\"INPUT_QUERY\",\"status\":\""+(unknown?"UNRETIRED":"FAILED")+"\",\"code\":\""+code+"\",\"dispatched\":"+(unknown?"true":"false")+",\"operationRetired\":"+(unknown?"false":"true")+",\"remoteExitCode\":null,\"stdoutEmpty\":null,\"stderrEmpty\":null,\"observedAtUtc\":null}",false,false,unknown);}
        static Facts VideoSnapshot(IDictionary<string,object> input,Request request)
        {
            string[] keys={"sessionId","snapshotRevision","state","code","streamObserved","sessionPackets","mediaPackets","encodedBytes","lastWidth","lastHeight","directory","upload","launch","localRetired","cleanup"};
            if(input==null||input.Count!=keys.Length)throw new InvalidDataException();foreach(string key in keys)if(!input.ContainsKey(key))throw new InvalidDataException();
            if(!(input["sessionId"] is string)||(string)input["sessionId"]!=request.VideoId)throw new InvalidDataException();
            string[][] enums={new[]{"PREPARING","STARTING","RECEIVING","STOPPING","CLOSED","FAILED","UNCERTAIN"},new[]{"OK","NOT_READY","BUSY","STALE_TARGET","ADMISSION_REJECTED","DEPLOYMENT_FAILED","PROTOCOL_FAILED","REMOTE_FAILED","DEADLINE_EXCEEDED","OUTCOME_UNKNOWN","CLOSED"},new[]{"NONE","CREATED","UNKNOWN"},new[]{"NONE","PARTIAL","VERIFIED","UNKNOWN"},new[]{"NONE","STARTED","EXITED","UNKNOWN"},new[]{"NOT_REQUIRED","PENDING","CLEANED","UNKNOWN"}};
            string[] names={"state","code","directory","upload","launch","cleanup"};for(int n=0;n<names.Length;n++)if(!(input[names[n]] is string)||Array.IndexOf(enums[n],(string)input[names[n]])<0)throw new InvalidDataException();
            foreach(string k in new[]{"streamObserved","localRetired"})if(!(input[k] is bool))throw new InvalidDataException();
            foreach(string k in new[]{"snapshotRevision","sessionPackets","mediaPackets","encodedBytes","lastWidth","lastHeight"}){object value=input[k];if(value==null&&(k=="lastWidth"||k=="lastHeight"))continue;if(!(value is int)&&!(value is long))throw new InvalidDataException();long n=Convert.ToInt64(value);if(n<0||n>SafeInteger||((k=="lastWidth"||k=="lastHeight")&&(n<1||n>16384)))throw new InvalidDataException();}
            if((input["lastWidth"]==null)!=(input["lastHeight"]==null))throw new InvalidDataException();
            if((string)input["state"]=="RECEIVING"&&(!(bool)input["streamObserved"]||(string)input["code"]!="OK"||Convert.ToInt64(input["sessionPackets"])<1||Convert.ToInt64(input["mediaPackets"])<1))throw new InvalidDataException();
            if((string)input["state"]=="UNCERTAIN"&&(string)input["code"]!="OUTCOME_UNKNOWN")throw new InvalidDataException();
            string state=(string)input["state"],code=(string)input["code"],dir=(string)input["directory"],upload=(string)input["upload"],launch=(string)input["launch"],cleanup=(string)input["cleanup"];
            bool observed=(bool)input["streamObserved"],retired=(bool)input["localRetired"];long sessions=Convert.ToInt64(input["sessionPackets"]),media=Convert.ToInt64(input["mediaPackets"]);
            if((input["lastWidth"]==null)!=(sessions==0)||observed!=(media>0)||observed&&sessions==0||Convert.ToInt64(input["encodedBytes"])<media)throw new InvalidDataException();
            if((state=="PREPARING"||state=="STARTING")&&(code!="OK"||observed)||state=="RECEIVING"&&(retired||dir!="CREATED"||upload!="VERIFIED"||launch!="STARTED"))throw new InvalidDataException();
            if((launch=="STARTED"||launch=="EXITED")&&upload!="VERIFIED")throw new InvalidDataException();
            if(dir=="NONE"&&(upload!="NONE"||launch!="NONE"||cleanup!="NOT_REQUIRED"))throw new InvalidDataException();
            bool clean=retired&&(dir=="NONE"&&upload=="NONE"&&launch=="NONE"&&cleanup=="NOT_REQUIRED"||dir=="CREATED"&&(launch=="NONE"||launch=="EXITED")&&cleanup=="CLEANED");
            if(state=="CLOSED"&&!clean||cleanup=="CLEANED"&&!clean||state=="FAILED"&&(code=="OK"||code=="OUTCOME_UNKNOWN"))throw new InvalidDataException();
            StringBuilder json=new StringBuilder("{");for(int n=0;n<keys.Length;n++){if(n!=0)json.Append(',');string k=keys[n];json.Append('"').Append(k).Append("\":");object value=input[k];if(value==null)json.Append("null");else if(value is string)json.Append('"').Append((string)value).Append('"');else if(value is bool)json.Append((bool)value?"true":"false");else json.Append(Convert.ToInt64(value).ToString(CultureInfo.InvariantCulture));}json.Append('}');return new Facts(json.ToString(),false,false,(string)input["state"]=="UNCERTAIN");
        }
        sealed class Reader
        {
            readonly bool diagnostics, server;
            int diagnosticSlots;
            enum ProgressSlot { REQUEST_ACCEPTED, PROVIDER_ENTERED, RESPONSE_WRITE, RESPONSE_FLUSH }
            void Progress(ProgressSlot slot)
            {
                if (!diagnostics) return;
                int bit = 1 << (int)slot, before;
                do { before = Interlocked.CompareExchange(ref diagnosticSlots, 0, 0); if ((before & bit) != 0) return; }
                while (Interlocked.CompareExchange(ref diagnosticSlots, before | bit, before) != before);
                // Fixed first-occurrence telemetry only; never an authority or retirement proof.
                try { Console.Error.WriteLine("HOST_READER_PROGRESS_" + slot.ToString()); } catch { }
            }
            readonly object gate = new object();
            readonly Stream input, output;
            readonly string session;
            readonly IProvider provider;
            readonly Func<bool> parentAlive;
            readonly Queue<Frame> queue = new Queue<Frame>(); Frame mediaFrame;
            readonly HashSet<string> seen = new HashSet<string>(StringComparer.Ordinal);
            readonly Stopwatch elapsed = Stopwatch.StartNew();
            Thread reader, writer;
            Task<int> readPending;
            Request deferred, deferredRetire;
            long deferredStarted;
            Attempt current;
            bool stopping, eof, reserving, writeFailed, writingMedia;
            string failure;
            long closeStarted = -1, writeStarted = -1, lastRequest;
            int outstanding;
            internal Reader(Stream input, Stream output, string session, IProvider provider, Func<bool> parentAlive, bool diagnostics, string operationSet)
            { this.server = operationSet == "SERVER_ONLY"; this.input = input; this.output = output; this.session = session; this.provider = provider; this.parentAlive = parentAlive; this.diagnostics = diagnostics; }
            void Stop(string code)
            {
                lock (gate) { CancelMedia(current); stopping = true; if (code != null && failure == null) failure = code; if (closeStarted < 0) closeStarted = elapsed.ElapsedMilliseconds; Monitor.PulseAll(gate); }
            }
            void CancelMedia(Attempt attempt)
            {if(attempt!=null&&attempt.videoVersion==7){foreach(RecoveryVideo v in attempt.recoveryVideos.Values)if(v.media!=null)CancelRecoveryMedia(attempt,v);return;}if(attempt==null||attempt.media==null)return;attempt.media.Cancel();if(mediaFrame!=null&&mediaFrame.attempt==attempt){Frame discarded=mediaFrame;mediaFrame=null;outstanding--;attempt.frames--;discarded.media.Written(discarded.credit,false);}Monitor.PulseAll(gate);}
            void EnqueueMedia(Attempt attempt,byte[] bytes,VideoMedia media,long credit,Func<int> remaining)
            {for(;;){remaining();lock(gate){if(stopping||attempt.retiring||media.Stopped||writeFailed)throw new IOException("CLOSED");if(outstanding==0&&mediaFrame==null){outstanding++;attempt.frames++;mediaFrame=new Frame(bytes,attempt,media,credit);Monitor.PulseAll(gate);return;}Monitor.Wait(gate,5);}}}
            static bool Done(Thread thread) { return thread == null || ((thread.ThreadState & System.Threading.ThreadState.Unstarted) == 0 && thread.Join(0)); }
            bool Available(Attempt attempt) { return outstanding == 0 && (attempt == null || (RecoveryDone(attempt)&&attempt.recoveryResponse==null&&attempt.recoveryCleanupResponse==null&&attempt.terminal && Done(attempt.ordinary) && Done(attempt.cleanup) && Done(attempt.videoCleanup) && attempt.frames == 0)); }
            void Enqueue(Request request, Attempt attempt, Facts facts)
            {
                string raw = "{\"version\":" + request.Version.ToString(CultureInfo.InvariantCulture) + ",\"sessionId\":\"" + session + "\",\"requestId\":" + request.RequestId.ToString(CultureInfo.InvariantCulture) +
                    ",\"attemptId\":\"" + request.AttemptId + "\",\"operation\":\"" + request.Operation + "\",\"result\":" + facts.json + "}\n";
                if(request.Version>=5)raw="{\"version\":"+request.Version.ToString(CultureInfo.InvariantCulture)+",\"requestId\":"+request.RequestId.ToString(CultureInfo.InvariantCulture)+",\"sessionId\":\""+session+"\",\"attemptId\":\""+request.AttemptId+"\",\"kind\":\""+request.Operation+"\",\"result\":"+facts.json+"}\n";
                byte[] bytes = Encoding.ASCII.GetBytes(raw);
                lock (gate) {
                    if (bytes.Length > FrameLimit || outstanding >= OutputLimit || writeFailed) { Stop("OUTPUT_FAILED"); return; }
                    outstanding++; if (attempt != null) attempt.frames++; queue.Enqueue(new Frame(bytes, attempt)); Monitor.PulseAll(gate);
                }
            }
            static bool RecoveryDone(Attempt a)
            {foreach(RecoveryWork w in a.recoveryWorkers)if(!Done(w.thread))return false;return true;}
            bool RecoveryBarrier(Attempt a,RecoveryVideo old)
            {return !stopping&&!a.retiring&&a.live&&!a.terminal&&RecoveryDone(a)&&Done(a.ordinary)&&Done(a.cleanup)&&Done(a.videoCleanup)&&queue.Count==0&&mediaFrame==null&&outstanding==0&&a.frames==0&&writeStarted<0&&!writingMedia&&!writeFailed&&(old==null||old.clean&&old.media!=null&&old.media.Stopped);}
            Facts RecoveryFacts(RecoveryVideo v,string refusal,bool fresh)
            {
                string why=refusal??v.refusal;
                if(v.owned&&v.snapshot==null)throw new IOException("PROTOCOL_FAILED");
                if(!v.owned&&Array.IndexOf(new[]{"BUSY","QUOTA","STALE_TARGET","REJECTED"},why)<0)throw new IOException("PROTOCOL_FAILED");
                if(v.owned&&why!=null&&why!="QUOTA")throw new IOException("PROTOCOL_FAILED");
                return new Facts("{\"handoff\":\""+(v.owned?"OWNED":"NOT_STARTED")+"\",\"videoId\":\""+v.id+"\",\"videoOrdinal\":"+v.ordinal.ToString(CultureInfo.InvariantCulture)+",\"refusal\":"+(why==null?"null":"\""+why+"\"")+",\"snapshot\":"+(v.owned?v.snapshot.json:"null")+",\"fresh\":"+(v.owned&&fresh?"true":"false")+"}",false);
            }
            void QueueRecovery(Attempt a,Request request,RecoveryVideo video,bool cleanup,string refusal,bool fresh)
            {
                Facts facts=RecoveryFacts(video,refusal,fresh);
                lock(gate){RecoveryResponse response=new RecoveryResponse(request,facts,video,cleanup);
                    if(cleanup){if(a.recoveryCleanupResponse!=null){Stop("OUTPUT_FAILED");return;}a.recoveryCleanupResponse=response;}
                    else{if(a.recoveryResponse!=null||!Object.ReferenceEquals(a.recoveryOrdinary,request)){Stop("OUTPUT_FAILED");return;}a.recoveryResponse=response;a.recoveryResponseStarted=elapsed.ElapsedMilliseconds;}
                    PumpRecovery(a);Monitor.PulseAll(gate);
                }
            }
            // Called only under gate. Deferred fixed replies never force a third encoded output slot.
            void PumpRecovery(Attempt a)
            {
                if(a==null||writeFailed)return;
                while(outstanding<OutputLimit){RecoveryResponse response=a.recoveryCleanupResponse??a.recoveryResponse;if(response==null)return;
                    string raw="{\"version\":7,\"requestId\":"+response.request.RequestId.ToString(CultureInfo.InvariantCulture)+",\"sessionId\":\""+session+"\",\"attemptId\":\""+a.id+"\",\"kind\":\""+response.request.Operation+"\",\"result\":"+response.facts.json+"}\n";
                    byte[] bytes=Encoding.ASCII.GetBytes(raw);if(bytes.Length>FrameLimit){Stop("OUTPUT_FAILED");return;}
                    if(response.cleanup)a.recoveryCleanupResponse=null;else a.recoveryResponse=null;
                    outstanding++;a.frames++;queue.Enqueue(new Frame(bytes,a,response));Monitor.PulseAll(gate);
                }
            }
            void CancelRecoveryMedia(Attempt a,RecoveryVideo v)
            {
                v.cancelled=true;if(v.media!=null)v.media.Cancel();
                if(mediaFrame!=null&&Object.ReferenceEquals(mediaFrame.media,v.media)){Frame discarded=mediaFrame;mediaFrame=null;outstanding--;a.frames--;discarded.media.Written(discarded.credit,false);}
                Monitor.PulseAll(gate);
            }
            void StartRecoveryWorker(Attempt a,Request request,RecoveryVideo v,bool cleanup)
            {
                if(a.recoveryWorkers.Count>=256){Stop("PROTOCOL_FAILED");return;}
                RecoveryWork work=new RecoveryWork(elapsed.ElapsedMilliseconds,cleanup);
                work.thread=new Thread(delegate(){RecoveryWorker(a,request,v,cleanup);});work.thread.IsBackground=true;
                a.recoveryWorkers.Add(work); // Publish every obligation before Thread.Start; never drop the prior thread.
                if(cleanup){a.videoCleanup=work.thread;a.videoCleanupStarted=work.started;}else{a.ordinary=work.thread;a.ordinaryStarted=work.started;if(request.Operation=="VIDEO_START")v.startWork=work;}
                work.thread.Start();
            }
            void StoreRecoverySnapshot(RecoveryVideo v,IDictionary<string,object> raw,Request request)
            {
                Facts facts=VideoSnapshot(raw,request);long revision=Convert.ToInt64(raw["snapshotRevision"]);
                lock(gate){if(revision>=v.revision){v.snapshot=facts;v.revision=revision;}}
                if(facts.queryUnknown)throw new IOException("UNRETIRED");
            }
            void RefuseRecoveryCandidate(Attempt a,RecoveryVideo v,string reason)
            {
                lock(gate){if(v.owned)throw new IOException("PROTOCOL_FAILED");v.refusal=reason;v.clean=true;CancelRecoveryMedia(a,v);
                    if(Object.ReferenceEquals(a.recoveryCurrent,v)){a.recoveryCurrent=v.previousRecord;a.media=v.previousRecord==null?null:v.previousRecord.media;}
                    a.recoveryBudget.Release(v.ordinal);
                }
            }
            void RecoveryWorker(Attempt a,Request request,RecoveryVideo v,bool cleanup)
            {
                try{
                    IVideoRecoveryProvider p=(IVideoRecoveryProvider)provider;
                    if(request.Operation=="VIDEO_START"){
                        long effective;if(v.cancelled||!request.DiscoveryDeadline(out effective)){RefuseRecoveryCandidate(a,v,"REJECTED");QueueRecovery(a,request,v,false,null,false);return;}
                        object owner=p.VideoReserveFresh(a.token,v.expectedOwner,a.id,v.id,request.TransportId,request.HostEpoch,effective,request.ArtifactId,request.Scid,request.NonceHex,v.media);
                        if(owner==null){RefuseRecoveryCandidate(a,v,"REJECTED");QueueRecovery(a,request,v,false,null,false);return;}
                        lock(gate){v.nativeOwner=owner;v.owned=true;a.videoId=v.id;if(stopping||a.retiring||v.cancelled)v.media.Cancel();}
                        // Even cancellation between native reserve and start must run the registered owner's cleanup path.
                        StoreRecoverySnapshot(v,p.VideoStartReserved(a.token,owner),request);
                    }else if(cleanup){
                        Stopwatch budget=v.stopBudget;
                        for(;;){bool owned;lock(gate)owned=v.owned;if(owned)break;if(v.media.StartDone&&v.startWork!=null&&Done(v.startWork.thread))break;if(budget.ElapsedMilliseconds>=RetirementMilliseconds)throw new IOException("UNRETIRED");Thread.Sleep(1);}
                        if(v.owned)StoreRecoverySnapshot(v,p.VideoStopMedia(a.token,v.id,budget),request);
                    }else StoreRecoverySnapshot(v,p.VideoStatus(a.token,v.id),request);
                    bool clean=v.owned?p.VideoOwnerClean(a.token,v.nativeOwner):v.clean;
                    lock(gate){if(clean){v.clean=true;a.recoveryBudget.Release(v.ordinal);}}
                    QueueRecovery(a,request,v,cleanup,null,v.owned);
                }catch{lock(gate){a.queryRetirementGeneration++;a.terminal=false;a.cleanupIssued=false;}Stop("PROVIDER_FAILED");}
                finally{if(request.Operation=="VIDEO_START"&&v.media!=null)v.media.StartFinished();lock(gate)Monitor.PulseAll(gate);}
            }
            void DispatchRecovery(Request request)
            {
                IVideoRecoveryProvider p=provider as IVideoRecoveryProvider;Attempt a;RecoveryVideo old;object expected=null;bool nativeClean=false;
                lock(gate){a=current;if(p==null||a==null||a.id!=request.AttemptId||a.terminal||(a.videoVersion!=0&&a.videoVersion!=7)){Stop("PROTOCOL_FAILED");return;}old=a.recoveryCurrent;expected=old==null?null:old.nativeOwner;}
                // No provider lock/callback runs while protocol gate is held.
                if(request.Operation=="VIDEO_START")try{nativeClean=p.VideoOwnerClean(a.token,expected);}catch{nativeClean=false;}
                lock(gate){
                    if(stopping||current!=a||a.retiring||a.terminal){Stop("PROTOCOL_FAILED");return;}
                    if(request.Operation=="VIDEO_START"){
                        if(a.recoveryOrdinary!=null||a.recoveryNext>128||request.VideoOrdinal!=a.recoveryNext||a.recoveryVideos.ContainsKey(request.VideoOrdinal)){Stop("PROTOCOL_FAILED");return;}
                        a.recoveryOrdinary=request;a.recoveryNext++;a.videoVersion=7;
                        bool same=Object.ReferenceEquals(old,a.recoveryCurrent);
                        if(same&&nativeClean&&old!=null){old.clean=true;a.recoveryBudget.Release(old.ordinal);}
                        bool uniqueId=a.recoveryIds.Add(request.VideoId),uniqueNonce=a.recoveryNonces.Add(request.NonceHex),uniqueScid=a.recoveryScids.Add(request.Scid);
                        string reason=!uniqueId||!uniqueNonce||!uniqueScid?"REJECTED":request.PreviousVideoId!=a.videoId?"STALE_TARGET":!same||!nativeClean||!RecoveryBarrier(a,old)?"BUSY":null;
                        bool quota;if(!a.recoveryBudget.Charge(request.VideoOrdinal,false,reason==null,out quota)){Stop("PROTOCOL_FAILED");return;}if(quota)reason="QUOTA";
                        VideoMedia media=reason==null?new VideoMedia(session,a.id,request.VideoId,delegate(byte[] b,VideoMedia m,long c,Func<int> r){EnqueueMedia(a,b,m,c,r);}):null;
                        RecoveryVideo v=new RecoveryVideo(request,media,expected);v.previousRecord=old;a.recoveryVideos.Add(v.ordinal,v);
                        if(reason!=null){v.refusal=reason;v.clean=true;QueueRecovery(a,request,v,false,null,false);return;}
                        a.recoveryCurrent=v;a.media=media;StartRecoveryWorker(a,request,v,false);return;
                    }
                    RecoveryVideo target;if(!a.recoveryVideos.TryGetValue(request.VideoOrdinal,out target)||target.id!=request.VideoId){Stop("PROTOCOL_FAILED");return;}
                    bool firstCleanup=request.Operation=="VIDEO_STOP"&&Object.ReferenceEquals(target,a.recoveryCurrent)&&!target.cleanupReceipt&&(!target.clean||target.media!=null&&!target.media.Stopped);
                    if(firstCleanup){target.cleanupReceipt=true;target.cleanupPending=true;target.stopBudget=Stopwatch.StartNew();CancelRecoveryMedia(a,target);StartRecoveryWorker(a,request,target,true);return;}
                    if(request.Operation=="VIDEO_STOP"&&target.cleanupPending||a.recoveryOrdinary!=null){Stop("PROTOCOL_FAILED");return;}
                    a.recoveryOrdinary=request;bool quotaRead;
                    if(!a.recoveryBudget.Charge(target.ordinal,request.Operation=="VIDEO_STATUS",false,out quotaRead)){Stop("PROTOCOL_FAILED");return;}
                    if(quotaRead){QueueRecovery(a,request,target,false,"QUOTA",false);return;}
                    if(target.clean||!target.owned||!Object.ReferenceEquals(target,a.recoveryCurrent)||request.Operation=="VIDEO_STOP"){QueueRecovery(a,request,target,false,null,false);return;}
                    StartRecoveryWorker(a,request,target,false);
                }
            }
            void Worker(Attempt attempt, Request request, bool cleanup, int cleanupGeneration = 0)
            {
                if(!cleanup&&request.Version>=5){VideoWorker(attempt,request);return;}
                if(!cleanup&&(request.Operation=="DISCOVER"||request.Operation=="METADATA"||request.Operation=="INPUT")) { DiscoveryWorker(attempt,request);return; }
                Facts facts;
                try { Progress(ProgressSlot.PROVIDER_ENTERED); facts = Snapshot(cleanup ? provider.Retire(attempt.token) : !server ? provider.Version(attempt.token) : request.Operation == "START" ? provider.StartForeground(attempt.token) : provider.Health(attempt.token), server, cleanup ? "RETIRE" : request.Operation); }
                catch { facts = new Facts("{\"code\":\"UNRETIRED\"}", false); lock (gate) { attempt.terminal = false; Stop("PROVIDER_FAILED"); } }
                lock (gate) { attempt.terminal = facts.terminal && (!cleanup || cleanupGeneration == attempt.queryRetirementGeneration); attempt.live = facts.live && !attempt.retiring; if(cleanup && cleanupGeneration != attempt.queryRetirementGeneration)attempt.cleanupIssued=false; if (!facts.terminal && cleanup) Stop("UNRETIRED"); }
                if (request != null) Enqueue(request, attempt, facts);
                lock (gate) { Monitor.PulseAll(gate); }
            }
            void DiscoveryWorker(Attempt attempt,Request request)
            {
                Facts facts;bool good=false;bool metadata=request.Operation=="METADATA",input=request.Operation=="INPUT";
                try{long effective;if(!request.DiscoveryDeadline(out effective))facts=input?InputFailure("DEADLINE",false):metadata?MetadataFailure("DEADLINE",false):AcquisitionFailure("DEADLINE");else{Progress(ProgressSlot.PROVIDER_ENTERED);facts=input?InputSnapshot(provider.Input(attempt.token,request.TransportId,request.Action,effective),request):metadata?MetadataSnapshot(provider.Metadata(attempt.token,request.TransportId,request.Field,effective),request):AcquisitionSnapshot(provider.Discover(attempt.token,effective),request);good=facts.live;}}
                catch{facts=input?InputFailure("UNRETIRED",true):metadata?MetadataFailure("UNRETIRED",true):new Facts("{\"version\":1,\"kind\":\"ACQUISITION\",\"status\":\"UNRETIRED\",\"code\":\"UNRETIRED\",\"dispatched\":true,\"operationRetired\":false,\"payloadBase64\":null,\"observedAtUtc\":null}",false,false,true);}
                // Query completion never grants terminal custody; late unknown invalidates an older cleanup witness.
                if(facts.queryUnknown)lock(gate){attempt.queryRetirementGeneration++;attempt.terminal=false;attempt.cleanupIssued=false;}
                Enqueue(request,attempt,facts);
                lock(gate){if(!good)Stop("PROVIDER_FAILED");Monitor.PulseAll(gate);}
            }
            void VideoWorker(Attempt attempt,Request request)
            {
                try{IVideoProvider p=provider as IVideoProvider;if(p==null)throw new InvalidDataException();IDictionary<string,object> result;
                    if(request.Operation=="VIDEO_START"){long effective;if(!request.DiscoveryDeadline(out effective))throw new IOException("DEADLINE_EXCEEDED");result=request.Version==6?((IVideoMediaProvider)p).VideoStartMedia(attempt.token,request.AttemptId,request.VideoId,request.TransportId,request.HostEpoch,effective,request.ArtifactId,request.Scid,request.NonceHex,attempt.media):p.VideoStart(attempt.token,request.AttemptId,request.VideoId,request.TransportId,request.HostEpoch,effective,request.ArtifactId,request.Scid,request.NonceHex);}
                    else if(request.Version==6&&request.Operation=="VIDEO_STOP"){Stopwatch wait=Stopwatch.StartNew();while(!attempt.media.OwnerReady&&!attempt.media.StartDone&&wait.ElapsedMilliseconds<RetirementMilliseconds)Thread.Sleep(1);if(!attempt.media.OwnerReady||wait.ElapsedMilliseconds>=RetirementMilliseconds)throw new IOException("UNRETIRED");result=((IVideoMediaProvider)p).VideoStopMedia(attempt.token,request.VideoId,wait);}
                    else result=request.Operation=="VIDEO_STOP"?p.VideoStop(attempt.token,request.VideoId):p.VideoStatus(attempt.token,request.VideoId);
                    Facts facts=VideoSnapshot(result,request);if(facts.queryUnknown)lock(gate){attempt.queryRetirementGeneration++;attempt.terminal=false;attempt.cleanupIssued=false;}
                    Enqueue(request,attempt,facts);if(facts.queryUnknown)Stop("PROVIDER_FAILED");
                }catch{lock(gate){attempt.queryRetirementGeneration++;attempt.terminal=false;attempt.cleanupIssued=false;}Stop("PROVIDER_FAILED");}
                finally{if(request.Version==6&&request.Operation=="VIDEO_START")attempt.media.StartFinished();}
                lock(gate){Monitor.PulseAll(gate);}
            }
            void Cleanup(Attempt attempt, Request request)
            {
                lock (gate) {
                    if (!Done(attempt.cleanup) || (request == null && attempt.cleanupIssued)) { if (request != null) Stop("PROTOCOL_FAILED"); return; }
                    CancelMedia(attempt); attempt.cleanupIssued = true; attempt.retiring = true; attempt.cleanupStarted = elapsed.ElapsedMilliseconds;
                    int cleanupGeneration=attempt.queryRetirementGeneration;
                    attempt.cleanup = new Thread(delegate() { Worker(attempt, request, true, cleanupGeneration); }); attempt.cleanup.IsBackground = true; attempt.cleanup.Start();
                }
            }
            bool ParentAlive() { try { return parentAlive(); } catch { return false; } }
            void StartVersion(Request request)
            {
                if (!ParentAlive()) { lock (gate) { reserving = false; } Stop("PARENT_LOST"); return; }
                object token = null;
                try { token = provider.Reserve(server ? "FOREGROUND" : "VERSION"); if (token == null) throw new InvalidDataException(); }
                catch { lock (gate) { reserving = false; } Stop("PROVIDER_FAILED"); return; }
                bool parentCurrent = ParentAlive();
                lock (gate) {
                    Attempt attempt = new Attempt(request.AttemptId, token); current = attempt; reserving = false;
                    if (!parentCurrent) Stop("PARENT_LOST");
                    if (stopping) { Cleanup(attempt, null); return; }
                    attempt.ordinaryStarted = elapsed.ElapsedMilliseconds;
                    attempt.ordinary = new Thread(delegate() { Worker(attempt, request, false); }); attempt.ordinary.IsBackground = true; attempt.ordinary.Start();
                }
            }
            void DispatchDeferred()
            {
                Request request, retire;
                lock (gate) {
                    if (deferred == null || stopping) return;
                    if (elapsed.ElapsedMilliseconds - deferredStarted >= OperationMilliseconds) { Stop("OPERATION_TIMEOUT"); return; }
                    if (!Available(current)) return;
                    request = deferred; retire = deferredRetire; deferred = null; deferredRetire = null;
                    if (retire == null) reserving = true;
                }
                if (retire == null) StartVersion(request);
                else {
                    Enqueue(request, null, new Facts("{\"code\":\"CLOSED\"}", false));
                    Enqueue(retire, null, new Facts("{\"version\":2,\"kind\":\"INVOCATION\",\"dispatched\":false,\"processRetired\":true,\"exitCode\":null,\"observation\":null}", true));
                }
            }
            void Dispatch(Request request)
            {
                // Immutable scope checked before reservation or provider handoff.
                if (server ? request.Operation == "VERSION" : request.Operation != "VERSION" && request.Operation != "RETIRE") { Stop("OPERATION_REJECTED"); return; }
                if (server) { DispatchServer(request); return; }
                Progress(ProgressSlot.REQUEST_ACCEPTED);
                Attempt attempt;
                lock (gate) {
                    if (stopping) return;
                    attempt = current;
                    if (request.Operation == "RETIRE") {
                        if (deferred != null && deferred.AttemptId == request.AttemptId) {
                            if (deferredRetire != null) { Stop("PROTOCOL_FAILED"); return; }
                            deferredRetire = request; return;
                        }
                        if (attempt == null || attempt.id != request.AttemptId || !Done(attempt.cleanup)) { Stop("PROTOCOL_FAILED"); return; }
                    } else {
                        if (deferred != null || seen.Count >= AttemptLimit || seen.Contains(request.AttemptId)) { Stop("PROTOCOL_FAILED"); return; }
                        if (!Available(attempt)) {
                            if (attempt == null || !attempt.terminal || !attempt.publicationStarted) { Stop("PROTOCOL_FAILED"); return; }
                            seen.Add(request.AttemptId); deferred = request; deferredStarted = elapsed.ElapsedMilliseconds; return;
                        }
                        seen.Add(request.AttemptId); reserving = true;
                    }
                }
                if (request.Operation == "RETIRE") { Cleanup(attempt, request); return; }
                StartVersion(request);
            }
            void DispatchServer(Request request)
            {
                if (!ParentAlive()) { Stop("PARENT_LOST"); return; }
                Progress(ProgressSlot.REQUEST_ACCEPTED);
                if(request.Version==7){DispatchRecovery(request);return;}
                Attempt attempt;
                lock (gate) {
                    if (stopping) return;
                    attempt = current;
                    if (request.Operation == "START") {
                        if (attempt != null || reserving || seen.Count != 0) { Stop("PROTOCOL_FAILED"); return; }
                        seen.Add(request.AttemptId); reserving = true;
                    } else {
                        if (attempt == null || attempt.id != request.AttemptId) { Stop("PROTOCOL_FAILED"); return; }
                        if (request.Operation == "RETIRE") {
                            // Cleanup effects do not wait for output capacity or ordinary completion.
                            Cleanup(attempt, request); return;
                        }
                        if(request.Version>=5){
                            if(attempt.videoVersion==7||!(provider is IVideoProvider)||(request.Version==6&&!(provider is IVideoMediaProvider))||attempt.terminal){Stop("PROTOCOL_FAILED");return;}
                            if(request.Operation=="VIDEO_STOP"){
                                if(attempt.videoId!=request.VideoId||attempt.videoVersion!=request.Version||!Done(attempt.videoCleanup)){Stop("PROTOCOL_FAILED");return;}
                                CancelMedia(attempt);attempt.videoCleanupStarted=elapsed.ElapsedMilliseconds;attempt.videoCleanup=new Thread(delegate(){VideoWorker(attempt,request);});attempt.videoCleanup.IsBackground=true;attempt.videoCleanup.Start();return;
                            }
                            if(attempt.retiring||!attempt.live||!Done(attempt.ordinary)||!Done(attempt.cleanup)||!Done(attempt.videoCleanup)||(request.Version==6?outstanding>1||outstanding==1&&mediaFrame==null&&!writingMedia:outstanding!=0||attempt.frames!=0)||attempt.videoCalls>=128){Stop("PROVIDER_FAILED");return;}
                            if(request.Operation=="VIDEO_START"){if(attempt.videoId!=null){Stop("PROTOCOL_FAILED");return;}attempt.videoId=request.VideoId;attempt.videoVersion=request.Version;if(request.Version==6)attempt.media=new VideoMedia(session,request.AttemptId,request.VideoId,delegate(byte[] b,VideoMedia m,long c,Func<int> r){EnqueueMedia(attempt,b,m,c,r);});}else if(attempt.videoId!=request.VideoId||attempt.videoVersion!=request.Version){Stop("PROTOCOL_FAILED");return;}
                            attempt.videoCalls++;attempt.ordinaryStarted=elapsed.ElapsedMilliseconds;attempt.ordinary=new Thread(delegate(){VideoWorker(attempt,request);});attempt.ordinary.IsBackground=true;attempt.ordinary.Start();return;
                        }
                        if (attempt.retiring || attempt.terminal) { Stop("PROTOCOL_FAILED"); return; }
                        bool discovery=request.Operation=="DISCOVER"||request.Operation=="METADATA"||request.Operation=="INPUT";
                        if (!attempt.live || !Done(attempt.ordinary) || !Done(attempt.cleanup) || outstanding != 0 || attempt.frames != 0 || (discovery ? attempt.discoveryCalls >= 128 : attempt.healthCalls >= 128)) {
                            Enqueue(request, attempt, discovery ? (request.Operation=="INPUT"?InputFailure("BUSY",false):request.Operation=="METADATA"?MetadataFailure("BUSY",false):AcquisitionFailure("BUSY")) : new Facts("{\"code\":\"BUSY\"}", false)); if(discovery)Stop("PROVIDER_FAILED"); return;
                        }
                        if(discovery)attempt.discoveryCalls++;else attempt.healthCalls++;
                        attempt.ordinaryStarted = elapsed.ElapsedMilliseconds;
                        attempt.ordinary = new Thread(delegate() { Worker(attempt, request, false); });
                        attempt.ordinary.IsBackground = true; attempt.ordinary.Start(); return;
                    }
                }
                StartVersion(request);
            }
            void ReadLoop()
            {
                byte[] buffer = new byte[FrameLimit], one = new byte[1]; int count = 0;
                try {
                    for (;;) {
                        DispatchDeferred();
                        lock (gate) { if (stopping) return; }
                        Task<int> pending = input.ReadAsync(one, 0, 1);
                        lock (gate) { readPending = pending; }
                        while (!readPending.Wait(10)) {
                            DispatchDeferred();
                            lock (gate) { if (stopping) return; }
                        }
                        int length = readPending.Result;
                        lock (gate) { readPending = null; }
                        if (length == 0) { lock (gate) { eof = true; Stop(count == 0 && deferred == null ? null : "FRAME_FAILED"); } return; }
                        if (length != 1) { Stop("INPUT_FAILED"); return; }
                        int next = one[0];
                        lock (gate) { if (stopping) return; }
                        if (count == FrameLimit || next > 127 || next == 13) { Stop("FRAME_FAILED"); return; }
                        buffer[count++] = (byte)next;
                        if (next != 10) continue;
                        byte[] frame = new byte[count]; Buffer.BlockCopy(buffer, 0, frame, 0, count); count = 0;
                        string creditAttempt,creditVideo;long credit;int creditOrdinal;
                        if(ParseRecoveryCredit(frame,session,out creditAttempt,out creditVideo,out creditOrdinal,out credit)){
                            lock(gate){RecoveryVideo v;if(!server||current==null||current.id!=creditAttempt||current.videoVersion!=7||!current.recoveryVideos.TryGetValue(creditOrdinal,out v)||v.id!=creditVideo||current.retiring){Stop("PROTOCOL_FAILED");return;}
                                bool ok=v.media==null?!v.owned&&credit==1:v.media.Stopped?v.media.RetiredCredit(credit):Object.ReferenceEquals(current.recoveryCurrent,v)&&v.media.Credit(credit);
                                if(!ok){Stop("PROTOCOL_FAILED");return;}
                            }continue;
                        }
                        if(ParseCredit(frame,session,out creditAttempt,out creditVideo,out credit)){
                            lock(gate){if(!server||current==null||current.id!=creditAttempt||current.videoVersion!=6||current.videoId!=creditVideo||current.media==null||current.retiring||!current.media.Credit(credit)){Stop("PROTOCOL_FAILED");return;}}continue;
                        }
                        Request request = Parse(frame, session, lastRequest);
                        if (request == null) { Stop("FRAME_FAILED"); return; }
                        lastRequest = request.RequestId; Dispatch(request);
                    }
                } catch { Stop("INPUT_FAILED"); }
            }
            void WriteLoop()
            {
                try {
                    for (;;) {
                        Frame frame;
                        lock (gate) {
                            PumpRecovery(current);
                            while (queue.Count == 0 && mediaFrame==null) {
                                if (stopping && !reserving && (current == null || (RecoveryDone(current)&&current.recoveryResponse==null&&current.recoveryCleanupResponse==null&&Done(current.ordinary) && Done(current.cleanup) && Done(current.videoCleanup)))) return;
                                Monitor.Wait(gate, 10);PumpRecovery(current);
                            }
                            if(queue.Count>0)frame=queue.Dequeue();else{frame=mediaFrame;mediaFrame=null;} writeStarted = elapsed.ElapsedMilliseconds;writingMedia=frame.media!=null;
                            if (frame.attempt != null) frame.attempt.publicationStarted = true;
                            // Admission release is not write retirement. Only the selected immutable response
                            // may clear its matching ordinary token; old Flush never clears a newer token.
                            if(frame.recovery!=null&&!frame.recovery.cleanup&&Object.ReferenceEquals(frame.attempt.recoveryOrdinary,frame.recovery.request))frame.attempt.recoveryOrdinary=null;
                        }
                        Progress(ProgressSlot.RESPONSE_WRITE); output.Write(frame.bytes, 0, frame.bytes.Length); output.Flush(); Progress(ProgressSlot.RESPONSE_FLUSH);
                        lock (gate) { writeStarted = -1; writingMedia=false; outstanding--; if (frame.attempt != null) frame.attempt.frames--; if(frame.media!=null)frame.media.Written(frame.credit,true);if(frame.recovery!=null&&frame.recovery.cleanup)frame.recovery.video.cleanupPending=false;PumpRecovery(current); Monitor.PulseAll(gate); }
                    }
                } catch { lock (gate) { writeFailed = true; } Stop("OUTPUT_FAILED"); }
            }
            internal RunResult Run()
            {
                reader = new Thread(ReadLoop); reader.IsBackground = true;
                writer = new Thread(WriteLoop); writer.IsBackground = true;
                writer.Start(); reader.Start();
                for (;;) {
                    bool alive; try { alive = parentAlive(); } catch { alive = false; }
                    if (!alive) Stop("PARENT_LOST");
                    lock (gate) {
                        long now = elapsed.ElapsedMilliseconds;
                        PumpRecovery(current);
                        if(current!=null){foreach(RecoveryWork work in current.recoveryWorkers)if(!Done(work.thread)&&now-work.started>=(work.cleanup?RetirementMilliseconds:OperationMilliseconds))Stop(work.cleanup?"UNRETIRED":"OPERATION_TIMEOUT");
                            if(current.recoveryResponse!=null&&now-current.recoveryResponseStarted>=OperationMilliseconds)Stop("OUTPUT_TIMEOUT");}
                        if (current != null && !Done(current.ordinary) && now - current.ordinaryStarted >= OperationMilliseconds) Stop("OPERATION_TIMEOUT");
                        if (current != null && !Done(current.cleanup) && now - current.cleanupStarted >= RetirementMilliseconds) Stop("RETIREMENT_TIMEOUT");
                        if (current != null && !Done(current.videoCleanup) && now-current.videoCleanupStarted>=RetirementMilliseconds) Stop("RETIREMENT_TIMEOUT");
                        if (writeStarted >= 0 && now - writeStarted >= OperationMilliseconds) Stop("OUTPUT_TIMEOUT");
                        if (deferred != null && now - deferredStarted >= OperationMilliseconds) Stop("OPERATION_TIMEOUT");
                        if (stopping && current != null && !current.terminal && !current.cleanupIssued) Cleanup(current, null);
                        bool workers = !reserving && (current == null || (RecoveryDone(current)&&Done(current.ordinary) && Done(current.cleanup) && Done(current.videoCleanup)));
                        bool native = current == null || current.terminal;
                        if (stopping && Done(reader) && (readPending == null || readPending.IsCompleted) && Done(writer) && workers && native && outstanding == 0 && queue.Count == 0 && mediaFrame==null && !writeFailed && (current==null||current.recoveryResponse==null&&current.recoveryCleanupResponse==null))
                            return new RunResult(eof && failure == null, failure ?? (eof ? "CLOSED" : "INPUT_FAILED"));
                        if (stopping && closeStarted >= 0 && now - closeStarted >= CloseMilliseconds) return new RunResult(false, "UNRETIRED");
                    }
                    Thread.Sleep(10);
                }
            }
        }
        public static RunResult Run(Stream input, Stream output, string sessionId, IProvider provider, Func<bool> parentAlive)
        { return Run(input, output, sessionId, provider, parentAlive, false); }
        public static RunResult Run(Stream input, Stream output, string sessionId, IProvider provider, Func<bool> parentAlive, bool diagnostics)
        {
            return Run(input, output, sessionId, provider, parentAlive, diagnostics, "VERSION_ONLY");
        }
        public static RunResult Run(Stream input, Stream output, string sessionId, IProvider provider, Func<bool> parentAlive, bool diagnostics, string operationSet)
        {
            if (operationSet != "VERSION_ONLY" && operationSet != "SERVER_ONLY") return new RunResult(false, "ADMISSION_REJECTED");
            if (input == null || output == null || !input.CanRead || !output.CanWrite || sessionId == null || !Uuid.IsMatch(sessionId) || provider == null || parentAlive == null)
                return new RunResult(false, "ADMISSION_REJECTED");
            try { return new Reader(input, output, sessionId, provider, parentAlive, diagnostics, operationSet).Run(); }
            catch { return new RunResult(false, "UNRETIRED"); }
        }
    }
}
