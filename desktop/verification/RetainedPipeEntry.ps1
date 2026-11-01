# Verification-only fixed pipe startup fixture. No provider, assembly, profile or device operations.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
try {
 if($args.Count -ne 0){throw 'FIXTURE_ARGUMENT'}
 $marker=[IO.Path]::Combine($PSScriptRoot,'.owner')
 $attributes=[IO.File]::GetAttributes($marker);$item=[IO.FileInfo]::new($marker)
 if(($attributes -band [IO.FileAttributes]::Directory) -or ($attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -ne 36){throw 'FIXTURE_OWNER'}
 $owner=[IO.File]::ReadAllText($marker)
 if($owner -cnotmatch '\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z'){throw 'FIXTURE_OWNER'}
 # Independent entry witness occurs before touching any Console stream.
 $stream=[IO.File]::Open(([IO.Path]::Combine($PSScriptRoot,'entry.txt')),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$bytes=[Text.Encoding]::ASCII.GetBytes("RETAINED_PIPE_ENTRY_V1`n");$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 [Console]::Error.WriteLine('RETAINED_PIPE_ENTRY')
 $inputStream=[Console]::OpenStandardInput();$byte=$inputStream.ReadByte()
 if($byte -eq 81){[Console]::Error.WriteLine('RETAINED_PIPE_INPUT_Q')}
 elseif($byte -eq -1){[Console]::Error.WriteLine('RETAINED_PIPE_INPUT_EOF')}
 else{[Console]::Error.WriteLine('RETAINED_PIPE_INPUT_OTHER')}
 [Console]::Out.WriteLine('RETAINED_PIPE_RESPONSE');[Console]::Out.Flush()
 if($byte -ne -1 -and $inputStream.ReadByte() -ne -1){throw 'FIXTURE_EXTRA_INPUT'}
 exit 0
}catch{
 [Console]::Error.WriteLine('RETAINED_PIPE_FAILED')
 exit 1
}
