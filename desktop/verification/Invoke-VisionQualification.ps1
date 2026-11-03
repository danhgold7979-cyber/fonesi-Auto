# Development-only native qualification. Source admission is not execution approval.
param([ValidateSet('Compile','Managed','Runtime')][string]$Mode='Compile',[string]$RuntimeRoot='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$report=[ordered]@{version=1;scope=$(if($Mode -ceq 'Compile'){'WINDOWS_VISION_COMPILE_ONLY'}else{'WINDOWS_VISION_DEVELOPMENT_ONLY'});mode=$Mode;compiled=$false;generatedAssemblies=@();compile=@();compilerDiagnostics=@();cases=@();observation=$null;runtime=$null;retired=$true;sourceUnchanged=$false;passed=$false;failure=$null}
$guards=New-Object 'System.Collections.Generic.List[IDisposable]'
$owners=New-Object 'System.Collections.Generic.List[object]'
$runtimeCustody=$null
$before=@{};$root=$null;$failureStage='ADMISSION'
$originalEnvironment=[Environment]::GetEnvironmentVariables('Process')
$utf8=New-Object Text.UTF8Encoding($false,$true)
function HashFile([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function GuardSource([string]$p,[long]$cap){
 $i=Get-Item -LiteralPath $p -Force
 if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -lt 1 -or $i.Length -gt $cap){throw 'SOURCE_REJECTED'}
 $s=New-Object IO.FileStream($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 $script:guards.Add($s);$script:before[$p]=HashFile $p
}
function NativeSummary($r){return [ordered]@{status=$r.Status;retired=$r.Retired;exitCode=$r.ExitCode;stdoutBytes=$r.Stdout.Length;stderrBytes=$r.Stderr.Length;stdoutOverflow=$r.StdoutOverflow;stderrOverflow=$r.StderrOverflow;peakWorkingSetBytes=$r.PeakWorkingSetBytes;elapsedMilliseconds=$r.ElapsedMilliseconds}}
function WaitVision($owner,[byte[]]$bytes,[bool]$cancel=$false){
 $script:lastPending=$null
 $script:owners.Add($owner);$r=$owner.Begin($bytes)
 if($cancel){$r=$owner.Cancel()}
 $clock=[Diagnostics.Stopwatch]::StartNew()
 while(-not $r.Retired -and $clock.ElapsedMilliseconds -lt 35000){
  if($r.Status -match 'UNCERTAIN|UNRETIRED'){break}
  Start-Sleep -Milliseconds 10;$r=$owner.Poll()
 }
 if(-not $r.Retired){
  $script:lastPending=NativeSummary $r
  $unexpected=$null;$busy=$false
  try{$unexpected=[Fonesi.Development.Vision.VisionProcess]::Admit($script:root,[Fonesi.Development.Vision.VisionProfile]::Echo,$script:hashes,[Fonesi.Development.Vision.VisionProcess]::NewDeadline())}
  catch{$busy=$_.Exception.ToString().Contains('SLOT_RESERVED')}
  if($null -ne $unexpected){$script:owners.Add($unexpected);$unexpected.Cancel()|Out-Null;$unexpected.Reconcile(5000)|Out-Null}
  if(-not $busy){throw 'BUSY_CUSTODY_LOST'}
  $r=$owner.Reconcile(5000)
 }
 if(-not $r.Retired){$script:report.retired=$false;throw 'OWNERSHIP_PENDING'}
 return $r
}
function HashTree([string]$tree,[string]$relative,$map){
 $items=@(Get-ChildItem -LiteralPath $tree -Recurse -Force)
 if($items.Count -gt 50000){throw 'INVENTORY_LIMIT'}
 foreach($i in $items){
  if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'INVENTORY_REPARSE'}
  if(-not $i.PSIsContainer){$key=$relative+'/'+$i.FullName.Substring($tree.Length+1).Replace('\','/');$map.Add($key,(HashFile $i.FullName))}
 }
}
function NewRuntimeDirectoryCustody {
 if('Fonesi.Development.Qualification.RuntimeDirectoryCustody' -as [type]){throw 'PRELOADED_RUNTIME_CUSTODY'}
 # Runtime-only harness helper. No candidate assembly is loaded to guard compilation.
 Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
namespace Fonesi.Development.Qualification {
 public sealed class RuntimeDirectoryCustody {
  const string Root = @"D:\a\_temp\fonesi-p4-windows-candidate-v1";
  static readonly List<RuntimeDirectoryCustody> retained = new List<RuntimeDirectoryCustody>();
  readonly List<IntPtr> handles = new List<IntPtr>();
  bool rootHeld, fixtureHeld, compileHeld;
  [StructLayout(LayoutKind.Sequential)] struct Info {
   public uint Attributes;
   public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
   public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CreateFile(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CreateDirectory(string path, IntPtr security);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr handle, out Info info);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern uint GetFinalPathNameByHandle(IntPtr handle, StringBuilder path, uint length, uint flags);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  public RuntimeDirectoryCustody() { retained.Add(this); }
  void Hold(string path) {
   // READ_ATTRIBUTES, READ|WRITE sharing only, OPEN_EXISTING, BACKUP_SEMANTICS|OPEN_REPARSE_POINT.
   IntPtr handle = CreateFile(path, 0x80, 3, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
   if(handle == new IntPtr(-1)) throw new IOException("RUNTIME_DIRECTORY_OPEN");
   handles.Add(handle); // Retain even when validation or later acquisition fails.
   Info info;
   if(!GetFileInformationByHandle(handle, out info) || (info.Attributes & 0x410) != 0x10)
    throw new IOException("RUNTIME_DIRECTORY_REJECTED");
   StringBuilder final = new StringBuilder(32768);
   uint length = GetFinalPathNameByHandle(handle, final, (uint)final.Capacity, 0);
   if(length == 0 || length >= final.Capacity) throw new IOException("RUNTIME_DIRECTORY_PATH");
   string actual = final.ToString();
   if(actual.StartsWith(@"\\?\", StringComparison.Ordinal)) actual = actual.Substring(4);
   if(!String.Equals(actual.TrimEnd('\\'), path.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
    throw new IOException("RUNTIME_DIRECTORY_PATH");
  }
  public void HoldRoot(string root) {
   if(rootHeld || !String.Equals(root, Root, StringComparison.Ordinal)) throw new IOException("RUNTIME_ROOT_REJECTED");
   // Top-down ancestor custody precedes reading inventory or any candidate-root write.
   foreach(string path in new string[] { @"D:\", @"D:\a", @"D:\a\_temp", Root }) Hold(path);
   rootHeld = true;
  }
  public void ReserveFixture() {
   if(!rootHeld || fixtureHeld) throw new IOException("RUNTIME_FIXTURE_STATE");
   string path = Path.Combine(Root, "fixture");
   if(!CreateDirectory(path, IntPtr.Zero)) throw new IOException("RUNTIME_FIXTURE_EXISTS");
   Hold(path);
   if(Directory.GetFileSystemEntries(path).Length != 0) throw new IOException("RUNTIME_FIXTURE_NOT_EMPTY");
   fixtureHeld = true;
  }
  public void ReserveCompile() {
   if(!fixtureHeld || compileHeld) throw new IOException("RUNTIME_COMPILE_STATE");
   Hold(Path.Combine(Root, "work"));
   string path = Path.Combine(Root, "work", "compile");
   if(!CreateDirectory(path, IntPtr.Zero)) throw new IOException("RUNTIME_COMPILE_EXISTS");
   Hold(path);
   if(Directory.GetFileSystemEntries(path).Length != 0) throw new IOException("RUNTIME_COMPILE_NOT_EMPTY");
   compileHeld = true;
  }
  public bool Release() {
   // A failed close retains that exact handle and its ancestors, without blind disposal.
   for(int i = handles.Count - 1; i >= 0; i--) {
    if(!CloseHandle(handles[i])) return false;
    handles.RemoveAt(i);
   }
   retained.Remove(this); return true;
  }
 }
}
'@
 return New-Object Fonesi.Development.Qualification.RuntimeDirectoryCustody
}
function AssertRuntimeFixture([string]$directory){
 # A separate same-run harness layer, never an installed-inventory namespace.
 $item=Get-Item -LiteralPath $directory -Force
 if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'FIXTURE_DIRECTORY_REJECTED'}
 $entries=@(Get-ChildItem -LiteralPath $directory -Force)
 if($entries.Count -ne 2){throw 'FIXTURE_INVENTORY_REJECTED'}
 foreach($entry in $entries){
  if($entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $entry.Name -cnotin @('VisionProcess.dll','VisionProcessFixture.exe')){throw 'FIXTURE_INVENTORY_REJECTED'}
  if(-not $script:before.ContainsKey($entry.FullName) -or (HashFile $entry.FullName) -cne $script:before[$entry.FullName]){throw 'FIXTURE_HASH_REJECTED'}
 }
 # Source, compiler, references and generated outputs remain held through use.
 foreach($p in $script:before.Keys){if((HashFile $p) -cne $script:before[$p]){throw 'FIXTURE_INPUT_CHANGED'}}
}
function Compiler([string[]]$arguments){
 # Reject incomplete option tokens before launching the fixed compiler.
 foreach($argument in $arguments){if([string]::IsNullOrWhiteSpace($argument) -or $argument -cin @('/out:','/reference:')){throw 'COMPILER_ARGUMENT_REJECTED'}}
 if(@($arguments|Where-Object{$_.StartsWith('/out:',[StringComparison]::Ordinal)}).Count -ne 1){throw 'COMPILER_ARGUMENT_REJECTED'}
 $script:report.retired=$false
 $r=[Fonesi.Phase00.NativeProbe]::Run($script:compiler,$arguments,30000,10000,16384)
 $script:report.retired=$r.CleanupComplete
 $script:report.compile+=@([ordered]@{status=$r.Status;exitCode=$r.ExitCode;retired=$r.CleanupComplete;stdoutTruncated=$r.StdoutTruncated;stderrTruncated=$r.StderrTruncated})
 foreach($match in [regex]::Matches($r.Stdout+' '+$r.Stderr,'\berror (CS[0-9]{4})\b')){if($script:report.compilerDiagnostics.Count -lt 16){$script:report.compilerDiagnostics+=@($match.Groups[1].Value)}}
 if(-not $r.CleanupComplete -or $r.ExitCode -ne 0 -or $r.StdoutTruncated -or $r.StderrTruncated -or $r.Status -cnotin @('SUCCESS','EMPTY_OUTPUT')){throw 'COMPILATION_FAILED'}
}
try {
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitProcess){throw 'WINDOWS_X64_REQUIRED'}
 foreach($key in @('NODE_PATH','NODE_OPTIONS','ESBUILD_BINARY_PATH')){if(Test-Path ('Env:'+ $key)){throw 'OVERRIDE_REJECTED'}}
 $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
 GuardSource $helper 1048576
 if($before[$helper] -cne 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'){throw 'HELPER_CHANGED'}
 if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED_HELPER'}
 Add-Type -Path $helper
 $native=Join-Path $desktop 'native/VisionProcess.cs';$fixture=Join-Path $desktop 'tests/fixtures/VisionProcessFixture.cs'
 $bootstrap=Join-Path $desktop 'native/VisionBootstrapProcess.cs'
 $materializer=Join-Path $desktop 'verification/Invoke-VisionMaterialization.ps1'
 $transportTests=Join-Path $desktop 'verification/Test-VisionMaterializationTransport.ps1'
 GuardSource $materializer 1048576;GuardSource $transportTests 1048576
 & $transportTests
 GuardSource $native 1048576;GuardSource $bootstrap 1048576;GuardSource $fixture 1048576;GuardSource $PSCommandPath 1048576
 $framework=Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319'
 $script:compiler=Join-Path $framework 'csc.exe';GuardSource $compiler 8388608
 $refs=@('mscorlib.dll','System.dll','System.Core.dll')|ForEach-Object{$p=Join-Path $framework $_;GuardSource $p 33554432;$p}
 # Canonicalize the test-owned TEMP parent once, not by weakening product guards.
 $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe';GuardSource $node 134217728
 if($before[$node] -cne 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_REJECTED'}
 $gate=Join-Path $desktop 'scripts/vision-qualification.mjs';GuardSource $gate 65536
 $report.retired=$false
 $gateResult=[Fonesi.Phase00.NativeProbe]::Run($node,@($gate,$Mode.ToLowerInvariant()),10000,5000,4096)
 $report.retired=$gateResult.CleanupComplete
 if(-not $gateResult.CleanupComplete -or $gateResult.ExitCode -ne 0 -or $gateResult.StdoutTruncated -or $gateResult.StderrTruncated -or $gateResult.Stdout.Trim() -cne 'WINDOWS_VISION_SOURCE_ADMISSION_PASS'){throw 'SOURCE_BUILD_REJECTED'}
 $report.retired=$false
 $canonical=[Fonesi.Phase00.NativeProbe]::Run($node,@('-e','process.stdout.write(require("node:fs").realpathSync.native(require("node:os").tmpdir()))'),5000,5000,4096)
 $report.retired=$canonical.CleanupComplete
 if(-not $canonical.CleanupComplete -or $canonical.ExitCode -ne 0 -or $canonical.StdoutTruncated -or $canonical.StderrTruncated -or $canonical.Stderr -cne ''){throw 'TEMP_CANONICALIZATION_FAILED'}
 $parent=$canonical.Stdout.TrimEnd('\')
 if($parent -cne [IO.Path]::GetFullPath($parent) -or $parent.StartsWith('\\') -or $parent.Contains("`n") -or $parent.Contains("`r")){throw 'TEMP_REJECTED'}
 if($Mode -cin @('Compile','Managed')){
  if($RuntimeRoot -cne ''){throw 'ARGUMENT_REJECTED'}
  $root=Join-Path $parent ('fonesi-vision-native-'+[guid]::NewGuid().ToString())
  [Fonesi.Phase00.NativeProbe]::ReserveDirectory($root)
  foreach($name in @('fixture','work')){[Fonesi.Phase00.NativeProbe]::ReserveDirectory((Join-Path $root $name))}
 }else{
  if($RuntimeRoot -ceq ''){throw 'RUNTIME_ROOT_REQUIRED'}
  $root=[IO.Path]::GetFullPath($RuntimeRoot)
  $candidate=Get-Content -LiteralPath (Join-Path $desktop 'vision/windows_qualification_manifest.json') -Raw|ConvertFrom-Json
  if($null -eq $candidate.approvedInstalledInventorySha256 -or -not $candidate.prerequisitesVerifiedOnHost){throw 'RUNTIME_NOT_ADMITTED'}
  $runtimeCustody=NewRuntimeDirectoryCustody
  $runtimeCustody.HoldRoot($root)
  $inventoryPath=Join-Path $root 'installed-inventory.json'
  GuardSource $inventoryPath 16777216
  if((HashFile $inventoryPath) -cne $candidate.approvedInstalledInventorySha256){throw 'RUNTIME_INVENTORY_REJECTED'}
  $inventory=Get-Content -LiteralPath $inventoryPath -Raw|ConvertFrom-Json
  if($inventory.version -ne 1 -or $inventory.files.Count -gt 50000 -or $inventory.runtimeBytes -lt 1){throw 'INVENTORY_SCHEMA'}
  $runtimeHashes=New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal)
  foreach($entry in $inventory.files){
   if($entry.path -cnotmatch '^(python|preprocess-runtime|ocr-runtime|source|tooling|model)/' -or $entry.path.Contains('..') -or $entry.sha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'INVENTORY_SCHEMA'}
   $runtimeHashes.Add([string]$entry.path,[string]$entry.sha256)
  }
  # No existing fixture tree is adopted. Reserve only after held inventory admission.
  $runtimeCustody.ReserveFixture()
 }
 $failureStage='COMPILE'
 $systemRoot=[IO.Path]::GetFullPath($env:SystemRoot)
 $compileTemp=Join-Path $root 'work/compile'
 if($Mode -ceq 'Runtime'){$runtimeCustody.ReserveCompile()}else{[Fonesi.Phase00.NativeProbe]::ReserveDirectory($compileTemp)}
 foreach($key in @($originalEnvironment.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
 foreach($pair in @(@('SystemRoot',$systemRoot),@('WINDIR',$systemRoot),@('PATH',(Join-Path $systemRoot 'System32')),@('TEMP',$compileTemp),@('TMP',$compileTemp))){[Environment]::SetEnvironmentVariable($pair[0],$pair[1],'Process')}

 $dll=Join-Path $root 'fixture/VisionProcess.dll';$exe=Join-Path $root 'fixture/VisionProcessFixture.exe'
 $common=@('/nologo','/noconfig','/nostdlib+','/platform:x64','/optimize+')+@($refs|ForEach-Object{'/reference:'+$_})
 Compiler ($common+@('/target:library',('/out:'+$dll),$native,$bootstrap))
 GuardSource $dll 1048576
 Compiler ($common+@('/target:exe',('/out:'+$exe),('/reference:'+$dll),$fixture))
 GuardSource $exe 1048576
 if($Mode -ceq 'Runtime'){AssertRuntimeFixture (Join-Path $root 'fixture')}
 $report.generatedAssemblies=@([ordered]@{name='VisionProcess.dll';sha256=$before[$dll]},[ordered]@{name='VisionProcessFixture.exe';sha256=$before[$exe]})
 $report.compiled=$true
 if($Mode -cne 'Compile'){
 if('Fonesi.Development.Vision.VisionProcess' -as [type]){throw 'PRELOADED_VISION_OWNER'}
 Add-Type -Path $dll
 $hashes=New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal)
 if($Mode -ceq 'Managed'){
  # Empty regular files exist in the real patched interpreter and must hash-admit.
  [IO.File]::WriteAllBytes((Join-Path $root 'fixture/empty'),(New-Object byte[] 0))
  HashTree (Join-Path $root 'fixture') 'fixture' $hashes
  if($hashes['fixture/empty'] -cne 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'){throw 'EMPTY_HASH'}
  $failureStage='NATIVE_CASES'
  foreach($name in @('Echo','WriteStall','Oversized','StderrOversized','MalformedUtf8','MalformedJson','LateOutput','Crash','Descendant','NestedOwnerCrash','AssignFailure','QueryFailure','TerminationFailure','CloseFailure')){
   $profile=[Enum]::Parse([Fonesi.Development.Vision.VisionProfile],$name)
   $deadline=if($name -ceq 'LateOutput'){[Diagnostics.Stopwatch]::GetTimestamp()+[Diagnostics.Stopwatch]::Frequency}else{[Fonesi.Development.Vision.VisionProcess]::NewDeadline()}
   $owned=[Fonesi.Development.Vision.VisionProcess]::Admit($root,$profile,$hashes,$deadline)
   $payload=if($name -ceq 'WriteStall'){New-Object byte[] 1048576}elseif($name -ceq 'Echo'){[byte[]](1,2,3,4)}else{New-Object byte[] 0}
   $r=WaitVision $owned $payload ($name -cin @('WriteStall','TerminationFailure'))
   $case=[ordered]@{name=$name;proof=$(if($name -cin @('MalformedUtf8','MalformedJson')){'RAW_BYTE_TRANSPORT_ONLY'}else{'NATIVE_OWNERSHIP'});native=(NativeSummary $r);pendingBeforeReconcile=$script:lastPending;passed=$false}
   switch($name){
    'Echo'{$case.passed=($r.Status -ceq 'SUCCESS' -and $r.ExitCode -eq 0 -and [Convert]::ToBase64String($r.Stdout) -ceq 'AQIDBA==')}
    'WriteStall'{$case.passed=($r.Status -cin @('CANCELLED','PIPE_FAILED'))}
    'Oversized'{$case.passed=($r.Status -ceq 'OUTPUT_LIMIT' -and $r.StdoutOverflow)}
    'StderrOversized'{$case.passed=($r.Status -ceq 'OUTPUT_LIMIT' -and $r.StderrOverflow)}
    'MalformedUtf8'{$case.passed=($r.Status -ceq 'SUCCESS' -and [Convert]::ToBase64String($r.Stdout) -ceq 'wK//')}
    'MalformedJson'{$case.passed=($r.Status -ceq 'SUCCESS' -and $utf8.GetString($r.Stdout) -ceq '{"unterminated":')}
    'LateOutput'{$case.passed=($r.Status -ceq 'TIMEOUT' -and $r.Stdout.Length -eq 0)}
    'Crash'{$case.passed=($r.Status -ceq 'NONZERO_EXIT' -and $r.ExitCode -eq 17)}
    'Descendant'{$case.passed=($r.Status -ceq 'DESCENDANT_UNRETIRED')}
    'NestedOwnerCrash'{$case.passed=($r.Status -cin @('NONZERO_EXIT','DESCENDANT_UNRETIRED') -and $r.ExitCode -eq 19)}
    'AssignFailure'{$case.passed=($r.Status -ceq 'LAUNCH_FAILED')}
    'QueryFailure'{$case.passed=($null -ne $script:lastPending -and $script:lastPending.status -ceq 'JOB_QUERY_UNCERTAIN')}
    'TerminationFailure'{$case.passed=($null -ne $script:lastPending -and $script:lastPending.status -ceq 'TERMINATION_UNCERTAIN')}
    'CloseFailure'{$case.passed=($null -ne $script:lastPending -and $script:lastPending.status -ceq 'HANDLE_CLOSE_UNCERTAIN')}
   }
   $report.cases+=@($case)
   if(-not $case.passed){throw 'NATIVE_CASE_FAILED'}
  }
  [IO.File]::WriteAllBytes((Join-Path $root 'fixture/empty'),[byte[]](1))
  $tampered=$null;$rejected=$false
  try{$tampered=[Fonesi.Development.Vision.VisionProcess]::Admit($root,[Fonesi.Development.Vision.VisionProfile]::Echo,$hashes,[Fonesi.Development.Vision.VisionProcess]::NewDeadline())}catch{$rejected=$true}
  if($null -ne $tampered){$owners.Add($tampered);$tampered.Cancel()|Out-Null;$tampered.Reconcile(5000)|Out-Null}
  if(-not $rejected){throw 'EMPTY_TAMPER_ACCEPTED'}
  $report.cases+=@([ordered]@{name='EmptyFileTamper';passed=$true})
 }else{
  $failureStage='RUNTIME_PIPELINE'
  # Merge only the exact held outputs of this invocation, not a recursively discovered tree.
  AssertRuntimeFixture (Join-Path $root 'fixture')
  foreach($entry in $runtimeHashes.GetEnumerator()){$hashes.Add($entry.Key,$entry.Value)}
  $hashes.Add('fixture/VisionProcess.dll',$before[$dll])
  $hashes.Add('fixture/VisionProcessFixture.exe',$before[$exe])
  $deadline=[Fonesi.Development.Vision.VisionProcess]::NewDeadline();$clock=[Diagnostics.Stopwatch]::StartNew();$bytes=New-Object byte[] 0
  foreach($name in @('Decoder','Preprocess','OcrRequest','English','OcrResult')){
   $profile=[Enum]::Parse([Fonesi.Development.Vision.VisionProfile],$name)
   $r=WaitVision ([Fonesi.Development.Vision.VisionProcess]::Admit($root,$profile,$hashes,$deadline)) $bytes
   $report.cases+=@([ordered]@{name=$name;native=(NativeSummary $r);passed=($r.Status -ceq 'SUCCESS')})
   if($r.Status -cne 'SUCCESS'){throw 'PIPELINE_UNAVAILABLE'}
   $bytes=$r.Stdout
  }
  $observed=$utf8.GetString($bytes)|ConvertFrom-Json
  if($observed.version -ne 2 -or $observed.memoryKind -cne 'WINDOWS_PEAK_WORKING_SET' -or $observed.capability -cne 'UNQUALIFIED'){throw 'CONSUMER_REJECTED'}
  $observed.row.endToEndLatencyMs=$clock.Elapsed.TotalMilliseconds
  $payload=[ordered]@{version=2;scope='EVALUATION_ONLY';memoryKind='WINDOWS_PEAK_WORKING_SET';runtimeSha256=$candidate.approvedInstalledInventorySha256;modelSha256=$observed.modelSha256;installedBytes=$inventory.runtimeBytes;modelBytes=7993991;rows=@($observed.row)}
  $deadline=[Fonesi.Development.Vision.VisionProcess]::NewMetricsDeadline()
  $r=WaitVision ([Fonesi.Development.Vision.VisionProcess]::Admit($root,[Fonesi.Development.Vision.VisionProfile]::Metrics,$hashes,$deadline)) ($utf8.GetBytes(($payload|ConvertTo-Json -Depth 6 -Compress)))
  if($r.Status -cne 'SUCCESS'){throw 'METRICS_UNAVAILABLE'}
  $metrics=$utf8.GetString($r.Stdout)|ConvertFrom-Json
  if($metrics.qualification -cne 'UNQUALIFIED' -or $metrics.summary.attempts -ne 1){throw 'METRICS_REJECTED'}
  $report.observation=$observed
  $report.runtime=$metrics
  # Exit zero is transport success, never recognition availability or accuracy.
  if($observed.row.status -cne 'TEXT'){$failureStage='OCR_SMOKE_UNAVAILABLE';throw 'OCR_SMOKE_UNAVAILABLE'}
 }
 } # Compile-only never loads/invokes the generated owner or fixture assembly.
 $report.sourceUnchanged=$true
 foreach($p in $before.Keys){if((HashFile $p) -cne $before[$p]){$report.sourceUnchanged=$false}}
 $report.passed=($report.sourceUnchanged -and $report.retired)
}catch{$report.failure=$failureStage}
finally{
 foreach($owned in $owners){
  try{$r=$owned.Poll();if(-not $r.Retired){$owned.Cancel()|Out-Null;$r=$owned.Reconcile(5000)};if(-not $r.Retired){$report.retired=$false;$report.passed=$false}}catch{$report.retired=$false;$report.passed=$false}
 }
 if($null -ne $runtimeCustody){
  if($report.retired){try{if(-not $runtimeCustody.Release()){$report.retired=$false;$report.passed=$false}}catch{$report.retired=$false;$report.passed=$false}}
  else{$report.passed=$false} # Keep directory custody while a child may still be live.
 }
 foreach($g in $guards){$g.Dispose()}
 $current=[Environment]::GetEnvironmentVariables('Process')
 foreach($key in @($current.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
 foreach($key in $originalEnvironment.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$originalEnvironment[$key],'Process')}
 # Preserve all roots/evidence, especially unknown retirement. No recursive deletion.
}
Write-Output ($report|ConvertTo-Json -Depth 20 -Compress)
if($report.passed){if($Mode -ceq 'Compile'){Write-Output 'WINDOWS_VISION_COMPILE_PASS'}else{Write-Output 'WINDOWS_VISION_QUALIFICATION_PASS'};exit 0}
Write-Output 'WINDOWS_VISION_QUALIFICATION_FAIL';exit 1
