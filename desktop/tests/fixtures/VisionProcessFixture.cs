// Owned synthetic lifecycle child only. No devices, network, input authority or shell.
// Compile as a separate executable; do not link its Main into the owner library.
using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Security.Cryptography;
using Fonesi.Development.Vision;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace Fonesi.Development.Vision.Fixture
{
    public static class VisionProcessFixture
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO
        {
            public int cb; public string reserved, desktop, title;
            public uint x, y, width, height, columns, rows, fill, flags;
            public short show, reservedLength; public IntPtr reserved2, input, output, error;
        }
        [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION
        { public IntPtr process, thread; public uint pid, tid; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(
            string image, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit,
            uint flags, IntPtr environment, string directory, ref STARTUPINFO startup, out PROCESS_INFORMATION process);
        [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

        static int Descendant()
        {
            string image;
            using (Process self = Process.GetCurrentProcess()) image = self.MainModule.FileName;
            if (image.IndexOf('"') >= 0) return 72;
            STARTUPINFO info = new STARTUPINFO(); info.cb = Marshal.SizeOf(typeof(STARTUPINFO)); info.flags = 0x100;
            info.input = GetStdHandle(-10); info.output = GetStdHandle(-11); info.error = GetStdHandle(-12);
            PROCESS_INFORMATION child;
            // No breakaway flags: descendant necessarily remains in the parent's non-breakaway Job.
            // Only inherited std handles were admitted to this process by the owner.
            if (!CreateProcess(image, new StringBuilder("\"" + image + "\" Hold"), IntPtr.Zero, IntPtr.Zero,
                true, 0x08000000, IntPtr.Zero, Environment.CurrentDirectory, ref info, out child)) return 73;
            CloseHandle(child.thread); CloseHandle(child.process);
            return 0; // deliberately leave descendant holding output/error pipes
        }
        static int NestedOwnerCrash()
        {
            // Outer owner has already pinned this complete fixture tree. This is not a
            // caller-selectable executable/path service; the nested profile is fixed.
            string root = Environment.GetEnvironmentVariable("FONESI_VISION_ROOT");
            long deadline = Int64.Parse(Environment.GetEnvironmentVariable("FONESI_VISION_DEADLINE_TICKS"), System.Globalization.CultureInfo.InvariantCulture);
            Dictionary<string, string> hashes = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (string path in Directory.GetFiles(Path.Combine(root, "fixture"), "*", SearchOption.AllDirectories)) {
                string relative = path.Substring(root.Length + 1).Replace('\\', '/');
                using (FileStream file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                using (SHA256 hash = SHA256.Create()) hashes.Add(relative, BitConverter.ToString(hash.ComputeHash(file)).Replace("-", "").ToLowerInvariant());
            }
            VisionProcess inner = VisionProcess.Admit(root, VisionProfile.WriteStall, hashes, deadline);
            VisionResult state = inner.Begin(new byte[0]);
            if (state.Status != "RUNNING" || state.Retired) { inner.Cancel(); inner.Reconcile(5000); return 75; }
            // Intentionally NO finally/Cancel: process death closes the inner kill-on-close
            // Job; outer owner must independently prove the entire nested tree has retired.
            Environment.Exit(19);
            return 76;
        }
        static void BoundedEcho()
        {
            using (Stream input = Console.OpenStandardInput())
            using (Stream output = Console.OpenStandardOutput()) {
                byte[] bytes = new byte[4096]; int count, total = 0;
                while ((count = input.Read(bytes, 0, bytes.Length)) != 0) {
                    total += count; if (total > 16781316) throw new IOException("FIXTURE_INPUT_LIMIT");
                    output.Write(bytes, 0, count);
                }
                output.Flush();
            }
        }
        public static int Main(string[] args)
        {
            if (args.Length != 1) return 64;
            try {
                switch (args[0]) {
                    case "Echo": case "CloseFailure": case "AssignFailure": case "QueryFailure": BoundedEcho(); return 0;
                    case "WriteStall": case "TerminationFailure": case "Hold": Thread.Sleep(120000); return 0;
                    case "Oversized":
                        using (Stream output = Console.OpenStandardOutput()) { byte[] bytes = new byte[4096]; for (int i = 0; i < 64; i++) output.Write(bytes, 0, bytes.Length); }
                        return 0;
                    case "StderrOversized":
                        using (Stream error = Console.OpenStandardError()) { byte[] bytes = new byte[4096]; for (int i = 0; i < 64; i++) error.Write(bytes, 0, bytes.Length); }
                        return 0;
                    case "MalformedUtf8":
                        using (Stream output = Console.OpenStandardOutput()) { byte[] bytes = { 0xc0, 0xaf, 0xff }; output.Write(bytes, 0, bytes.Length); }
                        return 0;
                    case "MalformedJson": Console.Write("{\"unterminated\":"); return 0;
                    case "LateOutput": Thread.Sleep(31000); Console.Write("late"); return 0;
                    case "Crash": return 17;
                    case "Descendant": return Descendant();
                    case "NestedOwnerCrash": return NestedOwnerCrash();
                    default: return 65;
                }
            } catch { return 74; }
        }
    }
}
