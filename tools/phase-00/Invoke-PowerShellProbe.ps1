# Fixed call-operator trampoline, not a dynamic expression evaluator.
# Execution policy is inherited normally. No Bypass or policy-setting switch.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Payload)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
    $request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json -ErrorAction Stop
    if (-not [IO.Path]::IsPathRooted($request.path) -or [IO.Path]::GetExtension($request.path) -ine '.ps1') {
        throw 'INVALID_SCRIPT_PATH'
    }
    [string[]]$probeArguments = @($request.arguments | ForEach-Object { [string]$_ })
    $global:LASTEXITCODE = 0
    & ([string]$request.path) @probeArguments
    if (-not $?) { exit 1 }
    exit $global:LASTEXITCODE
} catch {
    # Do not serialize exception messages/InvocationInfo: they can contain secrets.
    [Console]::Error.WriteLine('POWERSHELL_PROBE_FAILED:' + $_.Exception.GetType().Name)
    exit 1
}
