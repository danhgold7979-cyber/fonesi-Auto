Set-StrictMode -Version 2.0
function Get-TelemetrySpecs {
    param([ValidateSet('cpu','ram','capacity','disk','network','gpu')][string]$Group)
    switch ($Group) {
        cpu { return @(@{ id='cpu.total'; unit='percent'; path='\Processor(_Total)\% Processor Time'; suffix='\% processor time'; many=$false; percent=$true }) }
        ram { return @(@{ id='ram.available'; unit='bytes'; path='\Memory\Available Bytes'; suffix='\available bytes'; many=$false; percent=$false }) }
        capacity { return @(@{ id='ram.total'; unit='bytes'; path=$null; suffix=$null; many=$false; percent=$false }) }
        disk { return @(
            @{ id='disk.read'; unit='bytes_per_second'; path='\PhysicalDisk(_Total)\Disk Read Bytes/sec'; suffix='\disk read bytes/sec'; many=$false; percent=$false },
            @{ id='disk.write'; unit='bytes_per_second'; path='\PhysicalDisk(_Total)\Disk Write Bytes/sec'; suffix='\disk write bytes/sec'; many=$false; percent=$false }) }
        network { return @(
            @{ id='network.receive'; unit='bytes_per_second'; path='\Network Interface(*)\Bytes Received/sec'; suffix='\bytes received/sec'; many=$true; percent=$false },
            @{ id='network.send'; unit='bytes_per_second'; path='\Network Interface(*)\Bytes Sent/sec'; suffix='\bytes sent/sec'; many=$true; percent=$false }) }
        gpu { return @(@{ id='gpu.engineAvailability'; unit='count'; path='\GPU Engine(*)\Utilization Percentage'; suffix='\utilization percentage'; many=$true; percent=$true }) }
    }
}
function New-UnknownMetrics {
    param([string]$Group, [string]$Reason)
    return @(Get-TelemetrySpecs $Group | ForEach-Object {
        [pscustomobject][ordered]@{ sourceId=$_.id; unit=$_.unit; status='UNKNOWN'; reason=$Reason; samples=$null }
    })
}


function ConvertTo-TelemetrySamples {
    param([object[]]$Sets, [hashtable]$Spec, [DateTime]$ReadStart, [DateTime]$ReadEnd)
    if ($Sets.Count -ne 3) { throw 'INVALID_DATA' }
    $previous=@{}
    $baseline=@($Sets[0].CounterSamples | Where-Object {$_.Path.ToLowerInvariant().EndsWith($Spec.suffix)})
    if ($baseline.Count -lt 1 -or $baseline.Count -gt 64) { throw 'INVALID_DATA' }
    foreach ($counter in $baseline) {
        if ($counter.Timestamp -isnot [DateTime] -or $previous.ContainsKey($counter.Path)) { throw 'INVALID_DATA' }
        $previous[$counter.Path]=$counter.Timestamp.ToUniversalTime()
    }
    foreach ($set in $Sets[1..2]) {
        $counters=@($set.CounterSamples | Where-Object {$_.Path.ToLowerInvariant().EndsWith($Spec.suffix)})
        if ($counters.Count -ne $baseline.Count -or (-not $Spec.many -and $counters.Count -ne 1)) { throw 'INVALID_DATA' }
        $values=@(); $commonTime=$null; $seen=@{}
        foreach ($counter in $counters) {
            if ($counter.Timestamp -isnot [DateTime] -or -not $previous.ContainsKey($counter.Path) -or $seen.ContainsKey($counter.Path)) { throw 'INVALID_DATA' }
            $seen[$counter.Path]=$true
            $time=$counter.Timestamp.ToUniversalTime()
            if ($time -le $previous[$counter.Path] -or $time -lt $ReadStart -or $time -gt $ReadEnd) { throw 'INVALID_DATA' }
            $previous[$counter.Path]=$time
            # A metric record has one provider timestamp. Do not invent a batch time
            # when individual providers disagree; report UNKNOWN instead.
            if ($null -eq $commonTime) { $commonTime=$time } elseif ($commonTime -ne $time) { throw 'INVALID_DATA' }
            if ($null -eq $counter.CookedValue -or $counter.CookedValue -isnot [double]) { throw 'INVALID_DATA' }
            $value=[double]$counter.CookedValue
            if ($counter.Status -notin @(0,1) -or [double]::IsNaN($value) -or [double]::IsInfinity($value) -or $value -lt 0 -or $value -gt 9007199254740991 -or ($Spec.percent -and $value -gt 100)) { throw 'INVALID_DATA' }
            $values+=,$value
        }
        if ($Spec.id -eq 'gpu.engineAvailability') { $values=@([double]$values.Count) }
        [pscustomobject][ordered]@{ providerSampleUtc=$commonTime.ToString('o'); values=@($values | Sort-Object) }
    }
}
Export-ModuleMember -Function Get-TelemetrySpecs, New-UnknownMetrics, ConvertTo-TelemetrySamples
