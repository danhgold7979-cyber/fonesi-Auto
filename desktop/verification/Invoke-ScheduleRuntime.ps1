$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
if($args.Count -ne 0){throw 'SCHEDULE_ARGUMENTS_REJECTED'}
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $desktop '.schedule-runtime'
$public=Join-Path $desktop '.schedule-runtime-public'
$owner=$null
$allRetired=$true
$allChildrenRetired=$true
$stage='HOST'
$observerRequested=$false
function Show-FixedProbe($Probe){
 foreach($value in @('SUCCESS','NONZERO_EXIT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED','EMPTY_OUTPUT')){if($Probe.Status -ceq $value){Write-Output ('SCHEDULE_CHILD_'+$value)}}
 if($Probe.CleanupComplete){Write-Output 'SCHEDULE_CHILD_RETIRED'}else{Write-Output 'SCHEDULE_CHILD_RETIREMENT_UNCONFIRMED'}
 foreach($phase in @('OWNED','SOURCE','INSTALL','RUNTIME','COPY','APP','STATE','CAPTURE','CAPTURE_FILE','CAPTURE_ENCODING','CAPTURE_PROCESS','CAPTURE_FRAMING','REPORT','HOST','CONTROL','PROFILE','PATHS','OBSERVATION','CORPUS')){
  foreach($prefix in @('SCHEDULE_CONTROL_STAGE_','SCHEDULE_OBSERVER_STAGE_')){
   $marker=$prefix+$phase
   if(@(($Probe.Stdout+"`n"+$Probe.Stderr) -split '\r?\n'|Where-Object {$_ -ceq $marker}).Count -gt 0){Write-Output $marker}
  }
 }
 foreach($case in @('HCM_ALIAS','NY_GAP','NY_FOLD','LORD_HOWE','THRESHOLD','MIDNIGHT','BOUNDS_NEXT','DENSE_PREFIX','CALENDAR','FAIL_CLOSED')){
  $marker='SCHEDULE_CORPUS_CASE_'+$case
  if(@(($Probe.Stdout+"`n"+$Probe.Stderr) -split '\r?\n'|Where-Object {$_ -ceq $marker}).Count -gt 0){Write-Output $marker}
 }
 foreach($fact in @('TYPE_INVALID','OVER_OBSERVATION_LIMIT','LEADING_BOM','LEADING_WHITESPACE','NO_NONEMPTY_LINES','ONE_NONEMPTY_LINE','MULTIPLE_NONEMPTY_LINES','NO_CANONICAL_OBSERVATION_LINE','ONE_CANONICAL_OBSERVATION_LINE','MULTIPLE_CANONICAL_OBSERVATION_LINES','LINE_SCAN_BOUND','TRIM_ONLY_CANONICAL','FIRST_OPEN_BRACE','FIRST_CLOSE_BRACE','FIRST_WHITESPACE','FIRST_OTHER','LAST_OPEN_BRACE','LAST_CLOSE_BRACE','LAST_WHITESPACE','LAST_OTHER')){
  $marker='SCHEDULE_CAPTURE_FACT_'+$fact
  if(@($Probe.Stdout -split '\r?\n'|Where-Object {$_ -ceq $marker}).Count -gt 0){Write-Output $marker}
 }
 foreach($reason in @('SCHEDULE_CAPTURE_FRAMING','SCHEDULE_CAPTURE_JSON','SCHEDULE_CAPTURE_LIMIT','SCHEDULE_CAPTURE_GRAMMAR','SCHEDULE_CAPTURE_REPRESENTATION','SCHEDULE_CAPTURE_SCHEMA','SCHEDULE_RUNTIME_REJECTED','SCHEDULE_RUNTIME_CONTROL_REJECTED','PACKAGE_REJECTED','ENOENT','EINVAL','EPERM','EACCES')){
  $marker='SCHEDULE_CONTROL_REASON_'+$reason
  if(@($Probe.Stdout -split '\r?\n'|Where-Object {$_ -ceq $marker}).Count -gt 0){Write-Output $marker}
 }
}
function Require-Result($Probe,[string]$Marker){
 if(-not $Probe.CleanupComplete -or $Probe.StdoutTruncated -or $Probe.StderrTruncated -or $Probe.Status -cne 'SUCCESS' -or $Probe.ExitCode -ne 0 -or (($Probe.Stdout -replace '\r\n',"`n").TrimEnd("`n") -cne $Marker)){Show-FixedProbe $Probe;throw 'SCHEDULE_CHILD_FAILED'}
}
function Write-New([string]$File,[string]$Raw,[int]$Limit){
 $bytes=[Text.Encoding]::UTF8.GetBytes($Raw)
 if($bytes.Length -gt $Limit){throw 'SCHEDULE_FILE_LIMIT'}
 $stream=[IO.File]::Open($File,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Fixed-File([string]$Name,[int]$Limit){
 Assert-OwnedRun $owner
 $file=Join-Path $owner.Path $Name
 $item=Get-Item -LiteralPath $file -Force
 if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt $Limit){throw 'SCHEDULE_FILE_REJECTED'}
 return $file
}
try {
 if($env:OS -cne 'Windows_NT' -or $env:GITHUB_REF -cne 'refs/heads/phase-07'){throw 'SCHEDULE_HOST_REJECTED'}
 foreach($key in [Environment]::GetEnvironmentVariables('Process').Keys){if($key -match '(?i)electron' -or ([string]$key).ToUpperInvariant() -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH','NODE_ICU_DATA','ICU_DATA')){throw 'SCHEDULE_OVERRIDE_REJECTED'}}
 if((Test-Path -LiteralPath $base) -or (Test-Path -LiteralPath $public)){throw 'SCHEDULE_PREEXISTING_RUN'}
 $stage='OWNER'
 Assert-PlainDirectory $desktop
 [void][IO.Directory]::CreateDirectory($base)
 $owner=New-OwnedRun $base
 $stage='SOURCE'
 $head=(& git -C (Split-Path $desktop -Parent) rev-parse HEAD)
 if($LASTEXITCODE -ne 0 -or @($head).Count -ne 1 -or $head -cnotmatch '^[0-9a-f]{40}$' -or $head -cne $env:GITHUB_SHA){throw 'SCHEDULE_SOURCE_HEAD'}
 $tree=(& git -C (Split-Path $desktop -Parent) rev-parse 'HEAD^{tree}')
 if($LASTEXITCODE -ne 0 -or @($tree).Count -ne 1 -or $tree -cnotmatch '^[0-9a-f]{40}$'){throw 'SCHEDULE_SOURCE_TREE'}
 $stage='HELPER'
 $helper=Join-Path (Split-Path $desktop -Parent) 'tools/phase-00/HostProbeNative.cs'
 if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89' -or ('Fonesi.Phase00.NativeProbe' -as [type])){throw 'SCHEDULE_HELPER_REJECTED'}
 Add-Type -Path $helper
 $stage='NODE'
 $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe'
 $nodeItem=Get-Item -LiteralPath $node -Force
 if($nodeItem.PSIsContainer -or ($nodeItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'SCHEDULE_NODE_REJECTED'}
 $allRetired=$false
 $allChildrenRetired=$false
 $stage='INSTALL'
 $install=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'install-electron.mjs'))) 120000 @{}
 $allChildrenRetired=$install.CleanupComplete
 $allRetired=$install.CleanupComplete -and -not $install.StdoutTruncated -and -not $install.StderrTruncated
 if(-not $allRetired -or $install.Status -cne 'SUCCESS' -or $install.ExitCode -ne 0 -or -not (Test-ExactlyOneLine $install.Stdout 'FOUNDATION_BUILD_VERIFIED') -or -not (Test-ExactlyOneLine $install.Stdout 'FOUNDATION_OFFICIAL_INSTALL_VERIFIED')){Show-FixedProbe $install;throw 'SCHEDULE_INSTALL_FAILED'}
 $stage='BUILD'
 $allChildrenRetired=$false
 $built=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'build-schedule-corpus.mjs'))) 30000 @{}
 $allChildrenRetired=$built.CleanupComplete
 Require-Result $built 'SCHEDULE_CORPUS_BUILD_PASS'
 $reports=@()
 foreach($verb in @('stage-utc','stage-la','stage-tokyo')){
  if($verb -cne 'stage-utc'){$owner=New-OwnedRun $base}
 Write-New (Join-Path $owner.Path 'install.json') '{"version":1,"installedThisRun":true}' 1024
 $stage='PROFILE'
 $profile=New-OwnedProfile $owner 'source'
 $allRetired=$false
 $allChildrenRetired=$false
 $stage='STAGE'
 $staged=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'schedule-runtime-control.cjs'),$verb,$owner.Path,$head,$tree)) 30000 @{}
 $allChildrenRetired=$staged.CleanupComplete
 $allRetired=$staged.CleanupComplete -and -not $staged.StdoutTruncated -and -not $staged.StderrTruncated
 Require-Result $staged 'SCHEDULE_RUNTIME_STAGED'
 Assert-OwnedRun $owner
 $exe=Join-Path $owner.Path 'package/electron.exe'
 $allRetired=$false
 $allChildrenRetired=$false
 $stage='OBSERVER'
 $observerRequested=$true
 $observed=Invoke-OwnedChild $exe ([string[]]@()) 30000 @{}
 $allChildrenRetired=$observed.CleanupComplete
 $allRetired=$observed.CleanupComplete -and -not $observed.StdoutTruncated -and -not $observed.StderrTruncated
 if(-not $allRetired){Show-FixedProbe $observed;throw 'SCHEDULE_RETIREMENT_UNCONFIRMED'}
 if($observed.Status -cne 'SUCCESS' -or $observed.ExitCode -ne 0){Show-FixedProbe $observed}
 $capture=[ordered]@{status=$observed.Status;exitCode=$observed.ExitCode;cleanupComplete=$observed.CleanupComplete;stdoutTruncated=$observed.StdoutTruncated;stderrTruncated=$observed.StderrTruncated;stdoutBase64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($observed.Stdout));stderrBase64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($observed.Stderr))}
 Write-New (Join-Path $owner.Path 'capture.json') ($capture|ConvertTo-Json -Depth 4 -Compress) 131072
 $allRetired=$false
 $allChildrenRetired=$false
 $stage='VALIDATE'
 $validated=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'schedule-runtime-control.cjs'),'validate',$owner.Path)) 30000 @{}
 $allChildrenRetired=$validated.CleanupComplete
 $allRetired=$validated.CleanupComplete -and -not $validated.StdoutTruncated -and -not $validated.StderrTruncated
 Require-Result $validated 'SCHEDULE_RUNTIME_VALIDATED'
 $stage='REPORT'
 $reportFile=Fixed-File 'report.json' 32768
 $reports+=,[IO.File]::ReadAllText($reportFile)
 $private=@(@('install.json',1024),@('capture.json',131072),@('state.json',262144),@('report.json',32768))
 $files=@()
 foreach($pair in $private){$files+=,(Fixed-File $pair[0] $pair[1])}
 # Preflight both complete child trees before any cleanup; shared finite helpers are unchanged.
 [void](Get-BoundedOwnedEntries (Join-Path $owner.Path 'package') 536870912)
 [void](Get-BoundedOwnedEntries $profile 8388608)
 Assert-OwnedRun $owner
 $stage='CLEANUP'
 Remove-VerifiedOwnedPart $owner 'package' $allRetired
 Remove-VerifiedOwnedPart $owner 'fonesi-auto-foundation-source' $allRetired
 foreach($file in $files){[IO.File]::Delete($file)}
 Remove-VerifiedOwnedRun $owner $allRetired
 }
 # Only reports from three retired and removed owned runs enter the campaign root.
 $owner=New-OwnedRun $base
 Write-New (Join-Path $owner.Path 'campaign.json') ('['+($reports -join ',')+']') 98304
 $stage='CAMPAIGN'
 $allChildrenRetired=$false
 $campaign=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'schedule-runtime-control.cjs'),'campaign',$owner.Path)) 30000 @{}
 $allChildrenRetired=$campaign.CleanupComplete
 Require-Result $campaign 'SCHEDULE_CORPUS_CAMPAIGN_VALIDATED'
 $reportFile=Fixed-File 'report.json' 32768
 $report=[IO.File]::ReadAllText($reportFile)
 $campaignFile=Fixed-File 'campaign.json' 98304
 [IO.File]::Delete($reportFile)
 [IO.File]::Delete($campaignFile)
 Remove-VerifiedOwnedRun $owner $allChildrenRetired
 [IO.Directory]::Delete($base,$false)
 $stage='PUBLIC'
 if(Test-Path -LiteralPath $public){throw 'SCHEDULE_PUBLIC_EXISTS'}
 [void][IO.Directory]::CreateDirectory($public)
 Write-New (Join-Path $public 'schedule-production-campaign.json') $report 32768
 Write-Output 'SCHEDULE_PRODUCTION_CORPUS_VERIFIED'
} catch {
 # Preserve any uncertain or partially staged run; never print private exception data.
 if($stage -cin @('HOST','OWNER','SOURCE','HELPER','NODE','INSTALL','PROFILE','STAGE','OBSERVER','VALIDATE','REPORT','CLEANUP','PUBLIC','BUILD','CAMPAIGN')){Write-Output ('SCHEDULE_FAILURE_STAGE_'+$stage)}
 if($observerRequested){Write-Output 'SCHEDULE_OBSERVER_REQUESTED'}else{Write-Output 'SCHEDULE_OBSERVER_NOT_REQUESTED'}
 if($allChildrenRetired){Write-Output 'SCHEDULE_OWNED_PROCESSES_RETIRED'}else{Write-Output 'SCHEDULE_OWNED_RETIREMENT_UNCONFIRMED'}
 $reason=$_.Exception.Message
 if($reason -cin @('SCHEDULE_HOST_REJECTED','SCHEDULE_OVERRIDE_REJECTED','SCHEDULE_PREEXISTING_RUN','SCHEDULE_SOURCE_HEAD','SCHEDULE_SOURCE_TREE','SCHEDULE_HELPER_REJECTED','SCHEDULE_NODE_REJECTED','SCHEDULE_INSTALL_FAILED','SCHEDULE_CHILD_FAILED','SCHEDULE_FILE_LIMIT','SCHEDULE_FILE_REJECTED','SCHEDULE_RETIREMENT_UNCONFIRMED','SCHEDULE_PUBLIC_EXISTS','UNREVIEWED_DEADLINE','ENVIRONMENT_KEY_REJECTED','EXECUTABLE_REJECTED','CHROMIUM_NODE_SWITCH_REJECTED')){Write-Output ('SCHEDULE_FAILURE_REASON_'+$reason)}else{Write-Output 'SCHEDULE_FAILURE_REASON_UNCLASSIFIED'}
 Write-Output 'SCHEDULE_RUNTIME_OBSERVATION_FAILED'
 exit 1
}
