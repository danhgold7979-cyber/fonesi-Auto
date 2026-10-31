"""Fixed P1-08 evidence and bounded PNG publication; no private captures are published."""
import hashlib
import json
import re
import struct
import zlib
from pathlib import Path
from validate_runtime import exact_record, unique_pairs, reject, validate_process, VERSIONS
from validate_persistence import _admit_root, _read_owned, _write_new, validate_public_mode
MODES=('source','package','reference')
PAGES=('overview','accounts','tracking','setup','calendar','workflows')
THEMES=('light','dark')
MAIN_CASES=('realMain','originalKeyAuthenticated','sandboxAndIsolation','exactTabs','productionEmpty','allPagesBothThemes','modalCancel','modalEscape','focusRestored','dropdownKeyboard','dockResize','tileZoom','tableScroll','repeatedNavigation','themePersisted','orderlyQuit')
REFERENCE_CASES=('referenceHash','isolatedSession','sandboxAndIsolation','exactAssetPolicy','exactTabs','allPagesBothThemes','orderlyQuit')
FAILURES=('PREPARE_FAILED','PACKAGE_FAILED','CONTROL_FAILED','PREFLIGHT_FAILED','NATIVE_STAGE_FAILED','STAGE_VALIDATION_FAILED','SEQUENCE_VALIDATION_FAILED','SCREENSHOT_FAILED','CLEANUP_FAILED')
def cases(mode):
 if mode not in MODES:reject()
 return REFERENCE_CASES if mode=='reference' else MAIN_CASES+(('responsive',) if mode=='source' else ())
def specs(mode):
 cases(mode)
 pages=('overview','setup') if mode=='package' else PAGES
 values=[(f'ui-{mode}-{page}-{theme}.png',1440,900) for theme in THEMES for page in pages]
 if mode=='source':values += [(f'ui-source-overview-{theme}-{width}.png',width,768) for width in (880,600) for theme in THEMES]
 return values
def parse(raw):
 if type(raw) is not bytes or not 0<len(raw)<=65536:reject()
 return json.loads(raw.decode('utf8'),object_pairs_hook=unique_pairs,parse_constant=lambda _:reject())
def metadata(item,spec):
 exact_record(item,('name','width','height','bytes','sha256'))
 name,width,height=spec
 if item['name']!=name or type(item['width']) is not int or type(item['height']) is not int or (item['width'],item['height'])!=(width,height):reject()
 if type(item['bytes']) is not int or not 45<=item['bytes']<=4*1024*1024 or type(item['sha256']) is not str or re.fullmatch('[0-9a-f]{64}',item['sha256']) is None:reject()
def expected_stdout(mode):
 cases(mode)
 return ['UI_REFERENCE_CLOSED'] if mode=='reference' else ['BOOTSTRAP_READY','BOOTSTRAP_CLOSED','UI_CLOSED']
def validate_stage(raw,capture,mode):
 value=parse(raw);exact_record(value,('version','mode','versions','cases','pages','images'))
 if type(value['version']) is not int or value['version']!=1 or value['mode']!=mode:reject()
 exact_record(value['versions'],VERSIONS)
 if value['versions']!=VERSIONS:reject()
 exact_record(value['cases'],cases(mode));exact_record(value['pages'],tuple(f'{page}-{theme}' for theme in THEMES for page in PAGES))
 if any(type(v) is not bool for key in ('cases','pages') for v in value[key].values()):reject()
 expected=specs(mode)
 if type(value['images']) is not list or len(value['images'])!=len(expected):reject()
 for item,spec in zip(value['images'],expected):metadata(item,spec)
 exact_record(capture,('process','stdout','stderr'));normal=validate_process(capture['process'])
 for key in ('stdout','stderr'):
  if type(capture[key]) is not str or len(capture[key].encode('utf-16-le'))//2>32768:reject()
 lines=capture['stdout'].replace('\r\n','\n').split('\n')
 if lines and lines[-1]=='':lines.pop()
 if lines and lines[0]=='':lines.pop(0)
 if lines!=expected_stdout(mode):reject()
 if any(marker in capture['stderr'] for marker in ('UI_FAILED','UI_DEADLINE','UI_REFERENCE_FAILED','BOOTSTRAP_FAILED','BOOTSTRAP_CLEANUP_FAILED','PERSISTENCE_SHUTDOWN_FAILED')):reject()
 return {**value,'process':dict(capture['process']),'passed':normal and all(value['cases'].values()) and all(value['pages'].values())}
def validate_public(value,mode):
 exact_record(value,('version','mode','versions','cases','pages','images','process','passed'))
 if type(value['passed']) is not bool:reject()
 raw={key:value[key] for key in ('version','mode','versions','cases','pages','images')}
 rebuilt=validate_stage(json.dumps(raw).encode(),{'process':value['process'],'stdout':'\n'.join(expected_stdout(mode))+'\n','stderr':''},mode)
 if value['passed'] and not rebuilt['passed']:reject()
 return value['passed']
def screenshot(raw, expected_width, expected_height):
 if type(raw) is not bytes or not 45<=len(raw)<=4*1024*1024 or raw[:8]!=b'\x89PNG\r\n\x1a\n':reject()
 at=8;chunks=[];compressed=bytearray();width=height=channels=None
 while at<len(raw):
  if len(chunks)>=256 or at+12>len(raw):reject()
  size=struct.unpack('>I',raw[at:at+4])[0];kind=raw[at+4:at+8];end=at+12+size
  if end>len(raw) or kind not in (b'IHDR',b'IDAT',b'IEND',b'sRGB',b'gAMA',b'cHRM',b'pHYs'):reject()
  data=raw[at+8:at+8+size]
  if zlib.crc32(kind+data)&0xffffffff!=struct.unpack('>I',raw[end-4:end])[0]:reject()
  if not chunks and kind!=b'IHDR':reject()
  if kind==b'IHDR':
   if chunks or size!=13:reject()
   width,height,depth,color,compression,filter_method,interlace=struct.unpack('>IIBBBBB',data)
   if (width,height)!=(expected_width,expected_height) or depth!=8 or color not in (2,6) or (compression,filter_method,interlace)!=(0,0,0):reject()
   channels=3 if color==2 else 4
  elif kind==b'IDAT':
   if b'IDAT' in chunks and chunks[-1]!=b'IDAT':reject()
   compressed.extend(data)
  elif kind in (b'sRGB',b'gAMA',b'cHRM',b'pHYs'):
   if kind in chunks or b'IDAT' in chunks:reject()
   if kind==b'sRGB' and (size!=1 or data[0]>3):reject()
   if kind==b'gAMA' and (size!=4 or not 1<=struct.unpack('>I',data)[0]<=1000000):reject()
   if kind==b'cHRM':
    if size!=32:reject()
    values=struct.unpack('>8I',data)
    if any(x>100000 for x in values) or any(values[n]+values[n+1]>100000 for n in (0,2,4,6)):reject()
   if kind==b'pHYs' and (size!=9 or data[8]>1 or not all(1<=x<=1000000 for x in struct.unpack('>II',data[:8]))):reject()
  elif kind==b'IEND':
   if size or end!=len(raw):reject()
  chunks.append(kind);at=end
 if not chunks or chunks[-1]!=b'IEND' or not compressed or channels is None:reject()
 limit=(expected_width*channels+1)*expected_height
 decoder=zlib.decompressobj()
 try:pixels=decoder.decompress(bytes(compressed),limit+1)
 except zlib.error:reject()
 if len(pixels)!=limit or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:reject()
 if any(pixels[row*(expected_width*channels+1)]>4 for row in range(expected_height)):reject()
 return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'width':width,'height':height}
def validate_report(raw):
 value=parse(raw);exact_record(value,('version','scope','excludedVaultContext','bootstrap','modes','screenshots','runtimeCopyVerified','directoryCleanup','failure'))
 if type(value['version']) is not int or value['version']!=1 or value['scope']!='HOSTED_V9_UI_PARITY' or value['excludedVaultContext']!='P106_UNMET_NOT_RERUN':reject()
 if any(type(value[key]) is not bool for key in ('runtimeCopyVerified','directoryCleanup')):reject()
 if value['failure'] is not None and (type(value['failure']) is not str or value['failure'] not in FAILURES):reject()
 passed=value['failure'] is None and value['runtimeCopyVerified'] and value['directoryCleanup']
 for key,allowed in (('bootstrap',('source','package')),('modes',MODES)):
  if type(value[key]) is not dict or not set(value[key]).issubset(allowed):reject()
  if value['failure'] is None and set(value[key])!=set(allowed):reject()
 for mode,item in value['bootstrap'].items():passed=validate_public_mode(item,mode) and passed
 for mode,item in value['modes'].items():passed=validate_public(item,mode) and passed
 expected={name:(name,width,height) for mode in MODES for name,width,height in specs(mode)}
 if type(value['screenshots']) is not dict or not set(value['screenshots']).issubset(expected):reject()
 if value['failure'] is None and set(value['screenshots'])!=set(expected):reject()
 total=0
 for name,item in value['screenshots'].items():
  metadata(item,expected[name]);total+=item['bytes']
  mode=next(mode for mode in MODES if name.startswith('ui-'+mode+'-'))
  if mode not in value['modes'] or item not in value['modes'][mode]['images']:reject()
 if total>64*1024*1024:reject()
 for mode in MODES:
  for page in (('overview','setup') if mode=='package' else PAGES):
   a=f'ui-{mode}-{page}-light.png';b=f'ui-{mode}-{page}-dark.png'
   if a in value['screenshots'] and b in value['screenshots'] and value['screenshots'][a]['sha256']==value['screenshots'][b]['sha256']:reject()
 return {**value,'passed':passed}
def read_image(path,spec):
 import stat
 item=path.lstat()
 if path.resolve()!=path or not stat.S_ISREG(item.st_mode) or item.st_size>4*1024*1024:reject()
 with path.open('rb') as handle:raw=handle.read(4*1024*1024+1)
 return raw,{'name':spec[0],**screenshot(raw,spec[1],spec[2])}
def stage_files(root,mode):
 token=_admit_root(root)
 value=validate_stage(_read_owned(root,f'ui-{mode}.json'),parse(_read_owned(root,f'ui-capture-{mode}.json')),mode)
 if _admit_root(root)!=token:reject()
 _write_new(root,f'ui-public-{mode}.json',value)
 return value['passed']
def screenshot_files(root,mode):
 import os
 token=_admit_root(root);base=root.parent
 if not base.is_absolute() or base.resolve()!=base or base.name!='.ui-runtime':reject()
 public=parse(_read_owned(root,f'ui-public-{mode}.json'));validate_public(public,mode)
 total=0
 for candidate in MODES:
  admitted=parse(_read_owned(root,f'ui-public-{candidate}.json'));validate_public(admitted,candidate)
  total+=sum(item['bytes'] for item in admitted['images'])
 if total>64*1024*1024:reject()
 images=[]
 for spec,expected in zip(specs(mode),public['images']):
  raw,observed=read_image(root/spec[0],spec)
  if observed!=expected or _admit_root(root)!=token:reject()
  with (base/spec[0]).open('xb') as handle:handle.write(raw);handle.flush();os.fsync(handle.fileno())
  images.append(observed)
 _write_new(root,f'ui-screenshots-{mode}.json',{'images':images})
def publish(base):
 if not base.is_absolute() or base.resolve()!=base or not base.is_dir():reject()
 value=validate_report(_read_owned(base,'unvalidated.json'))
 for name,item in value['screenshots'].items():
  _,observed=read_image(base/name,(name,item['width'],item['height']))
  if observed!=item:reject()
 _write_new(base,'validated.json',value)
 return value['passed'],len(value['screenshots'])==32

def main():
 import sys
 try:
  if len(sys.argv)==4 and sys.argv[1]=='stage':
   passed=stage_files(Path(sys.argv[2]),sys.argv[3]);print('UI_VALIDATION_PASS' if passed else 'UI_VALIDATION_FAIL');return 0 if passed else 1
  if len(sys.argv)==4 and sys.argv[1]=='screenshots':
   screenshot_files(Path(sys.argv[2]),sys.argv[3]);print('UI_SCREENSHOTS_VERIFIED');return 0
  if len(sys.argv)!=2 or sys.argv[1]!='publish':reject()
  passed,bound=publish(Path(__file__).resolve().parents[1]/'.ui-runtime')
 except (OSError,ValueError,UnicodeError,RecursionError,TypeError,StopIteration):
  print('UI_VALIDATION_INVALID');return 2
 print('UI_VALIDATION_WRITTEN')
 if bound:print('UI_SCREENSHOTS_BOUND')
 print('UI_VALIDATION_PASS' if passed else 'UI_VALIDATION_FAIL');return 0 if passed else 1
if __name__=='__main__':raise SystemExit(main())
