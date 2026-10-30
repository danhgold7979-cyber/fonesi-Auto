#requires -Version 5.1
<#
Synthetic P0-01 behavioral regression suite. No host inventory, elevation,
package installation, execution-policy changes, devices or real acceleration.
See README.md for evidence boundaries and exact invocation.
#>
[CmdletBinding()]
param([string]$OutputDirectory = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$startedAt = [DateTime]::UtcNow
$runId = [Guid]::NewGuid().ToString('N')
$script:Cases = New-Object 'System.Collections.Generic.List[object]'
$script:FixtureRoot = $null
$script:CollectorModule = $null
$script:NativeExe = $null
$script:KnownOwnedProcesses = New-Object 'System.Collections.Generic.List[object]'
$script:Forbidden = @(
    'SYNTHETIC_PRIVATE_USER', 'SYNTHETIC_PRIVATE_HOST', 'private-share',
    '192.0.2.77', '2001:db8::77', 'SYNTHETIC_SERIAL_987654',
    'SYNTHETIC_TOKEN_ABC123', 'SYNTHETIC_PASSWORD_987', 'SYNTHETIC_SECRET_XYZ'
)
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$modulePath = Join-Path $repoRoot 'tools\phase-00\HostEnvironmentCollector.psm1'
$collectorPath = Join-Path $repoRoot 'tools\phase-00\Collect-HostEnvironment.ps1'
$wrapperPath = Join-Path $repoRoot 'tools\phase-00\Invoke-PowerShellProbe.ps1'
$nativeSourcePath = Join-Path $repoRoot 'tools\phase-00\HostProbeNative.cs'
$script:AssertionCount = 0
$script:CaseMeasurements = [ordered]@{}
$setupFailed = $false
$outputReady = $false

function Assert-True {
    param([bool]$Condition, [string]$Message)
    $script:AssertionCount++
    if (-not $Condition) { throw "ASSERTION: $Message" }
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Message)
    $script:AssertionCount++
    if ($Actual -cne $Expected) { throw "ASSERTION: $Message" }
}

function Assert-Throws {
    param([scriptblock]$Action, [string]$Message)
    $threw = $false
    try { & $Action | Out-Null } catch { $threw = $true }
    Assert-True $threw $Message
}

function Get-SafeFailure {
    param($Record)
    # Never publish arbitrary exception text, paths, invocation lines or stacks.
    $message = [string]$Record.Exception.Message
    if ($message.StartsWith('ASSERTION: ')) { return $message }
    return ('UNEXPECTED_EXCEPTION:' + $Record.Exception.GetType().Name)
}

function Invoke-Case {
    param([string]$Id, [string]$Name, [scriptblock]$Action)
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $before = $script:AssertionCount
    $status = 'PASS'
    $reason = $null
    $script:CaseMeasurements = [ordered]@{}
    try { & $Action | Out-Null }
    catch { $status = 'FAIL'; $reason = Get-SafeFailure $_ }
    $timer.Stop()
    $script:Cases.Add([pscustomobject][ordered]@{
        id = $Id; name = $Name; result = $status; reason = $reason
        assertionCount = $script:AssertionCount - $before
        durationMs = $timer.ElapsedMilliseconds
        measurements = [pscustomobject]$script:CaseMeasurements
    })
    Write-Host ($status + ' ' + $Id + ' ' + $Name)
}

function Add-NotRun {
    param([string]$Id, [string]$Name, [string]$Reason)
    $script:Cases.Add([pscustomobject][ordered]@{
        id = $Id; name = $Name; result = 'NOT_RUN'; reason = $Reason
        assertionCount = 0; durationMs = 0
    })
}

function New-FixturePath {
    param([string]$Name)
    return Join-Path $script:FixtureRoot $Name
}

function Invoke-NativeFixture {
    param([string[]]$Arguments, [int]$TimeoutMilliseconds = 10000, [int]$MaxOutputCharacters = 65536)
    return Invoke-CollectorProcess -FilePath $script:NativeExe -ArgumentList $Arguments `
        -TimeoutMilliseconds $TimeoutMilliseconds -CleanupMilliseconds 2000 `
        -MaxOutputCharacters $MaxOutputCharacters
}

function Assert-NoPrivateMarkers {
    param([string]$Text, [string]$Label)
    foreach ($marker in $script:Forbidden) {
        Assert-True (-not $Text.Contains($marker)) ($Label + ' contains a synthetic private marker')
    }
    if ($script:FixtureRoot) {
        Assert-True (-not $Text.Contains($script:FixtureRoot)) ($Label + ' leaks the fixture absolute path')
    }
    Assert-True ($Text -notmatch 'NativeCommandError') ($Label + ' contains PowerShell native error pollution')
}

function New-SyntheticReport {
    $sections = [ordered]@{
        memory = Invoke-CollectorQuery -Source 'fixture.memory' -Unit 'bytes' -Action {
            [pscustomobject]@{ capacity = [long]8589934592 }
        }
        unavailableSensor = Invoke-CollectorQuery -Source 'fixture.gpu' -Unit 'percent' -Action { $null }
        version = Invoke-CollectorQuery -Source 'fixture.version' -Unit 'text' -Action {
            [pscustomobject]@{ version = 'synthetic-tool 1.2.3' }
        }
    }
    return New-CollectorReport -Sections $sections -RunId 'synthetic-report-run-001'
}

function Invoke-WithWriterFailure {
    param([string]$Name, [scriptblock]$Action)
    # Only failing persistence is replaced; successful JSON/ZIP tests use the
    # real implementation and filesystem. Restore module session state always.
    $original = & $script:CollectorModule { param($FunctionName) (Get-Item ('Function:' + $FunctionName)).ScriptBlock } $Name
    try {
        & $script:CollectorModule {
            param($FunctionName)
            Set-Item ('Function:script:' + $FunctionName) -Value {
                param($Path, $Json, $Files)
                throw (New-Object UnauthorizedAccessException 'SYNTHETIC_WRITE_DENIED')
            }
        } $Name
        & $Action
    }
    finally {
        & $script:CollectorModule {
            param($FunctionName, $Original)
            Set-Item ('Function:script:' + $FunctionName) -Value $Original
        } $Name $original
    }
}

function Stop-KnownOwnedProcess {
    param([Diagnostics.Process]$Process)
    if ($null -eq $Process) { return }
    try {
        if (-not $Process.HasExited) {
            # Never kill by name, tree discovery or unverified PID. The handle
            # either came from our Start(), or an ID + exact fixture-path check.
            if ($Process.MainModule.FileName -eq $script:NativeExe) {
                $Process.Kill()
                [void]$Process.WaitForExit(3000)
            }
        }
    } catch { }
    finally { $Process.Dispose() }
}

try {
    if (-not $OutputDirectory) {
        $OutputDirectory = Join-Path ([IO.Path]::GetTempPath()) ('fonesi-p0-results-' + $runId)
    }
    $OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
    if (Test-Path -LiteralPath $OutputDirectory) { throw 'RESULT_DIRECTORY_ALREADY_EXISTS' }
    [void][IO.Directory]::CreateDirectory($OutputDirectory)
    $outputReady = $true

    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or
        $PSVersionTable.PSVersion.Minor -ne 1 -or $PSVersionTable.PSEdition -ne 'Desktop') {
        throw 'WINDOWS_POWERSHELL_5_1_REQUIRED'
    }
    $script:FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('fonesi-p0-fixtures-' + $runId)
    [void][IO.Directory]::CreateDirectory($script:FixtureRoot)
    [IO.File]::WriteAllText((New-FixturePath '.owned-by-test'), $runId)

    Invoke-Case 'HC-01.1' 'Exact collector, module and test files parse under Windows PowerShell 5.1' {
        foreach ($file in @($collectorPath, $modulePath, $wrapperPath, $PSCommandPath)) {
            $tokens = $null; $parseErrors = $null
            [void][Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$parseErrors)
            Assert-Equal @($parseErrors).Count 0 'Exact supported-shell script must parse without errors'
        }
        Assert-Equal $PSVersionTable.PSEdition 'Desktop' 'Runtime must be Windows PowerShell Desktop'
    }

    $script:CollectorModule = Import-Module $modulePath -Force -PassThru
    $unicodePart = [string][char]0x0110 + [char]0x1ED3 + ' fixture'
    $binaryDirectory = New-FixturePath ('space ' + $unicodePart)
    [void][IO.Directory]::CreateDirectory($binaryDirectory)
    $script:NativeExe = Join-Path $binaryDirectory 'native fixture.exe'
    $fixtureCode = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'fixtures\NativeFixture.cs') -Raw
    Add-Type -TypeDefinition $fixtureCode -Language CSharp -OutputAssembly $script:NativeExe -OutputType ConsoleApplication

    Invoke-Case 'HC-02.1' 'Real native stdout, stderr, both and Java-style version' {
        $stdout = Invoke-NativeFixture @('stdout')
        Assert-Equal $stdout.status 'SUCCESS' 'stdout must be SUCCESS'
        Assert-True ($stdout.stdout.Contains('synthetic-tool 1.2.3')) 'stdout text must be captured'
        Assert-Equal $stdout.exitCode 0 'stdout exit code must remain zero'
        $stderr = Invoke-NativeFixture @('-version')
        Assert-Equal $stderr.status 'SUCCESS' 'stderr-only Java-style version must be SUCCESS'
        Assert-True ($stderr.stderr.Contains('synthetic-java version 21.0-test')) 'stderr text must be captured'
        Assert-Equal $stderr.exitCode 0 'stderr-only exit code must remain zero'
        $both = Invoke-NativeFixture @('both')
        Assert-True ($both.stdout.Contains('STDOUT_VERSION')) 'both-stream stdout must be preserved'
        Assert-True ($both.stderr.Contains('STDERR_VERSION')) 'both-stream stderr must be preserved'
        Assert-Equal $both.exitCode 0 'both-stream exit code must remain zero'
        Assert-NoPrivateMarkers (($stdout, $stderr, $both) | ConvertTo-Json -Depth 8) 'Native results'
        $javaVersion = Get-CollectorCommandVersion -CommandName $script:NativeExe -Arguments @('-version')
        Assert-Equal $javaVersion.status 'SUCCESS' 'Version adapter must accept stderr-only success'
        Assert-True ($javaVersion.version.Contains('synthetic-java')) 'Version adapter must extract stderr version'
    }

    Invoke-Case 'HC-03.1' 'Concurrent 2 MiB stdout plus 2 MiB stderr drain and truncate safely' {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $r = Invoke-NativeFixture @('flood') -TimeoutMilliseconds 15000 -MaxOutputCharacters 4096
        $timer.Stop()
        Assert-Equal $r.status 'SUCCESS' 'Simultaneous large streams must complete, not deadlock'
        Assert-Equal $r.exitCode 0 'Flood must retain real zero exit code'
        Assert-True ([bool]$r.stdoutTruncated) 'stdout must disclose truncation'
        Assert-True ([bool]$r.stderrTruncated) 'stderr must disclose truncation'
        Assert-True ($r.stdout.Length -le 4096) 'stdout storage must obey explicit limit'
        Assert-True ($r.stderr.Length -le 4096) 'stderr storage must obey explicit limit'
        Assert-True ($r.stdout.Length -gt 0 -and $r.stderr.Length -gt 0) 'Both streams must be captured'
        Assert-True ($timer.ElapsedMilliseconds -lt 19000) 'Flood must obey fixture deadline plus cleanup budget'
        Assert-True ([bool]$r.cleanupComplete) 'Successful flood must release owned process'
    }

    Invoke-Case 'HC-04.1' 'Hung owned process and child terminate; unrelated sentinel survives' {
        $sentinel = New-Object Diagnostics.Process
        $sentinel.StartInfo = New-Object Diagnostics.ProcessStartInfo
        $sentinel.StartInfo.FileName = $script:NativeExe
        $sentinel.StartInfo.Arguments = 'hang'
        $sentinel.StartInfo.UseShellExecute = $false
        $sentinel.StartInfo.CreateNoWindow = $true
        $sentinel.StartInfo.RedirectStandardOutput = $true
        $sentinel.StartInfo.RedirectStandardError = $true
        Assert-True ($sentinel.Start()) 'Owned unrelated sentinel must start'
        $script:KnownOwnedProcesses.Add($sentinel)
        try {
            $timer = [Diagnostics.Stopwatch]::StartNew()
            $r = Invoke-NativeFixture @('tree') -TimeoutMilliseconds 1500
            $timer.Stop()
            Assert-Equal $r.status 'TIMEOUT' 'Hung native process must report TIMEOUT'
            Assert-True ($timer.ElapsedMilliseconds -lt 6500) 'Timeout and cleanup must be bounded'
            Assert-True ([bool]$r.cleanupComplete) 'Timed-out owned process tree cleanup must be verified'
            $ids = @([regex]::Matches($r.stdout, 'OWNED_(?:ROOT|CHILD)_PID=(\d+)') | ForEach-Object { [int]$_.Groups[1].Value } | Select-Object -Unique)
            Assert-True ($ids.Count -ge 2) 'Fixture must prove that it created an owned child before timeout'
            foreach ($ownedId in $ids) {
                $owned = Get-Process -Id $ownedId -ErrorAction SilentlyContinue
                if ($owned -and -not $owned.HasExited -and $owned.MainModule.FileName -eq $script:NativeExe) {
                    $script:KnownOwnedProcesses.Add($owned)
                    Assert-True $false 'Collector-owned root or child survived timeout'
                }
                if ($owned) { $owned.Dispose() }
            }
            Assert-True (-not $sentinel.HasExited) 'Timeout must not kill an unrelated process'
        } finally { Stop-KnownOwnedProcess $sentinel }
    }

    Invoke-Case 'HC-04.2' 'Root exits before descendant; inherited pipes cannot strand collector' {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $r = Invoke-NativeFixture @('orphan') -TimeoutMilliseconds 1500
        $timer.Stop()
        Assert-True ($r.status -in @('SUCCESS', 'TIMEOUT')) 'Exited root with owned descendant must complete or explicitly time out'
        Assert-True ($timer.ElapsedMilliseconds -lt 6500) 'Descendant-held pipes must not escape the deadline'
        Assert-True ([bool]$r.cleanupComplete) 'Descendant must be cleaned after root exit'
        $ids = @([regex]::Matches($r.stdout, 'OWNED_CHILD_PID=(\d+)') | ForEach-Object { [int]$_.Groups[1].Value })
        Assert-Equal $ids.Count 1 'Fixture must prove an owned child existed'
        foreach ($ownedId in $ids) {
            $owned = Get-Process -Id $ownedId -ErrorAction SilentlyContinue
            if ($owned -and -not $owned.HasExited -and $owned.MainModule.FileName -eq $script:NativeExe) {
                $script:KnownOwnedProcesses.Add($owned)
                Assert-True $false 'Owned child survived its already-exited root'
            }
            if ($owned) { $owned.Dispose() }
        }
    }

    Invoke-Case 'HC-05.1' 'Executable path spaces and Unicode; native argv exactly preserved' {
        $resolved = Resolve-CollectorCommand -CommandName $script:NativeExe
        Assert-Equal $resolved.status 'RESOLVED' 'Absolute EXE path must resolve'
        Assert-Equal $resolved.kind 'EXE' 'Executable kind must be explicit'
        $arguments = @('', 'two words', ('unicode ' + [char]0x0110 + [char]0x1ED3), 'embedded"quote', 'trailing\', 'a&b|c;d$(not-a-command)', 'slash\\"quote')
        $r = Invoke-NativeFixture (@('argv') + $arguments)
        Assert-Equal $r.status 'SUCCESS' 'Native literal arguments must execute without a shell'
        $actual = @($r.stdout -split '\r?\n' | Where-Object { $_.StartsWith('ARG:') } | ForEach-Object {
            [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_.Substring(4)))
        })
        Assert-Equal $actual.Count $arguments.Count 'All arguments including empty string must survive'
        for ($i = 0; $i -lt $arguments.Count; $i++) {
            Assert-Equal $actual[$i] $arguments[$i] 'Native argument must round-trip byte-for-byte'
        }
    }

    $cmdPath = Join-Path $binaryDirectory 'npm.cmd'
    $batPath = Join-Path $binaryDirectory 'version fixture.BAT'
    $ps1Path = Join-Path $binaryDirectory 'version fixture.ps1'
    [IO.File]::WriteAllText($cmdPath, "@echo off`r`necho SYNTHETIC_NPM_VERSION 1.2.3`r`nexit /b 0`r`n", [Text.Encoding]::ASCII)
    [IO.File]::WriteAllText($batPath, "@echo off`r`necho SYNTHETIC_BAT_VERSION %~1`r`nexit /b 0`r`n", [Text.Encoding]::ASCII)
    [IO.File]::WriteAllText($ps1Path, "[Console]::Out.WriteLine('SYNTHETIC_PS1_VERSION')`r`nforeach (`$value in `$args) { [Console]::Out.WriteLine('ARG:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]`$value))) }`r`nexit 0`r`n", (New-Object Text.UTF8Encoding $true))

    Invoke-Case 'HC-05.2' 'Real CMD, BAT and PowerShell shims execute without policy bypass' {
        foreach ($entry in @(@($cmdPath, 'CMD', 'SYNTHETIC_NPM_VERSION'), @($batPath, 'CMD', 'SYNTHETIC_BAT_VERSION'), @($ps1Path, 'PS1', 'SYNTHETIC_PS1_VERSION'))) {
            $resolved = Resolve-CollectorCommand -CommandName $entry[0]
            Assert-Equal $resolved.status 'RESOLVED' 'Shim must resolve'
            Assert-Equal $resolved.kind $entry[1] 'Shim kind must be explicit'
            $r = Get-CollectorCommandVersion -CommandName $entry[0] -Arguments @('--version')
            Assert-Equal $r.status 'SUCCESS' 'Real shim version invocation must succeed'
            Assert-True ($r.stdout.Contains($entry[2])) 'Real shim output must be retained'
        }
        $upperCmdPath = Join-Path $binaryDirectory 'uppercase.CMD'
        [IO.File]::Copy($cmdPath, $upperCmdPath)
        Assert-Equal (Get-CollectorCommandVersion -CommandName $upperCmdPath -Arguments @('--version')).status 'SUCCESS' 'Uppercase CMD extension must execute'
        $spaced = Get-CollectorCommandVersion -CommandName $batPath -Arguments @('two words')
        Assert-True ($spaced.stdout.Contains('SYNTHETIC_BAT_VERSION two words')) 'Safe CMD argument spaces must round-trip as one argument'
        $oldPath = $env:PATH
        try {
            $env:PATH = $binaryDirectory + [IO.Path]::PathSeparator + $oldPath
            $npm = Resolve-CollectorCommand -CommandName 'npm'
            Assert-Equal $npm.status 'RESOLVED' 'Synthetic npm must resolve through PATH'
            Assert-Equal $npm.kind 'CMD' 'Synthetic npm.cmd must resolve as CMD'
            Assert-Equal $npm.path $cmdPath 'PATH resolution must select the controlled npm fixture'
            $npmVersion = Get-CollectorCommandVersion -CommandName 'npm' -Arguments @('--version')
            Assert-True ($npmVersion.stdout.Contains('SYNTHETIC_NPM_VERSION')) 'npm shim must actually execute'
        } finally { $env:PATH = $oldPath }
    }

    Invoke-Case 'HC-05.3' 'CMD shell injection rejected before execution; PS1 arguments remain data' {
        $marker = New-FixturePath 'injection-must-not-exist.txt'
        $injections = @('& echo INJECTED', '| echo INJECTED', '> injection-must-not-exist.txt', '%COMSPEC%', 'a^&b', 'a!PATH!b', "a`nb", 'a"b')
        foreach ($arg in $injections) {
            $r = Get-CollectorCommandVersion -CommandName $cmdPath -Arguments @($arg)
            Assert-Equal $r.status 'UNSUPPORTED_ARGUMENT' 'Unsafe CMD argument must be rejected without shell evaluation'
        }
        $attack = "'; [IO.File]::WriteAllText('$marker','INJECTED'); #"
        $r = Get-CollectorCommandVersion -CommandName $ps1Path -Arguments @('two words', $attack)
        Assert-Equal $r.status 'SUCCESS' 'PS1 shim must accept serialized literal arguments'
        $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($attack))
        Assert-True ($r.stdout.Contains('ARG:' + $encoded)) 'PS1 attack string must round-trip as inert data'
        Assert-True (-not (Test-Path -LiteralPath $marker)) 'No injection marker may be created'
    }

    Invoke-Case 'HC-05.4' 'Aliases and functions are unsupported, not arbitrary shell commands' {
        $aliasName = 'SyntheticAlias_' + $runId
        $functionName = 'SyntheticFunction_' + $runId
        try {
            Set-Alias -Name $aliasName -Value $script:NativeExe -Scope Global
            Set-Item ('Function:global:' + $functionName) -Value { throw 'MUST_NOT_EXECUTE' }
            Assert-Equal (Resolve-CollectorCommand -CommandName $aliasName).status 'UNSUPPORTED_COMMAND' 'Alias must be explicitly unsupported'
            Assert-Equal (Resolve-CollectorCommand -CommandName $functionName).status 'UNSUPPORTED_COMMAND' 'Function must be explicitly unsupported'
        } finally {
            Remove-Item ('Alias:global:' + $aliasName) -ErrorAction SilentlyContinue
            Remove-Item ('Function:global:' + $functionName) -ErrorAction SilentlyContinue
        }
    }

    Invoke-Case 'HC-06.1' 'Missing, invalid image, nonzero and empty output are not success' {
        Assert-Equal (Resolve-CollectorCommand -CommandName ('missing-' + $runId)).status 'MISSING' 'Missing command must be distinguished'
        $missing = Get-CollectorCommandVersion -CommandName ('missing-' + $runId)
        Assert-Equal $missing.status 'MISSING' 'Missing version command must stay MISSING'
        Assert-True (-not $missing.present) 'Missing command must not be present'
        $badExe = New-FixturePath 'invalid.exe'
        [IO.File]::WriteAllText($badExe, 'THIS_IS_NOT_A_WINDOWS_EXECUTABLE')
        $bad = Invoke-CollectorProcess -FilePath $badExe -ArgumentList @() -TimeoutMilliseconds 1000
        Assert-Equal $bad.status 'LAUNCH_FAILED' 'Invalid executable image must be launch failure'
        $nonzero = Invoke-NativeFixture @('nonzero')
        Assert-Equal $nonzero.status 'NONZERO_EXIT' 'Nonzero exit must not report version success'
        Assert-Equal $nonzero.exitCode 23 'Real native exit code must be preserved'
        $empty = Invoke-NativeFixture @('empty')
        Assert-Equal $empty.status 'EMPTY_OUTPUT' 'Empty successful process must not fabricate a version'
        Assert-Equal $empty.exitCode 0 'Empty process exit code must remain zero'
    }

    Invoke-Case 'HC-06.2' 'Actual access-denied launch is distinguished from missing and empty' {
        $directoryExe = New-FixturePath 'directory-is-not-executable.exe'
        [void][IO.Directory]::CreateDirectory($directoryExe)
        $r = Invoke-CollectorProcess -FilePath $directoryExe -ArgumentList @() -TimeoutMilliseconds 1000
        Assert-Equal $r.status 'ACCESS_DENIED' 'Windows directory execution must expose access denial'
        Assert-True (-not [string]::IsNullOrWhiteSpace([string]$r.reason)) 'Access denial must have a safe explicit reason'
    }

    Invoke-Case 'HC-07.1' 'Repeated success, failure and timeout release process handles' {
        # Warm up JIT/lazy runtime infrastructure before measuring collector leaks.
        1..3 | ForEach-Object { Invoke-NativeFixture @('stdout') | Out-Null }
        [GC]::Collect(); [GC]::WaitForPendingFinalizers(); [GC]::Collect()
        $self = [Diagnostics.Process]::GetCurrentProcess()
        $self.Refresh(); $before = $self.HandleCount
        $samples = New-Object 'System.Collections.Generic.List[object]'
        $samples.Add([pscustomobject]@{ stage = 'baseline'; completedCalls = 0; handleCount = $before; growth = 0 })
        $script:CaseMeasurements.handleSamples = $samples
        $script:CaseMeasurements.maximumAllowedGrowth = 16
        $script:CaseMeasurements.measurementProcess = 'current-test-process-only'
        try {
            for ($i = 0; $i -lt 24; $i++) {
                $r = Invoke-NativeFixture @('stdout')
                Assert-Equal $r.status 'SUCCESS' 'Repeated success must remain successful'
                Assert-True ([bool]$r.cleanupComplete) 'Repeated success must release owned resources'
                $r = Invoke-NativeFixture @('nonzero')
                Assert-Equal $r.status 'NONZERO_EXIT' 'Repeated failure must remain explicit'
                Assert-True ([bool]$r.cleanupComplete) 'Repeated nonzero must release owned resources'
                if ($i -eq 0 -or (($i + 1) % 6) -eq 0) {
                    $self.Refresh(); $count = $self.HandleCount
                    $samples.Add([pscustomobject]@{
                        stage = 'success-nonzero-pairs'; completedCalls = ($i + 1) * 2
                        handleCount = $count; growth = $count - $before
                    })
                }
            }
            for ($i = 0; $i -lt 4; $i++) {
                $r = Invoke-NativeFixture @('hang') -TimeoutMilliseconds 300
                Assert-Equal $r.status 'TIMEOUT' 'Repeated timeout must remain explicit'
                Assert-True ([bool]$r.cleanupComplete) 'Repeated timeout must clean up'
                $self.Refresh(); $count = $self.HandleCount
                $samples.Add([pscustomobject]@{
                    stage = 'timeout'; completedCalls = 48 + $i + 1
                    handleCount = $count; growth = $count - $before
                })
            }
            $self.Refresh(); $immediateCount = $self.HandleCount; $immediateGrowth = $immediateCount - $before
            $samples.Add([pscustomobject]@{ stage = 'immediate-end'; completedCalls = 52; handleCount = $immediateCount; growth = $immediateGrowth })
            [GC]::Collect(); [GC]::WaitForPendingFinalizers(); [GC]::Collect()
            $self.Refresh(); $afterGcCount = $self.HandleCount; $growth = $afterGcCount - $before
            $samples.Add([pscustomobject]@{ stage = 'after-gc-diagnostic'; completedCalls = 52; handleCount = $afterGcCount; growth = $growth })
            # Save both measurements before asserting: a failure must expose its
            # trend. GC never changes the saved immediate-growth acceptance bound.
            $script:CaseMeasurements.immediateGrowth = $immediateGrowth
            $script:CaseMeasurements.afterGcGrowth = $growth
            Assert-True ($immediateGrowth -le 16) 'Immediate handle growth must be bounded without relying on finalizers'
            Assert-True ($growth -le 16) 'Handle growth must stay within documented runtime-noise allowance'
        } finally { $self.Dispose() }
    }

    Invoke-Case 'HC-08.1' 'Real query wrapper captures simulated CIM failure and no data' {
        $success = Invoke-CollectorQuery -Source 'fixture.cim' -Unit 'bytes' -Action { [long]42 }
        Assert-Equal $success.availability 'AVAILABLE' 'Successful synthetic reading must be available'
        Assert-Equal $success.data 42 'Successful reading must not change units/value'
        Assert-Equal $success.unit 'bytes' 'Reading unit must be explicit'
        Assert-Equal $success.source 'fixture.cim' 'Reading provenance must be explicit'
        foreach ($action in @(
            { throw 'SYNTHETIC_CIM_TERMINATING' },
            { Write-Error 'SYNTHETIC_CIM_NONTERMINATING'; [long]0 },
            { & ('MissingSyntheticCmdlet_' + [Guid]::NewGuid().ToString('N')) },
            { $null },
            { throw (New-Object UnauthorizedAccessException 'SYNTHETIC_FEATURE_QUERY_DENIED') }
        )) {
            $r = Invoke-CollectorQuery -Source 'fixture.cim' -Unit 'bytes' -Action $action
            Assert-Equal $r.availability 'UNAVAILABLE' 'Failed, denied or missing query must be unavailable'
            Assert-True ($null -eq $r.data) 'Unavailable query must not fabricate zero or partial success'
            Assert-True (-not [string]::IsNullOrWhiteSpace([string]$r.reason)) 'Unavailable query must explain the reason'
            Assert-True (-not [string]::IsNullOrWhiteSpace([string]$r.collectedAtUtc)) 'Unavailable query needs timestamp'
        }
    }

    Invoke-Case 'HC-10.1' 'Real JSON round-trip and ZIP whitelist contents' {
        $report = New-SyntheticReport
        $destination = New-FixturePath 'valid-report'
        $export = Export-CollectorReport -Report $report -OutputDirectory $destination
        Assert-Equal $export.status 'WRITTEN' 'Export must positively confirm successful writes'
        $jsonPath = Join-Path $destination 'host-environment.json'
        $readmePath = Join-Path $destination 'README.txt'
        Assert-True (Test-Path -LiteralPath $jsonPath -PathType Leaf) 'JSON file must exist'
        Assert-True (Test-Path -LiteralPath $readmePath -PathType Leaf) 'README file must exist'
        Assert-True (Test-Path -LiteralPath $export.zipPath -PathType Leaf) 'ZIP file must exist'
        $json = [IO.File]::ReadAllText($jsonPath)
        $roundTrip = $json | ConvertFrom-Json
        Assert-Equal $roundTrip.runId $report.runId 'JSON run ID must round-trip'
        Assert-Equal $roundTrip.status 'PARTIAL' 'JSON must preserve partial status'
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [IO.Compression.ZipFile]::OpenRead($export.zipPath)
        try {
            $names = @($archive.Entries | ForEach-Object { $_.FullName } | Sort-Object)
            Assert-Equal $names.Count 3 'ZIP must contain only the three reviewed generated files'
            Assert-Equal ($names -join '|') 'host-environment.json|manifest.json|README.txt' 'ZIP entries must be the explicit whitelist'
            foreach ($entry in $archive.Entries) {
                Assert-True ($entry.FullName -notmatch '(^[\\/]|\.\.|:)') 'ZIP entries must not expose absolute paths or traversal'
                $reader = New-Object IO.StreamReader($entry.Open())
                try {
                    $contents = $reader.ReadToEnd()
                    Assert-NoPrivateMarkers $contents 'Archive content'
                    if ($entry.FullName -eq 'host-environment.json') {
                        Assert-Equal (($contents | ConvertFrom-Json).runId) $report.runId 'ZIP JSON must be valid and belong to this run'
                    }
                } finally { $reader.Dispose() }
            }
        } finally { $archive.Dispose() }
        $manifest = [IO.File]::ReadAllText((Join-Path $destination 'manifest.json')) | ConvertFrom-Json
        Assert-Equal $manifest.runId $report.runId 'Manifest must belong to this run'
        Assert-Equal @($manifest.files).Count 2 'Manifest must describe the JSON and README payloads'
        foreach ($entry in $manifest.files) {
            Assert-True ($entry.name -in @('host-environment.json', 'README.txt')) 'Manifest must not contain unapproved files'
            $payload = Join-Path $destination $entry.name
            Assert-Equal $entry.sha256 (Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash 'Manifest digest must match actual payload bytes'
            Assert-Equal $entry.bytes (Get-Item -LiteralPath $payload).Length 'Manifest length must match actual payload bytes'
        }
        Assert-NoPrivateMarkers $json 'JSON artifact'
        Assert-NoPrivateMarkers ([IO.File]::ReadAllText($readmePath)) 'README artifact'
    }

    Invoke-Case 'HC-10.2' 'Directory, file and ZIP collisions preserve prior evidence' {
        $report = New-SyntheticReport
        $existing = New-FixturePath 'prior-directory'
        [void][IO.Directory]::CreateDirectory($existing)
        $sentinel = Join-Path $existing 'prior-evidence.txt'
        [IO.File]::WriteAllText($sentinel, 'DO_NOT_DELETE_OR_REPLACE')
        Assert-Throws { Export-CollectorReport -Report $report -OutputDirectory $existing } 'Existing directory must fail safely'
        Assert-Equal ([IO.File]::ReadAllText($sentinel)) 'DO_NOT_DELETE_OR_REPLACE' 'Prior directory evidence must be unchanged'
        $existingFile = New-FixturePath 'prior-file'
        [IO.File]::WriteAllText($existingFile, 'PRIOR_FILE_EVIDENCE')
        Assert-Throws { Export-CollectorReport -Report $report -OutputDirectory $existingFile } 'Existing output file must fail safely'
        Assert-Equal ([IO.File]::ReadAllText($existingFile)) 'PRIOR_FILE_EVIDENCE' 'Prior file must be unchanged'
        $zipDestination = New-FixturePath 'zip-collision'
        [IO.File]::WriteAllText(($zipDestination + '.zip'), 'PRIOR_ZIP_EVIDENCE')
        Assert-Throws { Export-CollectorReport -Report $report -OutputDirectory $zipDestination } 'Existing ZIP must fail safely'
        Assert-Equal ([IO.File]::ReadAllText(($zipDestination + '.zip'))) 'PRIOR_ZIP_EVIDENCE' 'Prior ZIP must be unchanged'
    }

    Invoke-Case 'HC-10.3' 'Invalid parent and injected JSON or ZIP write denial fail clearly' {
        $report = New-SyntheticReport
        $parentFile = New-FixturePath 'not-a-directory'
        [IO.File]::WriteAllText($parentFile, 'PRESERVE_PARENT_FILE')
        Assert-Throws { Export-CollectorReport -Report $report -OutputDirectory (Join-Path $parentFile 'child') } 'Unwritable directory path must fail clearly'
        Assert-Equal ([IO.File]::ReadAllText($parentFile)) 'PRESERVE_PARENT_FILE' 'Failed write must preserve parent file'
        Invoke-WithWriterFailure 'Write-CollectorJsonFile' {
            Assert-Throws { Export-CollectorReport -Report $report -OutputDirectory (New-FixturePath 'json-write-denial') } 'Injected JSON access denial must terminate export'
        }
        Invoke-WithWriterFailure 'Write-CollectorZipFile' {
            Assert-Throws { Export-CollectorReport -Report $report -OutputDirectory (New-FixturePath 'zip-write-denial') } 'Injected ZIP access denial must terminate export'
        }
        $recovered = Export-CollectorReport -Report $report -OutputDirectory (New-FixturePath 'after-injected-failures')
        Assert-Equal $recovered.status 'WRITTEN' 'Real filesystem writers must be restored after fault injection'
    }

    Invoke-Case 'HC-11.1' 'Synthetic private paths, IPs, serials and secrets are removed from public surfaces' {
        $native = Get-CollectorCommandVersion -CommandName $script:NativeExe -Arguments @('privacy')
        Assert-Equal $native.status 'SUCCESS' 'Privacy probe must actually execute'
        Assert-NoPrivateMarkers ($native | ConvertTo-Json -Depth 12) 'Command version result'
        $allMarkers = $script:Forbidden -join ' '
        $protected = Protect-CollectorText -Text $allMarkers -SensitiveValues $script:Forbidden
        Assert-NoPrivateMarkers $protected 'Explicit sensitive-value sanitizer'
        $equalLengthSecrets = @('ALPHA_SECRET', 'BETA__SECRET')
        $protectedEqualLength = Protect-CollectorText -Text ($equalLengthSecrets -join ' ') -SensitiveValues $equalLengthSecrets
        foreach ($secret in $equalLengthSecrets) {
            Assert-True (-not $protectedEqualLength.Contains($secret)) 'Distinct equal-length sensitive values must all be redacted'
        }
        $errorQuery = Invoke-CollectorQuery -Source 'fixture.privacy' -Unit 'text' -Action {
            throw 'C:\Users\SYNTHETIC_PRIVATE_USER\private\sdk token=SYNTHETIC_TOKEN_ABC123 ip=192.0.2.77'
        }
        Assert-NoPrivateMarkers ($errorQuery | ConvertTo-Json -Depth 8) 'Query error'
        $sections = [ordered]@{
            privateProbe = Invoke-CollectorQuery -Source 'fixture.privacy' -Unit 'text' -Action { $native }
            privateError = $errorQuery
        }
        $report = New-CollectorReport -Sections $sections -RunId 'synthetic-privacy-run'
        Assert-NoPrivateMarkers ($report | ConvertTo-Json -Depth 16) 'Public report'
        $export = Export-CollectorReport -Report $report -OutputDirectory (New-FixturePath 'privacy-report')
        foreach ($name in @('host-environment.json', 'README.txt', 'manifest.json')) {
            Assert-NoPrivateMarkers ([IO.File]::ReadAllText((Join-Path $export.outputDirectory $name))) 'Privacy export file'
        }
        $archive = [IO.Compression.ZipFile]::OpenRead($export.zipPath)
        try {
            foreach ($entry in $archive.Entries) {
                Assert-NoPrivateMarkers $entry.FullName 'Privacy archive entry name'
                $reader = New-Object IO.StreamReader($entry.Open())
                try { Assert-NoPrivateMarkers ($reader.ReadToEnd()) 'Privacy archive content' }
                finally { $reader.Dispose() }
            }
        } finally { $archive.Dispose() }
    }

    Invoke-Case 'HC-12.1' 'Schema, run, timestamp, provenance, units and PARTIAL are truthful' {
        $report = New-SyntheticReport
        Assert-Equal $report.schemaVersion '2.0' 'Report schema must be versioned'
        Assert-Equal $report.runId 'synthetic-report-run-001' 'Explicit synthetic run ID must be preserved'
        Assert-Equal $report.status 'PARTIAL' 'Any unavailable section makes report PARTIAL'
        Assert-True (-not [string]::IsNullOrWhiteSpace([string]$report.collectionScope)) 'Report scope must be explicit'
        $timestamp = [DateTimeOffset]::Parse($report.collectedAtUtc)
        Assert-Equal $timestamp.Offset ([TimeSpan]::Zero) 'Collection timestamp must be UTC'
        Assert-Equal $report.sections.memory.source 'fixture.memory' 'Section provenance must survive report building'
        Assert-Equal $report.sections.memory.unit 'bytes' 'Memory unit must remain bytes'
        Assert-Equal $report.sections.memory.data.capacity 8589934592 'Memory count must not become MB or truncated Int32'
        Assert-Equal $report.sections.unavailableSensor.availability 'UNAVAILABLE' 'Missing sensor must remain unavailable'
        Assert-True ($null -eq $report.sections.unavailableSensor.data) 'Missing sensor must not appear as zero'
        $complete = New-CollectorReport -Sections ([ordered]@{
            one = Invoke-CollectorQuery -Source 'fixture.complete' -Unit 'count' -Action { 1 }
        }) -RunId 'synthetic-complete-run'
        Assert-Equal $complete.status 'COMPLETE' 'All available synthetic sections may be complete only within fixture scope'
        foreach ($rawStatus in @('OK', 'Up')) {
            $sensorStatus = Invoke-CollectorQuery -Source 'fixture.raw-sensor-status' -Unit 'count' -Action {
                [pscustomobject]@{ Status = $rawStatus; reading = 1 }
            }
            Assert-Equal $sensorStatus.availability 'AVAILABLE' 'Raw sensor Status must not be confused with collector status'
            $sensorReport = New-CollectorReport -Sections ([ordered]@{ sensor = $sensorStatus }) -RunId 'synthetic-raw-sensor-status'
            Assert-Equal $sensorReport.status 'COMPLETE' 'Available raw sensor OK or Up must not force PARTIAL'
        }
        $failedNative = New-CollectorReport -Sections ([ordered]@{
            native = Invoke-CollectorQuery -Source 'fixture.failed-native' -Unit 'text' -Action { Invoke-NativeFixture @('nonzero') }
        }) -RunId 'synthetic-failed-native-status'
        Assert-Equal $failedNative.status 'PARTIAL' 'Nested failed native envelope must still make report PARTIAL'
        $nullField = New-CollectorReport -Sections ([ordered]@{
            sensor = Invoke-CollectorQuery -Source 'fixture.null-property' -Unit 'percent' -Action { [pscustomobject]@{ reading = $null } }
        }) -RunId 'synthetic-null-field-run'
        Assert-Equal $nullField.status 'PARTIAL' 'Object with a null sensor reading must not make overall COMPLETE'
        Assert-True ($null -eq $nullField.sections.sensor.data.reading) 'Null sensor reading must remain null, never zero'
        Assert-NoPrivateMarkers ($report | ConvertTo-Json -Depth 16) 'Schema artifact'
    }
}
catch {
    $setupFailed = $true
    $script:Cases.Add([pscustomobject][ordered]@{
        id = 'SETUP'; name = 'Harness prerequisite or setup'; result = 'FAIL'
        reason = Get-SafeFailure $_; assertionCount = 0; durationMs = 0
    })
}
finally {
    foreach ($owned in $script:KnownOwnedProcesses) { Stop-KnownOwnedProcess $owned }
    if ($script:CollectorModule) { Remove-Module $script:CollectorModule -ErrorAction SilentlyContinue }
    if ($script:FixtureRoot -and (Test-Path -LiteralPath $script:FixtureRoot)) {
        $ownership = Join-Path $script:FixtureRoot '.owned-by-test'
        try {
            if ((Test-Path -LiteralPath $ownership -PathType Leaf) -and
                [IO.File]::ReadAllText($ownership) -ceq $runId) {
                Remove-Item -LiteralPath $script:FixtureRoot -Recurse -Force -ErrorAction Stop
            } else { throw 'OWNERSHIP_MARKER_MISMATCH' }
        } catch {
            $script:Cases.Add([pscustomobject][ordered]@{
                id = 'CLEANUP'; name = 'Owned fixture cleanup'; result = 'FAIL'
                reason = 'Fixture cleanup failed; no unowned content was removed.'
                assertionCount = 0; durationMs = 0
            })
        }
    }
}

Add-NotRun 'HC-09' 'Target-host virtualization backend and actual emulator acceleration' 'Requires separately approved target-host read-only optional-feature query and emulator -accel-check. Synthetic CI does not run either.'
Add-NotRun 'HC-13' 'Exact approved collector rerun on the user Windows host' 'Requires user target Windows host and reviewed sanitized evidence. Windows CI is not target-host acceptance.'
$failedCount = @($script:Cases | Where-Object { $_.result -eq 'FAIL' }).Count
$passedCount = @($script:Cases | Where-Object { $_.result -eq 'PASS' }).Count
$notRunCount = @($script:Cases | Where-Object { $_.result -eq 'NOT_RUN' }).Count
$sourceHashes = [ordered]@{}
foreach ($item in @(@('collector', $collectorPath), @('module', $modulePath), @('powerShellWrapper', $wrapperPath), @('nativeHelper', $nativeSourcePath), @('harness', $PSCommandPath), @('nativeFixture', (Join-Path $PSScriptRoot 'fixtures\NativeFixture.cs')))) {
    if (Test-Path -LiteralPath $item[1] -PathType Leaf) { $sourceHashes[$item[0]] = (Get-FileHash -LiteralPath $item[1] -Algorithm SHA256).Hash }
}
$summary = [pscustomobject][ordered]@{
    schemaVersion = '1.0'; task = 'P0-01'; evidenceLayer = 'WINDOWS_POWERSHELL_5_1_SYNTHETIC'
    runId = $runId; startedAtUtc = $startedAt.ToString('o'); finishedAtUtc = [DateTime]::UtcNow.ToString('o')
    command = 'powershell.exe -NoProfile -NonInteractive -File tests/phase-00/Test-HostEnvironment.ps1 -OutputDirectory <new-owned-result-directory>'
    runtime = [ordered]@{ psVersion = $PSVersionTable.PSVersion.ToString(); edition = $PSVersionTable.PSEdition; osVersion = [Environment]::OSVersion.Version.ToString() }
    sourceSha256 = $sourceHashes
    syntheticResult = $(if ($failedCount -eq 0 -and -not $setupFailed) { 'PASS' } else { 'FAIL' })
    taskAcceptance = 'BLOCKED'; limitation = 'Synthetic behavior coverage only; HC-09 and HC-13 remain NOT_RUN. No target-host support or Phase acceptance claim.'
    counts = [ordered]@{ passed = $passedCount; failed = $failedCount; notRun = $notRunCount; assertions = $script:AssertionCount }
    cases = @($script:Cases.ToArray())
}
$json = $summary | ConvertTo-Json -Depth 12
$text = 'P0-01 synthetic=' + $summary.syntheticResult + '; PASS=' + $passedCount + '; FAIL=' + $failedCount + '; NOT_RUN=' + $notRunCount + '; task acceptance=BLOCKED. HC-09/HC-13 require target-host evidence.'
if ($outputReady) {
    try {
        [IO.File]::WriteAllText((Join-Path $OutputDirectory 'results.json'), $json, (New-Object Text.UTF8Encoding $false))
        [IO.File]::WriteAllText((Join-Path $OutputDirectory 'summary.txt'), $text, (New-Object Text.UTF8Encoding $false))
    } catch { Write-Host 'RESULT_WRITE_FAILED'; exit 2 }
}
Write-Output $json
if ($setupFailed) { exit 2 }
if ($failedCount -gt 0) { exit 1 }
exit 0
