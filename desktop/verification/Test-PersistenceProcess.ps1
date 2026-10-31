# Invoked only inside the existing outer 120-second owned Job supervisor.
# RunInteractive itself deliberately has no application-lifetime deadline.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$owned=$null
$allRetired=$true
function Plain-Directory([string]$Path){
    $item=Get-Item -LiteralPath $Path -Force
    if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'DIRECTORY_REJECTED'}
}
function Exclusive-Text([string]$Path,[string]$Text){
    $bytes=[Text.Encoding]::UTF8.GetBytes($Text)
    if($bytes.Length -gt 8192){throw 'FIXTURE_LIMIT'}
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Assert-Result($Result,[string]$Marker){
    if(-not $Result.CleanupComplete -or $Result.StdoutTruncated -or $Result.StderrTruncated -or $Result.Status -ne 'SUCCESS' -or $Result.ExitCode -ne 0 -or $Result.Stdout.Replace("`r`n","`n") -cne ($Marker+"`n") -or $Result.Stderr -cne ''){throw 'RESULT_REJECTED'}
}
try {
    if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'WINDOWS_REQUIRED'}
    $helper=Join-Path $desktop 'native/PersistenceProcess.cs'
    if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine '482874120c798b61a0e6a4ab759568832bae1189a71fa2fc2950b6a508083df1'){throw 'HELPER_CHANGED'}
    if('Fonesi.Desktop.Persistence.PersistenceProcess' -as [type]){throw 'PRELOADED_HELPER_REJECTED'}
    Add-Type -Path $helper
    $nodes=@(Get-Command node.exe -CommandType Application -ErrorAction Stop)
    if($nodes.Count -lt 1){throw 'NODE_MISSING'}
    [string]$node=$nodes[0].Source
    if(-not [string]::Equals([IO.Path]::GetFullPath($node),$node,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($node) -ine '.exe'){throw 'NODE_PATH_REJECTED'}
    $item=Get-Item -LiteralPath $node -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_CHANGED'}
    foreach($name in [Environment]::GetEnvironmentVariables('Process').Keys){if($name -match '(?i)electron' -or $name -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH')){throw 'OVERRIDE_REJECTED'}}
    $base=Join-Path $desktop '.runtime';Plain-Directory $base
    $owned=Join-Path $base ('process-test-'+[guid]::NewGuid().ToString())
    [Fonesi.Desktop.Persistence.PersistenceProcess]::ReserveDirectory($owned)
    Plain-Directory $owned
    $token=[guid]::NewGuid().ToString()
    Exclusive-Text (Join-Path $owned '.owner') $token
    Exclusive-Text (Join-Path $owned 'exit.cjs') "'use strict';process.stdout.write('PROCESS_ROOT_EXIT'+String.fromCharCode(10));"
    Exclusive-Text (Join-Path $owned 'child.cjs') @'
'use strict';
const fs=require('node:fs');
const marker=process.argv[2];
const h=fs.openSync(marker,'wx');fs.writeFileSync(h,'CHILD_STARTED');fs.fsyncSync(h);fs.closeSync(h);
setInterval(()=>{},1000);
'@
    Exclusive-Text (Join-Path $owned 'parent.cjs') @'
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const marker=path.join(__dirname,'child-started');
const child=spawn(process.execPath,[path.join(__dirname,'child.cjs'),marker],{stdio:'ignore',shell:false});
child.on('error',()=>process.exit(2));
const deadline=setTimeout(()=>process.exit(3),5000);
const poll=setInterval(()=>{if(fs.existsSync(marker)){clearTimeout(deadline);clearInterval(poll);process.stdout.write('PROCESS_DESCENDANT_STARTED'+String.fromCharCode(10),()=>process.exit(0));}},10);
'@
    $allRetired=$false
    $bounded=[Fonesi.Desktop.Persistence.PersistenceProcess]::RunBounded($node,[string[]]@((Join-Path $owned 'exit.cjs')),30000)
    $allRetired=$bounded.CleanupComplete;Assert-Result $bounded 'PROCESS_ROOT_EXIT'
    $allRetired=$false
    $interactive=[Fonesi.Desktop.Persistence.PersistenceProcess]::RunInteractive($node,[string[]]@((Join-Path $owned 'exit.cjs')))
    $allRetired=$interactive.CleanupComplete;Assert-Result $interactive 'PROCESS_ROOT_EXIT'
    $allRetired=$false
    $descendant=[Fonesi.Desktop.Persistence.PersistenceProcess]::RunInteractive($node,[string[]]@((Join-Path $owned 'parent.cjs')))
    $allRetired=$descendant.CleanupComplete;Assert-Result $descendant 'PROCESS_DESCENDANT_STARTED'
    $marker=Get-Item -LiteralPath (Join-Path $owned 'child-started') -Force
    if($marker.PSIsContainer -or ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $marker.Length -ne 13 -or [IO.File]::ReadAllText($marker.FullName) -cne 'CHILD_STARTED'){throw 'DESCENDANT_NOT_OBSERVED'}
    # Validate all known entries before deleting any. No recursive deletion.
    Plain-Directory $owned
    $ownerMarker=Get-Item -LiteralPath (Join-Path $owned '.owner') -Force
    if($ownerMarker.PSIsContainer -or ($ownerMarker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $ownerMarker.Length -ne 36 -or [IO.File]::ReadAllText($ownerMarker.FullName) -cne $token -or -not $allRetired){throw 'OWNER_UNCONFIRMED'}
    $expected=@('.owner','exit.cjs','child.cjs','parent.cjs','child-started')
    $entries=New-Object 'System.Collections.Generic.List[object]'
    $iterator=[IO.Directory]::EnumerateFileSystemEntries($owned).GetEnumerator()
    try{while($iterator.MoveNext()){
        if($entries.Count -ge 5){throw 'TREE_LIMIT'}
        $entry=Get-Item -LiteralPath $iterator.Current -Force
        if($entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $entry.Name -cnotin $expected -or $entry.Length -gt 8192){throw 'TREE_REJECTED'}
        $entries.Add($entry)
    }}finally{$iterator.Dispose()}
    if($entries.Count -ne 5){throw 'TREE_MISSING'}
    foreach($entry in $entries){if($entry.Name -cne '.owner'){[IO.File]::Delete($entry.FullName)}}
    [IO.File]::Delete((Join-Path $owned '.owner'));[IO.Directory]::Delete($owned,$false)
    Write-Output 'PERSISTENCE_PROCESS_TESTS_PASS 3'
}catch{
    # Unknown process/cleanup preserves the owned fixture. No raw exception/path.
    Write-Output 'PERSISTENCE_PROCESS_TESTS_FAILED';exit 1
}
