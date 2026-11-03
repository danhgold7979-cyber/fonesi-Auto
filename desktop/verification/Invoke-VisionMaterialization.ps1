# Development-only fixed materialization. Never imports candidate CV2/Paddle or models.
# Exact execution readiness is separate from source availability; default refuses.
param([switch]$ReviewedMaterialization,[ValidateSet('11.9.0','11.19.1')][string]$NpmVersion='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$utf8=New-Object Text.UTF8Encoding($false,$true)
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$checkout=[IO.Path]::GetFullPath((Join-Path $desktop '..'))
$guards=New-Object 'System.Collections.Generic.List[IDisposable]'
$owners=New-Object 'System.Collections.Generic.List[object]'
$before=@{};$lease=$null;$failed=$false;$compiledRoot=$null;$failureStage='ADMISSION';$inventoryBytes=$null;$evidence=$null;$evidenceReady=$false
$report=[ordered]@{version=1;scope='WINDOWS_MATERIALIZATION_ONLY';hostTrust='EXISTING_HOSTED_CI_TOOLCHAIN';compiled=$false;sourceOwnerSha256=$null;compiledOwnerSha256=$null;compilerExecutableSha256=$null;hostVersion=$null;hostExecutableSha256=$null;hostPathPolicy='OBSERVED_CANONICAL_RUNNER_TOOL_CACHE';hostPrerequisites=@();hostPrerequisitesScope='STATIC_ONLY_NOT_RUNTIME_ADMISSION';runtimeFiles=$null;runtimeBytes=$null;stages=@();installedInventorySha256=$null;expectedInventorySha256=$null;inventoryBytes=$null;reproductionDisposition='NOT_OBSERVED';indexHandoff=$false;retired=$true;sourceUnchanged=$false;passed=$false;candidateInference='NOT_RUN';failure=$null;failureStage=$null;hostDiagnostic=$null}
function Hash([string]$path){return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Hold([string]$path,[long]$cap){
 $i=Get-Item -LiteralPath $path -Force
 if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -gt $cap){throw 'SOURCE_REJECTED'}
 $s=New-Object IO.FileStream($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 $script:guards.Add($s);$script:before[$path]=Hash $path
}
function Dictionary(){return ,(New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal))}
function NativeSummary($r){return [ordered]@{status=$r.Status;retired=$r.Retired;exitCode=$r.ExitCode;stdoutBytes=$r.Stdout.Length;stderrBytes=$r.Stderr.Length;stdoutOverflow=$r.StdoutOverflow;stderrOverflow=$r.StderrOverflow;elapsedMilliseconds=$r.ElapsedMilliseconds}}
function WaitOwned($owner,[string]$profile){
 if($profile -cnotin @('Prepare','Bundle','CreatePreprocess','CreateOcr','InstallPreprocess','InstallOcr','Freeze')){throw 'PROFILE_REJECTED'}
 $script:owners.Add([pscustomobject]@{owner=$owner;profile=$profile});$r=$owner.Begin();$watch=[Diagnostics.Stopwatch]::StartNew()
 while(-not $r.Retired -and $watch.ElapsedMilliseconds -lt 610000){
  if($r.Status -match 'UNCERTAIN|UNRETIRED'){break}
  Start-Sleep -Milliseconds 10;$r=$owner.Poll()
 }
 if(-not $r.Retired){$script:report.stages+=@([ordered]@{profile=$profile;observation='PENDING';result=NativeSummary $r});$r=$owner.Reconcile(10000)}
 $script:report.stages+=@([ordered]@{profile=$profile;observation='TERMINAL';result=NativeSummary $r})
 if(-not $r.Retired){$script:report.retired=$false;throw 'OWNERSHIP_PENDING'}
 if($r.Status -cne 'SUCCESS' -or $r.ExitCode -ne 0 -or $r.StdoutOverflow -or $r.StderrOverflow){
  if($script:failureStage -cin @('HOST_PREPARE','HOST_FREEZE') -and $r.Stderr.Length -le 512){
   try{$diagnostic=$utf8.GetString($r.Stderr);if($diagnostic -cmatch '\A\{"stage":"(ADMISSION|SOURCE_INDEX|PREPARE|FREEZE|REPORT)","type":"(ValueError|OSError|TimeoutError|URLError|HTTPError|JSONDecodeError|PermissionError|FileExistsError|FileNotFoundError|ModuleNotFoundError|RuntimeError|Other)"\}\n\z'){$script:report.hostDiagnostic=[ordered]@{stage=$Matches[1];type=$Matches[2]}}}catch{}
  }
  throw 'CHILD_UNAVAILABLE'
 }
 return $r
}
function HashBytes([byte[]]$bytes){
 $sha=[Security.Cryptography.SHA256]::Create()
 try{return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
}
function ReadHeldInventory([IO.Stream]$stream,[string]$expected){
 if(-not $stream.CanRead -or -not $stream.CanSeek -or $stream.Length -lt 2 -or $stream.Length -gt 16777216 -or $expected -cnotmatch '^[0-9a-f]{64}$'){throw 'INVENTORY_CAPTURE_REJECTED'}
 $bytes=New-Object byte[] ([int]$stream.Length);$stream.Position=0;$offset=0
 while($offset -lt $bytes.Length){$read=$stream.Read($bytes,$offset,$bytes.Length-$offset);if($read -le 0){throw 'INVENTORY_CAPTURE_SHORT'};$offset+=$read}
 if($stream.Length -ne $bytes.Length -or (HashBytes $bytes) -cne $expected){throw 'INVENTORY_CAPTURE_CHANGED'}
 return ,$bytes
}
function ClosedMetadata($value,[string[]]$keys){
 if($value -isnot [Collections.IDictionary] -or $value.Count -ne $keys.Count){throw 'EVIDENCE_SCHEMA'}
 foreach($key in $value.Keys){if($key -isnot [string] -or $key -cnotin $keys){throw 'EVIDENCE_SCHEMA'}}
}
function MetadataInteger($value,[long]$minimum,[long]$maximum,[bool]$nullable){
 if($null -eq $value -and $nullable){return}
 if(($value -isnot [int] -and $value -isnot [long]) -or $value -lt $minimum -or $value -gt $maximum){throw 'EVIDENCE_INTEGER'}
}
function MetadataHash($value,[bool]$nullable){
 if($null -eq $value -and $nullable){return}
 if($value -isnot [string] -or $value -cnotmatch '^[0-9a-f]{64}$'){throw 'EVIDENCE_HASH'}
}
function MetadataSchema($value){
 $keys=@('version','scope','hostTrust','compiled','sourceOwnerSha256','compiledOwnerSha256','compilerExecutableSha256','hostVersion','hostExecutableSha256','hostPathPolicy','hostPrerequisites','hostPrerequisitesScope','runtimeFiles','runtimeBytes','stages','installedInventorySha256','expectedInventorySha256','inventoryBytes','reproductionDisposition','indexHandoff','retired','sourceUnchanged','passed','candidateInference','failure','failureStage','hostDiagnostic')
 ClosedMetadata $value $keys
 MetadataInteger $value.version 1 1 $false
 foreach($key in @('scope','hostTrust','hostPathPolicy','hostPrerequisitesScope','candidateInference')){if($value[$key] -isnot [string]){throw 'EVIDENCE_POLICY'}}
 if($value.scope -cne 'WINDOWS_MATERIALIZATION_ONLY' -or $value.hostTrust -cne 'EXISTING_HOSTED_CI_TOOLCHAIN' -or $value.hostPathPolicy -cne 'OBSERVED_CANONICAL_RUNNER_TOOL_CACHE' -or $value.hostPrerequisitesScope -cne 'STATIC_ONLY_NOT_RUNTIME_ADMISSION' -or $value.candidateInference -cne 'NOT_RUN'){throw 'EVIDENCE_POLICY'}
 foreach($key in @('compiled','retired','sourceUnchanged','passed','indexHandoff')){if($value[$key] -isnot [bool]){throw 'EVIDENCE_BOOLEAN'}}
 foreach($key in @('sourceOwnerSha256','compiledOwnerSha256','compilerExecutableSha256','hostExecutableSha256','installedInventorySha256','expectedInventorySha256')){MetadataHash $value[$key] $true}
 MetadataInteger $value.inventoryBytes 2 16777216 $true
 if($value.reproductionDisposition -isnot [string] -or $value.reproductionDisposition -cnotin @('NOT_OBSERVED','MATCH','OBSERVED_MISMATCH_NOT_ADMITTED')){throw 'EVIDENCE_REPRODUCTION'}
 if($null -ne $value.hostVersion -and ($value.hostVersion -isnot [string] -or $value.hostVersion.Length -gt 20 -or $value.hostVersion -cnotmatch '^3\.12\.[0-9]+$')){throw 'EVIDENCE_HOST_VERSION'}
 MetadataInteger $value.runtimeFiles 0 50000 $true;MetadataInteger $value.runtimeBytes 0 4294967296 $true
 if($null -ne $value.failure -and ($value.failure -isnot [string] -or $value.failure -cnotin @('MATERIALIZATION_UNAVAILABLE','EVIDENCE_EXPORT_UNAVAILABLE','REPRODUCTION_MISMATCH'))){throw 'EVIDENCE_FAILURE'}
 if($null -ne $value.failureStage -and ($value.failureStage -isnot [string] -or $value.failureStage -cnotin @('ADMISSION','COMPILE','RESERVE','HOST_SOURCE','HOST_PREPARE','HOST_BUNDLE','CANDIDATE_BOOTSTRAP','HOST_FREEZE','REPRODUCTION','INDEX_HANDOFF','EVIDENCE'))){throw 'EVIDENCE_FAILURE_STAGE'}
 if($value.hostPrerequisites -isnot [array] -or $value.hostPrerequisites.Count -gt 4 -or $value.stages -isnot [array] -or $value.stages.Count -gt 21){throw 'EVIDENCE_ARRAY'}
 $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
 foreach($item in $value.hostPrerequisites){
  ClosedMetadata $item @('name','state','sha256')
  if($item.name -isnot [string] -or $item.state -isnot [string]){throw 'EVIDENCE_PREREQUISITE'}
  if($item.name -cnotin @('VCOMP140.DLL','MFPlat.DLL','MF.dll','MFReadWrite.dll') -or -not $seen.Add($item.name)){throw 'EVIDENCE_PREREQUISITE'}
  if($item.state -ceq 'OBSERVED'){MetadataHash $item.sha256 $false}elseif($item.state -ceq 'MISSING'){if($null -ne $item.sha256){throw 'EVIDENCE_PREREQUISITE'}}else{throw 'EVIDENCE_PREREQUISITE'}
 }
 if($null -ne $value.hostDiagnostic){
  ClosedMetadata $value.hostDiagnostic @('stage','type')
  if($value.hostDiagnostic.stage -isnot [string] -or $value.hostDiagnostic.type -isnot [string]){throw 'EVIDENCE_DIAGNOSTIC'}
  if($value.hostDiagnostic.stage -cnotin @('ADMISSION','SOURCE_INDEX','PREPARE','FREEZE','REPORT') -or $value.hostDiagnostic.type -cnotin @('ValueError','OSError','TimeoutError','URLError','HTTPError','JSONDecodeError','PermissionError','FileExistsError','FileNotFoundError','ModuleNotFoundError','RuntimeError','Other')){throw 'EVIDENCE_DIAGNOSTIC'}
 }
 foreach($entry in $value.stages){
  ClosedMetadata $entry @('profile','observation','result')
  if($entry.profile -isnot [string] -or $entry.observation -isnot [string]){throw 'EVIDENCE_STAGE'}
  if($entry.profile -cnotin @('Prepare','Bundle','CreatePreprocess','CreateOcr','InstallPreprocess','InstallOcr','Freeze') -or $entry.observation -cnotin @('PENDING','TERMINAL','FINAL_RECONCILIATION')){throw 'EVIDENCE_STAGE'}
  $r=$entry.result;ClosedMetadata $r @('status','retired','exitCode','stdoutBytes','stderrBytes','stdoutOverflow','stderrOverflow','elapsedMilliseconds')
  if($r.status -isnot [string]){throw 'EVIDENCE_STATUS'}
  if($r.status -cnotin @('ADMISSION_CLEANUP_UNCERTAIN','ADMITTED','CANCELLED','DESCENDANT_UNRETIRED','EXIT_QUERY_UNCERTAIN','HANDLE_CLOSE_UNCERTAIN','JOB_QUERY_UNCERTAIN','MEMORY_UNAVAILABLE','OBSERVATION_UNCERTAIN','OUTPUT_LIMIT','PIPE_FAILED','PROCESS_QUERY_UNCERTAIN','RUNNING','TERMINATION_UNCERTAIN','TIMEOUT','LAUNCH_FAILED','SUCCESS','NONZERO_EXIT')){throw 'EVIDENCE_STATUS'}
  foreach($key in @('retired','stdoutOverflow','stderrOverflow')){if($r[$key] -isnot [bool]){throw 'EVIDENCE_BOOLEAN'}}
  MetadataInteger $r.exitCode -2147483648 2147483647 $true
  MetadataInteger $r.stdoutBytes 0 65536 $false;MetadataInteger $r.stderrBytes 0 65536 $false
  MetadataInteger $r.elapsedMilliseconds 0 86400000 $false
 }
}

function EvidencePayload($value,[byte[]]$inventory){
 $profiles=@('Prepare','Bundle','CreatePreprocess','CreateOcr','InstallPreprocess','InstallOcr','Freeze')
 MetadataSchema $value
 $terminal=@();$finals=@();foreach($entry in $value.stages){
  if($entry.profile -cnotin $profiles -or $entry.observation -cnotin @('PENDING','TERMINAL','FINAL_RECONCILIATION')){throw 'EVIDENCE_STAGE'}
  if($entry.observation -ceq 'TERMINAL'){$terminal+=@($entry)}
  if($entry.observation -ceq 'FINAL_RECONCILIATION'){$finals+=@($entry)}
 }
 $mismatch=$value.reproductionDisposition -ceq 'OBSERVED_MISMATCH_NOT_ADMITTED'
 if($value.passed -or $mismatch){
  if($value.passed){
   if($value.reproductionDisposition -cne 'MATCH' -or -not $value.indexHandoff -or $value.expectedInventorySha256 -cne $value.installedInventorySha256 -or $null -ne $value.failure){throw 'EVIDENCE_REPRODUCTION'}
  }elseif($value.indexHandoff -or $value.failure -cne 'REPRODUCTION_MISMATCH' -or $value.failureStage -cne 'REPRODUCTION' -or $value.expectedInventorySha256 -ceq $value.installedInventorySha256){throw 'EVIDENCE_REPRODUCTION'}
  MetadataHash $value.expectedInventorySha256 $false
  foreach($key in @('sourceOwnerSha256','compiledOwnerSha256','compilerExecutableSha256','hostExecutableSha256','installedInventorySha256')){MetadataHash $value[$key] $false}
  if(-not $value.compiled -or $null -eq $value.hostVersion -or $value.runtimeFiles -lt 3354 -or $value.runtimeBytes -lt 152074886 -or $value.hostPrerequisites.Count -ne 4){throw 'EVIDENCE_INCOMPLETE'}
  if(-not $value.retired -or -not $value.sourceUnchanged -or $terminal.Count -ne 7 -or $finals.Count -ne 7 -or $null -eq $inventory){throw 'EVIDENCE_INCOMPLETE'}
  foreach($observations in @($terminal,$finals)){for($i=0;$i -lt 7;$i++){$entry=$observations[$i];if($entry.profile -cne $profiles[$i] -or $entry.result.status -cne 'SUCCESS' -or $entry.result.exitCode -ne 0 -or -not $entry.result.retired -or $entry.result.stdoutOverflow -or $entry.result.stderrOverflow){throw 'EVIDENCE_INCOMPLETE'}}}
  if($inventory.Length -ne $value.inventoryBytes -or $inventory.Length -lt 2 -or $inventory.Length -gt 16777216 -or (HashBytes $inventory) -cne $value.installedInventorySha256){throw 'EVIDENCE_INVENTORY'}
 }else{$inventory=$null}
 $bytes=$utf8.GetBytes(($value|ConvertTo-Json -Depth 10 -Compress)+"`n")
 if($bytes.Length -gt 65536){throw 'EVIDENCE_REPORT_LIMIT'}
 return [pscustomobject]@{report=$bytes;inventory=$inventory}
}

function HostReceipt([byte[]]$bytes,[string]$stage,[string]$version,[string]$exeHash){
 # This fixed Python producer emits a flat ASCII scalar object. No outer
 # PowerShell serialization-byte equality; decoded duplicate keys are rejected.
 if($bytes.Length -gt 8192){throw 'RECEIPT_LIMIT'}
 $text=$utf8.GetString($bytes)
 if($text.Length -eq 0 -or [int]$text[0] -eq 65279){throw 'RECEIPT_ENCODING'}
 $pattern='\G(?:\{|,)"(?<key>[A-Za-z][A-Za-z0-9]*)":(?<value>"[A-Za-z0-9_.-]*"|(?:0|[1-9][0-9]*)|true|false|null)'
 $regex=New-Object Text.RegularExpressions.Regex($pattern,[Text.RegularExpressions.RegexOptions]::CultureInvariant,[TimeSpan]::FromMilliseconds(100))
 $keys=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
 $offset=0
 while($true){$m=$regex.Match($text,$offset);if(-not $m.Success){break};if(-not $keys.Add($m.Groups['key'].Value)){throw 'RECEIPT_DUPLICATE'};$offset+=$m.Length}
 if($text.Substring($offset) -cnotin @('}',"}`n","}`r`n")){throw 'RECEIPT_JSON'}
 $expected=@('version','scope','stage','hostVersion','hostExecutableSha256','hostIsolated','hostSiteDisabled','hostBytecodeDisabled','hostTrust','reportSha256','wheelCount','pythonFiles','modelFiles','acquiredBytes','runtimeFiles','runtimeBytes','inventoryBytes','expectedInventorySha256','comparison','candidateInference')
 if($keys.Count -ne $expected.Count){throw 'RECEIPT_SCHEMA'}
 foreach($key in $expected){if(-not $keys.Contains($key)){throw 'RECEIPT_SCHEMA'}}
 $v=$text|ConvertFrom-Json
 if($v.version -isnot [int] -and $v.version -isnot [long]){throw 'RECEIPT_TYPE'}
 foreach($key in @('hostIsolated','hostSiteDisabled','hostBytecodeDisabled')){if($v.$key -isnot [bool]){throw 'RECEIPT_TYPE'}}
 foreach($key in @('wheelCount','pythonFiles','modelFiles','acquiredBytes','runtimeFiles','runtimeBytes','inventoryBytes')){if($null -ne $v.$key -and $v.$key -isnot [int] -and $v.$key -isnot [long]){throw 'RECEIPT_TYPE'}}
 if($v.version -ne 1 -or $v.scope -cne 'TRUSTED_HOST_STAGING_ONLY' -or $v.stage -cne $stage -or $v.hostVersion -cne $version -or $v.hostExecutableSha256 -cne $exeHash -or $v.hostIsolated -cne $true -or $v.hostSiteDisabled -cne $true -or $v.hostBytecodeDisabled -cne $true -or $v.hostTrust -cne 'EXISTING_HOSTED_CI_TOOLCHAIN' -or $v.candidateInference -cne 'NOT_RUN' -or $v.reportSha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'RECEIPT_IDENTITY'}
 if($stage -ceq 'PREPARE'){
  if($v.wheelCount -ne 74 -or $v.pythonFiles -ne 3354 -or $v.modelFiles -ne 3 -or $v.acquiredBytes -ne 328203212 -or $null -ne $v.runtimeFiles -or $null -ne $v.runtimeBytes -or $null -ne $v.comparison -or $null -ne $v.inventoryBytes -or $null -ne $v.expectedInventorySha256){throw 'PREPARE_INCOMPLETE'}
 }else{
  if($null -ne $v.wheelCount -or $null -ne $v.pythonFiles -or $null -ne $v.modelFiles -or $null -ne $v.acquiredBytes -or $v.runtimeFiles -lt 3354 -or $v.runtimeFiles -gt 50000 -or $v.runtimeBytes -lt 152074886 -or $v.runtimeBytes -gt 4294967296 -or $v.comparison -cnotin @('MATCH','MISMATCH') -or $v.inventoryBytes -lt 2 -or $v.inventoryBytes -gt 16777216 -or $v.expectedInventorySha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'FREEZE_INCOMPLETE'}
 }
 return $v
}
try {
 if(-not $ReviewedMaterialization -or $NpmVersion -cnotin @('11.9.0','11.19.1') -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitProcess){throw 'MATERIALIZATION_NOT_REQUESTED'}
 if($env:SystemRoot -cne 'C:\Windows'){throw 'WINDOWS_ROOT_REJECTED'}
 if($checkout -cne [IO.Path]::GetFullPath($env:GITHUB_WORKSPACE)){throw 'CHECKOUT_REJECTED'}
 $toolcache=[IO.Path]::GetFullPath($env:RUNNER_TOOL_CACHE)
 $python=Get-Item -LiteralPath $env:FOUNDATION_PYTHON_EXE -Force
 $version=$python.Directory.Parent.Name
 if($version -cnotmatch '^3\.12\.[0-9]+$' -or $python.FullName -cne (Join-Path $toolcache ('Python/'+$version+'/x64/python.exe'))){throw 'HOST_PYTHON_REJECTED'}
 Hold $python.FullName 16777216;$pythonHash=$before[$python.FullName]
 $node=Join-Path $toolcache 'node/24.22.1/x64/node.exe';Hold $node 134217728
 if($before[$node] -cne 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'HOST_NODE_REJECTED'}
 $helper=Join-Path $checkout 'tools/phase-00/HostProbeNative.cs';Hold $helper 1048576
 if($before[$helper] -cne 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89' -or ('Fonesi.Phase00.NativeProbe' -as [type])){throw 'COMPILER_HELPER_REJECTED'}
 Add-Type -Path $helper
 $failureStage='COMPILE'
 $native=Join-Path $desktop 'native/VisionBootstrapProcess.cs';Hold $native 1048576;Hold $PSCommandPath 1048576
 $framework=Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319'
 $compiler=Join-Path $framework 'csc.exe';Hold $compiler 8388608
 $refs=@('mscorlib.dll','System.dll','System.Core.dll')|ForEach-Object{$p=Join-Path $framework $_;Hold $p 33554432;$p}
 $compiledRoot=Join-Path ([IO.Path]::GetFullPath($env:RUNNER_TEMP)) ('fonesi-vision-bootstrap-build-'+[guid]::NewGuid().ToString())
 [Fonesi.Phase00.NativeProbe]::ReserveDirectory($compiledRoot)
 $dll=Join-Path $compiledRoot 'VisionBootstrapProcess.dll'
 $compilerArgs=@('/nologo','/noconfig','/nostdlib+','/platform:x64','/optimize+','/target:library',('/out:'+$dll))+@($refs|ForEach-Object{'/reference:'+$_})+@($native)
 $compilerEnvironment=[Environment]::GetEnvironmentVariables('Process')
 try{
  foreach($key in @($compilerEnvironment.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
  foreach($pair in @(@('SystemRoot','C:\Windows'),@('WINDIR','C:\Windows'),@('PATH','C:\Windows\System32'),@('TEMP',$compiledRoot),@('TMP',$compiledRoot))){[Environment]::SetEnvironmentVariable($pair[0],$pair[1],'Process')}
  $report.retired=$false;$c=[Fonesi.Phase00.NativeProbe]::Run($compiler,$compilerArgs,30000,10000,16384);$report.retired=$c.CleanupComplete
 }finally{
  foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
  foreach($key in $compilerEnvironment.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$compilerEnvironment[$key],'Process')}
 }
 if(-not $c.CleanupComplete -or $c.ExitCode -ne 0 -or $c.StdoutTruncated -or $c.StderrTruncated -or $c.Status -cnotin @('SUCCESS','EMPTY_OUTPUT')){throw 'COMPILATION_FAILED'}
 Hold $dll 1048576
 if('Fonesi.Development.VisionBootstrap.VisionBootstrapProcess' -as [type]){throw 'PRELOADED_BOOTSTRAP'}
 $report.sourceOwnerSha256=$before[$native];$report.compiledOwnerSha256=$before[$dll];$report.compilerExecutableSha256=$before[$compiler]
 Add-Type -Path $dll;$report.compiled=$true
 $failureStage='RESERVE'
 $deadline=[Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::NewOverallDeadline()
 $lease=[Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::ReserveStaging($deadline)
 if(-not $lease.Ready){throw 'STAGING_REFUSED'}
 $root=[Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::CandidateRoot
 $acquisition=[Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::AcquisitionRoot
 $failureStage='HOST_SOURCE'
 $hostSource=Join-Path $acquisition 'host-source';[IO.Directory]::CreateDirectory($hostSource)|Out-Null
 $hostHashes=Dictionary;$indexFiles=[ordered]@{}
 foreach($name in @('windows_vision_host.py','windows_vision_catalog.py','windows_vision_materialize.py','windows_vision_prepare.py','windows_materialization_catalog.json','windows_python_members.json','preprocess-requirements-windows.lock','ocr-requirements-windows.lock','windows_reproduction_baseline.json')){
  $directory=if($name.EndsWith('.py')){'verification'}else{'vision'}
  $source=Join-Path $desktop ($directory+'/'+$name);Hold $source 2097152
  $target=Join-Path $hostSource $name;[IO.File]::Copy($source,$target,$false);Hold $target 2097152
  if($before[$target] -cne $before[$source]){throw 'SOURCE_COPY_CHANGED'}
  $hostHashes.Add($name,$before[$target]);$indexFiles[$name]=$before[$target]
 }
 $index=[ordered]@{version=1;files=$indexFiles}|ConvertTo-Json -Depth 4 -Compress
 $indexPath=Join-Path $hostSource 'source-index.json';[IO.File]::WriteAllText($indexPath,$index,$utf8);Hold $indexPath 8192;$hostHashes.Add('source-index.json',$before[$indexPath])
 $bundleHashes=Dictionary
 # Exact native closed list; includes only imported/copied build sources and
 # existing trusted buildchain metadata, not a recursive whole-host inventory.
 foreach($relative in [Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::BundleSourcePaths){
  $p=Join-Path $checkout $relative;Hold $p 16777216;$bundleHashes.Add($relative,$before[$p])
 }
 $context=New-Object -TypeName 'Fonesi.Development.VisionBootstrap.VisionBootstrapProcess+HostToolContext' -ArgumentList @($toolcache,$version,$pythonHash,$checkout,$NpmVersion)
 $failureStage='HOST_PREPARE'
 $r=WaitOwned ([Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::AdmitHost($lease,[Fonesi.Development.VisionBootstrap.HostStagingProfile]::Prepare,$context,$hostHashes,$bundleHashes)) 'Prepare'
 $prepared=HostReceipt $r.Stdout 'PREPARE' $version $pythonHash
 Hold (Join-Path $acquisition 'reports/prepare.json') 16777216
 if((Hash (Join-Path $acquisition 'reports/prepare.json')) -cne $prepared.reportSha256){throw 'PREPARE_REPORT_CHANGED'}
 $failureStage='HOST_BUNDLE'
 $r=WaitOwned ([Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::AdmitHost($lease,[Fonesi.Development.VisionBootstrap.HostStagingProfile]::Bundle,$context,$hostHashes,$bundleHashes)) 'Bundle'
 $candidateHashes=Dictionary
 foreach($member in (Get-Content -LiteralPath (Join-Path $hostSource 'windows_python_members.json') -Raw|ConvertFrom-Json)){$candidateHashes.Add($member.path,$member.sha256)}
 foreach($name in @('preprocess_worker.py','ocr_windows_worker.py','ocr_evaluation_metrics.py','vision-qualification-fixture.mjs')){$p=Join-Path $root ('source/'+$name);Hold $p 1048576;$candidateHashes.Add('source/'+$name,$before[$p])}
 $candidateHashes.Add('tooling/node.exe',(Hash (Join-Path $root 'tooling/node.exe')))
 if($candidateHashes['tooling/node.exe'] -cne $before[$node]){throw 'STAGED_NODE_CHANGED'}
 foreach($name in @('preprocess_worker.py','ocr_windows_worker.py','ocr_evaluation_metrics.py')){
  $directory=if($name -ceq 'ocr_evaluation_metrics.py'){'verification'}else{'vision'}
  if($candidateHashes['source/'+$name] -cne $before[(Join-Path $desktop ($directory+'/'+$name))]){throw 'STAGED_SOURCE_CHANGED'}
 }
 $catalog=Get-Content -LiteralPath (Join-Path $hostSource 'windows_materialization_catalog.json') -Raw|ConvertFrom-Json
 $acquisitionHashes=Dictionary
 foreach($name in @('preprocess','ocr')){
  foreach($wheel in $catalog.$name.wheels){$acquisitionHashes.Add($name+'-wheelhouse/'+$wheel.filename,$wheel.sha256)}
  $acquisitionHashes.Add('locks/'+$catalog.$name.lock,$catalog.$name.lockSha256)
 }
 $failureStage='CANDIDATE_BOOTSTRAP'
 foreach($bootstrapProfile in @('CreatePreprocess','CreateOcr','InstallPreprocess','InstallOcr')){
  if($bootstrapProfile.StartsWith('Install')){
   $target=if($bootstrapProfile -ceq 'InstallPreprocess'){'preprocess-runtime'}else{'ocr-runtime'}
   foreach($name in @('pyvenv.cfg','Scripts/python.exe','Scripts/pythonw.exe','Scripts/Activate.ps1','Scripts/activate','Scripts/activate.fish','Scripts/activate.bat','Scripts/deactivate.bat')){$relative=$target+'/'+$name;$candidateHashes[$relative]=Hash (Join-Path $root $relative)}
  }
  $enum=[Enum]::Parse([Fonesi.Development.VisionBootstrap.BootstrapProfile],$bootstrapProfile)
  $r=WaitOwned ([Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::Admit($lease,$enum,$candidateHashes,$acquisitionHashes)) $bootstrapProfile
 }
 $failureStage='HOST_FREEZE'
 $r=WaitOwned ([Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::AdmitHost($lease,[Fonesi.Development.VisionBootstrap.HostStagingProfile]::Freeze,$context,$hostHashes,$bundleHashes)) 'Freeze'
 $frozen=HostReceipt $r.Stdout 'FREEZE' $version $pythonHash
 Hold (Join-Path $acquisition 'reports/installed-inventory.json') 16777216
 if((Hash (Join-Path $acquisition 'reports/installed-inventory.json')) -cne $frozen.reportSha256){throw 'FREEZE_REPORT_CHANGED'}
 # Exact bytes from held/hash-bound trusted Freeze producer: inventory_tree +
 # validate_inventory enforce closed relative path/hash rows before this capture.
 $inventoryBytes=ReadHeldInventory $guards[$guards.Count-1] $frozen.reportSha256
 if(-not $lease.Ready){throw 'OVERALL_DEADLINE'}
 foreach($name in @('VCOMP140.DLL','MFPlat.DLL','MF.dll','MFReadWrite.dll')){
  $path=Join-Path 'C:/Windows/System32' $name
  if(Test-Path -LiteralPath $path){Hold $path 33554432;$report.hostPrerequisites+=@([ordered]@{name=$name;state='OBSERVED';sha256=$before[$path]})}
  else{$report.hostPrerequisites+=@([ordered]@{name=$name;state='MISSING';sha256=$null})}
 }
 $report.installedInventorySha256=$frozen.reportSha256;$report.hostVersion=$version;$report.hostExecutableSha256=$pythonHash
 $report.runtimeFiles=$frozen.runtimeFiles;$report.runtimeBytes=$frozen.runtimeBytes
 $report.expectedInventorySha256=$frozen.expectedInventorySha256;$report.inventoryBytes=$frozen.inventoryBytes
 if($inventoryBytes.Length -ne $frozen.inventoryBytes){throw 'INVENTORY_CAPTURE_CHANGED'}
 $failureStage='REPRODUCTION'
 if($frozen.comparison -ceq 'MISMATCH'){
  $report.reproductionDisposition='OBSERVED_MISMATCH_NOT_ADMITTED'
  $report.failure='REPRODUCTION_MISMATCH';$report.failureStage='REPRODUCTION';$failed=$true
 }else{
  if($frozen.reportSha256 -cne $frozen.expectedInventorySha256){throw 'REPRODUCTION_IDENTITY'}
  $report.reproductionDisposition='MATCH';$failureStage='INDEX_HANDOFF'
  if(-not $lease.Ready){throw 'OVERALL_DEADLINE'}
  $handoffHash=$lease.WriteReproducedInventory($inventoryBytes,$frozen.expectedInventorySha256)
  if($handoffHash -cne $frozen.expectedInventorySha256 -or -not $lease.ReproducedInventoryWritten){throw 'INDEX_HANDOFF_REJECTED'}
  $report.indexHandoff=$true;$report.passed=$true
 }
}catch{$failed=$true;$report.failure='MATERIALIZATION_UNAVAILABLE';$report.failureStage=$failureStage}
finally{
 foreach($owned in $owners){$owner=$owned.owner;try{$r=$owner.Poll();if(-not $r.Retired){$r=$owner.Cancel();if(-not $r.Retired){$r=$owner.Reconcile(10000)}};if(-not $r.Retired){$report.retired=$false};$report.stages+=@([ordered]@{profile=$owned.profile;observation='FINAL_RECONCILIATION';result=NativeSummary $r})}catch{$report.retired=$false}}
 if($null -ne $lease){try{if(-not $lease.Release()){$report.retired=$false};if($report.indexHandoff -and -not $lease.ReproducedInventoryWritten){$report.indexHandoff=$false;$failed=$true}}catch{$report.retired=$false;$report.indexHandoff=$false}}
 try{$report.sourceUnchanged=$true;foreach($p in $before.Keys){if((Hash $p) -cne $before[$p]){$report.sourceUnchanged=$false}}}catch{$report.sourceUnchanged=$false}
 foreach($guard in $guards){try{$guard.Dispose()}catch{$report.retired=$false}}
 if(-not $report.retired -or -not $report.sourceUnchanged){$failed=$true;$report.passed=$false}
 if($failed){$report.passed=$false}
 try{
  $payload=EvidencePayload $report $inventoryBytes
  if($ReviewedMaterialization -and $report.compiled){
   $evidence=[Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::ReserveEvidence()
   if(-not $evidence.Ready){throw 'EVIDENCE_ROOT_UNAVAILABLE'}
   $items=@()
   $digest=$evidence.Write('materialization-report.json',$payload.report)
   $items+=@([ordered]@{name='materialization-report.json';bytes=$payload.report.Length;sha256=$digest})
   if($null -ne $payload.inventory){$digest=$evidence.Write('installed-inventory.json',$payload.inventory);$items+=@([ordered]@{name='installed-inventory.json';bytes=$payload.inventory.Length;sha256=$digest})}
   $manifest=[ordered]@{version=1;scope='WINDOWS_MATERIALIZATION_METADATA_ONLY';candidateInference='NOT_RUN';files=$items}|ConvertTo-Json -Depth 5 -Compress
   $manifestBytes=$utf8.GetBytes($manifest+"`n")
   if($manifestBytes.Length -gt 65536){throw 'EVIDENCE_MANIFEST_LIMIT'}
   $null=$evidence.Write('evidence-manifest.json',$manifestBytes)
   $evidenceReleased=$evidence.Release()
   if(-not $evidenceReleased -or -not $evidence.Completed){throw 'EVIDENCE_RELEASE_UNCERTAIN'}
   $evidenceReady=$true
  }
 }catch{$failed=$true;$report.passed=$false;$report.failure='EVIDENCE_EXPORT_UNAVAILABLE';$report.failureStage='EVIDENCE'}
 finally{if($null -ne $evidence -and -not $evidenceReady){try{if(-not $evidence.Release()){$report.retired=$false}}catch{$report.retired=$false}}}
 try{
  MetadataSchema $report
  $final=$utf8.GetBytes(($report|ConvertTo-Json -Depth 10 -Compress)+"`n")
  if($final.Length -gt 65536){throw 'REPORT_LIMIT'}
  Write-Output ($utf8.GetString($final).TrimEnd("`n"))
 }catch{$failed=$true;$evidenceReady=$false;Write-Output '{"version":1,"scope":"WINDOWS_MATERIALIZATION_ONLY","passed":false,"retired":false,"failure":"REPORT_SCHEMA_UNAVAILABLE","candidateInference":"NOT_RUN"}'}
 if($evidenceReady){Write-Output 'VISION_MATERIALIZATION_EVIDENCE_READY'}
}
if($failed){exit 1}
