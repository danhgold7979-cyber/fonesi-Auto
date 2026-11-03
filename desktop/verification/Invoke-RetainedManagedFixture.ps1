# Separate managed execution campaign; historical compile-only entry is unchanged.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$owner=$null;$retired=$true;$stage='ADMISSION';$sourceBefore=@{}
$report=[ordered]@{version=7;scope='RETAINED_PROTOCOL_MANAGED_FIXTURE_ONLY';compileProcess=$null;fixtureProcess=$null;groupsPassed=0;compilerDiagnostics=@();sourceUnchanged=$false;inputHashes=[ordered]@{};directoryCleanup=$false;passed=$false}
function PlainFile([string]$path,[long]$limit){
 $i=Get-Item -LiteralPath $path -Force
 if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -lt 1 -or $i.Length -gt $limit -or $i.FullName -cne [IO.Path]::GetFullPath($path)){throw 'FILE_REJECTED'}
}
function Evidence($p){return [ordered]@{status=$p.Status;exitCode=$p.ExitCode;cleanupComplete=$p.CleanupComplete;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated}}
function Retired($p){return ($p.CleanupComplete -and $null -ne $p.ExitCode -and $p.Status -cin @('SUCCESS','EMPTY_OUTPUT','NONZERO_EXIT'))}
function Successful($p){return ((Retired $p) -and $p.ExitCode -eq 0 -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Status -cin @('SUCCESS','EMPTY_OUTPUT'))}
function Run-Fixed([string]$exe,[string[]]$arguments,[int]$deadline){
 $script:retired=$false
 $p=[Fonesi.Phase00.NativeProbe]::Run($exe,$arguments,$deadline,10000,32768)
 $script:retired=Retired $p
 return $p
}
function Write-New([string]$file,[string]$text){
 $b=[Text.Encoding]::UTF8.GetBytes($text);if($b.Length -gt 4096){throw 'ENTRY_LIMIT'}
 $s=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$s.Write($b,0,$b.Length);$s.Flush($true)}finally{$s.Dispose()}
 if([IO.File]::ReadAllText($file) -cne $text){throw 'ENTRY_READBACK'}
}
$entry=@'
using System;
internal static class ManagedFixtureEntry {
 public static int Main(string[] args) {
  try {
   if(args.Length != 0 || Fonesi.Tests.RetainedAdbProtocolFixture.RunAll() != 8 || Fonesi.Tests.RetainedAdbProtocolFixture.RunVersionExpectations() != 2 || Fonesi.Tests.RetainedAdbProtocolFixture.RunServer() != 9 || Fonesi.Tests.RetainedAdbProtocolFixture.RunDiscovery() != 8 || Fonesi.Tests.RetainedAdbProtocolFixture.RunMetadata() != 12 || Fonesi.Tests.RetainedAdbProtocolFixture.RunInput() != 12 || Fonesi.Tests.RetainedAdbProtocolFixture.RunVideo() != 23) return 1;
   Console.Out.WriteLine("RETAINED_MANAGED_GROUPS_74");
   Console.Out.Flush();
   return 0;
  } catch { Console.Error.WriteLine("RETAINED_MANAGED_FIXTURE_FAILED"); return 1; }
 }
}
'@
$original=[Environment]::GetEnvironmentVariables('Process')
try{
 if($args.Count -ne 0 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitProcess){throw 'ARGUMENT_REJECTED'}
 foreach($key in $original.Keys){if($key -match '(?i)electron' -or $key -in @('NODE_PATH','NODE_OPTIONS','ESBUILD_BINARY_PATH')){throw 'OVERRIDE_REJECTED'}}
 Assert-PlainDirectory $desktop
 $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
 PlainFile $helper 1048576
 if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'){throw 'HELPER_CHANGED'}
 if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED_HELPER'}
 Add-Type -Path $helper
 $windows=[IO.Path]::GetFullPath($env:SystemRoot);Assert-PlainDirectory $windows
 $framework=Join-Path $windows 'Microsoft.NET/Framework64/v4.0.30319';Assert-PlainDirectory $framework
 $compiler=Join-Path $framework 'csc.exe';PlainFile $compiler 8388608
 $refs=@('mscorlib.dll','System.dll','System.Core.dll')|ForEach-Object{ $p=Join-Path $framework $_;PlainFile $p 33554432;$p }
 $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe';PlainFile $node 134217728
 if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_REJECTED'}
 $sources=@('native/IsolatedAdbServer.cs','native/RetainedAdbSession.cs','native/RetainedAdbProtocol.cs','native/RetainedHostAdmission.cs','native/RetainedVideoSession.cs','tests/fixtures/RetainedAdbProtocolFixture.cs')|ForEach-Object{Join-Path $desktop $_}
 $bound=@($sources)+@($helper,(Join-Path $desktop 'scripts/retained-managed-fixture.mjs'),$PSCommandPath,(Join-Path $PSScriptRoot 'WindowsBoundary.psm1'),(Join-Path $PSScriptRoot 'OwnedFiles.psm1'))
 foreach($p in $bound){PlainFile $p 1048576;$sourceBefore[$p]=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}
 $expected=@('4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7','959354d2fcabc08d1ad3bfd4326b4049fa33814c1e942d2a06598145161f94c7','2b540242f411e7c3091d2bd13dff33be14c996194b4f5cb4486d8ec6e9d801cd','2e5602d3965b753ae536cf51a9467af77e59fc1b477ae06029dcfbd56e9c3110','c4311d6080f6b566353c6f72151d8ef04b99e60a1f16ce396d020d3b86770ccf','3d576c73fa16b1dd410c76273b8217a604900f0dd2bd89cdde2d97a03a46c6b9')
 for($i=0;$i -lt $sources.Count;$i++){if($sourceBefore[$sources[$i]] -ine $expected[$i]){throw 'SOURCE_CHANGED'}}
 $hashNames=@('server','session','protocol','admission','video','fixture','probe','gate','wrapper','boundary','ownedFiles')
 for($i=0;$i -lt $bound.Count;$i++){$report.inputHashes[$hashNames[$i]]=$sourceBefore[$bound[$i]].ToLowerInvariant()}
 $parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\');Assert-PlainDirectory $parent
 $root=Join-Path $parent ('retained-managed-'+[guid]::NewGuid().ToString());[Fonesi.Phase00.NativeProbe]::ReserveDirectory($root)
 $token=[guid]::NewGuid().ToString();Write-New (Join-Path $root '.owner') $token
 $owner=[pscustomobject]@{Parent=$parent;Path=$root;Token=$token};Assert-OwnedRun $owner
 foreach($key in @($original.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
 foreach($key in @('SystemRoot','WINDIR')){[Environment]::SetEnvironmentVariable($key,$windows,'Process')}
 foreach($key in @('TEMP','TMP')){[Environment]::SetEnvironmentVariable($key,$root,'Process')}
 $admit=Run-Fixed $node ([string[]]@((Join-Path $desktop 'scripts/retained-managed-fixture.mjs'),'admit')) 30000
 if(-not (Successful $admit) -or ($admit.Stdout -replace '\r\n',"`n") -cne "RETAINED_MANAGED_ADMISSION_PASS`n" -or $admit.Stderr -cne ''){throw 'BUILD_REJECTED'}
 Write-New (Join-Path $root 'entry.cs') $entry
 $output=Join-Path $root 'fixture.exe'
 $compilerArgs=@('/noconfig','/nologo','/nostdlib+','/target:exe','/optimize+','/debug-','/langversion:5','/main:ManagedFixtureEntry',('/out:'+$output))+@($refs|ForEach-Object{'/reference:'+$_})+@($sources)+@((Join-Path $root 'entry.cs'))
 $stage='COMPILE';$p=Run-Fixed $compiler ([string[]]$compilerArgs) 30000;$report.compileProcess=Evidence $p
 $compilerText=$p.Stdout+"`n"+$p.Stderr
 foreach($code in @('CS0122','CS0052','CS0051','CS0117','CS1061','CS0246','CS0103','CS1002')){if($compilerText -cmatch ('\berror '+$code+'\b')){$report.compilerDiagnostics+=,$code}}
 foreach($m in [regex]::Matches($compilerText,'\berror (CS[0-9]{4})\b')){if($m.Groups[1].Value -cnotin $report.compilerDiagnostics -and 'OTHER' -cnotin $report.compilerDiagnostics){$report.compilerDiagnostics+=,'OTHER'}}
 if(-not (Successful $p)){throw 'COMPILE_FAILED'}
 PlainFile $output 8388608
 $s=[IO.File]::OpenRead($output);try{if($s.ReadByte() -ne 77 -or $s.ReadByte() -ne 90){throw 'OUTPUT_REJECTED'}}finally{$s.Dispose()}
 foreach($p in $bound){PlainFile $p 1048576;if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -cne $sourceBefore[$p]){throw 'SOURCE_CHANGED'}}
 Assert-OwnedRun $owner
 $compiled=Get-BoundedOwnedEntries $root 8396800
 if($compiled.Entries.Count -ne 3){throw 'OUTPUT_INVENTORY'}
 foreach($i in $compiled.Entries){if($i.PSIsContainer -or $i.Name -cnotin @('.owner','entry.cs','fixture.exe')){throw 'OUTPUT_INVENTORY'}}
 if([IO.File]::ReadAllText((Join-Path $root 'entry.cs')) -cne $entry){throw 'ENTRY_CHANGED'}
 $assemblyHash=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
 $stage='FIXTURE';$p=Run-Fixed $output ([string[]]@()) 120000;$report.fixtureProcess=Evidence $p
 if(-not (Successful $p) -or $p.Status -cne 'SUCCESS' -or ($p.Stdout -replace '\r\n',"`n") -cne "RETAINED_MANAGED_GROUPS_74`n" -or $p.Stderr -cne ''){throw 'FIXTURE_FAILED'}
 PlainFile $output 8388608
 if((Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash -cne $assemblyHash){throw 'OUTPUT_CHANGED'}
 $report.groupsPassed=74
 foreach($p in $bound){PlainFile $p 1048576;if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -cne $sourceBefore[$p]){throw 'SOURCE_CHANGED'}}
 $report.sourceUnchanged=$true
}catch{
 Write-Output ('RETAINED_MANAGED_STAGE_'+$stage)
}finally{
 if($null -ne $owner -and $retired){
  try{
   Assert-OwnedRun $owner
   $inventory=Get-BoundedOwnedEntries $owner.Path 8396800
   foreach($i in $inventory.Entries){if($i.PSIsContainer -or $i.Name -cnotin @('.owner','entry.cs','fixture.exe') -or $i.Length -gt $(if($i.Name -ceq 'fixture.exe'){8388608}else{4096})){throw 'CLEANUP_INVENTORY'}}
   foreach($name in @('entry.cs','fixture.exe')){if(Test-Path -LiteralPath (Join-Path $owner.Path $name)){[IO.File]::Delete((Join-Path $owner.Path $name))}}
   Remove-VerifiedOwnedRun $owner $retired;$report.directoryCleanup=$true
  }catch{Write-Output 'RETAINED_MANAGED_STAGE_CLEANUP'}
 }
 $current=[Environment]::GetEnvironmentVariables('Process');foreach($key in @($current.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')};foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}
}
$report.passed=($report.groupsPassed -eq 74 -and $report.sourceUnchanged -and $report.directoryCleanup)
Write-Output ($report|ConvertTo-Json -Depth 6 -Compress)
if($report.passed){Write-Output 'RETAINED_MANAGED_FIXTURE_PASS';exit 0}
Write-Output 'RETAINED_MANAGED_FIXTURE_FAIL';exit 1
