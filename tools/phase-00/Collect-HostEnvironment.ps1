# Fonesi-Auto Phase 0 - P0-01 Host Environment Collector
# Read-only diagnostics. Does not install software, change Windows features,
# access personal files, collect IP addresses, or enumerate device serial numbers.
# Compatible target: Windows PowerShell 5.1+.

[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path ([Environment]::GetFolderPath("Desktop")) ("Fonesi-Auto-P0-01-" + (Get-Date -Format "yyyyMMdd-HHmmss")))
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

function Get-SafeValue {
    param([scriptblock]$Action)
    try {
        $value = & $Action
        if ($null -eq $value) { return $null }
        return $value
    } catch {
        return [pscustomobject]@{
            availability = "UNAVAILABLE"
            reason = $_.Exception.Message
        }
    }
}

function Get-CommandVersion {
    param([string]$CommandName, [string[]]$Arguments = @("--version"))
    $command = Get-Command $CommandName -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) {
        return [pscustomobject]@{ installed = $false; path = $null; version = $null }
    }

    $versionText = $null
    $exitCode = $null
    try {
        # Capture stdout and stderr separately through .NET so native tools
        # (notably java.exe, which writes -version to stderr) do not become
        # PowerShell NativeCommandError records in the JSON report.
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $command.Source
        $startInfo.Arguments = [string]::Join(" ", $Arguments)
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $startInfo
        [void]$process.Start()

        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        $exitCode = $process.ExitCode

        $combinedOutput = @($stdout, $stderr) -join "`n"
        $versionText = ($combinedOutput -split "`r?`n" |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Select-Object -First 1)
        if (-not $versionText) {
            $versionText = "No version output (exit code $exitCode)"
        }
        $process.Dispose()
    } catch {
        $versionText = "Version query failed: " + $_.Exception.Message
    }

    return [pscustomobject]@{
        installed = $true
        path = $command.Source
        version = $versionText
        exitCode = $exitCode
    }
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$os = Get-SafeValue {
    Get-CimInstance Win32_OperatingSystem |
        Select-Object Caption, Version, BuildNumber, OSArchitecture, InstallDate, LastBootUpTime
}

$computer = Get-SafeValue {
    Get-CimInstance Win32_ComputerSystem |
        Select-Object Manufacturer, Model, SystemType, TotalPhysicalMemory,
            NumberOfLogicalProcessors, NumberOfProcessors, HypervisorPresent
}

$cpu = Get-SafeValue {
    Get-CimInstance Win32_Processor |
        Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors,
            MaxClockSpeed, VirtualizationFirmwareEnabled,
            VMMonitorModeExtensions, SecondLevelAddressTranslationExtensions
}

$memory = Get-SafeValue {
    Get-CimInstance Win32_PhysicalMemory |
        Select-Object Manufacturer, PartNumber, Capacity, Speed, ConfiguredClockSpeed,
            SMBIOSMemoryType
}

$gpu = Get-SafeValue {
    Get-CimInstance Win32_VideoController |
        Select-Object Name, DriverVersion, DriverDate, VideoProcessor,
            AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution,
            CurrentRefreshRate, Status
}

$physicalDisks = Get-SafeValue {
    if (Get-Command Get-PhysicalDisk -ErrorAction SilentlyContinue) {
        Get-PhysicalDisk |
            Select-Object FriendlyName, MediaType, BusType, Size, HealthStatus, OperationalStatus
    } else {
        "Get-PhysicalDisk is unavailable on this Windows installation."
    }
}

$logicalDisks = Get-SafeValue {
    Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
        Select-Object DeviceID, FileSystem, Size, FreeSpace
}

$powerPlan = Get-SafeValue {
    (& powercfg.exe /getactivescheme 2>&1 | Out-String).Trim()
}

$virtualizationFeatures = Get-SafeValue {
    if (Get-Command Get-WindowsOptionalFeature -ErrorAction SilentlyContinue) {
        Get-WindowsOptionalFeature -Online |
            Where-Object {
                $_.FeatureName -match "Hyper-V|VirtualMachinePlatform|HypervisorPlatform"
            } |
            Select-Object FeatureName, State
    } else {
        "Windows optional-feature cmdlet unavailable; run this report from Windows PowerShell."
    }
}

$hypervisorStatus = Get-SafeValue {
    (& bcdedit.exe /enum "{current}" 2>&1 |
        Select-String -Pattern "hypervisorlaunchtype" |
        ForEach-Object { $_.Line.Trim() })
}

$networkAdapters = Get-SafeValue {
    if (Get-Command Get-NetAdapter -ErrorAction SilentlyContinue) {
        Get-NetAdapter |
            Select-Object Name, InterfaceDescription, Status, LinkSpeed, DriverInformation
    } else {
        "Get-NetAdapter is unavailable."
    }
}

$sdkRoot = $env:ANDROID_HOME
if (-not $sdkRoot) { $sdkRoot = $env:ANDROID_SDK_ROOT }
if (-not $sdkRoot) { $sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk" }

$sdkPaths = [ordered]@{
    sdkRoot = $sdkRoot
    sdkManager = (Test-Path (Join-Path $sdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"))
    avdManager = (Test-Path (Join-Path $sdkRoot "cmdline-tools\latest\bin\avdmanager.bat"))
    emulator = (Test-Path (Join-Path $sdkRoot "emulator\emulator.exe"))
    adb = (Test-Path (Join-Path $sdkRoot "platform-tools\adb.exe"))
}

$runtime = [ordered]@{
    node = Get-CommandVersion "node"
    npm = Get-CommandVersion "npm"
    python = Get-CommandVersion "python"
    git = Get-CommandVersion "git"
    java = Get-CommandVersion "java" @("-version")
}

$androidTools = [ordered]@{
    sdk = $sdkPaths
    adbOnPath = Get-CommandVersion "adb" @("version")
    emulatorOnPath = Get-CommandVersion "emulator" @("-version")
    androidStudio = @(
        (Join-Path $env:ProgramFiles "Android\Android Studio\bin\studio64.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Android Studio\bin\studio64.exe")
    ) | ForEach-Object {
        [pscustomobject]@{ path = $_; exists = (Test-Path $_) }
    }
}

$report = [ordered]@{
    schemaVersion = "1.0"
    collectedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    collectionScope = "Host hardware and development prerequisites only; no personal files, IP addresses, or device serials."
    operatingSystem = $os
    computerSystem = $computer
    processors = $cpu
    physicalMemory = $memory
    videoControllers = $gpu
    physicalDisks = $physicalDisks
    logicalDisks = $logicalDisks
    powerPlan = $powerPlan
    virtualizationFeatures = $virtualizationFeatures
    hypervisorBootSetting = $hypervisorStatus
    networkAdapters = $networkAdapters
    androidTools = $androidTools
    runtimes = $runtime
}

$jsonPath = Join-Path $OutputDirectory "host-environment.json"
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath -Encoding UTF8

$summary = @"
FONESI-AUTO PHASE 0 / P0-01 HOST PREFLIGHT
Collected UTC: $($report.collectedAtUtc)
Computer manufacturer/model: $($computer.Manufacturer) / $($computer.Model)
OS: $($os.Caption) | Version: $($os.Version) | Build: $($os.BuildNumber)
CPU: $($cpu.Name)
Cores / logical processors: $($cpu.NumberOfCores) / $($cpu.NumberOfLogicalProcessors)
Physical RAM bytes: $($computer.TotalPhysicalMemory)
GPU(s): $(($gpu | ForEach-Object { $_.Name }) -join "; ")
Android SDK root: $sdkRoot
SDK manager present: $($sdkPaths.sdkManager)
AVD manager present: $($sdkPaths.avdManager)
Emulator present: $($sdkPaths.emulator)
SDK ADB present: $($sdkPaths.adb)

Detailed structured data: host-environment.json

Privacy: this report intentionally excludes local IP addresses, device serial numbers,
user profile contents, browser data, credentials, tokens, OTPs and personal files.
"@
$summaryPath = Join-Path $OutputDirectory "README.txt"
$summary | Set-Content -Path $summaryPath -Encoding UTF8

$zipPath = "$OutputDirectory.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $OutputDirectory "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "P0-01 host preflight collection completed." -ForegroundColor Green
Write-Host "Report folder: $OutputDirectory"
Write-Host "ZIP: $zipPath" -ForegroundColor Cyan
Write-Host "Review the report before sharing. No system settings were changed."
