// Verification only. Invoke in an isolated, bounded owned Job after source approval.
// Input is only the owned synthetic Electron profile's DPAPI key blob, not user data.
using System;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;

namespace Fonesi.Verification
{
    public static class VaultDpapiContext
    {
        const uint TOKEN_QUERY = 8;
        const int ERROR_NO_TOKEN = 1008;
        const uint CRYPTPROTECT_UI_FORBIDDEN = 1;
        [StructLayout(LayoutKind.Sequential)] struct Blob { public int Length; public IntPtr Data; }
        sealed class Token : SafeHandleZeroOrMinusOneIsInvalid
        {
            public Token() : base(true) { }
            protected override bool ReleaseHandle() { return CloseHandle(handle); }
        }
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool LogonUserW(string user, string domain, string password, int logonType, int provider, out Token token);
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool ImpersonateLoggedOnUser(Token token);
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool RevertToSelf();
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenThreadToken(IntPtr thread, uint access, bool openAsSelf, out Token token);
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out Token token);
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(Token token, int kind, IntPtr buffer, int length, out int required);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertSidToStringSidW(IntPtr sid, out IntPtr text);
        [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll")] static extern IntPtr GetCurrentThread();
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
        [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint exitCode);
        [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool CryptProtectData(ref Blob input, string description, IntPtr entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
        [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool CryptUnprotectData(ref Blob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);

        static void Stop()
        {
            // Never continue owner work on an uncertain impersonation state.
            TerminateProcess(GetCurrentProcess(), 76);
            Environment.Exit(76);
        }
        static string EffectiveSid()
        {
            Token token;
            if (!OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, true, out token))
            {
                int error = Marshal.GetLastWin32Error();
                if (token != null) token.Dispose();
                if (error != ERROR_NO_TOKEN || !OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, out token))
                    throw new InvalidOperationException("TOKEN_QUERY_FAILED");
            }
            using (token)
            {
                int needed;
                GetTokenInformation(token, 1, IntPtr.Zero, 0, out needed); // TokenUser
                if (needed < IntPtr.Size || needed > 4096) throw new InvalidOperationException("TOKEN_QUERY_FAILED");
                IntPtr buffer = Marshal.AllocHGlobal(needed), text = IntPtr.Zero;
                try
                {
                    if (!GetTokenInformation(token, 1, buffer, needed, out needed) ||
                        !ConvertSidToStringSidW(Marshal.ReadIntPtr(buffer), out text))
                        throw new InvalidOperationException("TOKEN_QUERY_FAILED");
                    string sid = Marshal.PtrToStringUni(text);
                    if (sid == null || sid.Length > 184) throw new InvalidOperationException("TOKEN_QUERY_FAILED");
                    return sid;
                }
                finally { if (text != IntPtr.Zero) LocalFree(text); Marshal.FreeHGlobal(buffer); }
            }
        }
        static bool Equal(byte[] left, byte[] right)
        {
            if (left == null || right == null || left.Length != right.Length) return false;
            int difference = 0;
            for (int i = 0; i < left.Length; i++) difference |= left[i] ^ right[i];
            return difference == 0;
        }
        static void Clear(byte[] value) { if (value != null) Array.Clear(value, 0, value.Length); }
        static byte[] Dpapi(byte[] value, bool protect)
        {
            if (value == null || value.Length < 1 || value.Length > 4096) return null;
            Blob input = new Blob { Length = value.Length, Data = Marshal.AllocHGlobal(value.Length) };
            Blob output = new Blob();
            try
            {
                Marshal.Copy(value, 0, input.Data, value.Length);
                bool ok = protect
                    ? CryptProtectData(ref input, null, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, CRYPTPROTECT_UI_FORBIDDEN, out output)
                    : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, CRYPTPROTECT_UI_FORBIDDEN, out output);
                if (!ok) return null;
                if (output.Length < 1 || output.Length > 4096 || output.Data == IntPtr.Zero)
                    throw new InvalidOperationException("PROVIDER_OUTPUT_INVALID");
                byte[] result = new byte[output.Length];
                Marshal.Copy(output.Data, result, 0, result.Length);
                return result;
            }
            finally
            {
                for (int i = 0; i < input.Length; i++) Marshal.WriteByte(input.Data, i, 0);
                Marshal.FreeHGlobal(input.Data);
                if (output.Data != IntPtr.Zero)
                {
                    if (output.Length > 0 && output.Length <= 4096)
                        for (int i = 0; i < output.Length; i++) Marshal.WriteByte(output.Data, i, 0);
                    LocalFree(output.Data);
                }
            }
        }
        static string Report(string status, bool before, bool distinct, bool foreign, bool denied, bool reverted, bool after)
        {
            return "{\"version\":1,\"status\":\"" + status + "\",\"ownerBefore\":" + before.ToString().ToLowerInvariant() +
                ",\"distinctContext\":" + distinct.ToString().ToLowerInvariant() + ",\"foreignPositive\":" + foreign.ToString().ToLowerInvariant() +
                ",\"ownerBlobDenied\":" + denied.ToString().ToLowerInvariant() + ",\"reverted\":" + reverted.ToString().ToLowerInvariant() +
                ",\"ownerAfter\":" + after.ToString().ToLowerInvariant() + "}";
        }
        public static string Run(byte[] ownerDpapiBlob)
        {
            bool before = false, distinct = false, foreign = false, denied = false, reverted = false, after = false;
            string status = "INVALID_INPUT", original = null;
            byte[] blob = null, owner = null, canary = null, protectedCanary = null, foreignPlain = null, foreignOwner = null, ownerAfter = null;
            Token token = null;
            bool impersonating = false;
            try
            {
                if (ownerDpapiBlob == null || ownerDpapiBlob.Length < 32 || ownerDpapiBlob.Length > 4096)
                    return Report(status, false, false, false, false, false, false);
                blob = (byte[])ownerDpapiBlob.Clone();
                original = EffectiveSid();
                if (original == "S-1-5-19") return Report("OWNER_CONTEXT_INVALID", false, false, false, false, false, false);
                owner = Dpapi(blob, false);
                before = owner != null && owner.Length == 32;
                if (!before) return Report("OWNER_PROVIDER_UNAVAILABLE", false, false, false, false, false, false);
                status = "TOKEN_UNAVAILABLE";
                if (!LogonUserW("LocalService", "NT AUTHORITY", null, 5, 0, out token))
                    return Report(status, before, false, false, false, false, false);
                status = "IMPERSONATION_UNAVAILABLE";
                if (!ImpersonateLoggedOnUser(token))
                {
                    try { if (EffectiveSid() != original) Stop(); } catch { Stop(); }
                    return Report(status, before, false, false, false, false, false);
                }
                impersonating = true;
                try
                {
                    distinct = EffectiveSid() == "S-1-5-19" && original != "S-1-5-19";
                    if (!distinct) throw new InvalidOperationException("FOREIGN_IDENTITY_INVALID");
                    canary = new byte[32];
                    using (RandomNumberGenerator random = RandomNumberGenerator.Create()) random.GetBytes(canary);
                    protectedCanary = Dpapi(canary, true);
                    foreignPlain = Dpapi(protectedCanary, false);
                    foreign = Equal(canary, foreignPlain);
                    if (foreign)
                    {
                        foreignOwner = Dpapi(blob, false);
                        denied = foreignOwner == null;
                    }
                }
                finally
                {
                    if (!RevertToSelf()) Stop();
                    impersonating = false;
                    try { reverted = EffectiveSid() == original; } catch { Stop(); }
                    if (!reverted) Stop();
                }
                ownerAfter = Dpapi(blob, false);
                after = Equal(owner, ownerAfter);
                status = before && distinct && foreign && denied && reverted && after ? "PASS" : "CONTROL_FAILED";
            }
            catch { status = "CONTROL_FAILED"; }
            finally
            {
                if (impersonating)
                {
                    if (!RevertToSelf()) Stop();
                    try { if (EffectiveSid() != original) Stop(); } catch { Stop(); }
                }
                if (token != null) token.Dispose();
                Clear(blob); Clear(owner); Clear(canary); Clear(protectedCanary); Clear(foreignPlain); Clear(foreignOwner); Clear(ownerAfter);
            }
            return Report(status, before, distinct, foreign, denied, reverted, after);
        }
    }
}
