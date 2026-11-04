# Only the reviewed outer supervisor invokes this checked-in script in a fresh owned Job.
param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$phase='ADMISSION';$failure='PREFLIGHT_FAILED'
function Read-Private([string]$file,[long]$limit=65536){$i=Get-Item -LiteralPath $file -Force;if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -gt $limit){throw 'PRIVATE_REJECTED'};return [IO.File]::ReadAllText($file)}
function Write-Private([string]$file,$value){$bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Depth 16 -Compress));if($bytes.Length -gt 524288){throw 'PRIVATE_LIMIT'};$s=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()}}
function Scenario($p){
 $process=$null;if($null -ne $p){$process=[ordered]@{status=$p.Status;exitCode=$p.ExitCode;cleanupComplete=$p.CleanupComplete;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated}}
 return [ordered]@{process=$process;listenerOwned=($null -ne $p -and $p.ListenerOwned);hostVersionObserved=($null -ne $p -and $p.HealthObserved);endpointReleased=($null -ne $p -and $p.EndpointReleased);foreignOwnerUnchanged=$false;launchRefused=$false;forcedStop=($null -ne $p -and $p.ForcedStop);deadlineObserved=($null -ne $p -and $p.DeadlineObserved);prematureDeathObserved=($null -ne $p -and $p.PrematureDeathObserved)}
}
function Show-ServerDiagnostic($native){
 $p=$null;if($native.Phase -ceq 'HEALTHY'){$p=$native.Healthy}elseif($native.Phase -ceq 'DEATH'){$p=$native.Death}elseif($native.Phase -ceq 'TIMEOUT'){$p=$native.Timeout}
 $status='NONE';$processPhase='NONE';if($null -ne $p){$status=$p.Status;$processPhase=$p.Phase}
 if($native.Phase -cin @('ADMISSION','COLLISION','PROFILE','HEALTHY','DEATH','TIMEOUT','CLEANUP')){[Console]::Error.WriteLine('P202_NATIVE_STEP_'+$native.Phase)}
 if($native.Reason -cin @('DIRECTORY_REJECTED','FILE_REJECTED','FILE_CHANGED','OWNER_REJECTED','PROFILE_REJECTED','PROFILE_CHANGED','INVENTORY_REJECTED','LISTENER_TABLE_REJECTED','LISTENER_TABLE_CHANGED','LISTENER_ADDRESS_REJECTED','LISTENER_DUPLICATE','HEALTH_EOF','HEALTH_DEADLINE','HEALTH_REJECTED','HEALTH_LENGTH','HEALTH_VERSION','CUSTODY_CHANGED','EARLY_EXIT','FOREIGN_LISTENER','DEATH_UNCONFIRMED','ADMISSION_REJECTED','BINARY_CHANGED','COLLISION_FAILED','RESERVATION_FAILED','NATIVE_FAILED','STDOUT_READ_FAILED','STDERR_READ_FAILED','OWNED_PROCESS_OR_DRAIN_CLEANUP_UNCONFIRMED','UNCLASSIFIED')){[Console]::Error.WriteLine('P202_NATIVE_DETAIL_'+$native.Reason)}
 if($status -cin @('NONE','SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED')){[Console]::Error.WriteLine('P202_NATIVE_STATUS_'+$status)}
 if($processPhase -cin @('NONE','ADMISSION','LAUNCH','LISTENER','HEALTH','DEADLINE','DEATH')){[Console]::Error.WriteLine('P202_NATIVE_PROCESS_PHASE_'+$processPhase)}
}
try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitOperatingSystem){throw 'WINDOWS_REQUIRED'}
 if([IO.Path]::GetFullPath($Root) -cne $Root -or [IO.Path]::GetDirectoryName($Root) -cne (Join-Path $desktop '.platform-tools-server-runtime') -or [IO.Path]::GetFileName($Root) -cnotmatch '\Arun-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z'){throw 'ROOT_REJECTED'}
 $token=Read-Private (Join-Path $Root '.owner') 36
 if($token -cnotmatch '\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z'){throw 'OWNER_REJECTED'}
 $admission=(Read-Private (Join-Path $Root 'admission.json'))|ConvertFrom-Json
 if($admission.version -ne 1 -or $admission.runToken -cne $token -or $admission.operation -cne 'ISOLATED_SERVER_DEVELOPMENT'){throw 'ADMISSION_REJECTED'}
 # Names are not accepted from the record: only this exact checked-in dependency closure.
 $sources=@('src/main/platform-tools-files.ts','verification/platform-tools-candidate.json','verification/platform-tools-server-control.cjs','verification/Invoke-PlatformToolsServer.ps1','verification/Test-PlatformToolsServer.ps1','native/IsolatedAdbServer.cs','verification/platform_tools_archive.py','verification/validate_platform_tools_server.py','verification/validate_platform_tools.py','../tools/phase-00/HostProbeNative.cs','verification/WindowsBoundary.psm1','verification/OwnedFiles.psm1','verification/persistence-restore-contract.cjs')
 if(@($admission.sources.PSObject.Properties).Count -ne $sources.Count){throw 'SOURCE_REJECTED'}
 foreach($name in $sources){$file=[IO.Path]::GetFullPath((Join-Path $desktop $name));$item=Get-Item -LiteralPath $file -Force;if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $admission.sources.$name){throw 'SOURCE_REJECTED'}}
 $phase='HELPER';$helper=Join-Path $desktop 'native/IsolatedAdbServer.cs'
 if('Fonesi.Development.Server.IsolatedAdbServer' -as [type]){throw 'PRELOADED_HELPER_REJECTED'}
 Add-Type -Path $helper
 $pin=(Read-Private (Join-Path $PSScriptRoot 'platform-tools-candidate.json'))|ConvertFrom-Json
 if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'platform-tools-candidate.json') -Algorithm SHA256).Hash -ine $admission.candidateManifestSha256){throw 'CANDIDATE_REJECTED'}
 $exeRow=@($pin.files|Where-Object {$_.path -ceq 'adb.exe'})
 if($exeRow.Count -ne 1){throw 'CANDIDATE_REJECTED'}
 $phase='SERVER';$failure='SERVER_FAILED'
 $native=[Fonesi.Development.Server.IsolatedAdbServer]::Run((Join-Path $Root 'candidate/platform-tools/adb.exe'),$Root,$token,$exeRow[0].sha256)
 if($null -ne $native.Failure){Show-ServerDiagnostic $native}
 Write-Private (Join-Path $Root 'server-native.json') $native
 $occupied=Scenario $null;$occupied.endpointReleased=$native.CollisionEndpointReleased;$occupied.foreignOwnerUnchanged=$native.CollisionOwnerUnchanged;$occupied.launchRefused=$native.CollisionRefused
 $report=[ordered]@{version=1;scope='HOSTED_ADB_SERVER_DEVELOPMENT_ONLY';candidateSha256='45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99';revision='37.0.1';binaryArchitecture='IA32';hostArchitecture='X64';cases=[ordered]@{archiveVerified=$true;inventoryVerified=$true;sourceBound=$true;suppressionConfigured=$native.SuppressionConfigured;nativeProfileOwned=$native.NativeProfileOwned;existingProfileRefused=$native.ExistingProfileRefused;profileCleaned=$native.ProfileCleaned;candidateUnchanged=$false;commandForegroundOnly=$true};scenarios=[ordered]@{occupied=$occupied;healthy=(Scenario $native.Healthy);death=(Scenario $native.Death);timeout=(Scenario $native.Timeout)};directoryCleanup=$false;failure=$native.Failure}
 # Postprocess physical revalidation belongs to outer Node control, not a native assertion.
 $payload=Join-Path $Root 'candidate/platform-tools';$entryCount=0;$enumerator=[IO.Directory]::EnumerateFileSystemEntries($payload).GetEnumerator();try{while($enumerator.MoveNext()){$entryCount++;if($entryCount -gt 14){throw 'CANDIDATE_CHANGED'}}}finally{$enumerator.Dispose()}
 if($entryCount -ne 14 -or @($pin.files).Count -ne 14){throw 'CANDIDATE_CHANGED'}
 foreach($row in $pin.files){$file=Join-Path $payload $row.path;$i=Get-Item -LiteralPath $file -Force;if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -ne $row.bytes -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $row.sha256){throw 'CANDIDATE_CHANGED'}}
 $report.cases.candidateUnchanged=$true
 $phase='REPORT';Write-Private (Join-Path $Root 'server.json') $report
 if($null -ne $native.Failure){$failure=$native.Failure;throw 'SERVER_FAILED'}
 Write-Output 'P202_SERVER_OBSERVED';exit 0
}catch{
 if($phase -cin @('ADMISSION','HELPER','SERVER','REPORT')){[Console]::Error.WriteLine('P202_NATIVE_PHASE_'+$phase)}
 if($failure -cin @('PREFLIGHT_FAILED','PROFILE_REJECTED','SERVER_FAILED','RETIREMENT_FAILED','CLEANUP_FAILED')){[Console]::Error.WriteLine('P202_NATIVE_FAILURE_'+$failure)}
 Write-Output 'P202_SERVER_FAILED';exit 1
}
