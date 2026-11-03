# Pure fixed HostReceipt function tests. No custom assembly/tool/runtime is loaded.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$path=Join-Path $PSScriptRoot 'Invoke-VisionMaterialization.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if($errors.Count -ne 0){throw 'MATERIALIZER_PARSE_FAILED'}
$functions=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'HostReceipt'},$true))
if($functions.Count -ne 1){throw 'RECEIPT_FUNCTION_MISSING'}
. ([scriptblock]::Create($functions[0].Extent.Text))
$utf8=New-Object Text.UTF8Encoding($false,$true)
$sha='a'*64;$version='3.12.10'
$good=[ordered]@{version=1;scope='TRUSTED_HOST_STAGING_ONLY';stage='PREPARE';hostVersion=$version;hostExecutableSha256=$sha;hostIsolated=$true;hostSiteDisabled=$true;hostBytecodeDisabled=$true;hostTrust='EXISTING_HOSTED_CI_TOOLCHAIN';reportSha256=$sha;wheelCount=74;pythonFiles=3354;modelFiles=3;acquiredBytes=328203212;runtimeFiles=$null;runtimeBytes=$null;comparison=$null;candidateInference='NOT_RUN'}
$text=$good|ConvertTo-Json -Compress
HostReceipt ($utf8.GetBytes($text+"`n")) 'PREPARE' $version $sha|Out-Null
$count=1
function Refuse([byte[]]$raw){$refused=$false;try{HostReceipt $raw 'PREPARE' $version $sha|Out-Null}catch{$refused=$true};if(-not $refused){throw 'RECEIPT_NEGATIVE_ACCEPTED'};$script:count++}
Refuse ($utf8.GetBytes($text.Replace('"version":1','"version":1,"version":1')))
Refuse ($utf8.GetBytes($text.Replace('"version":1','"version":"1"')))
Refuse ($utf8.GetBytes($text.Replace('"hostIsolated":true','"hostIsolated":"True"')))
Refuse ($utf8.GetBytes($text.Replace('"wheelCount":74','"wheelCount":"74"')))
Refuse ($utf8.GetBytes($text.Replace('"wheelCount":74','"wheelCount":73')))
Refuse ($utf8.GetBytes($text.Replace('"version":1','"version":1.0')))
Refuse ($utf8.GetBytes($text.Replace('"stage":"PREPARE"','"stage":"FREEZE"')))
Refuse ([byte[]](239,187,191)+$utf8.GetBytes($text))
Refuse ([byte[]](255)+$utf8.GetBytes($text))
Refuse ($utf8.GetBytes($text+'x'))
$good.stage='FREEZE';$good.wheelCount=$null;$good.pythonFiles=$null;$good.modelFiles=$null;$good.acquiredBytes=$null;$good.runtimeFiles=20000;$good.runtimeBytes=2000000000;$good.comparison='NOT_REQUESTED'
HostReceipt ($utf8.GetBytes(($good|ConvertTo-Json -Compress)+"`r`n")) 'FREEZE' $version $sha|Out-Null
$count++
if($count -ne 12){throw 'TRANSPORT_CASE_COUNT'}
Write-Output 'VISION_MATERIALIZER_TRANSPORT_12_PASS'
