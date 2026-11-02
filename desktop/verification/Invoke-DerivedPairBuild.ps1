# Compile-only paired source gate. Never load or execute either resulting artifact.
param([string]$ArchivePath,[Parameter(Mandatory=$true)][string]$PythonPath)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $desktop '.derived-pair-build-runtime'
$controller=Join-Path $PSScriptRoot 'derived_pair_build.py'
$validator=Join-Path $PSScriptRoot 'validate_derived_pair_build.py'
$original=[Environment]::GetEnvironmentVariables('Process')
$clock=[Diagnostics.Stopwatch]::StartNew()
$owner=$null;$baseOwner=$null;$allRetired=$true;$prepared=$false;$staged=$false;$published=$false;$failure=$null;$phase='ADMISSION';$toolsStep=$null
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
function EnvironmentFor([bool]$compiler){
 foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
 foreach($key in @('SystemRoot','WINDIR')){[Environment]::SetEnvironmentVariable($key,$script:windows,'Process')}
 [Environment]::SetEnvironmentVariable('PATH',[Environment]::SystemDirectory,'Process')
 [Environment]::SetEnvironmentVariable('RUNNER_TEMP',$script:tempParent,'Process')
 $temp=if($compiler){Join-Path $script:owner.Path 'private/java-tmp'}else{$script:tempParent}
 foreach($key in @('TEMP','TMP')){[Environment]::SetEnvironmentVariable($key,$temp,'Process')}
}
function RunFixed([string]$exe,[string[]]$arguments,[int]$maximum,[bool]$compiler,[bool]$cleanup){
 if(-not $script:allRetired){throw 'UNRETIRED'}
 $end=if($cleanup){300000}else{290000}
 $command=[Fonesi.Phase00.NativeProbe]::QuoteArgument($exe)
 foreach($a in $arguments){if($null -eq $a -or $a.IndexOf([char]0) -ge 0){throw 'ARGUMENT_REJECTED'};$command+=' '+[Fonesi.Phase00.NativeProbe]::QuoteArgument($a)}
 if($command.Length -gt 30000){throw 'COMMAND_LIMIT'}
 EnvironmentFor $compiler
 $remaining=[long]$end-$script:clock.ElapsedMilliseconds
 $drain=[Math]::Min(10000,300000-$script:clock.ElapsedMilliseconds)
 if($cleanup){$drain=[Math]::Min(1000,[Math]::Floor($remaining/2));$remaining-=$drain}
 if($remaining -le 0 -or $drain -le 0){throw 'BUILD_DEADLINE'}
 $script:allRetired=$false
 # The existing supervisor supplies cwd=Path.GetDirectoryName(executable), not the source root.
 $p=[Fonesi.Phase00.NativeProbe]::Run($exe,$arguments,[int][Math]::Min($maximum,$remaining),[int]$drain,32768)
 $script:allRetired=Retired $p
 return $p
}
function Python([string]$script,[string[]]$arguments,[string]$marker,[bool]$cleanup=$false){
 $p=RunFixed $script:PythonPath ([string[]](@('-I','-B',$script)+$arguments)) 120000 $false $cleanup
 if(-not (Success $p) -or $p.Stderr -cne '' -or $p.Stdout.Replace("`r`n","`n") -cne ($marker+"`n")){throw 'CONTROL_FAILED'}
}
function Property([string]$text,[string]$name,[string]$pattern){
 $matches=[regex]::Matches($text,('(?m)^'+[regex]::Escape($name)+'\s*=\s*(.*?)\r?$'))
 if($matches.Count -ne 1){throw 'TOOLS_REJECTED'}
 $value=$matches[0].Groups[1].Value.Trim().Trim('"')
 if($value -cnotmatch $pattern){throw 'TOOLS_REJECTED'};return $value
}
function ReadPlan([string]$stage){
 Assert-OwnedRun $script:owner
 $raw=ReadText (Join-Path $script:owner.Path ('private/plan-'+$stage+'.json')) 262144
 $p=$raw|ConvertFrom-Json
 if(($p|ConvertTo-Json -Depth 12 -Compress) -cne $raw -or (@($p.PSObject.Properties.Name)-join ',') -cne 'version,stage,executable,arguments,deadlineMs,workingDirectory' -or $p.version -ne 1 -or $p.stage -cne $stage -or $p.workingDirectory -cne 'EXECUTABLE_DIRECTORY'){throw 'PLAN_REJECTED'}
 $maximum=if($stage -cin @('javac','d8')){120000}else{30000}
 if($p.deadlineMs -ne $maximum -or $p.executable -cne $script:executables[$stage] -or $p.arguments -isnot [array] -or $p.arguments.Count -lt 1 -or $p.arguments.Count -gt 2048){throw 'PLAN_REJECTED'}
 foreach($a in $p.arguments){if($a -isnot [string] -or $a.Length -lt 1 -or $a.Length -gt 2048 -or $a -cmatch '[^\x20-\x7e]'){throw 'PLAN_REJECTED'}}
 PlainFile $p.executable 268435456
 return $p
}
try{
 if($args.Count -ne 0 -or $PSVersionTable.PSVersion.Major -ne 5 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitProcess){throw 'PLATFORM_REJECTED'}
 $boundary=Join-Path $PSScriptRoot 'WindowsBoundary.psm1';$ownedFiles=Join-Path $PSScriptRoot 'OwnedFiles.psm1';$helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
 foreach($entry in @(@($boundary,'d796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf'),@($ownedFiles,'17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29'),@($helper,'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'))){PlainFile $entry[0] 1048576;if((Get-FileHash -LiteralPath $entry[0] -Algorithm SHA256).Hash -ine $entry[1]){throw 'SUPERVISOR_CHANGED'}}
 Import-Module $boundary -Force;Import-Module $ownedFiles -Force
 if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED_HELPER'};Add-Type -Path $helper
 foreach($key in $original.Keys){if($key -cmatch '^(CLASSPATH|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS|JDK_JAVAC_OPTIONS)$' -or $key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','PYTHONPATH','PYTHONHOME')){throw 'ENVIRONMENT_REJECTED'}}
 $windows=[IO.Path]::GetFullPath([string]$original['SystemRoot']);Assert-PlainDirectory $windows
 $tempParent=[IO.Path]::GetFullPath([string]$original['RUNNER_TEMP']).TrimEnd('\');Assert-PlainDirectory $tempParent
 if($tempParent -cne ([string]$original['RUNNER_TEMP']).TrimEnd('\')){throw 'TEMP_REJECTED'}
 foreach($path in @($PythonPath)+@($ArchivePath|Where-Object {$_})){if($path -cne [IO.Path]::GetFullPath($path)){throw 'PATH_REJECTED'}}
 if($ArchivePath){PlainFile $ArchivePath 4194304};PlainFile $PythonPath 268435456
 if([IO.Path]::GetFileName($PythonPath) -cne 'python.exe'){throw 'PYTHON_REJECTED'}
 PlainFile $controller 1048576;PlainFile $validator 1048576
 Assert-PlainDirectory $desktop
 [Fonesi.Phase00.NativeProbe]::ReserveDirectory($base)
 $baseOwner=[pscustomobject]@{Parent=$desktop;Path=$base;Token=[guid]::NewGuid().ToString()};WriteNew (Join-Path $base '.owner') $baseOwner.Token 36;Assert-OwnedRun $baseOwner
 $root=Join-Path $tempParent ('derived-pair-'+[guid]::NewGuid().ToString());[Fonesi.Phase00.NativeProbe]::ReserveDirectory($root)
 $owner=[pscustomobject]@{Parent=$tempParent;Path=$root;Token=[guid]::NewGuid().ToString()};WriteNew (Join-Path $root '.owner') $owner.Token 36;Assert-OwnedRun $owner
 if(-not $ArchivePath){$phase='ACQUIRE';Python $controller @('acquire',$root) 'DERIVED_PAIR_CONTROL_PASS';$ArchivePath=Join-Path $root 'upstream.tar.gz'}
 $phase='TOOLS'
 $toolsStep='JDK_ROOT';$jdk=[IO.Path]::GetFullPath([string]$original['JAVA_HOME_17_X64']);Assert-PlainDirectory $jdk
 $toolsStep='SDK_ROOT';$sdk=[IO.Path]::GetFullPath([string]$original['ANDROID_HOME']);Assert-PlainDirectory $sdk
 $toolsStep='SDK_CONSISTENCY'
 if($original.Contains('ANDROID_SDK_ROOT') -and [IO.Path]::GetFullPath([string]$original['ANDROID_SDK_ROOT']) -cne $sdk){throw 'SDK_ROOT_MISMATCH'}
 $toolsStep='PLATFORM_ROOT';$platform=Join-Path $sdk 'platforms/android-36';Assert-PlainDirectory $platform
 $toolsStep='BUILD_TOOLS_ROOT';$buildTools=Join-Path $sdk 'build-tools/36.0.0';Assert-PlainDirectory $buildTools
 $toolsStep='FRAMEWORK_ROOT';$framework=Join-Path $windows 'Microsoft.NET/Framework64/v4.0.30319';Assert-PlainDirectory $framework
 $toolsStep='JDK_METADATA'
 $release=ReadText (Join-Path $jdk 'release') 65536
 $jdkVersion=Property $release 'JAVA_VERSION' '\A17(?:[.0-9A-Za-z+_-]*)\z'
 $implementor=Property $release 'IMPLEMENTOR' '\A[\x20-\x7e]{1,128}\z'
 $vendor=if($implementor -cmatch 'Microsoft'){'MICROSOFT'}elseif($implementor -cmatch 'Adoptium|Temurin'){'TEMURIN'}elseif($implementor -cmatch 'Oracle'){'ORACLE'}else{'OTHER'}
 $toolsStep='PLATFORM_METADATA'
 $platformProperties=ReadText (Join-Path $platform 'source.properties') 65536
 if((Property $platformProperties 'AndroidVersion.ApiLevel' '\A[0-9]+\z') -cne '36'){throw 'PLATFORM_REJECTED'}
 $platformRevision=Property $platformProperties 'Pkg.Revision' '\A[0-9A-Za-z.+_-]{1,64}\z'
 $toolsStep='BUILD_TOOLS_METADATA'
 $buildVersion=Property (ReadText (Join-Path $buildTools 'source.properties') 65536) 'Pkg.Revision' '\A36\.0\.0\z'
 $toolsStep='COMPILER_METADATA'
 $csc=Join-Path $framework 'csc.exe';PlainFile $csc 8388608
 $compilerInfo=[Diagnostics.FileVersionInfo]::GetVersionInfo($csc)
 $compilerVersion=('{0}.{1}.{2}.{3}' -f $compilerInfo.FileMajorPart,$compilerInfo.FileMinorPart,$compilerInfo.FileBuildPart,$compilerInfo.FilePrivatePart)
 if($compilerVersion -cnotmatch '\A[0-9]+(?:\.[0-9]+){1,3}\z'){throw 'COMPILER_VERSION_REJECTED'}
 $toolsStep='IMAGE'
 if($original['ImageOS'] -cne 'win22' -or $original['ImageVersion'] -cnotmatch '\A[0-9.]{1,58}\z'){throw 'RUNNER_IMAGE_REJECTED'}
 $toolsStep='SOURCE_IDS'
 foreach($key in @('FONESI_AUTO_SOURCE_COMMIT','FONESI_AUTO_SOURCE_TREE')){if($original[$key] -cnotmatch '\A[0-9a-f]{40}\z'){throw 'SOURCE_ID_REJECTED'}}
 $toolsStep='CONTEXT'
 $context=[ordered]@{version=1;autoCommit=$original['FONESI_AUTO_SOURCE_COMMIT'];autoTree=$original['FONESI_AUTO_SOURCE_TREE'];runnerImage=('win22/'+$original['ImageVersion']);jdkRoot=$jdk;platformRoot=$platform;buildToolsRoot=$buildTools;frameworkRoot=$framework;jdkVersion=$jdkVersion;jdkVendor=$vendor;platformRevision=$platformRevision;buildToolsVersion=$buildVersion;consumerCompilerVersion=$compilerVersion}
 $contextFile=Join-Path $base 'context.json';JsonNew $contextFile $context
 $executables=@{aidlClipboard=(Join-Path $buildTools 'aidl.exe');aidlDisplay=(Join-Path $buildTools 'aidl.exe');javac=(Join-Path $jdk 'bin/javac.exe');d8=(Join-Path $jdk 'bin/java.exe');consumerCsc=$csc}
 $phase='PREPARE';Python $controller @('prepare',$root,$ArchivePath,$contextFile) 'DERIVED_PAIR_CONTROL_PASS';$prepared=$true
 foreach($stage in @('aidlClipboard','aidlDisplay','javac','d8','consumerCsc')){
  $phase='PLAN';Python $controller @('plan',$root,$stage) 'DERIVED_PAIR_CONTROL_PASS'
  $plan=ReadPlan $stage
  $phase='VERIFY';Python $controller @('verify',$root,$stage) 'DERIVED_PAIR_CONTROL_PASS'
  Assert-OwnedRun $owner
  $phase='COMPILE';$p=RunFixed $plan.executable ([string[]]$plan.arguments) ([int]$plan.deadlineMs) $true $false
  JsonNew (Join-Path $root ('private/process-'+$stage+'.json')) (Evidence $p)
  if(-not $allRetired){throw 'UNRETIRED'}
  $phase='VERIFY';Python $controller @('verify',$root,$stage) 'DERIVED_PAIR_CONTROL_PASS'
  if(-not (Success $p) -or [Text.Encoding]::UTF8.GetByteCount($p.Stdout) -gt 32768 -or [Text.Encoding]::UTF8.GetByteCount($p.Stderr) -gt 32768){$phase='COMPILE';throw 'COMPILE_FAILED'}
 }
}catch{
 $failure=if(-not $allRetired){'UNRETIRED'}elseif($phase -ceq 'TOOLS'){'TOOLS_UNAVAILABLE'}elseif($phase -ceq 'COMPILE'){'COMPILE_FAILED'}elseif($phase -cin @('PLAN','VERIFY')){'SOURCE_REJECTED'}elseif($phase -cin @('PREPARE','ACQUIRE')){'SOURCE_REJECTED'}else{'INTERNAL_FAILURE'}
 if($phase -ceq 'TOOLS' -and $toolsStep -cin @('JDK_ROOT','SDK_ROOT','SDK_CONSISTENCY','PLATFORM_ROOT','BUILD_TOOLS_ROOT','FRAMEWORK_ROOT','JDK_METADATA','PLATFORM_METADATA','BUILD_TOOLS_METADATA','COMPILER_METADATA','IMAGE','SOURCE_IDS','CONTEXT')){Write-Output ('DERIVED_PAIR_TOOLS_'+$toolsStep)}
 Write-Output ('DERIVED_PAIR_STAGE_'+$phase)
}
try{
 if($prepared -and $allRetired){
  $phase='FINISH';$finish=if($null -eq $failure){'NONE'}else{$failure}
  Python $controller @('finish',$owner.Path,$finish) 'DERIVED_PAIR_CONTROL_PASS'
  $phase='STAGE';Python $validator @('stage',$owner.Path) 'DERIVED_PAIR_STAGED';$staged=$true
  $phase='CLEANUP';Python $controller @('cleanup',$owner.Path) 'DERIVED_PAIR_CONTROL_PASS' $true
  Remove-VerifiedOwnedRun $owner $allRetired
 }
}catch{Write-Output ('DERIVED_PAIR_STAGE_'+$phase)}
try{
 if($staged -and $allRetired){
  Python $validator @('cleanup',$base) 'DERIVED_PAIR_CLEANUP_RECORDED' $true
  $phase='PUBLISH';$p=RunFixed $PythonPath ([string[]]@('-I','-B',$validator,'publish',$base)) 30000 $false $true
  $lines=$p.Stdout.Replace("`r`n","`n")
  if(-not (Retired $p) -or $p.Stderr -cne '' -or $p.StdoutTruncated -or $p.StderrTruncated -or $lines -cnotin @("DERIVED_PAIR_VALIDATION_WRITTEN`nDERIVED_PAIR_VALIDATION_PASS`n","DERIVED_PAIR_VALIDATION_WRITTEN`nDERIVED_PAIR_VALIDATION_FAIL`n")){throw 'PUBLISH_FAILED'}
  $published=($p.ExitCode -eq 0 -and $lines -ceq "DERIVED_PAIR_VALIDATION_WRITTEN`nDERIVED_PAIR_VALIDATION_PASS`n")
  Write-Output 'DERIVED_PAIR_VALIDATION_WRITTEN'
 }
}catch{Write-Output ('DERIVED_PAIR_STAGE_'+$phase)}finally{
 foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
 foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}
}
if($published){Write-Output 'DERIVED_PAIR_VALIDATION_PASS';exit 0}
Write-Output 'DERIVED_PAIR_VALIDATION_FAIL';exit 1
