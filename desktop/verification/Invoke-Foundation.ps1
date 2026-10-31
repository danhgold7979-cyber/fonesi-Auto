$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = Join-Path $desktop '.runtime'
$owner = $null
$baseVerified = $false
$allClean = $true
$stage = 'PREPARE_FAILED'
$report = [ordered]@{ schemaVersion=1; scope='HOSTED_RUNNER_ONLY'; installer=$null;
    runs=[ordered]@{}; negatives=[ordered]@{}; buildVerified=$false;
    binaryHashMatched=$false; runtimeCopyVerified=$false; directoryCleanup=$false;
    packageBytes=$null; failure=$null }

function Process-Evidence($Probe) {
    return [ordered]@{ status=$Probe.Status; exitCode=$Probe.ExitCode;
        cleanupComplete=$Probe.CleanupComplete; stdoutTruncated=$Probe.StdoutTruncated;
        stderrTruncated=$Probe.StderrTruncated }
}
function Confirm-RetiredCapture($Probe) {
    return ($Probe.CleanupComplete -and -not $Probe.StdoutTruncated -and -not $Probe.StderrTruncated -and
        $Probe.Status -notin @('TIMEOUT','CAPTURE_FAILED','CLEANUP_FAILED','LAUNCH_FAILED','ACCESS_DENIED'))
}
function Assert-RetiredCapture($Probe) {
    if (-not (Confirm-RetiredCapture $Probe)) { throw 'CHILD_UNCONFIRMED' }
}
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'WINDOWS_REQUIRED' }
    Assert-PlainDirectory $desktop
    Assert-PlainDirectory $PSScriptRoot
    if (-not (Test-Path -LiteralPath $base)) { [void][IO.Directory]::CreateDirectory($base) }
    Assert-PlainDirectory $base
    $baseVerified = $true
    if (Test-Path -LiteralPath (Join-Path $base 'unvalidated.json')) { throw 'PRIOR_RAW_OUTPUT_REJECTED' }
    $owner = New-OwnedRun $base
    $helper = [IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
    if ((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89') { throw 'HELPER_CHANGED' }
    if ('Fonesi.Phase00.NativeProbe' -as [type]) { throw 'PRELOADED_HELPER_REJECTED' }
    Add-Type -Path $helper
    $nodes = @(Get-Command node.exe -CommandType Application -ErrorAction Stop)
    if ($nodes.Count -lt 1) { throw 'NODE_MISSING' }
    [string]$node = $nodes[0].Source
    $expectedNode = Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe'
    if (-not [string]::Equals([IO.Path]::GetFullPath($node),[IO.Path]::GetFullPath($expectedNode),[StringComparison]::OrdinalIgnoreCase)) { throw 'NODE_LOCATION_REJECTED' }
    if ((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5') { throw 'NODE_BINARY_REJECTED' }
    $stage = 'INSTALL_FAILED'
    $allClean = $false
    $install = Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'install-electron.mjs'))) 120000 @{}
    $allClean = Confirm-RetiredCapture $install
    $report.installer = [ordered]@{ process=(Process-Evidence $install);
        officialMarker=(Test-ExactlyOneLine $install.Stdout 'FOUNDATION_OFFICIAL_INSTALL_VERIFIED') }
    Assert-RetiredCapture $install
    if ($install.Status -ne 'SUCCESS' -or $install.ExitCode -ne 0 -or -not $report.installer.officialMarker) { throw 'INSTALL_FAILED' }
    $report.buildVerified = Test-ExactlyOneLine $install.Stdout 'FOUNDATION_BUILD_VERIFIED'
    if (-not $report.buildVerified) { throw 'BUILD_UNVERIFIED' }
    $stage = 'PACKAGE_PREPARE_FAILED'
    $dist = Join-Path $desktop 'node_modules/electron/dist'
    $sourceExe = Join-Path $dist 'electron.exe'
    $sourceHash = (Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash
    $package = Join-Path $owner.Path 'package'
    [void](Copy-VerifiedTree $dist $package (512L * 1024 * 1024))
    $packagedExe = Join-Path $package 'AutoFoundation.exe'
    [IO.File]::Move((Join-Path $package 'electron.exe'),$packagedExe)
    $report.binaryHashMatched = (Get-FileHash -LiteralPath $packagedExe -Algorithm SHA256).Hash -ceq $sourceHash
    if (-not $report.binaryHashMatched) { throw 'BINARY_MISMATCH' }
    $resources = Join-Path $package 'resources'
    Assert-PlainDirectory $resources
    $appRoot = Join-Path $resources 'app'
    if (Test-Path -LiteralPath $appRoot) { throw 'PACKAGE_APP_EXISTS' }
    [void][IO.Directory]::CreateDirectory($appRoot)
    [void](Copy-VerifiedTree (Join-Path $desktop 'build') (Join-Path $appRoot 'build') (8L * 1024 * 1024))
    $verification = Join-Path $appRoot 'verification'
    [void][IO.Directory]::CreateDirectory($verification)
    $probeSource = Join-Path $PSScriptRoot 'runtime-probe.cjs'
    $probeCopy = Join-Path $verification 'runtime-probe.cjs'
    [IO.File]::Copy($probeSource,$probeCopy,$false)
    if ((Get-FileHash $probeSource -Algorithm SHA256).Hash -cne (Get-FileHash $probeCopy -Algorithm SHA256).Hash) { throw 'PROBE_COPY_MISMATCH' }
    [IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),'{"name":"auto-foundation-instrumented-test","version":"0.0.0","main":"verification/runtime-probe.cjs"}')
    $report.packageBytes = (Get-BoundedOwnedEntries $package (512L * 1024 * 1024)).Bytes
    $report.runtimeCopyVerified = $true
    foreach ($mode in @('source','package')) {
        $stage = 'RUNTIME_FAILED'
        $profile = New-OwnedProfile $owner $mode
        $exe = $sourceExe
        [string[]]$arguments = @($probeSource)
        if ($mode -eq 'package') { $exe=$packagedExe; $arguments=@() }
        if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -cne $sourceHash) { throw 'BINARY_CHANGED' }
        $allClean = $false
        $probe = Invoke-OwnedChild $exe $arguments 30000 @{FONESI_BOOTSTRAP_ROOT=$profile; FONESI_BOOTSTRAP_MODE=$mode}
        $allClean = Confirm-RetiredCapture $probe
        $report.runs[$mode] = [ordered]@{ process=(Process-Evidence $probe); payload=$probe.Stdout; ownedBytes=$null }
        Assert-RetiredCapture $probe
        $report.runs[$mode].ownedBytes = (Get-BoundedOwnedEntries $profile (8L * 1024 * 1024)).Bytes
        if ($probe.Status -ne 'SUCCESS' -or $probe.ExitCode -ne 0) { throw 'RUNTIME_FAILED' }
    }
    $stage = 'NEGATIVE_PROBE_FAILED'
    if ((Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash -cne $sourceHash) { throw 'BINARY_CHANGED' }
    $crashProfile = New-OwnedProfile $owner 'crash'
    $allClean = $false
    $crash = Invoke-OwnedChild $sourceExe ([string[]]@((Join-Path $PSScriptRoot 'crash-probe.cjs'))) 30000 @{FONESI_BOOTSTRAP_ROOT=$crashProfile}
    $allClean = Confirm-RetiredCapture $crash
    $report.negatives['crash'] = [ordered]@{process=(Process-Evidence $crash);
        armed=(Test-ExactlyOneLine $crash.Stdout 'CRASH_ARMED'); observed=(Test-ExactlyOneLine $crash.Stdout 'CRASH_OBSERVED');
        bootstrapFailed=(Test-ExactlyOneLine $crash.Stderr 'BOOTSTRAP_FAILED');
        unexpectedQuit=(Test-AnyLine $crash.Stdout 'CRASH_UNEXPECTED_ORDERLY_QUIT'); ownedBytes=$null}
    Assert-RetiredCapture $crash
    $report.negatives.crash.ownedBytes = (Get-BoundedOwnedEntries $crashProfile (8L * 1024 * 1024)).Bytes
    if ($crash.Status -ne 'NONZERO_EXIT' -or $crash.ExitCode -ne 1) { throw 'CRASH_RESULT_REJECTED' }
    $tamperBuild = Join-Path $owner.Path 'tampered-build'
    [void](Copy-VerifiedTree (Join-Path $desktop 'build') $tamperBuild (8L * 1024 * 1024))
    $tamperAsset = Join-Path $tamperBuild 'status.html'
    $before = (Get-FileHash -LiteralPath $tamperAsset -Algorithm SHA256).Hash
    [IO.File]::AppendAllText($tamperAsset,'<!-- owned negative -->')
    $changed = (Get-FileHash -LiteralPath $tamperAsset -Algorithm SHA256).Hash -cne $before
    if (-not $changed) { throw 'TAMPER_CONTROL_FAILED' }
    if ((Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash -cne $sourceHash) { throw 'BINARY_CHANGED' }
    $tamperProfile = New-OwnedProfile $owner 'tamper'
    $allClean = $false
    $tamper = Invoke-OwnedChild $sourceExe ([string[]]@((Join-Path $tamperBuild 'main.cjs'))) 30000 @{FONESI_BOOTSTRAP_ROOT=$tamperProfile}
    $allClean = Confirm-RetiredCapture $tamper
    $report.negatives['tamper'] = [ordered]@{process=(Process-Evidence $tamper); changed=$changed;
        bootstrapFailed=(Test-ExactlyOneLine $tamper.Stderr 'BOOTSTRAP_FAILED');
        unexpectedReady=(Test-AnyLine $tamper.Stdout 'BOOTSTRAP_READY'); ownedBytes=$null}
    Assert-RetiredCapture $tamper
    $report.negatives.tamper.ownedBytes = (Get-BoundedOwnedEntries $tamperProfile (8L * 1024 * 1024)).Bytes
    [void](Get-BoundedOwnedEntries $tamperBuild (8L * 1024 * 1024))
    if ($tamper.Status -ne 'NONZERO_EXIT' -or $tamper.ExitCode -ne 1) { throw 'TAMPER_RESULT_REJECTED' }
} catch { $report.failure = $stage }
finally {
    if ($null -ne $owner -and $allClean) {
        try { Remove-VerifiedOwnedRun $owner $allClean; $report.directoryCleanup=$true }
        catch { $report.failure='DIRECTORY_CLEANUP_FAILED' }
    }
}
# Private raw record only. Never print captured stdout/stderr or upload this file.
try {
    if (-not $baseVerified) { throw 'REPORT_PARENT_UNVERIFIED' }
    Assert-PlainDirectory $base
    $json = $report | ConvertTo-Json -Depth 12 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($json) -gt 65536) { throw 'REPORT_OVERSIZE' }
    $raw = Join-Path $base 'unvalidated.json'
    $stream = [IO.File]::Open($raw,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $bytes=[Text.Encoding]::UTF8.GetBytes($json); $stream.Write($bytes,0,$bytes.Length) }
    finally { $stream.Dispose() }
    Write-Output 'FOUNDATION_RAW_EVIDENCE_WRITTEN_PENDING_VALIDATION'
} catch { Write-Output 'FOUNDATION_RAW_EVIDENCE_WRITE_FAILED'; exit 1 }
