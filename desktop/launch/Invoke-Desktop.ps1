[CmdletBinding(DefaultParameterSetName='Existing')]
param(
    [Parameter(Mandatory=$true,ParameterSetName='Create')][string]$CreateUnder,
    [Parameter(Mandatory=$true,ParameterSetName='Existing')][string]$Root,
    [Parameter(Mandatory=$true,ParameterSetName='Store')][string]$Store,
    [string]$Maintenance = '',
    [Parameter(ParameterSetName='Existing')][Parameter(ParameterSetName='Store')][string]$RecoverRetainedLaunch = ''
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'launch-core.ps1')
Invoke-PersistenceLauncher -EntryMode 'SOURCE' -Selection $PSCmdlet.ParameterSetName -CreateUnder $CreateUnder -Root $Root -Store $Store -Maintenance $Maintenance -RecoverRetainedLaunch $RecoverRetainedLaunch
exit 0
