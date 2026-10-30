// Synthetic subprocess only. Built in an owned temporary directory by the test
// harness using Windows PowerShell 5.1 / .NET Framework; no external packages.
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

public static class NativeFixture
{
    private static void WriteFlood(TextWriter writer, char value)
    {
        // Each stream is > 1 MiB, independently produced on its own thread.
        string block = new string(value, 4096);
        for (int i = 0; i < 512; i++) writer.Write(block);
        writer.WriteLine("\nSTREAM_COMPLETE");
        writer.Flush();
    }

    public static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        string mode = args.Length == 0 ? "stdout" : args[0];
        switch (mode)
        {
            case "stdout":
                Console.Out.WriteLine("synthetic-tool 1.2.3");
                return 0;
            case "stderr":
            case "-version":
                Console.Error.WriteLine("synthetic-java version 21.0-test");
                return 0;
            case "both":
                Console.Out.WriteLine("STDOUT_VERSION 1.2.3");
                Console.Error.WriteLine("STDERR_VERSION 4.5.6");
                return 0;
            case "nonzero":
                Console.Out.WriteLine("NOT_A_SUCCESS_VERSION");
                Console.Error.WriteLine("SYNTHETIC_NONZERO");
                return 23;
            case "empty":
                return 0;
            case "flood":
                Thread output = new Thread(delegate() { WriteFlood(Console.Out, 'O'); });
                Thread error = new Thread(delegate() { WriteFlood(Console.Error, 'E'); });
                output.Start(); error.Start(); output.Join(); error.Join();
                return 0;
            case "argv":
                for (int i = 1; i < args.Length; i++)
                    Console.Out.WriteLine("ARG:" + Convert.ToBase64String(Encoding.UTF8.GetBytes(args[i])));
                return 0;
            case "privacy":
                Console.Out.WriteLine(@"C:\Users\SYNTHETIC_PRIVATE_USER\private\sdk");
                Console.Out.WriteLine(@"\\SYNTHETIC_PRIVATE_HOST\private-share\folder");
                Console.Out.WriteLine("host=synthetic-host.example.invalid ip=192.0.2.77 ipv6=2001:db8::77");
                Console.Out.WriteLine("serial=SYNTHETIC_SERIAL_987654 token=SYNTHETIC_TOKEN_ABC123 password=SYNTHETIC_PASSWORD_987");
                Console.Error.WriteLine("secret=SYNTHETIC_SECRET_XYZ username=SYNTHETIC_PRIVATE_USER");
                return 0;
            case "hang":
                Console.Out.WriteLine("OWNED_ROOT_PID=" + Process.GetCurrentProcess().Id);
                Console.Out.Flush();
                Thread.Sleep(30000);
                return 0;
            case "tree":
            case "orphan":
                ProcessStartInfo start = new ProcessStartInfo();
                start.FileName = Process.GetCurrentProcess().MainModule.FileName;
                start.Arguments = "hang";
                start.UseShellExecute = false;
                start.CreateNoWindow = true;
                using (Process child = Process.Start(start))
                {
                    // Only process IDs of fixture-owned processes are exposed.
                    Console.Out.WriteLine("OWNED_ROOT_PID=" + Process.GetCurrentProcess().Id);
                    Console.Out.WriteLine("OWNED_CHILD_PID=" + child.Id);
                    Console.Out.Flush();
                    if (mode == "tree") Thread.Sleep(30000);
                }
                return 0;
            default:
                Console.Error.WriteLine("SYNTHETIC_UNKNOWN_MODE");
                return 31;
        }
    }
}
