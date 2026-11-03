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
$before=@{};$lease=$null;$failed=$false;$compiledRoot=$null;$failureStage='ADMISSION'
$report=[ordered]@{version=1;scope='WINDOWS_MATERIALIZATION_ONLY';hostTrust='EXISTING_HOSTED_CI_TOOLCHAIN';compiled=$false;sourceOwnerSha256=$null;compiledOwnerSha256=$null;compilerExecutableSha256=$null;hostVersion=$null;hostExecutableSha256=$null;hostPathPolicy='OBSERVED_CANONICAL_RUNNER_TOOL_CACHE';hostPrerequisites=@();hostPrerequisitesScope='STATIC_ONLY_NOT_RUNTIME_ADMISSION';runtimeFiles=$null;runtimeBytes=$null;stages=@();installedInventorySha256=$null;retired=$true;sourceUnchanged=$false;passed=$false;candidateInference='NOT_RUN';failure=$null;failureStage=$null;hostDiagnostic=$null}
function Hash([string]$path){return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Hold([string]$path,[long]$cap){
 $i=Get-Item -LiteralPath $path -Force
 if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -gt $cap){throw 'SOURCE_REJECTED'}
 $s=New-Object IO.FileStream($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 $script:guards.Add($s);$script:before[$path]=Hash $path
}
function Dictionary(){return ,(New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal))}
function NativeSummary($r){return [ordered]@{status=$r.Status;retired=$r.Retired;exitCode=$r.ExitCode;stdoutBytes=$r.Stdout.Length;stderrBytes=$r.Stderr.Length;stdoutOverflow=$r.StdoutOverflow;stderrOverflow=$r.StderrOverflow;elapsedMilliseconds=$r.ElapsedMilliseconds}}
function WaitOwned($owner){
 $script:owners.Add($owner);$r=$owner.Begin();$watch=[Diagnostics.Stopwatch]::StartNew()
 while(-not $r.Retired -and $watch.ElapsedMilliseconds -lt 610000){
  if($r.Status -match 'UNCERTAIN|UNRETIRED'){break}
  Start-Sleep -Milliseconds 10;$r=$owner.Poll()
 }
 if(-not $r.Retired){$script:report.stages+=@([ordered]@{pending=NativeSummary $r});$r=$owner.Reconcile(10000)}
 $script:report.stages+=@(NativeSummary $r)
 if(-not $r.Retired){$script:report.retired=$false;throw 'OWNERSHIP_PENDING'}
 if($r.Status -cne 'SUCCESS' -or $r.ExitCode -ne 0 -or $r.StdoutOverflow -or $r.StderrOverflow){
  if($script:failureStage -cin @('HOST_PREPARE','HOST_FREEZE') -and $r.Stderr.Length -le 512){
   try{$diagnostic=$utf8.GetString($r.Stderr);if($diagnostic -cmatch '\A\{"stage":"(ADMISSION|SOURCE_INDEX|PREPARE|FREEZE|REPORT)","type":"(ValueError|OSError|TimeoutError|URLError|HTTPError|JSONDecodeError|PermissionError|FileExistsError|FileNotFoundError|ModuleNotFoundError|RuntimeError|Other)"\}\n\z'){$script:report.hostDiagnostic=[ordered]@{stage=$Matches[1];type=$Matches[2]}}}catch{}
  }
  throw 'CHILD_UNAVAILABLE'
 }
 return $r
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
 $expected=@('version','scope','stage','hostVersion','hostExecutableSha256','hostIsolated','hostSiteDisabled','hostBytecodeDisabled','hostTrust','reportSha256','wheelCount','pythonFiles','modelFiles','acquiredBytes','runtimeFiles','runtimeBytes','comparison','candidateInference')
 if($keys.Count -ne $expected.Count){throw 'RECEIPT_SCHEMA'}
 foreach($key in $expected){if(-not $keys.Contains($key)){throw 'RECEIPT_SCHEMA'}}
 $v=$text|ConvertFrom-Json
 if($v.version -isnot [int] -and $v.version -isnot [long]){throw 'RECEIPT_TYPE'}
 foreach($key in @('hostIsolated','hostSiteDisabled','hostBytecodeDisabled')){if($v.$key -isnot [bool]){throw 'RECEIPT_TYPE'}}
 foreach($key in @('wheelCount','pythonFiles','modelFiles','acquiredBytes','runtimeFiles','runtimeBytes')){if($null -ne $v.$key -and $v.$key -isnot [int] -and $v.$key -isnot [long]){throw 'RECEIPT_TYPE'}}
 if($v.version -ne 1 -or $v.scope -cne 'TRUSTED_HOST_STAGING_ONLY' -or $v.stage -cne $stage -or $v.hostVersion -cne $version -or $v.hostExecutableSha256 -cne $exeHash -or $v.hostIsolated -cne $true -or $v.hostSiteDisabled -cne $true -or $v.hostBytecodeDisabled -cne $true -or $v.hostTrust -cne 'EXISTING_HOSTED_CI_TOOLCHAIN' -or $v.candidateInference -cne 'NOT_RUN' -or $v.reportSha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'RECEIPT_IDENTITY'}
 if($stage -ceq 'PREPARE'){
  if($v.wheelCount -ne 74 -or $v.pythonFiles -ne 3354 -or $v.modelFiles -ne 3 -or $v.acquiredBytes -ne 328203212 -or $null -ne $v.runtimeFiles -or $null -ne $v.runtimeBytes -or $null -ne $v.comparison){throw 'PREPARE_INCOMPLETE'}
 }else{
  if($null -ne $v.wheelCount -or $null -ne $v.pythonFiles -or $null -ne $v.modelFiles -or $null -ne $v.acquiredBytes -or $v.runtimeFiles -lt 3354 -or $v.runtimeFiles -gt 50000 -or $v.runtimeBytes -lt 152074886 -or $v.runtimeBytes -gt 4294967296 -or $v.comparison -cne 'NOT_REQUESTED'){throw 'FREEZE_INCOMPLETE'}
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
 foreach($name in @('windows_vision_host.py','windows_vision_catalog.py','windows_vision_materialize.py','windows_vision_prepare.py','windows_materialization_catalog.json','windows_python_members.json','preprocess-requirements-windows.lock','ocr-requirements-windows.lock')){
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
 $r=WaitOwned ([Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::AdmitHost($lease,[Fonesi.Development.VisionBootstrap.HostStagingProfile]::Prepare,$context,$hostHashes,$bundleHashes))
 $prepared=HostReceipt $r.Stdout 'PREPARE' $version $pythonHash
 Hold (Join-Path $acquisition 'reports/prepare.json') 16777216
 if((Hash (Join-Path $acquisition 'reports/prepare.json')) -cne $prepared.reportSha256){throw 'PREPARE_REPORT_CHANGED'}
 $failureStage='HOST_BUNDLE'
 $r=WaitOwned ([Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::AdmitHost($lease,[Fonesi.Development.VisionBootstrap.HostStagingProfile]::Bundle,$context,$hostHashes,$bundleHashes))
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
  $r=WaitOwned ([Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::Admit($lease,$enum,$candidateHashes,$acquisitionHashes))
 }
 $failureStage='HOST_FREEZE'
 $r=WaitOwned ([Fonesi.Development.VisionBootstrap.VisionBootstrapProcess]::AdmitHost($lease,[Fonesi.Development.VisionBootstrap.HostStagingProfile]::Freeze,$context,$hostHashes,$bundleHashes))
 $frozen=HostReceipt $r.Stdout 'FREEZE' $version $pythonHash
 Hold (Join-Path $acquisition 'reports/installed-inventory.json') 16777216
 if((Hash (Join-Path $acquisition 'reports/installed-inventory.json')) -cne $frozen.reportSha256){throw 'FREEZE_REPORT_CHANGED'}
 if(-not $lease.Ready){throw 'OVERALL_DEADLINE'}
 foreach($name in @('VCOMP140.DLL','MFPlat.DLL','MF.dll','MFReadWrite.dll')){
  $path=Join-Path 'C:/Windows/System32' $name
  if(Test-Path -LiteralPath $path){Hold $path 33554432;$report.hostPrerequisites+=@([ordered]@{name=$name;state='OBSERVED';sha256=$before[$path]})}
  else{$report.hostPrerequisites+=@([ordered]@{name=$name;state='MISSING';sha256=$null})}
 }
 $report.installedInventorySha256=$frozen.reportSha256;$report.hostVersion=$version;$report.hostExecutableSha256=$pythonHash
 $report.runtimeFiles=$frozen.runtimeFiles;$report.runtimeBytes=$frozen.runtimeBytes
 if(-not $lease.Ready){throw 'OVERALL_DEADLINE'}
 $report.passed=$true
}catch{$failed=$true;$report.failure='MATERIALIZATION_UNAVAILABLE';$report.failureStage=$failureStage}
finally{
 foreach($owner in $owners){try{$r=$owner.Poll();if(-not $r.Retired){$r=$owner.Cancel();if(-not $r.Retired){$r=$owner.Reconcile(10000)}};if(-not $r.Retired){$report.retired=$false}}catch{$report.retired=$false}}
 if($null -ne $lease){try{if(-not $lease.Release()){$report.retired=$false}}catch{$report.retired=$false}}
 try{$report.sourceUnchanged=$true;foreach($p in $before.Keys){if((Hash $p) -cne $before[$p]){$report.sourceUnchanged=$false}}}catch{$report.sourceUnchanged=$false}
 foreach($guard in $guards){try{$guard.Dispose()}catch{$report.retired=$false}}
 if(-not $report.retired -or -not $report.sourceUnchanged){$failed=$true;$report.passed=$false}
 if($failed){$report.passed=$false}
 $report|ConvertTo-Json -Depth 8 -Compress
}
if($failed){exit 1}
