$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$results=Join-Path $PSScriptRoot '.lab-results'
$base=Join-Path $PSScriptRoot '.lab-runs'
$raw=Join-Path $results 'unvalidated.json'
$valid=Join-Path $results 'validated.json'
$report=[ordered]@{schemaVersion=1;scope='HOSTED_RUNNER_ONLY';installer=$null;runtimes=@();directoryCleanup=$false;failure=$null}
$owned=@(); $allClean=$true; $stage='PREPARE_FAILED'
function Assert-PlainDirectory([string]$path) {
    $item=Get-Item -LiteralPath $path -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'UNSAFE_DIRECTORY' }
}
function Get-OwnedEntries([string]$root) {
    $pending=New-Object 'System.Collections.Generic.Queue[object]'
    $pending.Enqueue([pscustomobject]@{path=$root;depth=0})
    $entries=New-Object 'System.Collections.Generic.List[object]'
    while($pending.Count -gt 0){
        $current=$pending.Dequeue()
        if($current.depth -gt 16){throw 'OWNED_DEPTH_EXCEEDED'}
        $enumerator=[IO.Directory]::EnumerateFileSystemEntries($current.path).GetEnumerator()
        try {
            while($enumerator.MoveNext()) {
                if($entries.Count -ge 256){throw 'OWNED_COUNT_EXCEEDED'}
                $entry=Get-Item -LiteralPath $enumerator.Current -Force
                if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'UNSAFE_OWNED_ENTRY'}
                $entries.Add($entry)
                if($entry.PSIsContainer){$pending.Enqueue([pscustomobject]@{path=$entry.FullName;depth=$current.depth+1})}
            }
        } finally {$enumerator.Dispose()}
    }
    return $entries.ToArray()
}
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'WINDOWS_REQUIRED' }
    foreach ($dir in @($PSScriptRoot,$results,$base)) {
        if (-not (Test-Path -LiteralPath $dir)) { [void][IO.Directory]::CreateDirectory($dir) }
        Assert-PlainDirectory $dir
    }
    foreach($file in @($raw,$valid)){if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}
    foreach($key in @('NODE_OPTIONS','ELECTRON_RUN_AS_NODE','ELECTRON_FORCE_IS_PACKAGED')) {
        if ($null -ne [Environment]::GetEnvironmentVariable($key)) { throw 'RUNTIME_OVERRIDE' }
    }
    $stage='HELPER_FAILED'
    if (-not ('Fonesi.Phase00.NativeProbe' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot '../HostProbeNative.cs') }
    $nodes=@(Get-Command node.exe -CommandType Application -ErrorAction Stop)
    if($nodes.Count -lt 1){throw 'NODE_MISSING'}
    [string]$node=$nodes[0].Source
    if(-not [IO.Path]::IsPathRooted($node) -or -not [IO.File]::Exists($node) -or [IO.Path]::GetExtension($node) -ine '.exe'){throw 'NODE_INVALID'}
    $stage='INSTALL_FAILED';$allClean=$false
    $install=[Fonesi.Phase00.NativeProbe]::Run($node,[string[]]@((Join-Path $PSScriptRoot '../desktop-stack-lab/scripts/install-electron.cjs')),120000,10000,32768)
    $allClean=$install.CleanupComplete
    $report.installer=[ordered]@{status=$install.Status;exitCode=$install.ExitCode;cleanupComplete=$install.CleanupComplete}
    if(-not $allClean -or $install.ExitCode -ne 0 -or $install.Status -ne 'SUCCESS'){throw 'INSTALL_FAILED'}
    foreach($mode in @('node','electron')) {
        $stage='OWNERSHIP_FAILED'
        $dir=Join-Path $base ('run-'+[guid]::NewGuid().ToString())
        if(Test-Path -LiteralPath $dir){throw 'EXISTS'}
        [void][IO.Directory]::CreateDirectory($dir);Assert-PlainDirectory $dir
        $token=[guid]::NewGuid().ToString()
        $marker=Join-Path $dir '.owner'
        $stream=[IO.File]::Open($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try{$bytes=[Text.Encoding]::UTF8.GetBytes($token);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
        $owned+=,[pscustomobject]@{path=$dir;token=$token}
        $env:FONESI_SQLITE_RUN=$dir;$env:FONESI_SQLITE_TOKEN=$token;$env:FONESI_SQLITE_MODE=$mode
        $exe=$node
        if($mode -eq 'electron'){$exe=Join-Path $PSScriptRoot '../desktop-stack-lab/node_modules/electron/dist/electron.exe'}
        $stage='RUNTIME_FAILED';$allClean=$false
        $probe=[Fonesi.Phase00.NativeProbe]::Run($exe,[string[]]@((Join-Path $PSScriptRoot 'probe.cjs')),15000,5000,32768)
        $allClean=$probe.CleanupComplete
        # Preserve raw payload for duplicate-aware validator; never print captured streams.
        $report.runtimes+=,[ordered]@{mode=$mode;status=$probe.Status;exitCode=$probe.ExitCode;cleanupComplete=$probe.CleanupComplete;stdoutTruncated=$probe.StdoutTruncated;payload=$probe.Stdout;ownedBytes=$null}
        if(-not $allClean){throw 'CLEANUP_UNCONFIRMED'}
        $size=0L
        foreach($file in @(Get-OwnedEntries $dir)) {if(-not $file.PSIsContainer){$size+=$file.Length}}
        $report.runtimes[$report.runtimes.Count-1].ownedBytes=$size
        if($size -gt 4194304){throw 'OWNED_SIZE_EXCEEDED'}
    }
} catch {$report.failure=$stage}
finally {
    foreach($key in @('FONESI_SQLITE_RUN','FONESI_SQLITE_TOKEN','FONESI_SQLITE_MODE')){[Environment]::SetEnvironmentVariable($key,$null)}
    if($allClean) {
        try {
            foreach($entry in $owned){
                Assert-PlainDirectory $entry.path
                if([IO.Path]::GetDirectoryName($entry.path) -ne $base -or [IO.File]::ReadAllText((Join-Path $entry.path '.owner')) -cne $entry.token){throw 'OWNER_MISMATCH'}
                # Workers are confirmed gone. Refuse unexpected directories/reparse points.
                $entries=@(Get-OwnedEntries $entry.path)
                foreach($file in @($entries | Where-Object {-not $_.PSIsContainer})){Remove-Item -LiteralPath $file.FullName -Force}
                foreach($dir in @($entries | Where-Object {$_.PSIsContainer} | Sort-Object {$_.FullName.Length} -Descending)){[IO.Directory]::Delete($dir.FullName,$false)}
                [IO.Directory]::Delete($entry.path,$false)
                if(Test-Path -LiteralPath $entry.path){throw 'DELETE_FAILED'}
            }
            $report.directoryCleanup=$true
        }catch{$report.failure='DIRECTORY_CLEANUP_FAILED'}
    }
}
try {
    $json=$report|ConvertTo-Json -Depth 10 -Compress
    if([Text.Encoding]::UTF8.GetByteCount($json) -gt 65536){throw 'REPORT_OVERSIZE'}
    [IO.File]::WriteAllText($raw,$json)
} catch {Write-Output 'SQLITE_REPORT_WRITE_FAILED';exit 1}
Write-Output 'SQLITE_PROBES_FINISHED_PENDING_VALIDATION'
