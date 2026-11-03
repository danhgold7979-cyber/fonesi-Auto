# Exact vendor text evidence only. No build or payload execution.
param([Parameter(Mandatory=$true)][string]$PythonPath)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$clock=[Diagnostics.Stopwatch]::StartNew()
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$repo=[IO.Path]::GetFullPath((Join-Path $desktop '..'))
$base=Join-Path $desktop '.derived-notice-runtime'
$controller=Join-Path $PSScriptRoot 'derived_notice_evidence.py'
$original=[Environment]::GetEnvironmentVariables('Process')
$owner=$null;$baseOwner=$null;$allRetired=$true;$published=$false;$failure='INTERNAL_FAILURE'
$categories=@('BASELINE_REJECTED','SDK_PROFILE_REJECTED','INPUT_REJECTED','TEXT_REJECTED','SOURCE_CHANGED','STAGING_FAILED','UNRETIRED','CLEANUP_FAILED','PUBLICATION_FAILED','INTERNAL_FAILURE')
function PlainFile([string]$file,[long]$limit){
 $i=Get-Item -LiteralPath $file -Force
 if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -lt 1 -or $i.Length -gt $limit -or $i.FullName -cne [IO.Path]::GetFullPath($file)){throw 'FILE_REJECTED'}
}
# Fixed win22 image layout; link metadata is checked, never used to choose a target.
function Assert-PlainAncestors([string]$directory){
 $current=$directory
 while($null -ne $current){Assert-PlainDirectory $current;$parent=[IO.Directory]::GetParent($current);$current=if($null -eq $parent){$null}else{$parent.FullName}}
}
function Assert-SdkLabel([string]$label){
 $alias='C:\Android\android-sdk';$physical='C:\Program Files (x86)\Android\android-sdk'
 if($label -cne $alias -and $label -cne $physical){throw 'SDK_PROFILE_REJECTED'}
 if($label -ceq $alias){
  Assert-PlainAncestors 'C:\Android'
  $link=Get-Item -LiteralPath $alias -Force -ErrorAction Stop
  if(-not $link.PSIsContainer -or -not ($link.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $link.LinkType -cne 'SymbolicLink'){throw 'SDK_PROFILE_REJECTED'}
  $targets=@($link.Target)
  if($targets.Count -ne 1 -or $targets[0] -isnot [string] -or $targets[0] -cne $physical){throw 'SDK_PROFILE_REJECTED'}
 }
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

function Assert-ExactPublishedText([string]$file,[long]$bytes,[string]$sha256){
 PlainFile $file $bytes
 $s=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 $hash=[Security.Cryptography.SHA256]::Create()
 try{
  if($s.Length -ne $bytes){throw 'PUBLICATION_FAILED'}
  $actual=[BitConverter]::ToString($hash.ComputeHash($s)).Replace('-','').ToLowerInvariant()
  if($s.Position -ne $bytes -or $s.Length -ne $bytes -or $actual -cne $sha256){throw 'PUBLICATION_FAILED'}
 }finally{$hash.Dispose();$s.Dispose()}
}

function JsonNew([string]$file,$value){WriteNew $file ($value|ConvertTo-Json -Depth 12 -Compress) 16384}
function Retired($p){return ($p.CleanupComplete -and $null -ne $p.ExitCode -and $p.Status -cin @('SUCCESS','EMPTY_OUTPUT','NONZERO_EXIT'))}
function Success($p){return ((Retired $p) -and $p.Status -ceq 'SUCCESS' -and $p.ExitCode -eq 0 -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Stderr -ceq '')}
function EnvironmentFor {
 foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
 foreach($key in @('SystemRoot','WINDIR')){[Environment]::SetEnvironmentVariable($key,$script:windows,'Process')}
 [Environment]::SetEnvironmentVariable('PATH',[Environment]::SystemDirectory,'Process')
 foreach($key in @('TEMP','TMP','RUNNER_TEMP')){[Environment]::SetEnvironmentVariable($key,$script:tempParent,'Process')}
}
function RunAction([string]$action){
 if(-not $script:allRetired){throw 'UNRETIRED'}
 switch -CaseSensitive ($action) {
  'capture' {$arguments=@('capture',$script:owner.Path);$marker='DERIVED_NOTICE_CAPTURED';$end=60000}
  'stage' {$arguments=@('stage',$script:owner.Path,$script:base);$marker='DERIVED_NOTICE_STAGED';$end=60000}
  'cleanup' {$arguments=@('cleanup',$script:owner.Path,$script:base);$marker='DERIVED_NOTICE_CLEANED';$end=70000}
  'publish' {$arguments=@('publish',$script:base);$marker='DERIVED_NOTICE_PUBLISHED';$end=70000}
  default {throw 'INTERNAL_FAILURE'}
 }
 Assert-OwnedRun $script:baseOwner
 if($action -cne 'publish'){Assert-OwnedRun $script:owner}
 PlainFile $script:PythonPath 268435456;PlainFile $script:controller 1048576
 EnvironmentFor
 $total=70000-$script:clock.ElapsedMilliseconds
 $remaining=$end-$script:clock.ElapsedMilliseconds
 if($end -eq 60000){$drain=[Math]::Min(10000,$total-$remaining)}else{$drain=[Math]::Min(1000,[Math]::Floor($remaining/2));$remaining-=$drain}
 if($remaining -le 0 -or $drain -le 0){throw 'UNRETIRED'}
 $script:allRetired=$false
 $p=[Fonesi.Phase00.NativeProbe]::Run($script:PythonPath,[string[]](@('-I','-B',$script:controller)+$arguments),[int]$remaining,[int]$drain,4096)
 $script:allRetired=Retired $p
 if(-not $script:allRetired){throw 'UNRETIRED'}
 if(-not (Success $p) -or $p.Stdout.Replace("`r`n","`n") -cne ($marker+"`n")){
  $pattern='\ADERIVED_NOTICE_FAILED\|(BASELINE_REJECTED|SDK_PROFILE_REJECTED|INPUT_REJECTED|TEXT_REJECTED|SOURCE_CHANGED|STAGING_FAILED|UNRETIRED|CLEANUP_FAILED|PUBLICATION_FAILED|INTERNAL_FAILURE)\n\z'
  if($p.ExitCode -eq 1 -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Stderr -ceq '' -and $p.Stdout.Length -le 128){
   $match=[regex]::Match($p.Stdout.Replace("`r`n","`n"),$pattern)
   if($match.Success){throw $match.Groups[1].Value}
  }
  throw $script:failure
 }
 return [ordered]@{status=$p.Status;exitCode=$p.ExitCode;cleanupComplete=$p.CleanupComplete;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated;stderrEmpty=($p.Stderr -ceq '');marker=$marker}
}
try {
 if($args.Count -ne 0 -or $PSVersionTable.PSVersion.Major -ne 5 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitProcess){throw 'INTERNAL_FAILURE'}
 $boundary=Join-Path $PSScriptRoot 'WindowsBoundary.psm1';$ownedFiles=Join-Path $PSScriptRoot 'OwnedFiles.psm1';$helper=Join-Path $repo 'tools/phase-00/HostProbeNative.cs'
 foreach($entry in @(@($boundary,'d796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf'),@($ownedFiles,'17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29'),@($helper,'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'))){PlainFile $entry[0] 1048576;if((Get-FileHash -LiteralPath $entry[0] -Algorithm SHA256).Hash -ine $entry[1]){throw 'SOURCE_CHANGED'}}
 Import-Module $boundary -Force;Import-Module $ownedFiles -Force
 if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'INTERNAL_FAILURE'};Add-Type -Path $helper
 foreach($key in @('NODE_OPTIONS','NODE_PATH','PYTHONPATH','PYTHONHOME')){if($original.Contains($key)){throw 'INTERNAL_FAILURE'}}
 $windows=[IO.Path]::GetFullPath([string]$original['SystemRoot']);Assert-PlainAncestors $windows
 $tempParent=[IO.Path]::GetFullPath([string]$original['RUNNER_TEMP']).TrimEnd('\');Assert-PlainAncestors $tempParent
 if($tempParent -cne ([string]$original['RUNNER_TEMP']).TrimEnd('\')){throw 'INTERNAL_FAILURE'}
 if($PythonPath -cne [IO.Path]::GetFullPath($PythonPath) -or [IO.Path]::GetFileName($PythonPath) -cne 'python.exe'){throw 'INTERNAL_FAILURE'}
 Assert-PlainAncestors ([IO.Path]::GetDirectoryName($PythonPath));PlainFile $PythonPath 268435456
 $failure='SDK_PROFILE_REJECTED';Assert-SdkLabel ([string]$original['ANDROID_HOME'])
 if($original.Contains('ANDROID_SDK_ROOT')){Assert-SdkLabel ([string]$original['ANDROID_SDK_ROOT'])}
 $buildTools='C:\Program Files (x86)\Android\android-sdk\build-tools\36.0.0';Assert-PlainAncestors $buildTools
 $failure='SOURCE_CHANGED'
 foreach($key in @('FONESI_AUTO_SOURCE_COMMIT','FONESI_AUTO_SOURCE_TREE')){if([string]$original[$key] -cnotmatch '\A[0-9a-f]{40}\z'){throw 'SOURCE_CHANGED'}}
 $names=@('desktop/verification/Invoke-DerivedNoticeEvidence.ps1','desktop/verification/derived_notice_evidence.py','desktop/verification/derived_pair_build.py','desktop/verification/WindowsBoundary.psm1','desktop/verification/OwnedFiles.psm1','tools/phase-00/HostProbeNative.cs','docs/evidence/P3-01-derived-pair-build-sample-2026-11-02/tools.json','docs/evidence/P3-01-derived-pair-build-sample-2026-11-02/report.json','docs/evidence/P3-01-derived-pair-build-sample-2026-11-02/dependencies.json')
 [Array]::Sort($names,[StringComparer]::Ordinal)
 $closure=@(foreach($name in $names){$file=Join-Path $repo $name;Assert-PlainAncestors ([IO.Path]::GetDirectoryName($file));PlainFile $file 8388608;[ordered]@{name=$name;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}})
 Assert-PlainAncestors $desktop
 [Fonesi.Phase00.NativeProbe]::ReserveDirectory($base)
 $baseOwner=[pscustomobject]@{Parent=$desktop;Path=$base;Token=[guid]::NewGuid().ToString()};WriteNew (Join-Path $base '.owner') $baseOwner.Token 36;Assert-OwnedRun $baseOwner
 $owner=New-OwnedRun $tempParent;Assert-OwnedRun $owner
 $context=[ordered]@{version=1;owner=$owner.Token;baseOwner=$baseOwner.Token;scratchRoot=$owner.Path;autoSourceCommit=[string]$original['FONESI_AUTO_SOURCE_COMMIT'];autoSourceTree=[string]$original['FONESI_AUTO_SOURCE_TREE'];buildToolsRoot=$buildTools;sourceClosure=$closure}
 JsonNew (Join-Path $owner.Path 'context.json') $context
 $contextHash=(Get-FileHash -LiteralPath (Join-Path $owner.Path 'context.json') -Algorithm SHA256).Hash.ToLowerInvariant()
 $failure='INPUT_REJECTED';$capture=RunAction 'capture'
 $failure='STAGING_FAILED';$stage=RunAction 'stage'
 $failure='CLEANUP_FAILED';$cleanup=RunAction 'cleanup'
 if(Test-Path -LiteralPath $owner.Path){throw 'CLEANUP_FAILED'}
 Assert-OwnedRun $baseOwner
 JsonNew (Join-Path $base 'processes.json') ([ordered]@{version=1;contextSha256=$contextHash;capture=$capture;stage=$stage;cleanup=$cleanup;directoryCleanup=$true})
 $failure='PUBLICATION_FAILED';$publication=RunAction 'publish'
 Assert-OwnedRun $baseOwner
 $upload=Join-Path $base 'upload';Assert-PlainDirectory $upload
 $entries=@(Get-ChildItem -LiteralPath $upload -Force)
 if($entries.Count -ne 3){throw 'PUBLICATION_FAILED'}
 Assert-ExactPublishedText (Join-Path $upload 'NOTICE.txt') 1063288 '2df581726e404bf9f5385107b650f6bf7800945348745ea54b7970d98e816b86'
 Assert-ExactPublishedText (Join-Path $upload 'source.properties') 62 '7dee6632e9ad6cb111da2bb99d747211e27927061b1276d040bb1d71fded5ebb'
 $expectedReceipt='{"version":1,"scope":"EXACT_BUILD_TOOLS_NOTICE_EVIDENCE","autoSourceCommit":"@COMMIT@","autoSourceTree":"@TREE@","baselineReportSha256":"1d9ba8ee1466a138a5c8d0b5166fedd65a3756a5794ff3d7cb76ab17601ad2f6","baselineToolsSha256":"15634991ffb5d5c5a4419a62ce6cdceeb8957fc0313587c779c6911f8e241047","baselineDependenciesSha256":"052271a1f838628f2421d5fe0c410dbaf203c81e06d69886c3d052a7060a4dd8","files":[{"name":"NOTICE.txt","bytes":1063288,"sha256":"2df581726e404bf9f5385107b650f6bf7800945348745ea54b7970d98e816b86"},{"name":"source.properties","bytes":62,"sha256":"7dee6632e9ad6cb111da2bb99d747211e27927061b1276d040bb1d71fded5ebb"}],"toolBindings":[{"name":"aidl.exe","bytes":3512416,"sha256":"266dcf772ad1791b43f1ec5702af2e152d1222b051d3676af4e47006dd47d359"},{"name":"lib/d8.jar","bytes":17998582,"sha256":"4097ff9c46c185c6e7214da7fe9b1befb5adeea5cc9ca349270e0249904f9240"},{"name":"core-lambda-stubs.jar","bytes":17103,"sha256":"2feb8df434cae3218ed9ffe9bae01ddec101d1dc5e12824c4209f61e283e0d3d"}],"sourceUnchanged":true,"inputsUnchanged":true,"processRetired":true,"directoryCleanup":true,"passed":true}'
 $expectedReceipt=$expectedReceipt.Replace('@COMMIT@',[string]$original['FONESI_AUTO_SOURCE_COMMIT']).Replace('@TREE@',[string]$original['FONESI_AUTO_SOURCE_TREE'])
 if((ReadText (Join-Path $upload 'receipt.json') 8192) -cne $expectedReceipt){throw 'PUBLICATION_FAILED'}
 if($clock.ElapsedMilliseconds -gt 70000){throw 'PUBLICATION_FAILED'}
 $published=$true
} catch {
 $message=[string]$_.Exception.Message
 if($message -cin $categories){$failure=$message}
 if(-not $allRetired){$failure='UNRETIRED'}
} finally {
 foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
 foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}
}
if($published){Write-Output 'DERIVED_NOTICE_EVIDENCE_PASS';exit 0}
Write-Output ('DERIVED_NOTICE_EVIDENCE_FAIL_'+$failure);exit 1
