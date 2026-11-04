# Fresh verification PowerShell only. Production launcher copy has exactly four
# audited entry/path substitutions; application key/provider/control remain real.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $desktop '.runtime'
$owner=$null;$allClean=$true;$failure='PREPARE_FAILED'
function Good($Result,[string]$Marker){
    if(-not $Result.CleanupComplete -or $Result.StdoutTruncated -or $Result.StderrTruncated -or $Result.Status -ne 'SUCCESS' -or $Result.ExitCode -ne 0 -or $Result.Stdout.Replace("`r`n","`n") -cne ($Marker+"`n")){throw 'PROCESS_FAILED'}
}
function Write-Exclusive([string]$Path,[string]$Raw){
    Assert-PlainDirectory ([IO.Path]::GetDirectoryName($Path));$b=[Text.Encoding]::UTF8.GetBytes($Raw)
    if($b.Length -gt 65536){throw 'LIMIT'}
    $f=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}
}
function Read-Bounded([string]$Path){
    Assert-PlainDirectory ([IO.Path]::GetDirectoryName($Path));$s=Get-Item -LiteralPath $Path -Force
    if($s.PSIsContainer -or ($s.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $s.Length -gt 65536){throw 'FILE'}
    $f=[IO.File]::OpenRead($Path)
    try{$b=New-Object byte[] 65537;$n=0;while($n -lt $b.Length){$c=$f.Read($b,$n,$b.Length-$n);if($c -eq 0){break};$n+=$c};if($n -gt 65536){throw 'LIMIT'};return (New-Object Text.UTF8Encoding($false,$true)).GetString($b,0,$n)}finally{$f.Dispose()}
}
function Node-Control([string]$Action){
    $script:allClean=$false
    $r=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-launch-e2e-control.cjs'),$Action,$owner.Path)) 120000 @{}
    $script:allClean=$r.CleanupComplete -and -not $r.StdoutTruncated -and -not $r.StderrTruncated
    Good $r $(if($Action -eq 'prepare'){'PERSISTENCE_LAUNCH_E2E_PREPARED'}elseif($Action -eq 'verify-copy'){'PERSISTENCE_LAUNCH_E2E_COPY_VERIFIED'}else{'PERSISTENCE_LAUNCH_E2E_INSPECTED'})
}
function Invoke-Launcher([string[]]$Arguments){
    # Distinct fixed PowerShell invocation; WindowsBoundary's generic switch ban
    # is not widened. No ExecutionPolicy bypass, shell command text or PATH lookup.
    $original=[Environment]::GetEnvironmentVariables('Process')
    foreach($key in $original.Keys){if($key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH')){throw 'OVERRIDE'}}
    $allowed=@('SystemRoot','WINDIR','SystemDrive','PATH','PATHEXT','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')
    try{
        foreach($key in @($original.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
        foreach($key in $original.Keys){if($allowed -contains [string]$key){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}}
        return [Fonesi.Phase00.NativeProbe]::Run($powershell,$Arguments,120000,10000,32768)
    }finally{
        foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
        foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}
    }
}
function Remove-Part([string]$Path,[long]$Limit){
    if(-not $allClean){throw 'RETIREMENT_UNCONFIRMED'};Assert-OwnedRun $owner
    $entries=Get-BoundedOwnedEntries $Path $Limit
    foreach($entry in $entries.Entries){if(-not $entry.PSIsContainer -and $entry.Name -cne '.owner'){[IO.File]::Delete($entry.FullName)}}
    foreach($entry in $entries.Entries){if(-not $entry.PSIsContainer -and $entry.Name -ceq '.owner'){[IO.File]::Delete($entry.FullName)}}
    foreach($entry in @($entries.Entries|Where-Object {$_.PSIsContainer}|Sort-Object {$_.FullName.Length} -Descending)){[IO.Directory]::Delete($entry.FullName,$false)}
    [IO.Directory]::Delete($Path,$false)
}
try{
    Assert-PlainDirectory $base
    $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
    if((Get-FileHash $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'){throw 'HELPER'}
    if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED_HELPER'};Add-Type -Path $helper
    $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe'
    if((Get-FileHash $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE'}
    $powershell=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $exe=Get-Item -LiteralPath $powershell -Force
    if($exe.PSIsContainer -or ($exe.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'POWERSHELL'}
    $owner=New-OwnedRun $base
    Node-Control 'prepare'
    $failure='FIRST_LAUNCH_FAILED';Node-Control 'verify-copy';$allClean=$false
    $first=Invoke-Launcher ([string[]]@('-NoProfile','-NonInteractive','-File',(Join-Path $owner.Path 'Invoke-Desktop.instrumented.ps1'),'-CreateUnder',(Join-Path $owner.Path 'first-use')))
    $allClean=$first.CleanupComplete -and -not $first.StdoutTruncated -and -not $first.StderrTruncated
    Write-Exclusive (Join-Path $owner.Path 'first-capture.json') (([ordered]@{status=$first.Status;exitCode=$first.ExitCode;cleanupComplete=$first.CleanupComplete;stdout=$first.Stdout;stderr=$first.Stderr})|ConvertTo-Json -Compress)
    Good $first 'PERSISTENCE_DESKTOP_CLOSED';Node-Control 'inspect-first'
    $firstState=(Read-Bounded (Join-Path $owner.Path 'first.json'))|ConvertFrom-Json
    $managed=[string]$firstState.root
    if([IO.Path]::GetDirectoryName($managed) -cne (Join-Path $owner.Path 'first-use')){throw 'ROOT'}
    $failure='SECOND_LAUNCH_FAILED';Node-Control 'verify-copy';$allClean=$false
    $second=Invoke-Launcher ([string[]]@('-NoProfile','-NonInteractive','-File',(Join-Path $owner.Path 'Invoke-Desktop.instrumented.ps1'),'-Root',$managed))
    $allClean=$second.CleanupComplete -and -not $second.StdoutTruncated -and -not $second.StderrTruncated
    Write-Exclusive (Join-Path $owner.Path 'second-capture.json') (([ordered]@{status=$second.Status;exitCode=$second.ExitCode;cleanupComplete=$second.CleanupComplete;stdout=$second.Stdout;stderr=$second.Stderr})|ConvertTo-Json -Compress)
    Good $second 'PERSISTENCE_DESKTOP_CLOSED';Node-Control 'inspect-second'
    $public=(Read-Bounded (Join-Path $owner.Path 'result.json'))|ConvertFrom-Json
    $failure='CLEANUP_FAILED'
    # Separate fixed partitions, never all native profiles under one256 aggregate.
    if((Read-Bounded (Join-Path $managed '.owner')) -cne $firstState.parentToken){throw 'MANAGED_OWNER'}
    $managedEntries=[IO.Directory]::EnumerateFileSystemEntries($managed).GetEnumerator();$launches=New-Object 'System.Collections.Generic.List[string]';$rootCount=0
    try{while($managedEntries.MoveNext()){
        if(++$rootCount -gt 8){throw 'ROOT_LIMIT'}
        $p=$managedEntries.Current;$entry=Get-Item -LiteralPath $p -Force
        if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'ROOT_REPARSE'}
        if($entry.Name -cmatch '^launch-[0-9a-f-]{36}$') {if(-not $entry.PSIsContainer){throw 'LAUNCH_KIND'};$launches.Add($p)}
        elseif($entry.Name -cnotin @('.owner','.launcher-guard','.launcher-current.json','data-main','logs-main','verification-backup-parent')){throw 'ROOT_UNKNOWN'}
    }}finally{$managedEntries.Dispose()}
    if($launches.Count -ne 2){throw 'LAUNCH_COUNT'}
    $guard=Get-Item -LiteralPath (Join-Path $managed '.launcher-guard') -Force
    if($guard.PSIsContainer -or ($guard.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $guard.Length -ne 0){throw 'GUARD_OWNER'}
    $pointerRaw=Read-Bounded (Join-Path $managed '.launcher-current.json');$pointer=$pointerRaw|ConvertFrom-Json
    if(($pointer|ConvertTo-Json -Compress) -cne $pointerRaw -or (@($pointer.PSObject.Properties.Name) -join ',') -cne 'version,launchId,ownerToken,storeId,dataRoot' -or $pointer.version -ne 1 -or $pointer.dataRoot -cne (Join-Path $managed 'data-main') -or $pointer.launchId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z'){throw 'CURRENT_POINTER'}
    $currentMatched=$false;$allProfiles=New-Object 'System.Collections.Generic.List[string]'
    foreach($launchPath in $launches){
        Assert-PlainDirectory $launchPath
        $launchId=[IO.Path]::GetFileName($launchPath).Substring(7)
        if((Read-Bounded (Join-Path $launchPath '.owner')) -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z'){throw 'LAUNCH_OWNER'}
        $headerRaw=Read-Bounded (Join-Path $launchPath 'launch-journal.json');$header=$headerRaw|ConvertFrom-Json
        if(($header|ConvertTo-Json -Compress) -cne $headerRaw -or $header.launchId -cne $launchId -or $header.parentToken -cne $firstState.parentToken -or $header.dataRoot -cne (Join-Path $managed 'data-main')){throw 'JOURNAL_OWNER'}
        if($launchId -ceq $pointer.launchId){if($launchPath -ceq $firstState.launch){throw 'CURRENT_NOT_SECOND'};if($pointer.ownerToken -cne $header.ownerToken -or $pointer.storeId -cne $header.storeId){throw 'CURRENT_POINTER'};$currentMatched=$true}
        $iterator=[IO.Directory]::EnumerateFileSystemEntries($launchPath).GetEnumerator();$count=0;$last=0;$metadataBytes=0
        try{while($iterator.MoveNext()){
            if(++$count -gt 256){throw 'LAUNCH_LIMIT'};$entry=Get-Item -LiteralPath $iterator.Current -Force
            if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'LAUNCH_REPARSE'}
            if($entry.PSIsContainer){
                if($entry.Name -cnotin @(('fonesi-auto-foundation-'+$launchId+'-provision'),('fonesi-auto-foundation-'+$launchId+'-auth'),('fonesi-auto-foundation-'+$launchId+'-main'))){throw 'PROFILE_NAME'}
                if((Read-Bounded (Join-Path $entry.FullName '.owner')) -cne "FONESI_AUTO_FOUNDATION_PROFILE_V1`n"){throw 'PROFILE_OWNER'}
                $null=Get-BoundedOwnedEntries $entry.FullName (8L*1024*1024);$allProfiles.Add($entry.FullName)
            }else{
                if($entry.Name -cnotin @('.owner','launch-journal.json','lease-acquired.json','lease-recovery.json','state.json','runtime-attestation.json','log-launch-proof.json','log-recovery-owner.json','main-capture.json') -and $entry.Name -cnotmatch '^(intent|settled|capture)-(0[1-9]|1[0-6])\.json\z' -and $entry.Name -cnotmatch '^(provision|auth)-(control|result|observed|capture)\.json\z'){throw 'LAUNCH_UNKNOWN'}
                $metadataBytes+=$entry.Length;if($entry.Length -gt 65536 -or $metadataBytes -gt 1048576){throw 'LAUNCH_LIMIT'}
                if($entry.Name -cmatch '^settled-(0[1-9]|1[0-6])\.json\z'){$last=[Math]::Max($last,[int]$Matches[1])}
            }
        }}finally{$iterator.Dispose()}
        if($last -lt 1){throw 'JOURNAL_INCOMPLETE'};$suffix=$last.ToString('00')
        $settledRaw=Read-Bounded (Join-Path $launchPath ('settled-'+$suffix+'.json'));$settled=$settledRaw|ConvertFrom-Json
        if(($settled|ConvertTo-Json -Compress) -cne $settledRaw -or $settled.launchId -cne $launchId -or $settled.ownerToken -cne $header.ownerToken -or $settled.stage -cne 'RELEASE' -or $settled.sequence -ne $last -or $settled.status -cne 'SUCCESS' -or $settled.exitCode -ne 0 -or $settled.cleanupComplete -ne $true -or $settled.stdoutTruncated -ne $false -or $settled.stderrTruncated -ne $false){throw 'JOURNAL_INCOMPLETE'}
        if((Get-FileHash (Join-Path $launchPath ('capture-'+$suffix+'.json')) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $settled.captureSha256 -or (Get-FileHash (Join-Path $launchPath ('intent-'+$suffix+'.json')) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $settled.intentSha256){throw 'JOURNAL_BINDING'}
        if(Test-Path -LiteralPath (Join-Path $launchPath ('intent-'+($last+1).ToString('00')+'.json'))){throw 'JOURNAL_PENDING'}
    }
    if(-not $currentMatched -or (Test-Path -LiteralPath (Join-Path $managed 'data-main/.writer-lock'))){throw 'CURRENT_UNRELEASED'}
    # Both known journals and all profile partitions validate before deletion.
    foreach($p in $allProfiles){Remove-Part $p (8L*1024*1024)}
    foreach($launchPath in $launches){Remove-Part $launchPath (1024L*1024)}
    Remove-Part (Join-Path $managed 'data-main') (128L*1024*1024)
    Remove-Part (Join-Path $managed 'logs-main') (8L*1024*1024)
    Remove-Part (Join-Path $managed 'verification-backup-parent') (128L*1024*1024)
    $left=Get-BoundedOwnedEntries $managed 65536
    if($left.Entries.Count -ne 3){throw 'ROOT_REMAINDER'};foreach($entry in $left.Entries){if($entry.PSIsContainer -or $entry.Name -cnotin @('.owner','.launcher-guard','.launcher-current.json')){throw 'ROOT_REMAINDER'}}
    if((Read-Bounded (Join-Path $managed '.launcher-current.json')) -cne $pointerRaw -or (Get-Item -LiteralPath (Join-Path $managed '.launcher-guard')).Length -ne 0){throw 'ROOT_CHANGED'}
    Remove-Part $managed 65536;[IO.Directory]::Delete((Join-Path $owner.Path 'first-use'),$false)
    $left=Get-BoundedOwnedEntries $owner.Path (1024L*1024)
    $witnessNames=New-Object 'System.Collections.Generic.List[string]'
    foreach($launchPath in $launches){$id=[IO.Path]::GetFileName($launchPath).Substring(7);foreach($kind in @('auth','ui')){$witnessNames.Add('launcher-witness-'+$id+'-'+$kind+'.json')};if($launchPath -ceq $firstState.launch){$witnessNames.Add('launcher-witness-'+$id+'-provision.json')}}
    foreach($entry in $left.Entries){if($entry.PSIsContainer -or ($entry.Name -cnotin @('.owner','Invoke-Desktop.instrumented.ps1','launch-core.ps1','copy.json','first-capture.json','second-capture.json','first.json','result.json') -and $entry.Name -cnotin $witnessNames)){throw 'REMAINDER'}}
    foreach($entry in $left.Entries){if($entry.Name -cne '.owner'){[IO.File]::Delete($entry.FullName)}}
    Remove-VerifiedOwnedRun $owner $allClean
    Write-Exclusive (Join-Path $base 'launcher-e2e-result.json') (([ordered]@{version=1;result=$public;cleanupComplete=$true})|ConvertTo-Json -Depth 8 -Compress)
    Write-Output 'PERSISTENCE_LAUNCH_E2E_PASS'
}catch{Write-Output ('PERSISTENCE_LAUNCH_E2E_'+$failure);exit 1}
