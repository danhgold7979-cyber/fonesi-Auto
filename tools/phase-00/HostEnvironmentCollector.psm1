# P0-01 read-only host diagnostics. Windows PowerShell 5.1 target only.
Set-StrictMode -Version 2.0
$script:CollectorRoot = $PSScriptRoot

function Initialize-CollectorNative {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'WINDOWS_REQUIRED' }
    if (-not ('Fonesi.Phase00.NativeProbe' -as [type])) {
        Add-Type -Path (Join-Path $script:CollectorRoot 'HostProbeNative.cs') -ErrorAction Stop
    }
}

function Protect-CollectorText {
    [CmdletBinding()]
    param([AllowNull()][AllowEmptyString()][string]$Text, [string[]]$SensitiveValues = @())
    if ($null -eq $Text) { return $null }
    $clean = $Text
    $literals = @($SensitiveValues) + @($env:USERPROFILE, $env:LOCALAPPDATA, $env:APPDATA, $env:TEMP, $env:USERNAME, $env:COMPUTERNAME)
    foreach ($literal in ($literals | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique | Sort-Object Length -Descending)) {
        $clean = [regex]::Replace($clean, [regex]::Escape($literal), '[REDACTED]', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }
    # Deliberately conservative: diagnostics are not a lossless text export.
    $clean = [regex]::Replace($clean, '(?i)(?:[a-z]:[\\/]|\\\\)[^\r\n"''<>]*', '[PATH]')
    $clean = [regex]::Replace($clean, '(?i)/(?:home|Users|tmp)/[^\s"''<>]+', '[PATH]')
    $octet = '(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)'
    $clean = [regex]::Replace($clean, '(?<![\w.])' + $octet + '(?:\.' + $octet + '){3}(?![\w.])', '[IP]')
    $clean = [regex]::Replace($clean, '(?i)(?<![\w:])(?:[a-f0-9]{0,4}:){2,}[a-f0-9:.%]+', '[IP]')
    $clean = [regex]::Replace($clean, '(?i)\b(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|otp|serial(?:number)?|device[_ -]?id|username|hostname)\s*[:=]\s*[^\r\n,;]+', '[SENSITIVE]')
    $clean = [regex]::Replace($clean, '(?i)\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[SECRET]')
    $clean = [regex]::Replace($clean, '(?i)(https?://)[^\s/@]+:[^\s/@]+@', '$1[REDACTED]@')
    return $clean
}

function Protect-CollectorObject {
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [string]) { return (Protect-CollectorText -Text $Value) }
    if ($Value -is [datetime]) { return $Value.ToUniversalTime().ToString('o') }
    if ($Value -is [System.Collections.IDictionary]) {
        $result = [ordered]@{}
        foreach ($key in $Value.Keys) { $result[(Protect-CollectorText ([string]$key))] = Protect-CollectorObject $Value[$key] }
        return [pscustomobject]$result
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        $items = @(); foreach ($item in $Value) { $items += ,(Protect-CollectorObject $item) }
        return ,$items
    }
    if ($Value -is [pscustomobject]) {
        $result = [ordered]@{}
        foreach ($property in $Value.PSObject.Properties) { $result[(Protect-CollectorText $property.Name)] = Protect-CollectorObject $property.Value }
        return [pscustomobject]$result
    }
    return $Value
}

function New-CollectorProcessResult {
    param([string]$Status, [string]$Reason)
    return [pscustomobject][ordered]@{
        status = $Status; exitCode = $null; stdout = ''; stderr = ''
        stdoutTruncated = $false; stderrTruncated = $false; durationMs = 0
        cleanupComplete = $true; reason = $Reason
    }
}

function Convert-CollectorNativeResult {
    param($Native, [string[]]$SensitiveValues = @(), [int]$MaxOutputCharacters = 65536)
    $result = New-CollectorProcessResult $Native.Status $Native.Reason
    $result.exitCode = $Native.ExitCode
    $result.stdout = Protect-CollectorText $Native.Stdout $SensitiveValues
    $result.stderr = Protect-CollectorText $Native.Stderr $SensitiveValues
    $result.stdoutTruncated = $Native.StdoutTruncated; $result.stderrTruncated = $Native.StderrTruncated
    if ($result.stdout.Length -gt $MaxOutputCharacters) { $result.stdout = $result.stdout.Substring(0, $MaxOutputCharacters); $result.stdoutTruncated = $true }
    if ($result.stderr.Length -gt $MaxOutputCharacters) { $result.stderr = $result.stderr.Substring(0, $MaxOutputCharacters); $result.stderrTruncated = $true }
    $result.durationMs = $Native.DurationMs; $result.cleanupComplete = $Native.CleanupComplete
    return $result
}

function Invoke-CollectorProcess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [AllowEmptyCollection()][AllowEmptyString()][string[]]$ArgumentList = @(),
        [ValidateRange(100, 120000)][int]$TimeoutMilliseconds = 10000,
        [ValidateRange(100, 10000)][int]$CleanupMilliseconds = 2000,
        [ValidateRange(256, 1048576)][int]$MaxOutputCharacters = 65536,
        [string[]]$SensitiveValues = @()
    )
    if (-not [IO.Path]::IsPathRooted($FilePath) -or [IO.Path]::GetExtension($FilePath) -ine '.exe') {
        return New-CollectorProcessResult 'UNSUPPORTED_COMMAND' 'ABSOLUTE_EXE_REQUIRED'
    }
    try {
        Initialize-CollectorNative
        $native = [Fonesi.Phase00.NativeProbe]::Run($FilePath, $ArgumentList, $TimeoutMilliseconds, $CleanupMilliseconds, $MaxOutputCharacters)
        return Convert-CollectorNativeResult $native $SensitiveValues $MaxOutputCharacters
    } catch {
        $status = 'LAUNCH_FAILED'
        if ($_.Exception -is [UnauthorizedAccessException]) { $status = 'ACCESS_DENIED' }
        return New-CollectorProcessResult $status ('HELPER_' + $_.Exception.GetType().Name)
    }
}

function Resolve-CollectorCommand {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$CommandName)
    $result = [ordered]@{ status = 'MISSING'; path = $null; kind = $null; reason = 'COMMAND_NOT_FOUND' }
    try {
        $command = Get-Command -Name $CommandName -ErrorAction Stop | Select-Object -First 1
        if ($command.CommandType -notin @('Application', 'ExternalScript')) {
            $result.status = 'UNSUPPORTED_COMMAND'; $result.reason = 'ALIAS_FUNCTION_OR_CMDLET_NOT_EXECUTED'
        } else {
            $path = $command.Source
            $extension = [IO.Path]::GetExtension($path).ToLowerInvariant()
            switch ($extension) {
                '.exe' { $result.kind = 'EXE' }
                '.cmd' { $result.kind = 'CMD' }
                '.bat' { $result.kind = 'CMD' }
                '.ps1' { $result.kind = 'PS1' }
                default { $result.status = 'UNSUPPORTED_COMMAND'; $result.reason = 'UNSUPPORTED_EXTENSION' }
            }
            if ($result.kind) { $result.status = 'RESOLVED'; $result.path = $path; $result.reason = $null }
        }
    } catch [System.Management.Automation.CommandNotFoundException] { }
    catch [UnauthorizedAccessException] { $result.status = 'ACCESS_DENIED'; $result.reason = 'RESOLUTION_ACCESS_DENIED' }
    catch { $result.status = 'RESOLUTION_FAILED'; $result.reason = 'COMMAND_RESOLUTION_FAILED' }
    return [pscustomobject]$result
}

function Get-CollectorCommandVersion {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$CommandName,
        [AllowEmptyCollection()][AllowEmptyString()][string[]]$Arguments = @('--version'),
        [ValidateRange(100, 120000)][int]$TimeoutMilliseconds = 10000,
        [ValidateRange(100, 10000)][int]$CleanupMilliseconds = 2000,
        [ValidateRange(256, 1048576)][int]$MaxOutputCharacters = 65536,
        [string[]]$SensitiveValues = @()
    )
    $resolved = Resolve-CollectorCommand $CommandName
    $result = New-CollectorProcessResult $resolved.status $resolved.reason
    if ($resolved.status -eq 'RESOLVED') {
        $file = $resolved.path; [string[]]$nativeArguments = $Arguments
        if ($resolved.kind -eq 'CMD') {
            # CMD cannot faithfully transport arbitrary strings. Reject its grammar,
            # expansions and quotes instead of attempting security-sensitive escaping.
            $unsafe = @($resolved.path) + @($Arguments) | Where-Object { $_ -match '["%!?&|<>^()\r\n\x00]' }
            if (@($unsafe).Count -gt 0) { $result = New-CollectorProcessResult 'UNSUPPORTED_ARGUMENT' 'CMD_UNSAFE_CHARACTER' }
            else {
                $file = Join-Path ([Environment]::GetFolderPath('System')) 'cmd.exe'
                try {
                    Initialize-CollectorNative
                    $native = [Fonesi.Phase00.NativeProbe]::RunCmd($file, $resolved.path, $Arguments, $TimeoutMilliseconds, $CleanupMilliseconds, $MaxOutputCharacters)
                    $result = Convert-CollectorNativeResult $native $SensitiveValues $MaxOutputCharacters
                } catch { $result = New-CollectorProcessResult 'LAUNCH_FAILED' ('HELPER_' + $_.Exception.GetType().Name) }
            }
        } elseif ($resolved.kind -eq 'PS1') {
            $request = [ordered]@{ path = $resolved.path; arguments = @($Arguments) } | ConvertTo-Json -Compress -Depth 3
            $payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($request))
            $file = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
            $nativeArguments = @('-NoLogo', '-NoProfile', '-NonInteractive', '-File', (Join-Path $script:CollectorRoot 'Invoke-PowerShellProbe.ps1'), '-Payload', $payload)
            $result = Invoke-CollectorProcess -FilePath $file -ArgumentList $nativeArguments -TimeoutMilliseconds $TimeoutMilliseconds -CleanupMilliseconds $CleanupMilliseconds -MaxOutputCharacters $MaxOutputCharacters -SensitiveValues $SensitiveValues
        } else {
            $result = Invoke-CollectorProcess -FilePath $file -ArgumentList $nativeArguments -TimeoutMilliseconds $TimeoutMilliseconds -CleanupMilliseconds $CleanupMilliseconds -MaxOutputCharacters $MaxOutputCharacters -SensitiveValues $SensitiveValues
        }
    }
    $version = $null
    if ($result.status -eq 'SUCCESS') {
        $version = (@(($result.stdout + "`n" + $result.stderr) -split '\r?\n') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
    }
    $result | Add-Member NoteProperty present ($resolved.status -eq 'RESOLVED')
    $result | Add-Member NoteProperty kind $resolved.kind
    $result | Add-Member NoteProperty version $version
    $result | Add-Member NoteProperty source ('command:' + (Protect-CollectorText ([IO.Path]::GetFileName($CommandName))))
    $result | Add-Member NoteProperty collectedAtUtc ([DateTime]::UtcNow.ToString('o'))
    $availability = 'UNAVAILABLE'
    if ($result.status -eq 'SUCCESS') {
        $availability = 'AVAILABLE'
        if ($result.stdoutTruncated -or $result.stderrTruncated) { $availability = 'PARTIAL' }
    }
    $result | Add-Member NoteProperty availability $availability
    return $result
}

function Invoke-CollectorQuery {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Source, [Parameter(Mandatory = $true)][scriptblock]$Action, [string]$Unit = 'not_applicable')
    $result = [ordered]@{ source = $Source; collectedAtUtc = [DateTime]::UtcNow.ToString('o'); availability = 'UNAVAILABLE'; reason = $null; data = $null; unit = $Unit }
    try {
        # Local dynamic preference catches cmdlets' nonterminating errors too.
        $ErrorActionPreference = 'Stop'
        $data = & $Action
        if ($null -eq $data -or @($data).Count -eq 0) { $result.reason = 'NO_DATA' }
        else {
            $result.availability = 'AVAILABLE'; $result.data = Protect-CollectorObject $data
            if (-not (Test-CollectorSectionComplete $data)) { $result.availability = 'PARTIAL'; $result.reason = 'ONE_OR_MORE_FIELDS_UNAVAILABLE' }
        }
    } catch [UnauthorizedAccessException] { $result.reason = 'ACCESS_DENIED' }
    catch [System.Management.Automation.CommandNotFoundException] { $result.reason = 'CMDLET_UNAVAILABLE' }
    catch { $result.reason = 'QUERY_FAILED:' + $_.Exception.GetType().Name }
    return [pscustomobject]$result
}

function Test-CollectorSectionComplete {
    param($Section)
    if ($null -eq $Section) { return $false }
    if ($Section -is [System.Collections.IDictionary]) {
        if ($Section.Contains('availability') -and $Section['availability'] -ne 'AVAILABLE') { return $false }
        if ($Section.Contains('status') -and ($Section.Contains('cleanupComplete') -or $Section.Contains('schemaVersion')) -and $Section['status'] -notin @('SUCCESS', 'COMPLETE')) { return $false }
        foreach ($key in $Section.Keys) {
            if ($key -notin @('reason', 'exitCode', 'version', 'kind') -and -not (Test-CollectorSectionComplete $Section[$key])) { return $false }
        }
    } elseif ($Section -is [pscustomobject]) {
        if ($Section.PSObject.Properties['availability'] -and $Section.availability -ne 'AVAILABLE') { return $false }
        if ($Section.PSObject.Properties['status'] -and ($Section.PSObject.Properties['cleanupComplete'] -or $Section.PSObject.Properties['schemaVersion']) -and $Section.status -notin @('SUCCESS', 'COMPLETE')) { return $false }
        # Null reason/exitCode/version are metadata; don't mistake them for missing sensors.
        foreach ($property in $Section.PSObject.Properties) {
            if ($property.Name -notin @('reason', 'exitCode', 'version', 'kind') -and -not (Test-CollectorSectionComplete $property.Value)) { return $false }
        }
    } elseif ($Section -is [System.Collections.IEnumerable] -and $Section -isnot [string]) {
        foreach ($value in $Section) { if (-not (Test-CollectorSectionComplete $value)) { return $false } }
    }
    return $true
}

function New-CollectorReport {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][System.Collections.IDictionary]$Sections, [string]$RunId = ([Guid]::NewGuid().ToString('N')))
    if ($RunId -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'INVALID_RUN_ID' }
    $status = 'COMPLETE'
    if ($Sections.Count -eq 0) { $status = 'PARTIAL' }
    foreach ($section in $Sections.Values) { if (-not (Test-CollectorSectionComplete $section)) { $status = 'PARTIAL' } }
    return [pscustomobject][ordered]@{
        schemaVersion = '2.0'; collectorVersion = 'P0-01-HC-1'; runId = $RunId
        collectedAtUtc = [DateTime]::UtcNow.ToString('o'); status = $status
        collectionScope = 'Read-only host/prerequisite queries only; no device enumeration or host setting changes.'
        privacy = 'PRIVATE_REVIEW_REQUIRED: redaction reduces exposure; no automatic public upload or claim of complete sanitization.'
        source = [ordered]@{ shell = 'Windows PowerShell'; shellVersion = $PSVersionTable.PSVersion.ToString(); operatingSystemVersion = [Environment]::OSVersion.Version.ToString() }
        sections = Protect-CollectorObject $Sections
    }
}

function Write-CollectorJsonFile {
    param([string]$Path, [string]$Json)
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($Json)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush()
    } finally { $stream.Dispose() }
    $null = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json -ErrorAction Stop
}

function Write-CollectorZipFile {
    param([string]$Path, [string[]]$Files)
    Add-Type -AssemblyName System.IO.Compression -ErrorAction Stop
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            foreach ($file in $Files) {
                $entry = $archive.CreateEntry([IO.Path]::GetFileName($file), [IO.Compression.CompressionLevel]::Optimal)
                $destination = $entry.Open()
                try {
                    $source = [IO.File]::Open($file, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
                    try { $source.CopyTo($destination) } finally { $source.Dispose() }
                } finally { $destination.Dispose() }
            }
        } finally { $archive.Dispose() }
    } finally { $stream.Dispose() }
}

function Export-CollectorReport {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)]$Report, [Parameter(Mandatory = $true)][string]$OutputDirectory)
    try {
        Initialize-CollectorNative
        $directory = [IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\', '/')
        $parent = [IO.Path]::GetDirectoryName($directory)
        if (-not [IO.Directory]::Exists($parent)) { throw 'OUTPUT_PARENT_MISSING' }
        if ([IO.File]::Exists($directory + '.zip') -or [IO.Directory]::Exists($directory + '.zip')) { throw 'OUTPUT_ZIP_ALREADY_EXISTS' }
        # Atomic create, unlike Directory.CreateDirectory (which silently reuses existing directories).
        [Fonesi.Phase00.NativeProbe]::ReserveDirectory($directory)
        $clean = Protect-CollectorObject $Report
        $jsonPath = Join-Path $directory 'host-environment.json'
        $summaryPath = Join-Path $directory 'README.txt'
        $manifestPath = Join-Path $directory 'manifest.json'
        Write-CollectorJsonFile -Path $jsonPath -Json ($clean | ConvertTo-Json -Depth 20)
        $summary = "FONESI-AUTO P0-01 READ-ONLY HOST PREFLIGHT`r`nRun: $($clean.runId)`r`nUTC: $($clean.collectedAtUtc)`r`nCollection: $($clean.status)`r`nSchema: $($clean.schemaVersion)`r`n`r`nPRIVATE REVIEW REQUIRED. Do not commit or upload this archive automatically.`r`nRedaction is best-effort; inspect JSON, README, errors, captured streams and ZIP entries before any sharing.`r`nNo host settings, SDK installations, device state or unrelated files were changed.`r`nPARTIAL means one or more probes are unavailable/failed/not run; it is not host acceptance.`r`n"
        $summaryStream = [IO.File]::Open($summaryPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $bytes = [Text.Encoding]::UTF8.GetBytes($summary); $summaryStream.Write($bytes, 0, $bytes.Length) } finally { $summaryStream.Dispose() }
        $manifest = [ordered]@{ schemaVersion = '1.0'; runId = $clean.runId; privacy = 'PRIVATE_REVIEW_REQUIRED'; files = @() }
        foreach ($file in @($jsonPath, $summaryPath)) {
            $manifest.files += [ordered]@{ name = [IO.Path]::GetFileName($file); sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256 -ErrorAction Stop).Hash; bytes = (Get-Item -LiteralPath $file -ErrorAction Stop).Length }
        }
        Write-CollectorJsonFile -Path $manifestPath -Json ($manifest | ConvertTo-Json -Depth 5)
        $files = @($jsonPath, $summaryPath, $manifestPath)
        Write-CollectorZipFile -Path ($directory + '.zip') -Files $files
        return [pscustomobject]@{ status = 'WRITTEN'; outputDirectory = $directory; zipPath = $directory + '.zip'; files = @('host-environment.json', 'README.txt', 'manifest.json') }
    } catch {
        # Leave bounded partial output for diagnosis; never remove pre-existing data or reuse it.
        throw ('COLLECTOR_EXPORT_FAILED:' + $_.Exception.GetType().Name + ':No existing evidence was overwritten; partial owned output may remain. Choose a new output directory.')
    }
}

function New-CollectorUnavailableSection {
    param([string]$Source, [string]$Reason)
    return [pscustomobject]@{ source = $Source; collectedAtUtc = [DateTime]::UtcNow.ToString('o'); availability = 'UNAVAILABLE'; reason = $Reason; data = $null; unit = 'not_applicable' }
}

function Get-CollectorHostReport {
    [CmdletBinding()]
    param(
        [switch]$IncludeOptionalFeatureQuery,
        [switch]$IncludeAccelerationCheck,
        [ValidateRange(100, 120000)][int]$TimeoutMilliseconds = 10000,
        [ValidateRange(100, 10000)][int]$CleanupMilliseconds = 2000,
        [ValidateRange(256, 1048576)][int]$MaxOutputCharacters = 65536
    )
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) {
        throw 'SUPPORTED_TARGET_IS_WINDOWS_POWERSHELL_5_1_ONLY'
    }
    $probeOptions = @{ TimeoutMilliseconds = $TimeoutMilliseconds; CleanupMilliseconds = $CleanupMilliseconds; MaxOutputCharacters = $MaxOutputCharacters }
    $sections = [ordered]@{}
    $sections.operatingSystem = Invoke-CollectorQuery 'CIM:Win32_OperatingSystem' {
        Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object Caption, Version, BuildNumber, OSArchitecture, LastBootUpTime
    }
    $sections.computerSystem = Invoke-CollectorQuery 'CIM:Win32_ComputerSystem' {
        Get-CimInstance Win32_ComputerSystem -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object Manufacturer, Model, SystemType, TotalPhysicalMemory, NumberOfLogicalProcessors, NumberOfProcessors, HypervisorPresent
    } 'TotalPhysicalMemory=bytes; processor counts=count'
    $sections.processors = Invoke-CollectorQuery 'CIM:Win32_Processor' {
        Get-CimInstance Win32_Processor -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, VirtualizationFirmwareEnabled, VMMonitorModeExtensions, SecondLevelAddressTranslationExtensions
    } 'MaxClockSpeed=MHz; core/logical counts=count; flags=boolean or null(unavailable)'
    $sections.physicalMemory = Invoke-CollectorQuery 'CIM:Win32_PhysicalMemory' {
        Get-CimInstance Win32_PhysicalMemory -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object Manufacturer, Capacity, Speed, ConfiguredClockSpeed, SMBIOSMemoryType
    } 'Capacity=bytes; Speed/ConfiguredClockSpeed=MHz (provider-reported)'
    $sections.videoControllers = Invoke-CollectorQuery 'CIM:Win32_VideoController' {
        # AdapterRAM is uint32 and cannot establish modern GPU VRAM capacity.
        Get-CimInstance Win32_VideoController -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object Name, DriverVersion, DriverDate, VideoProcessor, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate, Status
    } 'resolution=pixels; CurrentRefreshRate=Hz'
    $sections.gpuMemoryAndUtilization = New-CollectorUnavailableSection 'P0-06 telemetry gate' 'NOT_MEASURED:legacy AdapterRAM is not reliable VRAM capacity; no fabricated zero'
    $sections.physicalDisks = Invoke-CollectorQuery 'Storage:Get-PhysicalDisk' {
        Get-PhysicalDisk -ErrorAction Stop | Select-Object MediaType, BusType, Size, HealthStatus, OperationalStatus
    } 'Size=bytes'
    $sections.logicalDisks = Invoke-CollectorQuery 'CIM:Win32_LogicalDisk' {
        Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object FileSystem, Size, FreeSpace
    } 'Size/FreeSpace=bytes; volumes intentionally unnamed'
    $sections.networkAdapters = Invoke-CollectorQuery 'NetAdapter:Get-NetAdapter' {
        Get-NetAdapter -ErrorAction Stop | Select-Object InterfaceDescription, Status, LinkSpeed
    } 'LinkSpeed=provider display string; not measured throughput; no IP/MAC/adapter aliases'
    $sections.powerPlan = Get-CollectorCommandVersion 'powercfg.exe' @('/getactivescheme') @probeOptions
    if ($IncludeOptionalFeatureQuery) {
        $sections.virtualizationFeatures = Invoke-CollectorQuery 'DISM:Get-WindowsOptionalFeature -Online (read-only)' {
            Get-WindowsOptionalFeature -Online -ErrorAction Stop | Where-Object { $_.FeatureName -match 'Hyper-V|VirtualMachinePlatform|HypervisorPlatform' } | Select-Object FeatureName, State
        }
        $sections.hypervisorBootSetting = Get-CollectorCommandVersion 'bcdedit.exe' @('/enum', '{current}') @probeOptions
    } else {
        $sections.virtualizationFeatures = New-CollectorUnavailableSection 'DISM:Get-WindowsOptionalFeature -Online' 'NOT_RUN:explicit read-only elevated-query authorization required'
        $sections.hypervisorBootSetting = New-CollectorUnavailableSection 'bcdedit /enum {current}' 'NOT_RUN:explicit read-only elevated-query authorization required'
    }
    $sdkRoot = $env:ANDROID_HOME
    if (-not $sdkRoot) { $sdkRoot = $env:ANDROID_SDK_ROOT }
    if (-not $sdkRoot -and $env:LOCALAPPDATA) { $sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    $sections.androidSdk = Invoke-CollectorQuery 'SDK:explicit environment/default candidate paths only' {
        if (-not $sdkRoot) { throw 'SDK_ROOT_UNAVAILABLE' }
        [pscustomobject]@{
            sdkRoot = '[PATH_NOT_COLLECTED]'
            sdkManagerPresent = Test-Path -LiteralPath (Join-Path $sdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat') -PathType Leaf -ErrorAction Stop
            avdManagerPresent = Test-Path -LiteralPath (Join-Path $sdkRoot 'cmdline-tools\latest\bin\avdmanager.bat') -PathType Leaf -ErrorAction Stop
            emulatorPresent = Test-Path -LiteralPath (Join-Path $sdkRoot 'emulator\emulator.exe') -PathType Leaf -ErrorAction Stop
            adbPresent = Test-Path -LiteralPath (Join-Path $sdkRoot 'platform-tools\adb.exe') -PathType Leaf -ErrorAction Stop
            presenceIsExecutableOrSupported = $false
        }
    }
    $runtimes = [ordered]@{}
    foreach ($name in @('node', 'npm', 'python', 'git')) { $runtimes[$name] = Get-CollectorCommandVersion $name @probeOptions }
    $runtimes.java = Get-CollectorCommandVersion 'java' @('-version') @probeOptions
    $sections.runtimes = $runtimes
    $sections.adbVersion = Get-CollectorCommandVersion 'adb' @('version') @probeOptions
    $emulator = 'emulator'
    if ($sdkRoot -and (Test-Path -LiteralPath (Join-Path $sdkRoot 'emulator\emulator.exe') -PathType Leaf)) { $emulator = Join-Path $sdkRoot 'emulator\emulator.exe' }
    $sections.emulatorVersion = Get-CollectorCommandVersion $emulator @('-version') @probeOptions
    if ($IncludeAccelerationCheck) { $sections.accelerationCheck = Get-CollectorCommandVersion $emulator @('-accel-check') @probeOptions }
    else { $sections.accelerationCheck = New-CollectorUnavailableSection 'emulator -accel-check' 'NOT_RUN:explicit read-only acceleration-check authorization required' }
    $sections.virtualizationConclusion = New-CollectorUnavailableSection 'Manual HC-09/HC-13 reconciliation' 'PENDING_HOST_REVIEW:firmware flags, hypervisor/feature state and emulator backend must be reconciled; no automatic host acceptance'
    $report = New-CollectorReport -Sections $sections
    $report | Add-Member NoteProperty limits ([ordered]@{ probeTimeoutMs = $TimeoutMilliseconds; cleanupBudgetMs = $CleanupMilliseconds; maxCharactersPerStream = $MaxOutputCharacters; streamDecoding = 'UTF-8 replacement fallback; not lossless for OEM-encoded tools'; cimOperationTimeoutSeconds = 5 })
    return $report
}

Export-ModuleMember -Function Protect-CollectorText, Invoke-CollectorProcess, Resolve-CollectorCommand, Get-CollectorCommandVersion, Invoke-CollectorQuery, New-CollectorReport, Export-CollectorReport, Get-CollectorHostReport
