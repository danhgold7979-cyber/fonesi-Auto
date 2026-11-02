# One private long-lived helper. No command string, renderer entry or server activation.
param([Parameter(Mandatory=$true)][string]$BootstrapFile,[Parameter(Mandatory=$true)][string]$BootstrapSha256)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$admission=$null;$phase='ENVIRONMENT'
$progressSlots=@{}
function Progress([string]$Slot) {
    if($Slot -cnotin @('ENVIRONMENT','CONTEXT','ASSETS','COMPILE_BEGIN','COMPILE_END','PARENT_BEGIN','PARENT_END','READER','CLOSE')){Reject}
    if(-not $progressSlots.ContainsKey($Slot)){$progressSlots[$Slot]=$true;try{[Console]::Error.WriteLine('HOST_BOOTSTRAP_PROGRESS_'+$Slot)}catch{}}
}
function Compile-Type($Value) {
    if($null -eq $Value){return 'NONE'}
    switch -CaseSensitive ($Value.GetType().FullName) {
        'System.IO.IOException' {return 'IO'}
        'System.IO.PathTooLongException' {return 'PATH_TOO_LONG'}
        'System.UnauthorizedAccessException' {return 'ACCESS'}
        'System.ComponentModel.Win32Exception' {return 'WIN32'}
        'System.Runtime.InteropServices.ExternalException' {return 'EXTERNAL'}
        'System.IO.DirectoryNotFoundException' {return 'DIRECTORY_NOT_FOUND'}
        'System.InvalidOperationException' {return 'INVALID_OPERATION'}
        'System.ArgumentException' {return 'ARGUMENT'}
        'System.IO.FileNotFoundException' {return 'FILE_NOT_FOUND'}
        'System.IO.FileLoadException' {return 'FILE_LOAD'}
        'System.BadImageFormatException' {return 'BAD_IMAGE'}
        'System.Management.Automation.CmdletInvocationException' {return 'CMDLET'}
        'System.Management.Automation.CommandNotFoundException' {return 'COMMAND_NOT_FOUND'}
        'System.Management.Automation.ParameterBindingException' {return 'PARAMETER_BINDING'}
        default {return 'OTHER'}
    }
}
function Compile-ReasonText([string]$Text) {
    $value=$Text.Trim([char]32)
    if($value.EndsWith('.',[StringComparison]::Ordinal)){$value=$value.Substring(0,$value.Length-1).TrimEnd([char]32)}
    return $value
}
function Compile-Frame([System.Management.Automation.ErrorRecord]$Record) {
    $id='OTHER';$type='OTHER';$inner='NONE';$cs='NONE'
    $tempReason='UNAVAILABLE';$tempRelation='UNAVAILABLE';$tempLength='UNAVAILABLE'
    try {
        if($Record.GetType() -ne [System.Management.Automation.ErrorRecord]){throw 'FIXED'}
        $fq=$Record.FullyQualifiedErrorId
        if($null -ne $fq -and $fq.Length -le 256){
            $part=$fq.Split(',')[0]
            switch -CaseSensitive ($part) {
                'SOURCE_CODE_ERROR' {$id='SOURCE_CODE_ERROR'}
                'COMPILER_ERRORS' {$id='COMPILER_ERRORS'}
                'ASSEMBLY_NOT_FOUND' {$id='ASSEMBLY_NOT_FOUND'}
                'ASSEMBLY_LOAD_ERRORS' {$id='ASSEMBLY_LOAD_ERRORS'}
                'CommandNotFoundException' {$id='COMMAND_NOT_FOUND'}
                'NamedParameterNotFound' {$id='PARAMETER_BINDING'}
                'PositionalParameterNotFound' {$id='PARAMETER_BINDING'}
            }
        }
        $exception=$Record.Exception
        $type=Compile-Type $exception
        if($null -ne $exception){$inner=Compile-Type $exception.InnerException}
        $target=$Record.TargetObject
        if($null -ne $target -and $target.GetType().FullName -cin @('Microsoft.PowerShell.Commands.AddTypeCompilerError','System.CodeDom.Compiler.CompilerError')){
            $number=$target.ErrorNumber
            $cs='OTHER'
            if($number -is [string] -and $number.Length -eq 6 -and $number -cmatch '\ACS[0-9]{4}\z'){$cs=$number}
            if($cs -ceq 'CS1619'){
                $text=$target.ErrorText
                if($text -is [string] -and $text.Length -le 4096 -and $text.IndexOf([char]0) -lt 0 -and $text.IndexOf([char]10) -lt 0 -and $text.IndexOf([char]13) -lt 0){
                    $match=[Text.RegularExpressions.Regex]::Match($text,'\ACannot create temporary file ''([^'']*)'' -- (.+)\z',[Text.RegularExpressions.RegexOptions]::CultureInvariant)
                    if($match.Success){
                        $tempPath=$match.Groups[1].Value
                        $reason=Compile-ReasonText $match.Groups[2].Value
                        $tempReason='OTHER'
                        switch -CaseSensitive ($reason) {
                            'Access is denied' {$tempReason='ACCESS'}
                            'The filename or extension is too long' {$tempReason='PATH_TOO_LONG'}
                            'The file name is too long' {$tempReason='PATH_TOO_LONG'}
                            'The system cannot find the file specified' {$tempReason='NOT_FOUND'}
                            'The system cannot find the path specified' {$tempReason='NOT_FOUND'}
                            'There is not enough space on the disk' {$tempReason='DISK_FULL'}
                            'The disk is full' {$tempReason='DISK_FULL'}
                            'The data area passed to a system call is too small' {$tempReason='BUFFER_TOO_SMALL'}
                            'The filename, directory name, or volume label syntax is incorrect' {$tempReason='INVALID_NAME'}
                        }
                        if($tempReason -ceq 'OTHER'){
                            $matchedCode=0;$matchCount=0;$lookupComplete=$true
                            for($code=1;$code -le 499;$code++){
                                try {
                                    $nativeError=New-Object -TypeName System.ComponentModel.Win32Exception -ArgumentList $code
                                    $nativeText=$nativeError.Message
                                    if($nativeText -is [string] -and $nativeText.Length -le 1024 -and $nativeText.IndexOf([char]0) -lt 0 -and $nativeText.IndexOf([char]10) -lt 0 -and $nativeText.IndexOf([char]13) -lt 0 -and (Compile-ReasonText $nativeText) -ceq $reason){$matchCount++;$matchedCode=$code}
                                } catch {$lookupComplete=$false}
                            }
                            if($lookupComplete -and $matchCount -eq 1){$tempReason='WIN32_'+[string]::Format('{0:D4}',$matchedCode)}
                        }
                        if($tempPath.Length -eq 0){$tempRelation='EMPTY';$tempLength='EMPTY'}
                        else {
                            $tempRelation='OTHER'
                            $profilePrefix=$b.runRoot+'\profile\'
                            $runPrefix=$b.runRoot+'\'
                            if($tempPath.IndexOf('/') -lt 0 -and $tempPath -cnotmatch '(?:\A|\\)\.{1,2}(?:\\|\z)' -and $tempPath.StartsWith($profilePrefix,[StringComparison]::OrdinalIgnoreCase)){$tempRelation='PROFILE'}
                            elseif($tempPath.IndexOf('/') -lt 0 -and $tempPath -cnotmatch '(?:\A|\\)\.{1,2}(?:\\|\z)' -and $tempPath.StartsWith($runPrefix,[StringComparison]::OrdinalIgnoreCase)){$tempRelation='RUN'}
                            if($tempPath.Length -le 247){$tempLength='LE247'}
                            elseif($tempPath.Length -le 259){$tempLength='FROM248_TO259'}
                            else {$tempLength='GE260'}
                        }
                    }
                }
            }
        }
    } catch {$id='OTHER';$type='OTHER';$inner='OTHER';$cs='OTHER';$tempReason='UNAVAILABLE';$tempRelation='UNAVAILABLE';$tempLength='UNAVAILABLE'}
    [Console]::Error.WriteLine('HOST_BOOTSTRAP_COMPILE_ERROR|'+$id+'|'+$type+'|'+$inner+'|'+$cs+'|'+$tempReason+'|'+$tempRelation+'|'+$tempLength)
}
function Reject { throw 'HOST_BOOTSTRAP_REJECTED' }
function Plain([string]$Path,[bool]$Directory=$false) {
    if(-not [IO.Path]::IsPathRooted($Path) -or [IO.Path]::GetFullPath($Path) -cne $Path){Reject}
    $item=Get-Item -LiteralPath $Path -Force
    if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or [bool]$item.PSIsContainer -ne $Directory){Reject}
    $parent=[IO.Path]::GetDirectoryName($Path)
    while($parent){$p=Get-Item -LiteralPath $parent -Force;if(-not $p.PSIsContainer -or ($p.Attributes -band [IO.FileAttributes]::ReparsePoint)){Reject};$parent=[IO.Path]::GetDirectoryName($parent)}
}
function Read-Bounded([string]$Path,[int]$Max) {
    Plain $Path
    $s=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try {
        if($s.Length -lt 1 -or $s.Length -gt $Max){Reject};$size=$s.Length
        $b=New-Object byte[] ($size+1);$n=0
        while($n -lt $b.Length){$got=$s.Read($b,$n,$b.Length-$n);if($got -eq 0){break};$n+=$got}
        if($n -ne $size -or $s.Length -ne $size){Reject}
        $exact=New-Object byte[] $size;[Array]::Copy($b,$exact,$size);return ,$exact
    } finally {$s.Dispose()}
}
function Digest([byte[]]$Bytes) {$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Parse([byte[]]$Bytes,[string[]]$Keys) {
    $utf8=New-Object Text.UTF8Encoding($false,$true);$raw=$utf8.GetString($Bytes)
    if($raw.Length -lt 2 -or $raw[0] -ne '{' -or $raw[$raw.Length-1] -ne '}'){Reject}
    $v=ConvertFrom-Json -InputObject $raw
    if((@($v.PSObject.Properties.Name) -join '|') -cne ($Keys -join '|')){Reject}
    return $v
}
# Source-owned reviewed output pin. Null is intentionally unavailable, never caller authority.
$ReviewedVideoPairSha256=$null
function Video-Pair($b,[string]$desktop) {
    if($null -eq $ReviewedVideoPairSha256){Reject}
    $a=$b.videoArtifact
    if((@($a.PSObject.Properties.Name) -join '|') -cne 'artifactId|relativePath|bytes|sha256|protocolId|pairManifestSha256'){Reject}
    if($a.artifactId -isnot [string] -or $a.artifactId -cnotmatch '\A[0-9a-f]{64}\z' -or $a.artifactId -cne $a.sha256 -or $a.relativePath -cne 'video/server.jar' -or $a.protocolId -cne 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1' -or $a.bytes -lt 1 -or $a.bytes -gt 8388608 -or [Math]::Truncate([double]$a.bytes) -ne $a.bytes -or $a.pairManifestSha256 -cne $ReviewedVideoPairSha256){Reject}
    $pairRaw=Read-Bounded (Join-Path $desktop 'video/pair.json') 8192
    if((Digest $pairRaw) -cne $ReviewedVideoPairSha256){Reject}
    $pair=Parse $pairRaw @('version','serverVersion','serverBytes','serverSha256','protocolId','consumerBytes','consumerWindowsArtifactSha256','consumerBuildManifestSha256','serverBuildManifestSha256','architecture')
    if($pair.version -ne 1 -or $pair.serverVersion -cne '5.0.1' -or $pair.architecture -cne 'AMD64' -or $pair.serverBytes -ne $a.bytes -or $pair.serverSha256 -cne $a.sha256 -or $pair.protocolId -cne $a.protocolId -or $pair.consumerBytes -lt 1 -or $pair.consumerBytes -gt 8388608 -or [Math]::Truncate([double]$pair.consumerBytes) -ne $pair.consumerBytes){Reject}
    foreach($key in @('consumerWindowsArtifactSha256','consumerBuildManifestSha256','serverBuildManifestSha256')){if($pair.$key -isnot [string] -or $pair.$key -cnotmatch '\A[0-9a-f]{64}\z'){Reject}}
    $serverBuildRaw=Read-Bounded (Join-Path $desktop 'video/server-build.json') 8192
    if((Digest $serverBuildRaw) -cne $pair.serverBuildManifestSha256){Reject}
    $serverBuild=Parse $serverBuildRaw @('version','upstreamCommit','sourcePatchSha256','toolchainManifestSha256','dependenciesManifestSha256','buildCommandSha256','serverBytes','serverSha256','protocolId')
    if($serverBuild.version -ne 1 -or $serverBuild.upstreamCommit -cne 'a60891aea193d92e7e5c3942700eca63f9d19a5f' -or $serverBuild.serverBytes -ne $a.bytes -or $serverBuild.serverSha256 -cne $a.sha256 -or $serverBuild.protocolId -cne $a.protocolId){Reject}
    foreach($key in @('sourcePatchSha256','toolchainManifestSha256','dependenciesManifestSha256','buildCommandSha256')){if($serverBuild.$key -isnot [string] -or $serverBuild.$key -cnotmatch '\A[0-9a-f]{64}\z'){Reject}}
    $buildRaw=Read-Bounded (Join-Path $desktop 'video/consumer-build.json') 8192
    if((Digest $buildRaw) -cne $pair.consumerBuildManifestSha256){Reject}
    $build=Parse $buildRaw @('version','sourceCommit','compilerSha256','compilerVersion','arguments','frameworkReferences','sources','consumerSha256')
    if($build.version -ne 1 -or $build.sourceCommit -cnotmatch '\A[0-9a-f]{40}\z' -or $build.compilerSha256 -cnotmatch '\A[0-9a-f]{64}\z' -or $build.compilerVersion -isnot [string] -or $build.compilerVersion.Length -gt 64 -or $build.compilerVersion -cnotmatch '\A[0-9]+(\.[0-9]+){1,3}\z' -or $build.arguments -isnot [Array] -or $build.arguments.Count -ne 4 -or ($build.arguments -join '|') -cne '/nologo|/target:library|/platform:x64|/optimize+' -or $build.consumerSha256 -cne $pair.consumerWindowsArtifactSha256){Reject}
    if((@($build.frameworkReferences.PSObject.Properties.Name) -join '|') -cne 'System.dll|System.Core.dll'){Reject}
    foreach($key in @('System.dll','System.Core.dll')){if($build.frameworkReferences.$key -cnotmatch '\A[0-9a-f]{64}\z'){Reject}}
    $sourceNames=@('native/IsolatedAdbServer.cs','native/RetainedAdbSession.cs','native/RetainedAdbProtocol.cs','native/RetainedHostAdmission.cs','native/RetainedVideoSession.cs')
    if((@($build.sources.PSObject.Properties.Name) -join '|') -cne ($sourceNames -join '|')){Reject}
    $total=0;foreach($name in $sourceNames){$source=Read-Bounded (Join-Path $desktop $name) 1048576;$total+=$source.Length;if($total -gt 4194304 -or (Digest $source) -cne $build.sources.$name){Reject}}
    $server=Read-Bounded (Join-Path $desktop 'video/server.jar') 8388608
    if($server.Length -ne $a.bytes -or (Digest $server) -cne $a.sha256){Reject}
    $dll=Read-Bounded (Join-Path $desktop 'native/RetainedVideoConsumer.dll') 8388608
    if($dll.Length -ne $pair.consumerBytes -or (Digest $dll) -cne $pair.consumerWindowsArtifactSha256 -or $dll.Length -lt 64 -or [BitConverter]::ToUInt16($dll,0) -ne 0x5a4d){Reject}
    $pe=[BitConverter]::ToUInt32($dll,60)
    if($pe -gt $dll.Length-26 -or [BitConverter]::ToUInt32($dll,$pe) -ne 0x4550 -or [BitConverter]::ToUInt16($dll,$pe+4) -ne 0x8664 -or [BitConverter]::ToUInt16($dll,$pe+24) -ne 0x20b){Reject}
    return ,$dll
}

try {
    Progress 'ENVIRONMENT'
    if($PSVersionTable.PSVersion.Major -ne 5 -or $BootstrapSha256 -cnotmatch '^[0-9a-f]{64}$'){Reject}
    $desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $phase='CONTEXT';Progress 'CONTEXT'
    $raw=Read-Bounded $BootstrapFile 8192
    if((Digest $raw) -cne $BootstrapSha256){Reject}
    $shape=ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString($raw))
    $keys=@('version','operationSet','sessionId','launchId','storeId','ownerToken','parentReceiptSha256','readySha256','runRoot','adbPath','adbExeSha256','candidateArchiveSha256','candidateManifestSha256','installationRevision','expectedRelease','expectedBuildGrammar','assets')
    if($shape.version -eq 3){$keys+=,'videoArtifact'}
    $b=Parse $raw $keys
    if(($b.version -ne 2 -and $b.version -ne 3) -or ($b.operationSet -cne 'VERSION_ONLY' -and $b.operationSet -cne 'SERVER_ONLY')){Reject}
    foreach($key in @('sessionId','launchId','storeId','ownerToken')){if($b.$key -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'){Reject}}
    foreach($key in @('parentReceiptSha256','readySha256','adbExeSha256','candidateArchiveSha256','candidateManifestSha256')){if($b.$key -cnotmatch '^[0-9a-f]{64}$'){Reject}}
    if($b.installationRevision -lt 1 -or $b.installationRevision -gt 9007199254740991 -or [Math]::Truncate([double]$b.installationRevision) -ne $b.installationRevision){Reject}
    if($b.expectedRelease -isnot [string] -or $b.expectedRelease.Length -lt 1 -or $b.expectedRelease.Length -gt 32 -or $b.expectedRelease -cnotmatch '\A[0-9]+\.[0-9]+\.[0-9]+\z' -or $b.expectedBuildGrammar -isnot [string] -or $b.expectedBuildGrammar -cne 'DECIMAL_1_20'){Reject}
    Plain $b.runRoot $true
    if($BootstrapFile -cne (Join-Path $b.runRoot 'bootstrap.json') -or [IO.Path]::GetFileName($b.runRoot) -cne '.host-session'){Reject}
    if([Text.Encoding]::ASCII.GetString((Read-Bounded (Join-Path $b.runRoot '.owner') 36)) -cne $b.ownerToken){Reject}
    if($env:TEMP -cne (Join-Path $b.runRoot 'profile') -or $env:TMP -cne $env:TEMP){Reject};Plain $env:TEMP $true
    foreach($key in [Environment]::GetEnvironmentVariables('Process').Keys){if($key -match '(?i)^(NODE_|ELECTRON|ADB_|ANDROID_)'){Reject}}
    $launch=[IO.Path]::GetDirectoryName($b.runRoot)
    if([IO.Path]::GetFileName($launch) -cne ('launch-'+$b.launchId)){Reject}
    $parentRaw=Read-Bounded (Join-Path $launch 'host-parent.json') 4096
    if((Digest $parentRaw) -cne $b.parentReceiptSha256){Reject}
    $p=Parse $parentRaw @('version','launchId','storeId','ownerToken','readySha256','jobName','parentPid','parentCreationFileTime','parentImagePath','parentImageSha256')
    if($p.version -ne 1 -or $p.launchId -cne $b.launchId -or $p.storeId -cne $b.storeId -or $p.ownerToken -cne $b.ownerToken -or $p.readySha256 -cne $b.readySha256 -or $p.parentPid -lt 1 -or $p.parentPid -gt 4294967295 -or $p.parentCreationFileTime -cnotmatch '^[0-9a-f]{16}$'){Reject}
    $phase='ASSETS';Progress 'ASSETS'
    $names=@('launch/Invoke-RetainedHost.ps1','native/IsolatedAdbServer.cs','native/RetainedAdbSession.cs','native/RetainedAdbProtocol.cs','native/RetainedHostAdmission.cs')
    if($b.version -eq 3){$names+=,'native/RetainedVideoSession.cs'}
    if((@($b.assets.PSObject.Properties.Name) -join '|') -cne ($names -join '|')){Reject}
    $paths=@();$total=0
    foreach($name in $names){$asset=Join-Path $desktop $name;$bytes=Read-Bounded $asset 1048576;$total+=$bytes.Length;if($total -gt 4194304 -or $b.assets.$name -cnotmatch '^[0-9a-f]{64}$' -or (Digest $bytes) -cne $b.assets.$name){Reject};if($name.EndsWith('.cs')){$paths+=,$asset}}
    $videoDll=$null
    if($b.version -eq 3 -and $null -ne $b.videoArtifact){if($b.operationSet -cne 'SERVER_ONLY'){Reject};$videoDll=Video-Pair $b $desktop}
    $phase='COMPILE';Progress 'COMPILE_BEGIN'
    if($null -ne $videoDll){[void][Reflection.Assembly]::Load([byte[]]$videoDll)}else{Add-Type -Path $paths -ReferencedAssemblies @('System.dll','System.Core.dll') -ErrorAction Stop}
    Progress 'COMPILE_END'
    $phase='PARENT';Progress 'PARENT_BEGIN'
    $admission=[Fonesi.Development.Server.IsolatedAdbServer]::OpenParentAdmission([uint32]$p.parentPid,$p.parentCreationFileTime,$p.parentImagePath,$p.parentImageSha256,$p.jobName)
    Progress 'PARENT_END'
    $provider=New-Object Fonesi.Development.Server.IsolatedAdbServer+RetainedProvider($b.runRoot,$b.ownerToken,$b.adbPath,$b.adbExeSha256,$b.expectedRelease,$b.expectedBuildGrammar,$true)
    if($null -ne $videoDll){$a=$b.videoArtifact;$provider.ConfigureVideo($b.launchId,$b.storeId,$b.sessionId,$a.artifactId,(Join-Path $desktop 'video/server.jar'),[int]$a.bytes,$a.sha256,$a.protocolId,$a.pairManifestSha256,[long]$b.installationRevision)}
    $adapter=New-Object Fonesi.Development.Server.RetainedAdbProtocol+NativeProvider($provider)
    $phase='READER';Progress 'READER'
    $result=[Fonesi.Development.Server.RetainedAdbProtocol]::Run([Console]::OpenStandardInput(),[Console]::OpenStandardOutput(),$b.sessionId,$adapter,$admission.Liveness(),$true,$b.operationSet)
    if(-not $result.Clean){Reject}
    $phase='CLOSE';Progress 'CLOSE'
    $admission.Dispose();$admission=$null
    exit 0
} catch {
    if($phase -ceq 'COMPILE'){try{Compile-Frame $_}catch{}}
    [Console]::Error.WriteLine('HOST_BOOTSTRAP_PHASE_'+$phase)
    [Console]::Error.WriteLine('HOST_BOOTSTRAP_FAILED')
    exit 1
} finally {if($null -ne $admission){$admission.Dispose()}}
