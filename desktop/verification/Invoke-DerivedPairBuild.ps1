# Compile-only paired source gate. Never load or execute either resulting artifact.
param([string]$ArchivePath,[Parameter(Mandatory=$true)][string]$PythonPath,[switch]$RetainEvidence)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $desktop '.derived-pair-build-runtime'
$controller=Join-Path $PSScriptRoot 'derived_pair_build.py'
$validator=Join-Path $PSScriptRoot 'validate_derived_pair_build.py'
$retentionProducer=Join-Path $PSScriptRoot 'derived_pair_retention.py'
$retentionValidator=Join-Path $PSScriptRoot 'validate_retained_pair_evidence.py'
$retentionStaged=$false;$retentionPublished=$false
$original=[Environment]::GetEnvironmentVariables('Process')
$clock=[Diagnostics.Stopwatch]::StartNew()
$owner=$null;$baseOwner=$null;$allRetired=$true;$prepared=$false;$staged=$false;$published=$false;$failure=$null;$phase='ADMISSION';$toolsStep=$null
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
function PythonDiagnostic($p,[string]$script,[string]$action){
 $statuses=@('SUCCESS','EMPTY_OUTPUT','NONZERO_EXIT','TIMEOUT','ACCESS_DENIED','LAUNCH_FAILED','CAPTURE_FAILED','CLEANUP_FAILED')
 if($p.Status -cin $statuses){
  $exitFlag=if($null -eq $p.ExitCode){'NULL'}else{'PRESENT'}
  $retiredFlag=if(Retired $p){'TRUE'}else{'FALSE'}
  $outFlag=if($p.StdoutTruncated){'TRUE'}else{'FALSE'};$errFlag=if($p.StderrTruncated){'TRUE'}else{'FALSE'}
  Write-Output ('DERIVED_PAIR_SUPERVISOR_STATUS_'+$p.Status+'_EXIT_'+$exitFlag+'_RETIRED_'+$retiredFlag+'_STDOUT_TRUNCATED_'+$outFlag+'_STDERR_TRUNCATED_'+$errFlag)
 }
 $raw=$p.Stdout
 $pattern='\ADERIVED_PAIR_CONTROL_DIAG\|(ACQUIRE|PREPARE|PLAN|VERIFY|FINISH|CLEANUP|CLI)\|(ENTRY|OWNER|CONTEXT|ARCHIVE|PATCH|TOOLS_JDK17|TOOLS_ANDROID36|TOOLS_BUILD_TOOLS36|TOOLS_FRAMEWORK64|TOOLS_METADATA|MATERIALIZE_SOURCE|MATERIALIZE_CONSUMER|GENERATED_INPUTS|RUNNER_CLOSURE|ADMISSION_WRITE|LOAD_ADMISSION|REVALIDATE_SOURCE|PLAN_WRITE|PLAN_COMPARE|PROCESS_RECEIPTS|DEPENDENCIES|OUTPUT_INSPECT|OUTPUT_ZIP|DEX_HEADER|DEX_TABLES|DEX_NAME|DEX_NAMESPACE|PE_HEADER|PE_CLI|PE_METADATA|EVIDENCE_WRITE|REPORT_WRITE|CLOSED_LAYOUT|STAGING_BINDING|DELETE_FILES|DELETE_DIRS|ACQUIRE_FETCH|ACQUIRE_WRITE)\|(PREDICATE|CANONICAL_PATH|REPARSE|FILE_TYPE|LINK_COUNT|IDENTITY|BYTE_LIMIT|ENTRY_LIMIT|TOTAL_BYTES|NAME|COLLISION|HASH|SCHEMA|NO_CLOBBER|IO_ACCESS|IO_NOT_FOUND|IO_OTHER|ENCODING|ARCHIVE_FORMAT|INTERNAL)\nDERIVED_PAIR_CONTROL_FAILED\n\z'
 if($script -ceq $script:controller -and (Retired $p) -and $p.ExitCode -eq 1 -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Stderr -ceq '' -and $raw.Length -le 256 -and $raw -cnotmatch '[^\x00-\x7f]'){
  $frame=$raw.Replace("`r`n","`n")
  $match=[regex]::Match($frame,$pattern)
  if($match.Success -and $match.Groups[1].Value -ceq $action.ToUpperInvariant()){
   Write-Output ('DERIVED_PAIR_CONTROL_DIAG|'+$match.Groups[1].Value+'|'+$match.Groups[2].Value+'|'+$match.Groups[3].Value)
   return
  }
 }
 Write-Output 'DERIVED_PAIR_DIAGNOSTIC_UNAVAILABLE'
}
function Python([string]$script,[string[]]$arguments,[string]$marker,[bool]$cleanup=$false){
 $p=RunFixed $script:PythonPath ([string[]](@('-I','-B',$script)+$arguments)) 120000 $false $cleanup
 # A handled FINISH refusal is only a diagnostic; stage/publish still validates its report.
 $finishPattern='\ADERIVED_PAIR_CONTROL_DIAG\|FINISH\|(ENTRY|OWNER|CONTEXT|ARCHIVE|PATCH|TOOLS_JDK17|TOOLS_ANDROID36|TOOLS_BUILD_TOOLS36|TOOLS_FRAMEWORK64|TOOLS_METADATA|MATERIALIZE_SOURCE|MATERIALIZE_CONSUMER|GENERATED_INPUTS|RUNNER_CLOSURE|ADMISSION_WRITE|LOAD_ADMISSION|REVALIDATE_SOURCE|PLAN_WRITE|PLAN_COMPARE|PROCESS_RECEIPTS|DEPENDENCIES|OUTPUT_INSPECT|OUTPUT_ZIP|DEX_HEADER|DEX_TABLES|DEX_NAME|DEX_NAMESPACE|PE_HEADER|PE_CLI|PE_METADATA|EVIDENCE_WRITE|REPORT_WRITE|CLOSED_LAYOUT|STAGING_BINDING|DELETE_FILES|DELETE_DIRS|ACQUIRE_FETCH|ACQUIRE_WRITE)\|(PREDICATE|CANONICAL_PATH|REPARSE|FILE_TYPE|LINK_COUNT|IDENTITY|BYTE_LIMIT|ENTRY_LIMIT|TOTAL_BYTES|NAME|COLLISION|HASH|SCHEMA|NO_CLOBBER|IO_ACCESS|IO_NOT_FOUND|IO_OTHER|ENCODING|ARCHIVE_FORMAT|INTERNAL)\nDERIVED_PAIR_CONTROL_PASS\n\z'
 if($script -ceq $script:controller -and $arguments[0] -ceq 'finish' -and $marker -ceq 'DERIVED_PAIR_CONTROL_PASS' -and (Success $p) -and $p.ExitCode -eq 0 -and $p.Stderr -ceq '' -and $p.Stdout.Length -le 256 -and $p.Stdout -cnotmatch '[^\x00-\x7f]'){
  $finishFrame=$p.Stdout.Replace("`r`n","`n")
  $finishMatch=[regex]::Match($finishFrame,$finishPattern)
  if($finishMatch.Success){
   Write-Output ('DERIVED_PAIR_CONTROL_DIAG|FINISH|'+$finishMatch.Groups[1].Value+'|'+$finishMatch.Groups[2].Value)
   return
  }
 }
 if(-not (Success $p) -or $p.Stderr -cne '' -or $p.Stdout.Replace("`r`n","`n") -cne ($marker+"`n")){PythonDiagnostic $p $script $arguments[0];throw 'CONTROL_FAILED'}
}
# Retention is a separate, explicit mode; no child output is forwarded verbatim.
function RetentionPython([string]$entry,[string]$verb,[string]$target,[string]$action,[string]$marker,[bool]$cleanup=$false){
 $p=RunFixed $PythonPath ([string[]]@('-I','-B',$entry,$verb,$target)) 30000 $false $cleanup
 $raw=$p.Stdout.Replace("`r`n","`n")
 if((Success $p) -and $p.Stderr -ceq '' -and $raw -ceq ($marker+"`n")){return}
 $diagnostics=@(PythonDiagnostic $p $entry $verb)
 foreach($line in $diagnostics){if($line.StartsWith('DERIVED_PAIR_SUPERVISOR_STATUS_')){Write-Output $line}}
 $diagnosticAvailable=$false
 $pattern='\ADERIVED_PAIR_RETENTION_DIAG\|(COPY|VALIDATE|CLEANUP|PUBLISH)\|(OWNER|CONTEXT|SOURCE|BUILD|OUTPUT|GENERATED|NOTICE|COPY|READBACK|LAYOUT|CLEANUP|RECEIPT|PROMOTE)\|(PREDICATE|IDENTITY|HASH|BYTE_LIMIT|SCHEMA|IO_ACCESS|IO_NOT_FOUND|IO_OTHER|INTERNAL)\nDERIVED_PAIR_RETENTION_FAILED\n\z'
 if((Retired $p) -and $p.ExitCode -eq 1 -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Stderr -ceq '' -and $raw.Length -le 256 -and $raw -cnotmatch '[^\x00-\x7f]'){
  $m=[regex]::Match($raw,$pattern)
  if($m.Success -and $m.Groups[1].Value -ceq $action){Write-Output ('DERIVED_PAIR_RETENTION_DIAG|'+$m.Groups[1].Value+'|'+$m.Groups[2].Value+'|'+$m.Groups[3].Value);$diagnosticAvailable=$true}
 }
 if(-not $diagnosticAvailable){Write-Output 'DERIVED_PAIR_DIAGNOSTIC_UNAVAILABLE'}
 throw 'RETENTION_FAILED'
}
function Assert-ScratchAbsent {
 Assert-PlainDirectory $script:tempParent
 try{$null=Get-Item -LiteralPath $script:owner.Path -Force -ErrorAction Stop;throw 'SCRATCH_RETAINED'}catch [System.Management.Automation.ItemNotFoundException]{}
}
function RetentionReadback {
 if(-not $script:allRetired -or $script:clock.ElapsedMilliseconds -ge 300000){throw 'RETENTION_DEADLINE'}
 Assert-OwnedRun $script:baseOwner;Assert-ScratchAbsent
 if((ReadText (Join-Path $script:base 'retention-staging.json') 65536) -cne $script:retentionBindingText -or (ReadText (Join-Path $script:base 'retention-context.json') 4096) -cne ($script:retentionContext|ConvertTo-Json -Compress)){throw 'RETENTION_BINDING'}
 $folder=Join-Path $script:base 'retained-upload'
 $caps=[ordered]@{
 'payload/server.jar'=8388608;'payload/RetainedVideoConsumer.dll'=8388608
 'build/source.json'=262144;'build/tools.json'=8388608;'build/dependencies.json'=524288;'build/generated.json'=2097152;'build/commands.json'=262144;'build/outputs.json'=1048576;'build/server-build.json'=8192;'build/consumer-build.json'=8192;'build/report.json'=65536;'build/retention-source.json'=65536
 'generated/android/content/IOnPrimaryClipChangedListener.java'=1048576;'generated/android/view/IDisplayWindowListener.java'=1048576;'generated/com/genymobile/scrcpy/BuildConfig.java'=1048576
 'source/upstream.tar.gz'=513746;'source/verified-selected-source-manifest.json'=262144;'source/verified-full-source-manifest.json'=262144;'source/auto-video-nonce-v1.patch'=262144;'source/source-provenance.json'=262144
 'source/auto/native/IsolatedAdbServer.cs'=1048576;'source/auto/native/RetainedAdbSession.cs'=1048576;'source/auto/native/RetainedAdbProtocol.cs'=1048576;'source/auto/native/RetainedHostAdmission.cs'=1048576;'source/auto/native/RetainedVideoSession.cs'=1048576
 'source/upstream-LICENSE'=11387;'source/upstream-README.md'=8141;'notice/NOTICE.txt'=1063288;'notice/source.properties'=62;'notice/capture-receipt.json'=1167
 }
 $inventory=Get-BoundedOwnedEntries $folder 67108864
 $files=@($inventory.Entries|Where-Object {-not $_.PSIsContainer})
 if($files.Count -ne 31){throw 'RETENTION_LAYOUT'}
 $names=[string[]]@($caps.Keys);[Array]::Sort($names,[StringComparer]::Ordinal)
 $allowedDirs=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
 foreach($name in $names){$part=$name;while($part.Contains('/')){$part=$part.Substring(0,$part.LastIndexOf('/'));[void]$allowedDirs.Add($part)}}
 foreach($entry in $inventory.Entries){$rel=$entry.FullName.Substring($folder.Length+1).Replace('\','/');if($entry.PSIsContainer){if(-not $allowedDirs.Contains($rel)){throw 'RETENTION_LAYOUT'}}elseif($rel -cne 'retention-receipt.json' -and -not $caps.Contains($rel)){throw 'RETENTION_LAYOUT'}}
 $receiptText=ReadText (Join-Path $folder 'retention-receipt.json') 65536
 if($receiptText -cne $script:expectedRetentionReceiptText){throw 'RETENTION_RECEIPT'}
 # All expected rows came from the already retired independent stage, not the new receipt.
 $receipt=$script:expectedRetentionReceipt
 $total=0L;$hashes=@{}
 for($i=0;$i -lt $names.Length;$i++){
  if($script:clock.ElapsedMilliseconds -ge 300000){throw 'RETENTION_DEADLINE'}
  $name=$names[$i];$row=$receipt.files[$i]
  if((@($row.PSObject.Properties.Name)-join ',') -cne 'path,bytes,sha256' -or $row.path -cne $name -or $row.sha256 -cnotmatch '\A[0-9a-f]{64}\z'){throw 'RETENTION_RECEIPT'}
  $path=Join-Path $folder $name;PlainFile $path $caps[$name]
  $stream=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  $sha=[Security.Cryptography.SHA256]::Create()
  try{
   $length=$stream.Length
   if($length -lt 1 -or $length -gt $caps[$name] -or $length -ne $row.bytes){throw 'RETENTION_LENGTH'}
   $buffer=New-Object byte[] 65536;$read=0L
   while($read -lt $length){
    if($script:clock.ElapsedMilliseconds -ge 300000){throw 'RETENTION_DEADLINE'}
    $n=$stream.Read($buffer,0,[int][Math]::Min($buffer.Length,$length-$read))
    if($n -le 0){throw 'RETENTION_LENGTH'}
    [void]$sha.TransformBlock($buffer,0,$n,$buffer,0);$read+=$n
   }
   [void]$sha.TransformFinalBlock($buffer,0,0)
   $digest=([BitConverter]::ToString($sha.Hash)).Replace('-','').ToLowerInvariant()
   if($stream.Length -ne $length -or $row.sha256 -cne $digest){throw 'RETENTION_HASH'}
   PlainFile $path $caps[$name]
   if((Get-Item -LiteralPath $path -Force).Length -ne $length){throw 'RETENTION_CHANGED'}
   $total+=$length;$hashes[$name]=$digest
  }finally{$sha.Dispose();$stream.Dispose()}
 }
 if($receipt.totalBytes -ne $total -or $receipt.reportSha256 -cne $hashes['build/report.json'] -or $receipt.retentionSourceSha256 -cne $hashes['build/retention-source.json'] -or $receipt.noticeReceiptSha256 -cne $hashes['notice/capture-receipt.json']){throw 'RETENTION_RECEIPT'}
 $finalInventory=Get-BoundedOwnedEntries $folder 67108864
 if($finalInventory.Entries.Count -ne $inventory.Entries.Count -or $finalInventory.Bytes -ne $inventory.Bytes){throw 'RETENTION_LAYOUT'}
 foreach($entry in $finalInventory.Entries){
  $rel=$entry.FullName.Substring($folder.Length+1).Replace('\','/')
  if($entry.PSIsContainer){if(-not $allowedDirs.Contains($rel)){throw 'RETENTION_LAYOUT'}}elseif($rel -cne 'retention-receipt.json' -and -not $caps.Contains($rel)){throw 'RETENTION_LAYOUT'}
 }
 if((ReadText (Join-Path $folder 'retention-receipt.json') 65536) -cne $script:expectedRetentionReceiptText -or (ReadText (Join-Path $folder 'build/report.json') 65536) -cne $script:retentionFinalReportText -or (ReadText (Join-Path $script:base 'retention-staging.json') 65536) -cne $script:retentionBindingText -or (ReadText (Join-Path $script:base 'retention-context.json') 4096) -cne ($script:retentionContext|ConvertTo-Json -Compress)){throw 'RETENTION_CHANGED'}
 Assert-OwnedRun $script:baseOwner;Assert-ScratchAbsent
 if($script:clock.ElapsedMilliseconds -ge 300000){throw 'RETENTION_DEADLINE'}
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
 if($RetainEvidence){
  if($ArchivePath){throw 'RETENTION_ARCHIVE_REJECTED'}
  PlainFile $retentionProducer 1048576;PlainFile $retentionValidator 1048576
  $runId=[string]$original['GITHUB_RUN_ID'];$attempt=[string]$original['GITHUB_RUN_ATTEMPT']
  if($runId -cnotmatch '\A[1-9][0-9]{0,19}\z' -or $attempt -cnotmatch '\A[1-9][0-9]{0,6}\z' -or [long]$attempt -gt 1000000){throw 'RETENTION_CONTEXT'}
  $retentionContext=[ordered]@{version=1;githubRunId=$runId;githubRunAttempt=[long]$attempt}
 }
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
 if($RetainEvidence){JsonNew (Join-Path $base 'retention-context.json') $retentionContext}
 $root=Join-Path $tempParent ('derived-pair-'+[guid]::NewGuid().ToString());[Fonesi.Phase00.NativeProbe]::ReserveDirectory($root)
 $owner=[pscustomobject]@{Parent=$tempParent;Path=$root;Token=[guid]::NewGuid().ToString()};WriteNew (Join-Path $root '.owner') $owner.Token 36;Assert-OwnedRun $owner
 if(-not $ArchivePath){$phase='ACQUIRE';Python $controller @('acquire',$root) 'DERIVED_PAIR_CONTROL_PASS';$ArchivePath=Join-Path $root 'upstream.tar.gz'}
 $phase='TOOLS'
 $toolsStep='JDK_ROOT';$jdk=[IO.Path]::GetFullPath([string]$original['JAVA_HOME_17_X64']);Assert-PlainDirectory $jdk
 $toolsStep='SDK_ROOT';Assert-SdkLabel ([string]$original['ANDROID_HOME']);$sdk='C:\Program Files (x86)\Android\android-sdk';Assert-PlainAncestors $sdk
 $toolsStep='SDK_CONSISTENCY'
 if($original.Contains('ANDROID_SDK_ROOT')){Assert-SdkLabel ([string]$original['ANDROID_SDK_ROOT'])}
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
  if($RetainEvidence){
   $phase='RETAIN';RetentionPython $retentionProducer 'stage' $owner.Path 'COPY' 'DERIVED_PAIR_RETENTION_COPIED'
   RetentionPython $retentionValidator 'stage' $owner.Path 'VALIDATE' 'DERIVED_PAIR_RETENTION_STAGED'
   $retentionBindingText=ReadText (Join-Path $base 'retention-staging.json') 65536
   $retentionBinding=$retentionBindingText|ConvertFrom-Json
   if(($retentionBinding|ConvertTo-Json -Depth 12 -Compress) -cne $retentionBindingText -or @($retentionBinding.files).Count -ne 29){throw 'RETENTION_BINDING'}
   $retentionStaged=$true
  }
  $phase='CLEANUP';Python $controller @('cleanup',$owner.Path) 'DERIVED_PAIR_CONTROL_PASS' $true
  if($RetainEvidence){RetentionPython $retentionValidator 'cleanup' $base 'CLEANUP' 'DERIVED_PAIR_RETENTION_CLEANED' $true;Assert-ScratchAbsent}else{Remove-VerifiedOwnedRun $owner $allRetired}
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
  if($RetainEvidence -and $published -and $retentionStaged){
   # Capture the actual retired legacy publisher's final report BEFORE retained publication.
   $retentionFinalReportText=ReadText (Join-Path $base 'upload/report.json') 65536
   $reportBytes=[Text.Encoding]::UTF8.GetBytes($retentionFinalReportText);$reportHasher=[Security.Cryptography.SHA256]::Create()
   try{$reportDigest=([BitConverter]::ToString($reportHasher.ComputeHash($reportBytes))).Replace('-','').ToLowerInvariant()}finally{$reportHasher.Dispose()}
   $expectedRows=@{};$expectedTotal=0L
   foreach($row in $retentionBinding.files){
    if((@($row.PSObject.Properties.Name)-join ',') -cne 'path,bytes,sha256' -or $expectedRows.ContainsKey($row.path) -or $row.path -ceq 'build/report.json'){throw 'RETENTION_BINDING'}
    $expectedRows[$row.path]=[ordered]@{path=$row.path;bytes=$row.bytes;sha256=$row.sha256}
   }
   $expectedRows['build/report.json']=[ordered]@{path='build/report.json';bytes=$reportBytes.Length;sha256=$reportDigest}
   $expectedNames=[string[]]@($expectedRows.Keys);[Array]::Sort($expectedNames,[StringComparer]::Ordinal)
   $expectedFiles=@(foreach($name in $expectedNames){$expectedTotal+=$expectedRows[$name].bytes;$expectedRows[$name]})
   $expectedRetentionReceipt=[ordered]@{version=1;scope='DERIVED_SCRCPY_PAIR_RETAINED_EVIDENCE';githubRunId=$retentionContext.githubRunId;githubRunAttempt=$retentionContext.githubRunAttempt;autoSourceCommit=$context.autoCommit;autoSourceTree=$context.autoTree;protocolId='AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1';reportSha256=$reportDigest;retentionSourceSha256=$expectedRows['build/retention-source.json'].sha256;noticeReceiptSha256=$expectedRows['notice/capture-receipt.json'].sha256;files=$expectedFiles;totalBytes=$expectedTotal;buildProcessesRetired=$true;copyVerified=$true;sourceUnchanged=$true;noticeBytesVerified=$true;directoryCleanup=$true;passed=$true}
   $expectedRetentionReceiptText=$expectedRetentionReceipt|ConvertTo-Json -Depth 12 -Compress
   $phase='RETAIN';RetentionPython $retentionValidator 'publish'  $base 'PUBLISH' 'DERIVED_PAIR_RETENTION_PUBLISHED' $true
   RetentionReadback;$retentionPublished=$true
  }
 }
}catch{Write-Output ('DERIVED_PAIR_STAGE_'+$phase)}finally{
 foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
 foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}
}
if($RetainEvidence){if($retentionPublished -and $published -and $allRetired){Write-Output 'DERIVED_PAIR_RETENTION_WRITTEN';Write-Output 'DERIVED_PAIR_RETENTION_PASS';exit 0};Write-Output 'DERIVED_PAIR_RETENTION_FAIL';exit 1}
if($published){Write-Output 'DERIVED_PAIR_VALIDATION_PASS';exit 0}
Write-Output 'DERIVED_PAIR_VALIDATION_FAIL';exit 1
