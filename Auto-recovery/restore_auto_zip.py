import hashlib,json,sys
from pathlib import Path
root=Path(__file__).resolve().parent
def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def local(name):
    if not isinstance(name,str) or not name or Path(name).name!=name or name in ('.','..') or '/' in name or '\\' in name or ':' in name:raise ValueError('Unsafe filename in manifest')
    return root/name
try:
    m=json.loads((root/'Auto-recovery-parts-manifest.json').read_text(encoding='utf-8'))
    if m.get('format')!='auto-split-zip-v1' or not m.get('parts'):raise ValueError('Invalid manifest')
    archive=m['archive'];dest=local(archive['name']);temp=local(archive['name']+'.rebuilding')
    if not dest.name.endswith('.zip'):raise ValueError('Expected a ZIP output filename')
    if dest.exists() or temp.exists():raise ValueError('Output already exists; move it aside before retrying')
    seen=set();size=0
    for i,p in enumerate(m['parts'],1):
        f=local(p['name'])
        if p['name']!=archive['name']+f'.{i:03d}' or p['name'] in seen:raise ValueError('Invalid part ordering')
        seen.add(p['name'])
        if not f.is_file() or f.is_symlink():raise ValueError('Missing part: '+p['name'])
        if f.stat().st_size!=p['bytes'] or digest(f)!=p['sha256']:raise ValueError('Part checksum failed: '+p['name'])
        size+=p['bytes']
    if size!=archive['bytes']:raise ValueError('Total length mismatch')
    h=hashlib.sha256()
    with temp.open('xb') as out:
        for p in m['parts']:
            with local(p['name']).open('rb') as f:
                while True:
                    b=f.read(1024*1024)
                    if not b:break
                    out.write(b);h.update(b)
    if h.hexdigest()!=archive['sha256'] or temp.stat().st_size!=archive['bytes']:raise ValueError('Rebuilt ZIP checksum failed; .rebuilding retained for inspection')
    if dest.exists():raise ValueError('Output appeared during reconstruction; .rebuilding retained')
    temp.rename(dest)
    print('PASS: '+dest.name)
    print('SHA-256: '+archive['sha256'])
    print('Extract this ZIP into a NEW empty folder. Read PACKAGE-README inside Auto.')
except Exception as e:
    print('ERROR: '+str(e),file=sys.stderr)
    sys.exit(1)
