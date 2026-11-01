$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $desktop '.platform-tools-runtime'
$owner=$null;$allClean=$true;$baseVerified=$false;$phase='PREPARE'
$report=[ordered]@{version=1;scope='HOSTED_ADB_VERSION_DEVELOPMENT_ONLY';candidateSha256='45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99';revision='37.0.1';binaryArchitecture='IA32';hostArchitecture='X64';cases=[ordered]@{archiveVerified=$false;inventoryVerified=$false;architectureVerified=$false;missingRejected=$false;tamperRejected=$false;architectureRejected=$false;pathShadowIgnored=$false;sourceBound=$false;profileUnchanged=$false;candidateUnchanged=$false;commandVersionOnly=$false};process=$null;versionObserved=$false;directoryCleanup=$false;failure=$null}
function Retired($p){return ($p.CleanupComplete -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT'))}
function Evidence($p){return [ordered]@{status=$p.Status;exitCode=$p.ExitCode;cleanupComplete=$p.CleanupComplete;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated}}
function Write-Private([string]$file,$value){Assert-PlainDirectory ([IO.Path]::GetDirectoryName($file));$bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Depth 16 -Compress));if($bytes.Length -gt 65536){throw 'PRIVATE_LIMIT'};$s=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()}}
function Read-Private([string]$file){$i=Get-Item -LiteralPath $file -Force;if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -gt 65536){throw 'PRIVATE_LIMIT'};return ([IO.File]::ReadAllText($file)|ConvertFrom-Json)}
function Require($p,[string]$marker){if(-not (Retired $p) -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0 -or (($p.Stdout -replace '\r\n',"`n").TrimEnd("`n")) -cne $marker){throw 'CONTROL_FAILED'}}
function Show-ControlDiagnostic($p){
 $vector=[ordered]@{
 PHASE=@('PREPARE','VERIFY','CLEANUP','ARGUMENT')
 REASON=@('P201_ARGUMENT','P201_CHANGED','P201_CLEANUP','P201_FILE','P201_LIMIT','P201_NEGATIVE_ACCEPTED','P201_NEGATIVE_UNEXPECTED','P201_OWNER','P201_PE','PLATFORM_TOOLS_FILES_REJECTED','RESTORE_OWNER','RESTORE_FILE','RESTORE_LIMIT','RESTORE_READBACK','ENOENT','EACCES','EPERM','EEXIST','ENOTEMPTY','UNCLASSIFIED')
 }
 $shown=0;foreach($key in $vector.Keys){$count=0;$selected=$null;foreach($value in $vector[$key]){$literal='P201_CONTROL_'+$key+'_'+$value;$matches=@($p.Stderr -split '\r?\n'|Where-Object {$_ -ceq $literal}).Count;if($matches -gt 0){$count+=$matches;$selected=$literal}};if($count -eq 1 -and $shown -lt 2){Write-Output $selected;$shown++}}
}
function Show-NativeDiagnostic($p){
 $status='INVALID';if($p.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED')){$status=$p.Status};Write-Output ('P201_NATIVE_STATUS_'+$status)
 $exit='NONZERO';if($null -eq $p.ExitCode){$exit='NONE'}elseif($p.ExitCode -eq 0){$exit='ZERO'};Write-Output ('P201_NATIVE_EXIT_'+$exit)
 $retirement='UNCONFIRMED';if(Retired $p){$retirement='CONFIRMED'};Write-Output ('P201_NATIVE_RETIREMENT_'+$retirement)
 $count=@($p.Stdout -split '\r?\n'|Where-Object {$_ -cne ''}).Count;$lines='MORE';if($count -le 4){$lines=@('ZERO','ONE','TWO','THREE','FOUR')[$count]};Write-Output ('P201_NATIVE_LINES_'+$lines)
}
function Node-Control([string]$action){$script:allClean=$false;$p=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'platform-tools-version-control.cjs'),$action,$owner.Path)) 30000 @{};$script:allClean=Retired $p;if(-not $script:allClean -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0 -or (($p.Stdout -replace '\r\n',"`n").TrimEnd("`n")) -cne 'P201_CONTROL_PASS'){Show-ControlDiagnostic $p};Require $p 'P201_CONTROL_PASS'}
function Empty-Profile([string]$profile){Assert-PlainDirectory $profile;$enumerator=[IO.Directory]::EnumerateFileSystemEntries($profile).GetEnumerator();try{if($enumerator.MoveNext()){throw 'PROFILE_CHANGED'}}finally{$enumerator.Dispose()}}
try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitOperatingSystem){throw 'WINDOWS_REQUIRED'}
 Assert-PlainDirectory $desktop
 $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
 if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'){throw 'HELPER_CHANGED'}
 if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED_HELPER_REJECTED'}
 Add-Type -Path $helper
 if(-not (Test-Path -LiteralPath $base)){[Fonesi.Phase00.NativeProbe]::ReserveDirectory($base)}
 Assert-PlainDirectory $base;$baseVerified=$true
 if(Test-Path -LiteralPath (Join-Path $base 'unvalidated.json')){throw 'PRIOR_REPORT'}
 $root=Join-Path $base ('run-'+[guid]::NewGuid().ToString());[Fonesi.Phase00.NativeProbe]::ReserveDirectory($root)
 $token=[guid]::NewGuid().ToString();$stream=[IO.File]::Open((Join-Path $root '.owner'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$bytes=[Text.Encoding]::UTF8.GetBytes($token);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 $owner=[pscustomobject]@{Parent=$base;Path=$root;Token=$token};Assert-OwnedRun $owner
 $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe'
 $nodeFile=Get-Item -LiteralPath $node -Force
 if($nodeFile.PSIsContainer -or ($nodeFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_REJECTED'}
 $python=$env:FOUNDATION_PYTHON_EXE;$pythonFile=Get-Item -LiteralPath $python -Force
 if(-not [IO.Path]::IsPathRooted($python) -or $pythonFile.PSIsContainer -or ($pythonFile.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'PYTHON_REJECTED'}
 $phase='EXTRACT';$archive=Join-Path $desktop '.platform-tools-input/platform-tools_r37.0.1-win.zip'
 $allClean=$false;$extract=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'platform_tools_archive.py'),'extract',$archive,(Join-Path $root 'candidate'),$token)) 30000 @{}
 $allClean=Retired $extract;Require $extract 'PLATFORM_TOOLS_ARCHIVE_EXTRACTED';$report.cases.archiveVerified=$true
 $phase='PREFLIGHT';Node-Control 'prepare'
 $preflight=Read-Private (Join-Path $root 'preflight.json')
 foreach($name in @('inventoryVerified','architectureVerified','missingRejected','tamperRejected','architectureRejected','pathShadowIgnored','sourceBound')){if($preflight.$name -isnot [bool] -or -not $preflight.$name){throw 'PREFLIGHT_FAILED'};$report.cases[$name]=$true}
 $profile=Join-Path $root 'profile';[Fonesi.Phase00.NativeProbe]::ReserveDirectory($profile);Empty-Profile $profile
 $phase='ADMISSION';Node-Control 'verify';Assert-OwnedRun $owner
 $exe=Join-Path $root 'candidate/platform-tools/adb.exe'
 $original=@{};foreach($key in @('PATH','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP')){$original[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
 $phase='VERSION';$allClean=$false
 try{
  [Environment]::SetEnvironmentVariable('PATH',(Join-Path $env:SystemRoot 'System32'),'Process')
  foreach($key in @('USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP')){[Environment]::SetEnvironmentVariable($key,$profile,'Process')}
  # Sole ADB invocation: literal version. No server/discovery/device command exists here.
  $native=Invoke-OwnedChild $exe ([string[]]@('version')) 30000 @{}
 }finally{foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable($key,$original[$key],'Process')}}
 $allClean=Retired $native;Show-NativeDiagnostic $native;$report.process=Evidence $native;$report.cases.commandVersionOnly=$true
 Write-Private (Join-Path $root 'capture.json') ([ordered]@{process=(Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
 if(-not $allClean){throw 'RETIREMENT_FAILED'}
 $phase='POSTCHECK';Node-Control 'verify';$report.cases.candidateUnchanged=$true
 Empty-Profile $profile;$report.cases.profileUnchanged=$true
 $phase='VALIDATE';$allClean=$false;$validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_platform_tools.py'),'stage',$root)) 30000 @{}
 $allClean=Retired $validated;Require $validated 'PLATFORM_TOOLS_STAGE_VALIDATED'
 $public=Read-Private (Join-Path $root 'public.json');if($public.versionObserved -isnot [bool] -or -not $public.versionObserved){throw 'VERSION_REJECTED'};$report.versionObserved=$true
 $phase='CLEANUP';Assert-OwnedRun $owner;Node-Control 'cleanup';Remove-VerifiedOwnedRun $owner $allClean;$report.directoryCleanup=$true
}catch{
 $report.failure='PREFLIGHT_FAILED';if($phase -ceq 'VERSION'){$report.failure='PROCESS_FAILED'}elseif($phase -ceq 'VALIDATE'){$report.failure='VERSION_REJECTED'}elseif($phase -ceq 'POSTCHECK'){$report.failure='OWNERSHIP_REJECTED'}elseif($phase -ceq 'CLEANUP'){$report.failure='CLEANUP_FAILED'};if($phase -cin @('PREPARE','EXTRACT','PREFLIGHT','ADMISSION','VERSION','POSTCHECK','VALIDATE','CLEANUP')){Write-Output ('P201_STAGE_'+$phase)}
}finally{
 if($baseVerified){try{Write-Private (Join-Path $base 'unvalidated.json') $report;Write-Output 'P201_REPORT_WRITTEN'}catch{Write-Output 'P201_REPORT_FAILED'}}
}
