# One private long-lived helper. No command string, renderer entry or server activation.
param([Parameter(Mandatory=$true)][string]$BootstrapFile,[Parameter(Mandatory=$true)][string]$BootstrapSha256)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$admission=$null;$phase='ENVIRONMENT'
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
try {
    if($PSVersionTable.PSVersion.Major -ne 5 -or $BootstrapSha256 -cnotmatch '^[0-9a-f]{64}$'){Reject}
    $desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $phase='CONTEXT'
    $raw=Read-Bounded $BootstrapFile 8192
    if((Digest $raw) -cne $BootstrapSha256){Reject}
    $b=Parse $raw @('version','operationSet','sessionId','launchId','storeId','ownerToken','parentReceiptSha256','readySha256','runRoot','adbPath','adbExeSha256','candidateArchiveSha256','candidateManifestSha256','installationRevision','assets')
    if($b.version -ne 1 -or $b.operationSet -cne 'VERSION_ONLY'){Reject}
    foreach($key in @('sessionId','launchId','storeId','ownerToken')){if($b.$key -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'){Reject}}
    foreach($key in @('parentReceiptSha256','readySha256','adbExeSha256','candidateArchiveSha256','candidateManifestSha256')){if($b.$key -cnotmatch '^[0-9a-f]{64}$'){Reject}}
    if($b.installationRevision -lt 1 -or $b.installationRevision -gt 9007199254740991 -or [Math]::Truncate([double]$b.installationRevision) -ne $b.installationRevision){Reject}
    Plain $b.runRoot $true
    if($BootstrapFile -cne (Join-Path $b.runRoot 'bootstrap.json') -or [IO.Path]::GetFileName($b.runRoot) -cne ('host-session-'+$b.sessionId)){Reject}
    if([Text.Encoding]::ASCII.GetString((Read-Bounded (Join-Path $b.runRoot '.owner') 36)) -cne $b.ownerToken){Reject}
    if($env:TEMP -cne (Join-Path $b.runRoot 'profile') -or $env:TMP -cne $env:TEMP){Reject};Plain $env:TEMP $true
    foreach($key in [Environment]::GetEnvironmentVariables('Process').Keys){if($key -match '(?i)^(NODE_|ELECTRON|ADB_|ANDROID_)'){Reject}}
    $launch=[IO.Path]::GetDirectoryName($b.runRoot)
    if([IO.Path]::GetFileName($launch) -cne ('launch-'+$b.launchId)){Reject}
    $parentRaw=Read-Bounded (Join-Path $launch 'host-parent.json') 4096
    if((Digest $parentRaw) -cne $b.parentReceiptSha256){Reject}
    $p=Parse $parentRaw @('version','launchId','storeId','ownerToken','readySha256','jobName','parentPid','parentCreationFileTime','parentImagePath','parentImageSha256')
    if($p.version -ne 1 -or $p.launchId -cne $b.launchId -or $p.storeId -cne $b.storeId -or $p.ownerToken -cne $b.ownerToken -or $p.readySha256 -cne $b.readySha256 -or $p.parentPid -lt 1 -or $p.parentPid -gt 4294967295 -or $p.parentCreationFileTime -cnotmatch '^[0-9a-f]{16}$'){Reject}
    $phase='ASSETS'
    $names=@('launch/Invoke-RetainedHost.ps1','native/IsolatedAdbServer.cs','native/RetainedAdbSession.cs','native/RetainedAdbProtocol.cs','native/RetainedHostAdmission.cs')
    if((@($b.assets.PSObject.Properties.Name) -join '|') -cne ($names -join '|')){Reject}
    $paths=@();$total=0
    foreach($name in $names){$asset=Join-Path $desktop $name;$bytes=Read-Bounded $asset 1048576;$total+=$bytes.Length;if($total -gt 4194304 -or $b.assets.$name -cnotmatch '^[0-9a-f]{64}$' -or (Digest $bytes) -cne $b.assets.$name){Reject};if($name.EndsWith('.cs')){$paths+=,$asset}}
    $phase='COMPILE'
    Add-Type -Path $paths -ReferencedAssemblies @('System.dll','System.Core.dll') -ErrorAction Stop
    $phase='PARENT'
    $admission=[Fonesi.Development.Server.IsolatedAdbServer]::OpenParentAdmission([uint32]$p.parentPid,$p.parentCreationFileTime,$p.parentImagePath,$p.parentImageSha256,$p.jobName)
    $provider=New-Object Fonesi.Development.Server.IsolatedAdbServer+RetainedProvider($b.runRoot,$b.ownerToken,$b.adbPath,$b.adbExeSha256)
    $adapter=New-Object Fonesi.Development.Server.RetainedAdbProtocol+NativeProvider($provider)
    $phase='READER'
    $result=[Fonesi.Development.Server.RetainedAdbProtocol]::Run([Console]::OpenStandardInput(),[Console]::OpenStandardOutput(),$b.sessionId,$adapter,$admission.Liveness())
    if(-not $result.Clean){Reject}
    $phase='CLOSE'
    $admission.Dispose();$admission=$null
    exit 0
} catch {
    [Console]::Error.WriteLine('HOST_BOOTSTRAP_PHASE_'+$phase)
    [Console]::Error.WriteLine('HOST_BOOTSTRAP_FAILED')
    exit 1
} finally {if($null -ne $admission){$admission.Dispose()}}
