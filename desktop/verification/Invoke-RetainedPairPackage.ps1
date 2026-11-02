# Build/verify only. Never launch the app, Electron, retained DLL/JAR, server or device.
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $desktop '.retained-pair-package-check'
$controller=Join-Path $PSScriptRoot 'retained-pair-package-control.mjs'
$original=[Environment]::GetEnvironmentVariables('Process')
$clock=[Diagnostics.Stopwatch]::StartNew()
$phase='ADMISSION';$allRetired=$true;$owner=$null;$baseOwner=$null;$processes=[ordered]@{};$passed=$false
function PlainFile([string]$file,[long]$limit){
 $i=Get-Item -LiteralPath $file -Force
 if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -lt 1 -or $i.Length -gt $limit -or $i.FullName -cne [IO.Path]::GetFullPath($file)){throw 'FILE_REJECTED'}
}
function ReadText([string]$file,[int]$limit){
 PlainFile $file $limit
 $s=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try{$b=New-Object byte[] ($limit+1);$n=0;while($n -lt $b.Length){$r=$s.Read($b,$n,$b.Length-$n);if($r -eq 0){break};$n+=$r};if($n -gt $limit){throw 'FILE_LIMIT'};return (New-Object Text.UTF8Encoding($false,$true)).GetString($b,0,$n)}finally{$s.Dispose()}
}
function WriteNew([string]$file,[string]$value,[int]$limit){
 Assert-PlainDirectory ([IO.Path]::GetDirectoryName($file));$b=[Text.Encoding]::UTF8.GetBytes($value);if($b.Length -gt $limit){throw 'FILE_LIMIT'}
 $s=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$s.Write($b,0,$b.Length);$s.Flush($true)}finally{$s.Dispose()}
 if((ReadText $file $limit) -cne $value){throw 'FILE_READBACK'}
}
function JsonNew([string]$file,$value){WriteNew $file ($value|ConvertTo-Json -Depth 12 -Compress) 262144}
function Retired($p){return ($p.CleanupComplete -and $null -ne $p.ExitCode -and $p.Status -cin @('SUCCESS','EMPTY_OUTPUT','NONZERO_EXIT'))}
function Success($p){return ((Retired $p) -and $p.ExitCode -eq 0 -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Status -cin @('SUCCESS','EMPTY_OUTPUT'))}
function Evidence($p){return [ordered]@{status=$p.Status;exitCode=$p.ExitCode;cleanupComplete=$p.CleanupComplete;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated}}

function Assert-PreparedCapture {
 Assert-OwnedRun $script:baseOwner;Assert-OwnedRun $script:owner
 if((ReadText (Join-Path $script:root 'private.json') 1048576) -cne $script:preparedPrivateText -or (ReadText (Join-Path $script:root 'context.json') 8192) -cne $script:preparedContextText){throw 'PREPARED_CHANGED'}
}
function RunStage([string]$stage,[string[]]$arguments,[string]$marker,[bool]$cleanup=$false){
 if(-not $script:allRetired){throw 'UNRETIRED'}
 $end=if($cleanup){300000}else{290000};$remaining=$end-$script:clock.ElapsedMilliseconds
 $drain=[Math]::Min(10000,300000-$script:clock.ElapsedMilliseconds)
 if($cleanup){$drain=[Math]::Min(1000,[Math]::Floor($remaining/2));$remaining-=$drain}
 if($remaining -le 0 -or $drain -le 0){throw 'DEADLINE'}
 $command=[Fonesi.Phase00.NativeProbe]::QuoteArgument($script:node)
 foreach($a in $arguments){if($null -eq $a -or $a.IndexOf([char]0) -ge 0){throw 'ARGUMENT'};$command+=' '+[Fonesi.Phase00.NativeProbe]::QuoteArgument($a)}
 if($command.Length -gt 30000){throw 'ARGUMENT'}
 foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
 foreach($key in @('SystemRoot','WINDIR','SystemDrive','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')){if($script:original.Contains($key)){[Environment]::SetEnvironmentVariable($key,[string]$script:original[$key],'Process')}}
 [Environment]::SetEnvironmentVariable('PATH',[Environment]::SystemDirectory,'Process')
 $script:allRetired=$false
 $p=[Fonesi.Phase00.NativeProbe]::Run($script:node,$arguments,[int][Math]::Min(120000,$remaining),[int]$drain,32768)
 $script:allRetired=Retired $p
 $script:processes[$stage]=[ordered]@{stage=$stage;status=$p.Status;exitCode=$p.ExitCode;retired=$script:allRetired;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated}
 if(-not (Success $p) -or $p.Stderr -cne '' -or $p.Stdout.Replace("`r`n","`n") -cne ($marker+"`n")){
  if($p.Status -cin @('SUCCESS','EMPTY_OUTPUT','NONZERO_EXIT','TIMEOUT','ACCESS_DENIED','LAUNCH_FAILED','CAPTURE_FAILED','CLEANUP_FAILED')){
   $exitFlag=if($null -eq $p.ExitCode){'NULL'}else{'PRESENT'};$retiredFlag=if($script:allRetired){'TRUE'}else{'FALSE'};$outFlag=if($p.StdoutTruncated){'TRUE'}else{'FALSE'};$errFlag=if($p.StderrTruncated){'TRUE'}else{'FALSE'}
   Write-Output ('RETAINED_PAIR_PACKAGE_SUPERVISOR_'+$p.Status+'_EXIT_'+$exitFlag+'_RETIRED_'+$retiredFlag+'_STDOUT_TRUNCATED_'+$outFlag+'_STDERR_TRUNCATED_'+$errFlag)
  }
  if((Retired $p) -and $p.ExitCode -eq 1 -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Stderr -ceq '' -and $p.Stdout -cmatch '\ARETAINED_PAIR_PACKAGE_FAILED\|(ADMISSION|ARTIFACT|CANDIDATE|BUILD|VERIFY|CLEANUP)\r?\n\z'){Write-Output ('RETAINED_PAIR_PACKAGE_CONTROL_'+$Matches[1])}
  throw 'PROCESS_FAILED'
 }
}
try{
 if($args.Count -ne 0 -or $PSVersionTable.PSVersion.Major -ne 5 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitProcess){throw 'PLATFORM'}
 $boundary=Join-Path $PSScriptRoot 'WindowsBoundary.psm1';$owned=Join-Path $PSScriptRoot 'OwnedFiles.psm1';$helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
 foreach($entry in @(@($boundary,'d796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf'),@($owned,'17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29'),@($helper,'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'))){PlainFile $entry[0] 1048576;if((Get-FileHash -LiteralPath $entry[0] -Algorithm SHA256).Hash -ine $entry[1]){throw 'SUPERVISOR'}}
 Import-Module $boundary -Force;Import-Module $owned -Force
 if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED'};Add-Type -Path $helper
 foreach($key in $original.Keys){if($key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH','PYTHONPATH','PYTHONHOME')){throw 'ENVIRONMENT'}}
 foreach($key in @('FONESI_AUTO_SOURCE_COMMIT','FONESI_AUTO_SOURCE_TREE')){if($original[$key] -cnotmatch '\A[0-9a-f]{40}\z'){throw 'SOURCE'}}
 if($original['FONESI_AUTO_SOURCE_COMMIT'] -cne $original['GITHUB_SHA'] -or $original['PACKAGE_NPM_VERSION'] -cnotmatch '\A[0-9]+\.[0-9]+\.[0-9]+\z'){throw 'SOURCE'}
 $node=Join-Path ([string]$original['RUNNER_TOOL_CACHE']) 'node/24.22.1/x64/node.exe';PlainFile $node 268435456
 if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE'}
 PlainFile $controller 1048576;Assert-PlainDirectory $desktop
 [Fonesi.Phase00.NativeProbe]::ReserveDirectory($base)
 $baseOwner=[pscustomobject]@{Parent=$desktop;Path=$base;Token=[guid]::NewGuid().ToString()};WriteNew (Join-Path $base '.owner') $baseOwner.Token 36;Assert-OwnedRun $baseOwner
 $root=Join-Path $base ('run-'+[guid]::NewGuid().ToString());[Fonesi.Phase00.NativeProbe]::ReserveDirectory($root)
 $owner=[pscustomobject]@{Parent=$base;Path=$root;Token=[guid]::NewGuid().ToString()};WriteNew (Join-Path $root '.owner') $owner.Token 36;Assert-OwnedRun $owner
 $context=[ordered]@{version=1;sourceHead=$original['FONESI_AUTO_SOURCE_COMMIT'];sourceTree=$original['FONESI_AUTO_SOURCE_TREE'];npmVersion=$original['PACKAGE_NPM_VERSION'];nodeExe=$node}
 JsonNew (Join-Path $root 'context.json') $context
 $phase='NODE_LICENSE';$license=Join-Path $desktop '.retained-pair-package-node-LICENSE';PlainFile $license 1048576
 if((Get-FileHash -LiteralPath $license -Algorithm SHA256).Hash -ine '5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace'){throw 'LICENSE'}
 $phase='CANDIDATE';RunStage 'PREPARE' @($controller,'prepare',$root) 'RETAINED_PAIR_PACKAGE_PREPARED'
 $preparedPrivateText=ReadText (Join-Path $root 'private.json') 1048576
 $preparedContextText=ReadText (Join-Path $root 'context.json') 8192
 if($preparedContextText -cne ($context|ConvertTo-Json -Depth 12 -Compress)){throw 'PREPARED_CHANGED'}
 Assert-PreparedCapture
 $phase='ELECTRON';[Fonesi.Phase00.NativeProbe]::ReserveDirectory((Join-Path $desktop '.runtime'))
 RunStage 'ELECTRON' @((Join-Path $PSScriptRoot 'install-electron.mjs')) "FOUNDATION_BUILD_VERIFIED`nFOUNDATION_OFFICIAL_INSTALL_VERIFIED"
 $phase='ATTEST';RunStage 'ATTEST' @((Join-Path $PSScriptRoot 'persistence-control.cjs'),'attest-runtime',$desktop,$context.sourceHead) 'PERSISTENCE_RUNTIME_ATTESTED'
 $phase='BUILD';Assert-PreparedCapture;RunStage 'BUILD' @($controller,'build',$root) 'RETAINED_PAIR_PACKAGE_BUILT'
 $phase='VERIFY';Assert-PreparedCapture;$resultText=ReadText (Join-Path $root 'build-result.json') 8192;$result=$resultText|ConvertFrom-Json
 $keys='sourceHead,sourceTree,retainedArtifactId,retainedRunId,retentionReceiptSha256,pairManifestSha256,noticeManifestSha256,evidenceManifestSha256,nodeSha256,electronManifestSha256,packageManifestSha256,packageFiles,packageBytes,archiveBytes,archiveSha256,externalReceiptSha256,packageVerified,archiveBound'
 if(($result|ConvertTo-Json -Depth 12 -Compress) -cne $resultText -or (@($result.PSObject.Properties.Name)-join ',') -cne $keys){throw 'RESULT'}
 foreach($key in @('sourceHead','sourceTree','retainedArtifactId','retainedRunId')){if($result.$key -isnot [string]){throw 'RESULT'}}
 if($result.sourceHead -cne $context.sourceHead -or $result.sourceTree -cne $context.sourceTree -or $result.retainedArtifactId -cne '13132988023' -or $result.retainedRunId -cne '41427976617'){throw 'RESULT'}
 $pins=@{retentionReceiptSha256='dc3e9888284b5512c4c5314890eff9591ae825db4029884bbed81c683a966e98';pairManifestSha256='934a9ff34a1b868fa56ddfc8a57d4eaba64d9d6305b6da05839566b90b366437';noticeManifestSha256='305698d5f4623d7572c1c46a515a17d0984b35d26a82ae743ebeb71a04a0ebf6';evidenceManifestSha256='7bd7125bf8f427cd10a2371f6a435b82c410bd4a0163b5626750049a7aa2a043';nodeSha256='d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'}
 foreach($key in $pins.Keys){if($result.$key -isnot [string] -or $result.$key -cne $pins[$key]){throw 'RESULT'}}
 foreach($key in @('electronManifestSha256','packageManifestSha256','archiveSha256','externalReceiptSha256')){if($result.$key -isnot [string] -or $result.$key -cnotmatch '\A[0-9a-f]{64}\z'){throw 'RESULT'}}
 foreach($key in @('packageFiles','packageBytes','archiveBytes')){if(($result.$key -isnot [int] -and $result.$key -isnot [long]) -or $result.$key -le 0 -or $result.$key -gt 671088640){throw 'RESULT'}}
 if($result.packageFiles -gt 511 -or $result.packageVerified -isnot [bool] -or $result.packageVerified -ne $true -or $result.archiveBound -isnot [bool] -or $result.archiveBound -ne $true){throw 'RESULT'}
 $cleanupSealText=ReadText (Join-Path $root 'cleanup.json') 1048576;$cleanupSeal=$cleanupSealText|ConvertFrom-Json
 if(($cleanupSeal|ConvertTo-Json -Depth 24 -Compress) -cne $cleanupSealText -or (@($cleanupSeal.PSObject.Properties.Name)-join ',') -cne 'version,ownership,layout' -or $cleanupSeal.version -isnot [int] -or $cleanupSeal.version -ne 1){throw 'CLEANUP_SEAL'}
 $resultRows=@($cleanupSeal.layout.files|Where-Object {$_.path -ceq 'build-result.json'})
 $resultBytes=[Text.Encoding]::UTF8.GetBytes($resultText);$hasher=[Security.Cryptography.SHA256]::Create()
 try{$resultDigest=([BitConverter]::ToString($hasher.ComputeHash($resultBytes))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
 if($resultRows.Count -ne 1 -or (@($resultRows[0].PSObject.Properties.Name)-join ',') -cne 'path,identity,bytes,sha256' -or ($resultRows[0].bytes -isnot [int] -and $resultRows[0].bytes -isnot [long]) -or $resultRows[0].bytes -ne $resultBytes.Length -or $resultRows[0].sha256 -isnot [string] -or $resultRows[0].sha256 -cne $resultDigest){throw 'CLEANUP_SEAL'}
 $phase='CLEANUP';Assert-PreparedCapture
 if((ReadText (Join-Path $root 'cleanup.json') 1048576) -cne $cleanupSealText -or (ReadText (Join-Path $root 'build-result.json') 8192) -cne $resultText){throw 'CLEANUP_CHANGED'}
 RunStage 'CLEANUP' @($controller,'cleanup',$root) 'RETAINED_PAIR_PACKAGE_CLEANED' $true
 Assert-OwnedRun $baseOwner
 try{$null=Get-Item -LiteralPath $root -Force -ErrorAction Stop;throw 'ROOT_RETAINED'}catch [System.Management.Automation.ItemNotFoundException]{}
 $phase='REPORT';if(-not $allRetired -or $clock.ElapsedMilliseconds -ge 300000){throw 'DEADLINE'}
 $report=[ordered]@{version=1;scope='RETAINED_PAIR_PACKAGE_BUILD_ONLY'}
 foreach($key in ($keys -split ',')[0..15]){$report[$key]=$result.$key}
 $report['processes']=$processes;$report['packageVerified']=$true;$report['archiveBound']=$true;$report['packageRootCleanup']=$true;$report['passed']=$true
 if((@($processes.Keys)-join ',') -cne 'PREPARE,ELECTRON,ATTEST,BUILD,CLEANUP'){throw 'PROCESSES'}
 $reportText=$report|ConvertTo-Json -Depth 12 -Compress
 WriteNew (Join-Path $base 'report.json') $reportText 8192
 Assert-OwnedRun $baseOwner
 try{$null=Get-Item -LiteralPath $root -Force -ErrorAction Stop;throw 'ROOT_RETAINED'}catch [System.Management.Automation.ItemNotFoundException]{}
 if($clock.ElapsedMilliseconds -ge 300000 -or (ReadText (Join-Path $base 'report.json') 8192) -cne $reportText){throw 'REPORT'}
 $passed=$true
}catch{
 if($phase -cin @('ADMISSION','ARTIFACT','NODE_LICENSE','ELECTRON','ATTEST','CANDIDATE','BUILD','VERIFY','CLEANUP','REPORT')){Write-Output ('RETAINED_PAIR_PACKAGE_STAGE_'+$phase)}
}finally{
 foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
 foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}
}
if($passed){Write-Output 'RETAINED_PAIR_PACKAGE_PASS';exit 0}
Write-Output 'RETAINED_PAIR_PACKAGE_FAIL';exit 1
