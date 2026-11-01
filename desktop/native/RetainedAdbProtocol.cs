// Fixed private VERSION_ONLY reader. Compile with unchanged IsolatedAdbServer/RetainedAdbSession.
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
        static readonly string[] Errors = { "ADMISSION_REJECTED", "BINARY_CHANGED", "PROFILE_REJECTED", "ENDPOINT_REJECTED", "BUSY", "CLOSED", "NATIVE_FAILED", "UNRETIRED" };
        public interface IProvider
        {
            object Reserve(string kind);
            IDictionary<string, object> Version(object attempt);
            IDictionary<string, object> Retire(object attempt);
        }
        public sealed class NativeProvider : IProvider
        {
            readonly IsolatedAdbServer.RetainedProvider provider;
            public NativeProvider(IsolatedAdbServer.RetainedProvider provider)
            { if (provider == null) throw new ArgumentException("ADMISSION_REJECTED"); this.provider = provider; }
            public object Reserve(string kind)
            { if (kind != "VERSION") throw new ArgumentException("ADMISSION_REJECTED"); return provider.Reserve("VERSION"); }
            public IDictionary<string, object> Version(object attempt)
            { return provider.Version(attempt as IsolatedAdbServer.RetainedProvider.Attempt).Snapshot(); }
            public IDictionary<string, object> Retire(object attempt)
            { return provider.Retire(attempt as IsolatedAdbServer.RetainedProvider.Attempt).Snapshot(); }
        }
        public sealed class Request
        {
            public readonly string SessionId, AttemptId, Operation;
            public readonly long RequestId;
            internal Request(string session, long request, string attempt, string operation)
            { SessionId = session; RequestId = request; AttemptId = attempt; Operation = operation; }
        }
        public static Request Parse(byte[] frame, string sessionId, long previousRequestId)
        {
            if (frame == null || frame.Length < 2 || frame.Length > FrameLimit || sessionId == null || !Uuid.IsMatch(sessionId)) return null;
            for (int n = 0; n < frame.Length; n++) if (frame[n] > 127 || frame[n] == 13 || (frame[n] == 10 && n != frame.Length - 1)) return null;
            Match m = RequestPattern.Match(Encoding.ASCII.GetString(frame)); long request;
            if (!m.Success || m.Groups[1].Value != sessionId || !Uuid.IsMatch(m.Groups[3].Value) ||
                !Int64.TryParse(m.Groups[2].Value, NumberStyles.None, CultureInfo.InvariantCulture, out request) || request <= previousRequestId || request > SafeInteger) return null;
            return new Request(sessionId, request, m.Groups[3].Value, m.Groups[4].Value);
        }
        public sealed class RunResult
        {
            public readonly bool Clean;
            public readonly string Code;
            internal RunResult(bool clean, string code) { Clean = clean; Code = code; }
        }
        sealed class Attempt
        {
            internal readonly string id; internal readonly object token;
            internal Thread ordinary, cleanup;
            internal bool terminal, cleanupIssued, retiring, publicationStarted;
            internal int frames;
            internal long ordinaryStarted, cleanupStarted;
            internal Attempt(string id, object token) { this.id = id; this.token = token; }
        }
        sealed class Frame
        {
            internal readonly byte[] bytes; internal readonly Attempt attempt;
            internal Frame(byte[] bytes, Attempt attempt) { this.bytes = bytes; this.attempt = attempt; }
        }
        sealed class Facts
        {
            internal readonly string json; internal readonly bool terminal;
            internal Facts(string json, bool terminal) { this.json = json; this.terminal = terminal; }
        }
        static Facts Snapshot(IDictionary<string, object> input)
        {
            if (input == null) throw new InvalidDataException();
            Dictionary<string, object> v = new Dictionary<string, object>();
            foreach (KeyValuePair<string, object> pair in input) { if (v.Count == 6 || v.ContainsKey(pair.Key)) throw new InvalidDataException(); v.Add(pair.Key, pair.Value); }
            if (v.Count == 1 && v.ContainsKey("code") && v["code"] is string && Array.IndexOf(Errors, (string)v["code"]) >= 0)
                return new Facts("{\"code\":\"" + (string)v["code"] + "\"}", false);
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
        sealed class Reader
        {
            readonly object gate = new object();
            readonly Stream input, output;
            readonly string session;
            readonly IProvider provider;
            readonly Func<bool> parentAlive;
            readonly Queue<Frame> queue = new Queue<Frame>();
            readonly HashSet<string> seen = new HashSet<string>(StringComparer.Ordinal);
            readonly Stopwatch elapsed = Stopwatch.StartNew();
            Thread reader, writer;
            Task<int> readPending;
            Request deferred, deferredRetire;
            long deferredStarted;
            Attempt current;
            bool stopping, eof, reserving, writeFailed;
            string failure;
            long closeStarted = -1, writeStarted = -1, lastRequest;
            int outstanding;
            internal Reader(Stream input, Stream output, string session, IProvider provider, Func<bool> parentAlive)
            { this.input = input; this.output = output; this.session = session; this.provider = provider; this.parentAlive = parentAlive; }
            void Stop(string code)
            {
                lock (gate) { stopping = true; if (code != null && failure == null) failure = code; if (closeStarted < 0) closeStarted = elapsed.ElapsedMilliseconds; Monitor.PulseAll(gate); }
            }
            static bool Done(Thread thread) { return thread == null || ((thread.ThreadState & System.Threading.ThreadState.Unstarted) == 0 && thread.Join(0)); }
            bool Available(Attempt attempt) { return outstanding == 0 && (attempt == null || (attempt.terminal && Done(attempt.ordinary) && Done(attempt.cleanup) && attempt.frames == 0)); }
            void Enqueue(Request request, Attempt attempt, Facts facts)
            {
                string raw = "{\"version\":1,\"sessionId\":\"" + session + "\",\"requestId\":" + request.RequestId.ToString(CultureInfo.InvariantCulture) +
                    ",\"attemptId\":\"" + request.AttemptId + "\",\"operation\":\"" + request.Operation + "\",\"result\":" + facts.json + "}\n";
                byte[] bytes = Encoding.ASCII.GetBytes(raw);
                lock (gate) {
                    if (bytes.Length > FrameLimit || outstanding >= OutputLimit || writeFailed) { Stop("OUTPUT_FAILED"); return; }
                    outstanding++; if (attempt != null) attempt.frames++; queue.Enqueue(new Frame(bytes, attempt)); Monitor.PulseAll(gate);
                }
            }
            void Worker(Attempt attempt, Request request, bool cleanup)
            {
                Facts facts;
                try { facts = Snapshot(cleanup ? provider.Retire(attempt.token) : provider.Version(attempt.token)); }
                catch { facts = new Facts("{\"code\":\"UNRETIRED\"}", false); lock (gate) { attempt.terminal = false; Stop("PROVIDER_FAILED"); } }
                lock (gate) { attempt.terminal = facts.terminal; if (!facts.terminal && cleanup) Stop("UNRETIRED"); }
                if (request != null) Enqueue(request, attempt, facts);
                lock (gate) { Monitor.PulseAll(gate); }
            }
            void Cleanup(Attempt attempt, Request request)
            {
                lock (gate) {
                    if (!Done(attempt.cleanup) || (request == null && attempt.cleanupIssued)) { if (request != null) Stop("PROTOCOL_FAILED"); return; }
                    attempt.cleanupIssued = true; attempt.retiring = true; attempt.cleanupStarted = elapsed.ElapsedMilliseconds;
                    attempt.cleanup = new Thread(delegate() { Worker(attempt, request, true); }); attempt.cleanup.IsBackground = true; attempt.cleanup.Start();
                }
            }
            bool ParentAlive() { try { return parentAlive(); } catch { return false; } }
            void StartVersion(Request request)
            {
                if (!ParentAlive()) { lock (gate) { reserving = false; } Stop("PARENT_LOST"); return; }
                object token = null;
                try { token = provider.Reserve("VERSION"); if (token == null) throw new InvalidDataException(); }
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
                // Fixed bootstrap scope; START/HEALTH rejected before Reserve or provider handoff.
                if (request.Operation != "VERSION" && request.Operation != "RETIRE") { Stop("OPERATION_REJECTED"); return; }
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
                            while (queue.Count == 0) {
                                if (stopping && !reserving && (current == null || (Done(current.ordinary) && Done(current.cleanup)))) return;
                                Monitor.Wait(gate, 10);
                            }
                            frame = queue.Dequeue(); writeStarted = elapsed.ElapsedMilliseconds;
                            if (frame.attempt != null) frame.attempt.publicationStarted = true;
                        }
                        output.Write(frame.bytes, 0, frame.bytes.Length); output.Flush();
                        lock (gate) { writeStarted = -1; outstanding--; if (frame.attempt != null) frame.attempt.frames--; Monitor.PulseAll(gate); }
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
                        if (current != null && !Done(current.ordinary) && now - current.ordinaryStarted >= OperationMilliseconds) Stop("OPERATION_TIMEOUT");
                        if (current != null && !Done(current.cleanup) && now - current.cleanupStarted >= RetirementMilliseconds) Stop("RETIREMENT_TIMEOUT");
                        if (writeStarted >= 0 && now - writeStarted >= OperationMilliseconds) Stop("OUTPUT_TIMEOUT");
                        if (deferred != null && now - deferredStarted >= OperationMilliseconds) Stop("OPERATION_TIMEOUT");
                        if (stopping && current != null && !current.terminal && !current.cleanupIssued) Cleanup(current, null);
                        bool workers = !reserving && (current == null || (Done(current.ordinary) && Done(current.cleanup)));
                        bool native = current == null || current.terminal;
                        if (stopping && Done(reader) && (readPending == null || readPending.IsCompleted) && Done(writer) && workers && native && outstanding == 0 && queue.Count == 0 && !writeFailed)
                            return new RunResult(eof && failure == null, failure ?? (eof ? "CLOSED" : "INPUT_FAILED"));
                        if (stopping && closeStarted >= 0 && now - closeStarted >= CloseMilliseconds) return new RunResult(false, "UNRETIRED");
                    }
                    Thread.Sleep(10);
                }
            }
        }
        public static RunResult Run(Stream input, Stream output, string sessionId, IProvider provider, Func<bool> parentAlive)
        {
            if (input == null || output == null || !input.CanRead || !output.CanWrite || sessionId == null || !Uuid.IsMatch(sessionId) || provider == null || parentAlive == null)
                return new RunResult(false, "ADMISSION_REJECTED");
            try { return new Reader(input, output, sessionId, provider, parentAlive).Run(); }
            catch { return new RunResult(false, "UNRETIRED"); }
        }
    }
}
