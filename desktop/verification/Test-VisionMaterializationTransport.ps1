# Pure fixed HostReceipt function tests. No custom assembly/tool/runtime is loaded.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$path=Join-Path $PSScriptRoot 'Invoke-VisionMaterialization.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if($errors.Count -ne 0){throw 'MATERIALIZER_PARSE_FAILED'}
foreach($name in @('HostReceipt','HashBytes','ReadHeldInventory','ClosedMetadata','MetadataInteger','MetadataHash','MetadataSchema','EvidencePayload')){
 $functions=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true))
 if($functions.Count -ne 1){throw 'PURE_FUNCTION_MISSING'}
 . ([scriptblock]::Create($functions[0].Extent.Text))
}
$utf8=New-Object Text.UTF8Encoding($false,$true)
$sha='a'*64;$version='3.12.10'
$good=[ordered]@{version=1;scope='TRUSTED_HOST_STAGING_ONLY';stage='PREPARE';hostVersion=$version;hostExecutableSha256=$sha;hostIsolated=$true;hostSiteDisabled=$true;hostBytecodeDisabled=$true;hostTrust='EXISTING_HOSTED_CI_TOOLCHAIN';reportSha256=$sha;wheelCount=74;pythonFiles=3354;modelFiles=3;acquiredBytes=328203212;runtimeFiles=$null;runtimeBytes=$null;inventoryBytes=$null;expectedInventorySha256=$null;comparison=$null;candidateInference='NOT_RUN'}
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
$good.stage='FREEZE';$good.wheelCount=$null;$good.pythonFiles=$null;$good.modelFiles=$null;$good.acquiredBytes=$null;$good.runtimeFiles=20000;$good.runtimeBytes=2000000000;$good.inventoryBytes=3057892;$good.expectedInventorySha256=$sha;$good.comparison='MATCH'
HostReceipt ($utf8.GetBytes(($good|ConvertTo-Json -Compress)+"`r`n")) 'FREEZE' $version $sha|Out-Null
$count++
if($count -ne 12){throw 'TRANSPORT_CASE_COUNT'}
Write-Output 'VISION_MATERIALIZER_TRANSPORT_12_PASS'

# Metadata construction tests only: memory streams, no native exporter/filesystem.
$script:evidenceCount=0
function EvidenceCase([scriptblock]$body){& $body;$script:evidenceCount++}
function EvidenceRefuse([scriptblock]$body){$refused=$false;try{& $body|Out-Null}catch{$refused=$true};if(-not $refused){throw 'EVIDENCE_NEGATIVE_ACCEPTED'};$script:evidenceCount++}
function GoodReport(){
 $stages=@();foreach($observation in @('TERMINAL','FINAL_RECONCILIATION')){foreach($profile in @('Prepare','Bundle','CreatePreprocess','CreateOcr','InstallPreprocess','InstallOcr','Freeze')){$stages+=@([ordered]@{profile=$profile;observation=$observation;result=[ordered]@{status='SUCCESS';retired=$true;exitCode=0;stdoutBytes=0;stderrBytes=0;stdoutOverflow=$false;stderrOverflow=$false;elapsedMilliseconds=1}})}}
 return [ordered]@{version=1;scope='WINDOWS_MATERIALIZATION_ONLY';hostTrust='EXISTING_HOSTED_CI_TOOLCHAIN';compiled=$true;sourceOwnerSha256=$sha;compiledOwnerSha256=$sha;compilerExecutableSha256=$sha;hostVersion='3.12.10';hostExecutableSha256=$sha;hostPathPolicy='OBSERVED_CANONICAL_RUNNER_TOOL_CACHE';hostPrerequisites=@(@{name='VCOMP140.DLL';state='MISSING';sha256=$null},@{name='MFPlat.DLL';state='MISSING';sha256=$null},@{name='MF.dll';state='MISSING';sha256=$null},@{name='MFReadWrite.dll';state='MISSING';sha256=$null});hostPrerequisitesScope='STATIC_ONLY_NOT_RUNTIME_ADMISSION';runtimeFiles=3354;runtimeBytes=152074886;stages=$stages;installedInventorySha256=(HashBytes $inventory);expectedInventorySha256=(HashBytes $inventory);inventoryBytes=$inventory.Length;reproductionDisposition='MATCH';indexHandoff=$true;retired=$true;sourceUnchanged=$true;passed=$true;candidateInference='NOT_RUN';failure=$null;failureStage=$null;hostDiagnostic=$null}
}
$inventory=$utf8.GetBytes('{}')
EvidenceCase {$r=GoodReport;$p=EvidencePayload $r $inventory;if($p.inventory.Length -ne 2 -or $p.report.Length -gt 65536){throw 'EVIDENCE_POSITIVE'}}
EvidenceCase {$r=GoodReport;$r.passed=$false;$r.failure='MATERIALIZATION_UNAVAILABLE';$r.stages=@();$p=EvidencePayload $r $inventory;if($null -ne $p.inventory){throw 'FAILURE_INVENTORY_EXPOSED'}}
EvidenceCase {$r=GoodReport;$r.passed=$false;$r.retired=$false;$r.failure='MATERIALIZATION_UNAVAILABLE';$r.stages=@();$p=EvidencePayload $r $null;if(($utf8.GetString($p.report)|ConvertFrom-Json).retired){throw 'UNKNOWN_RETIREMENT_LOST'}}
EvidenceRefuse {$r=GoodReport;$r.retired=$false;EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.sourceUnchanged=$false;EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.stages=$r.stages[1..13];EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.stages[1].profile='Prepare';EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.stages[0].result.status='UNAVAILABLE';EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.stages[7].result.retired=$false;EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.stages[0].result.stdoutOverflow=$true;EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;EvidencePayload $r ($utf8.GetBytes('[]'))}
EvidenceRefuse {$r=GoodReport;EvidencePayload $r $null}
EvidenceRefuse {$r=GoodReport;$r.Add('rawEnvironment','forbidden');EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.hostDiagnostic='x'*65536;EvidencePayload $r $inventory}
EvidenceCase {$stream=New-Object IO.MemoryStream(,$inventory);try{$bytes=ReadHeldInventory $stream (HashBytes $inventory);if($bytes.Length -ne 2){throw 'CAPTURE_POSITIVE'}}finally{$stream.Dispose()}}
EvidenceRefuse {$stream=New-Object IO.MemoryStream(,$inventory);try{ReadHeldInventory $stream ('b'*64)}finally{$stream.Dispose()}}
EvidenceRefuse {$stream=New-Object IO.MemoryStream(,[byte[]](1));try{ReadHeldInventory $stream (HashBytes ([byte[]](1)))}finally{$stream.Dispose()}}
EvidenceRefuse {$r=GoodReport;$r.stages[0].observation='UNKNOWN';EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.passed=$false;$r.hostTrust='D:\private';EvidencePayload $r $null}
EvidenceRefuse {$r=GoodReport;$r.passed=$false;$r.hostDiagnostic=@{stage='PREPARE';type='ValueError';path='D:\private'};EvidencePayload $r $null}
EvidenceRefuse {$r=GoodReport;$r.passed=$false;$r.stages[0].result.Add('rawOutput','private');EvidencePayload $r $null}
EvidenceRefuse {$r=GoodReport;$r.passed=$false;$r.hostPrerequisites=@(@{name='D:\private';state='MISSING';sha256=$null});EvidencePayload $r $null}
EvidenceRefuse {$r=GoodReport;$r.passed=$false;$r.version='1';EvidencePayload $r $null}
EvidenceRefuse {$r=GoodReport;$r.passed=$false;$r.stages[0].result.exitCode=$true;EvidencePayload $r $null}
EvidenceRefuse {$r=GoodReport;$r.passed=$false;$r.sourceOwnerSha256='D:\private';EvidencePayload $r $null}
EvidenceRefuse {$r=GoodReport;$r.passed=$false;$r.failure='raw exception';EvidencePayload $r $null}
EvidenceRefuse {$r=GoodReport;$r.passed=$false;$r.stages[0].result.stdoutBytes=65537;EvidencePayload $r $null}
# A complete mismatch is diagnostic metadata, never a successful handoff.
function MismatchReport(){
 $r=GoodReport;$r.passed=$false;$r.indexHandoff=$false;$r.reproductionDisposition='OBSERVED_MISMATCH_NOT_ADMITTED';$r.expectedInventorySha256='b'*64;$r.failure='REPRODUCTION_MISMATCH';$r.failureStage='REPRODUCTION';return $r
}
EvidenceCase {$r=MismatchReport;$p=EvidencePayload $r $inventory;if($p.inventory.Length -ne $inventory.Length -or ($utf8.GetString($p.report)|ConvertFrom-Json).passed){throw 'MISMATCH_LOST'}}
EvidenceRefuse {$r=MismatchReport;$r.indexHandoff=$true;EvidencePayload $r $inventory}
EvidenceRefuse {$r=MismatchReport;$r.retired=$false;EvidencePayload $r $inventory}
EvidenceRefuse {$r=MismatchReport;$r.stages=@();EvidencePayload $r $inventory}
EvidenceRefuse {$r=MismatchReport;$r.failure='MATERIALIZATION_UNAVAILABLE';EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.indexHandoff=$false;EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.expectedInventorySha256='b'*64;EvidencePayload $r $inventory}
EvidenceRefuse {$r=GoodReport;$r.inventoryBytes=3;EvidencePayload $r $inventory}
EvidenceRefuse {$r=MismatchReport;EvidencePayload $r $null}
if($evidenceCount -ne 36){throw 'EVIDENCE_CASE_COUNT'}
Write-Output 'VISION_MATERIALIZER_EVIDENCE_36_PASS'
