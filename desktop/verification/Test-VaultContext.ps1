param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][ValidateSet('source','package')][string]$Mode)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
function Plain([string]$Path){$i=Get-Item -LiteralPath $Path -Force;if(-not $i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.Path]::GetFullPath($Path) -cne $Path){throw 'DIRECTORY'}}
function Read-Bounded([string]$Path,[int]$Limit=65536){Plain ([IO.Path]::GetDirectoryName($Path));$i=Get-Item -LiteralPath $Path -Force;if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -gt $Limit){throw 'FILE'};$s=[IO.File]::OpenRead($Path);try{$b=New-Object byte[] ($Limit+1);$n=0;while($n -lt $b.Length){$read=$s.Read($b,$n,$b.Length-$n);if($read -eq 0){break};$n+=$read};if($n -gt $Limit){throw 'LIMIT'};$out=New-Object byte[] $n;[Array]::Copy($b,$out,$n);return ,$out}finally{$s.Dispose()}}
function Text([string]$Path){return (New-Object Text.UTF8Encoding($false,$true)).GetString((Read-Bounded $Path))}
try{
    Plain $Root
    if('Fonesi.Verification.VaultDpapiContext' -as [type]){throw 'PRELOADED'}
    $helper=Join-Path $PSScriptRoot 'VaultDpapiContext.cs'
    $helperItem=Get-Item -LiteralPath $helper -Force
    if($helperItem.PSIsContainer -or ($helperItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash $helper -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'b52511ff827a696d464699eff94b4590a875960cadf071c3a18826fc4b304a23'){throw 'HELPER'}
    $raw=Text (Join-Path $Root ('persistence-vault-context-control-'+$Mode+'.json'));$control=$raw|ConvertFrom-Json
    if(($control.PSObject.Properties.Name -join ',') -cne 'version,mode,parentToken,ownerToken,storeId,blobSha256,localStateSha256' -or $control.version -isnot [int] -or $control.version -ne 1 -or $control.mode -cne $Mode -or ($control|ConvertTo-Json -Compress) -cne $raw){throw 'CONTROL'}
    foreach($key in @('parentToken','ownerToken','storeId')){if($control.$key -isnot [string] -or $control.$key -cnotmatch '\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z'){throw 'IDENTITY'}}
    foreach($key in @('blobSha256','localStateSha256')){if($control.$key -isnot [string] -or $control.$key -cnotmatch '\A[0-9a-f]{64}\z'){throw 'HASH'}}
    if((Text (Join-Path $Root '.owner')) -cne $control.parentToken){throw 'OWNER'}
    $data=Join-Path $Root ('data-'+$Mode);Plain $data
    if((Text (Join-Path $data '.persistence-owner.json')) -cne ('{"version":1,"storeId":"'+$control.storeId+'","kind":"FRESH","restoreReceiptId":null}')){throw 'OWNER'}
    $lock=Join-Path $data '.writer-lock';Plain $lock;$entries=[IO.Directory]::EnumerateFileSystemEntries($lock).GetEnumerator()
    try{if(-not $entries.MoveNext() -or [IO.Path]::GetFileName($entries.Current) -cne 'owner.json' -or $entries.MoveNext()){throw 'LOCK'}}finally{$entries.Dispose()}
    if((Text (Join-Path $lock 'owner.json')) -cne ('{"version":1,"storeId":"'+$control.storeId+'","ownerToken":"'+$control.ownerToken+'"}')){throw 'LOCK'}
    $profile=Join-Path $data 'key-profile';Plain $profile
    if((Text (Join-Path $profile '.key-profile-owner.json')) -cne ('{"version":1,"storeId":"'+$control.storeId+'"}')){throw 'PROFILE'}
    $state=Read-Bounded (Join-Path $profile 'Local State');$sha=[Security.Cryptography.SHA256]::Create()
    try{if(([BitConverter]::ToString($sha.ComputeHash($state))).Replace('-','').ToLowerInvariant() -cne $control.localStateSha256){throw 'PROFILE_HASH'}
        $blob=Read-Bounded (Join-Path $Root ('persistence-vault-context-blob-'+$Mode+'.bin')) 4096
        if($blob.Length -lt 32 -or ([BitConverter]::ToString($sha.ComputeHash($blob))).Replace('-','').ToLowerInvariant() -cne $control.blobSha256){throw 'BLOB_HASH'}
    }finally{$sha.Dispose()}
    try {
        Add-Type -Path $helper
        # Source-reviewed helper reverts and verifies original SID before returning.
        $result=[Fonesi.Verification.VaultDpapiContext]::Run($blob)
    } finally { [Array]::Clear($blob,0,$blob.Length) }
    if($result.Length -gt 4096){throw 'RESULT'}
    $out=Join-Path $Root ('persistence-vault-context-result-'+$Mode+'.json');Plain $Root
    if((Text (Join-Path $Root '.owner')) -cne $control.parentToken){throw 'OWNER'}
    $s=[IO.File]::Open($out,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.Encoding]::UTF8.GetBytes($result);$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()}
    Write-Output 'VAULT_CONTEXT_RESULT'
}catch{Write-Output 'VAULT_CONTEXT_FAILED';exit 1}
