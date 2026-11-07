@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop'; try { $m=Get-Content -LiteralPath 'Auto-recovery-parts-manifest.json' -Raw | ConvertFrom-Json; if($m.format -ne 'auto-split-zip-v1' -or $m.parts.Count -lt 1){throw 'Invalid manifest'}; $name=[string]$m.archive.name; if([IO.Path]::GetFileName($name) -ne $name -or $name.Contains(':') -or -not $name.EndsWith('.zip')){throw 'Unsafe output filename'}; $dst=Join-Path (Get-Location) $name; $tmp=$dst+'.rebuilding'; if((Test-Path -LiteralPath $dst) -or (Test-Path -LiteralPath $tmp)){throw 'Output already exists; move it aside before retrying'}; $n=0; [long]$total=0; foreach($p in $m.parts){$n++; $expected=$name+'.'+$n.ToString('000'); if($p.name -ne $expected){throw 'Invalid part order'}; $f=Get-Item -LiteralPath $p.name; if($f.Length -ne $p.bytes -or (Get-FileHash -LiteralPath $p.name -Algorithm SHA256).Hash -ne $p.sha256){throw ('Part checksum failed: '+$p.name)}; $total+=$p.bytes}; if($total -ne $m.archive.bytes){throw 'Total length mismatch'}; $o=[IO.File]::Open($tmp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write); try {foreach($p in $m.parts){$i=[IO.File]::OpenRead((Join-Path (Get-Location) $p.name)); try {$i.CopyTo($o)} finally {$i.Dispose()}}} finally {$o.Dispose()}; if((Get-Item -LiteralPath $tmp).Length -ne $m.archive.bytes -or (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash -ne $m.archive.sha256){throw 'Rebuilt ZIP checksum failed; .rebuilding retained'}; Move-Item -LiteralPath $tmp -Destination $dst; Write-Host ('PASS: '+$name); Write-Host ('SHA-256: '+$m.archive.sha256); exit 0 } catch {Write-Host ('ERROR: '+$_.Exception.Message); exit 1}"
if errorlevel 1 (
 echo Reconstruction failed. No existing archive was overwritten.
 pause
 exit /b 1
)
echo Extract the verified ZIP into a NEW empty folder.
pause
