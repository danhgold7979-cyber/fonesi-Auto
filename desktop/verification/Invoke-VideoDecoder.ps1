# Explicit opt-in only; actual Electron synthetic decoder, never ADB/device/native provider.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$owner=$null;$retired=$true;$phase='PREPARE'
$report=[ordered]@{version=1;scope='ELECTRON_H264_SYNTHETIC_TILE_ONLY';head=$env:GITHUB_SHA;process=$null;directoryCleanup=$false;cleanupFailure=$null;passed=$false;failure=$null}
function Retired($p){return ($p.CleanupComplete -and $null -ne $p.ExitCode -and $p.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT'))}
function Run([string]$exe,[string[]]$arguments,[int]$timeout){$script:retired=$false;$p=Invoke-OwnedChild $exe $arguments $timeout @{};$script:retired=Retired $p;return $p}
function Require($p,[string]$marker){if(-not (Retired $p) -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0 -or $p.StdoutTruncated -or $p.StderrTruncated -or $p.Stdout.Replace("`r`n","`n") -cne ($marker+"`n")){throw 'CHILD_FAILED'}}
function Control([string]$action){$args2=[string[]]@((Join-Path $PSScriptRoot 'video-decoder-control.mjs'),$action,$owner.Path);if($action -ceq 'prepare'){$args2+=$env:GITHUB_SHA};Require (Run $node $args2 30000) 'VIDEO_DECODER_CONTROL_PASS'}
try{
 if($args.Count -ne 0 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitProcess -or $env:GITHUB_SHA -cnotmatch '\A[0-9a-f]{40}\z'){throw 'HOST_REJECTED'}
 Assert-PlainDirectory $desktop
 $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
 if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89' -or ('Fonesi.Phase00.NativeProbe' -as [type])){throw 'HELPER_REJECTED'}
 Add-Type -Path $helper
 $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe'
 if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_REJECTED'}
 $parent=Join-Path $desktop '.test-output';Assert-PlainDirectory $parent
 $root=Join-Path $parent ('video-decoder-'+[guid]::NewGuid().ToString());[Fonesi.Phase00.NativeProbe]::ReserveDirectory($root)
 $token=[guid]::NewGuid().ToString();[IO.File]::WriteAllText((Join-Path $root '.owner'),$token,(New-Object Text.UTF8Encoding($false)))
 $owner=[pscustomobject]@{Parent=$parent;Path=$root;Token=$token};Assert-OwnedRun $owner
 $phase='INSTALL'
 $runtime=Join-Path $desktop '.runtime';if(Test-Path -LiteralPath $runtime){throw 'RUNTIME_EXISTS'};[Fonesi.Phase00.NativeProbe]::ReserveDirectory($runtime)
 $installed=Run $node ([string[]]@((Join-Path $PSScriptRoot 'install-electron.mjs'))) 120000
 Require $installed "FOUNDATION_BUILD_VERIFIED`nFOUNDATION_OFFICIAL_INSTALL_VERIFIED"
 Require (Run $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'attest-runtime',$desktop,$env:GITHUB_SHA)) 120000) 'PERSISTENCE_RUNTIME_ATTESTED'
 $phase='CONTROL';Control 'prepare';Assert-OwnedRun $owner
 $exe=Join-Path $desktop 'node_modules/electron/dist/electron.exe'
 $manifest=[IO.File]::ReadAllText((Join-Path $runtime 'persistence-runtime-manifest.json'))|ConvertFrom-Json
 if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ine $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
 Require (Run $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'verify-runtime',$desktop,$env:GITHUB_SHA)) 120000) 'PERSISTENCE_RUNTIME_VERIFIED'
 $phase='DECODE';$p=Run $exe ([string[]]@((Join-Path $root 'probe.cjs'),$root)) 120000
 $report.process=[ordered]@{status=$p.Status;exitCode=$p.ExitCode;cleanupComplete=$p.CleanupComplete;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated}
 if(Retired $p){$phase='DIAGNOSTIC';Control 'diagnostic'}
 $phase='DECODE'
 if(-not (Retired $p) -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0 -or $p.StdoutTruncated -or $p.StderrTruncated){throw 'PROBE_FAILED'}
 $phase='RUNTIME_VERIFY'
 Require (Run $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'verify-runtime',$desktop,$env:GITHUB_SHA)) 120000) 'PERSISTENCE_RUNTIME_VERIFIED'
 $phase='RESULT_INSPECT';Control 'inspect'
 $phase='PROBE_MARKER';Require $p 'VIDEO_DECODER_PROBE_PASS'
 $phase='CLEANUP';Control 'cleanup';Remove-VerifiedOwnedRun $owner $retired;$report.directoryCleanup=$true;$report.passed=$true
}catch{$report.failure=$phase+'_FAILED';Write-Output ('VIDEO_DECODER_STAGE_'+$phase)}
finally{
 if($null -ne $owner -and -not $report.directoryCleanup){
  if($retired){
   try {Control 'cleanup';Remove-VerifiedOwnedRun $owner $retired;$report.directoryCleanup=$true}
   catch {$report.cleanupFailure='CLEANUP_FAILED';$report.passed=$false}
  }else{$report.cleanupFailure='RETIREMENT_UNCONFIRMED';$report.passed=$false}
 }
 $bytes=[Text.Encoding]::UTF8.GetBytes(($report|ConvertTo-Json -Depth 8 -Compress));if($bytes.Length -gt 16384){throw 'REPORT_LIMIT'}
 $file=Join-Path $desktop '.test-output/video-decoder-supervisor.json';$s=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()}
}
if($report.passed){Write-Output 'VIDEO_DECODER_CAMPAIGN_PASS'}else{Write-Output 'VIDEO_DECODER_CAMPAIGN_FAIL';exit 1}
