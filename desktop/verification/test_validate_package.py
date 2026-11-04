import copy
import json
import unittest
from validate_package import STAGES,CASES,NEGATIVES,VERSIONS,expected,validate_stage,validate_stage_public,validate_negatives,validate_negative_public,validate_report

def process(stage=None):
 status,exit_code,_=expected(stage) if stage else ('SUCCESS',0,'')
 return {'status':status,'exitCode':exit_code,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False}
def stage(name):
 raw={'version':1,'stage':name,'versions':VERSIONS,'cases':dict.fromkeys(CASES[name],True)}
 cap={'process':process(name),'stdout':expected(name)[2]+'\n','stderr':''}
 return raw,cap
def negatives():
 return {'version':1,'cases':dict.fromkeys(NEGATIVES,True)},{'process':process(),'stdout':'PACKAGE_NEGATIVES_VERIFIED\n','stderr':''}
def report():
 raw,cap=negatives()
 return {'version':1,'scope':'HOSTED_INTERNAL_PRODUCTION_PACKAGE','excludedVaultContext':'P106_UNMET_NOT_RERUN','sourceHead':'a'*40,'sourceTree':'b'*40,'package':{'sha256':'c'*64,'bytes':1234,'fileCount':90,'node':'24.22.1','electron':'45.1.0'},'stages':{name:validate_stage(json.dumps(stage(name)[0]).encode(),stage(name)[1],name) for name in STAGES},'negatives':validate_negatives(json.dumps(raw).encode(),cap),'relocatedCopyVerified':True,'originalPackageUnchanged':True,'dataOutsidePackage':True,'directoryCleanup':True,'failure':None}
class PackageTests(unittest.TestCase):
 def test_all_ten_stages_exact_expected_success_and_real_denial(self):
  for name in STAGES:
   raw,cap=stage(name);self.assertTrue(validate_stage(json.dumps(raw).encode(),cap,name)['passed'])
   for key in CASES[name]:
    bad=copy.deepcopy(raw);bad['cases'][key]=False;self.assertFalse(validate_stage(json.dumps(bad).encode(),cap,name)['passed'])
 def test_wrong_exit_or_retirement_never_passes(self):
  for name in STAGES:
   raw,cap=stage(name)
   for patch in ({'cleanupComplete':False},{'stdoutTruncated':True},{'stderrTruncated':True},{'status':'TIMEOUT','exitCode':None}):
    bad=copy.deepcopy(cap);bad['process'].update(patch);self.assertFalse(validate_stage(json.dumps(raw).encode(),bad,name)['passed'])
 def test_duplicate_unknown_case_bool_alias_and_private_fields_reject(self):
  raw,cap=stage(STAGES[0])
  for data in (json.dumps(raw).replace('"version": 1','"version":0,"version":1').encode(),json.dumps({**raw,'version':True}).encode(),json.dumps({**raw,'privatePath':'private'}).encode()):
   with self.assertRaises(ValueError):validate_stage(data,cap,STAGES[0])
  bad=copy.deepcopy(raw);bad['cases'][next(iter(bad['cases']))]=1
  with self.assertRaises(ValueError):validate_stage(json.dumps(bad).encode(),cap,STAGES[0])
 def test_marker_framing_and_public_false_claims_reject(self):
  raw,cap=stage(STAGES[0])
  for text in ('WRONG\n',cap['stdout']+'\n','\n\n'+cap['stdout']):
   with self.assertRaises(ValueError):validate_stage(json.dumps(raw).encode(),{**cap,'stdout':text},STAGES[0])
  value=validate_stage(json.dumps(raw).encode(),cap,STAGES[0]);value['cases'][next(iter(value['cases']))]=False
  with self.assertRaises(ValueError):validate_stage_public(value,STAGES[0])
 def test_every_negative_required_no_forged_pass(self):
  raw,cap=negatives();self.assertTrue(validate_negatives(json.dumps(raw).encode(),cap)['passed'])
  for key in NEGATIVES:
   bad=copy.deepcopy(raw);bad['cases'][key]=False;value=validate_negatives(json.dumps(bad).encode(),cap);self.assertFalse(value['passed']);value['passed']=True
   with self.assertRaises(ValueError):validate_negative_public(value)
 def test_complete_report_and_every_global_gate(self):
  value=report();self.assertTrue(validate_report(json.dumps(value).encode())['passed'])
  for key in ('relocatedCopyVerified','originalPackageUnchanged','dataOutsidePackage','directoryCleanup'):
   bad=copy.deepcopy(value);bad[key]=False;self.assertFalse(validate_report(json.dumps(bad).encode())['passed'])
  bad=copy.deepcopy(value);bad['stages'].pop(STAGES[-1])
  with self.assertRaises(ValueError):validate_report(json.dumps(bad).encode())
 def test_partial_failure_is_truthful_and_no_package_promotion(self):
  value=report();value.update(package=None,stages={},negatives=None,failure='BUILD_FAILED',directoryCleanup=False);self.assertFalse(validate_report(json.dumps(value).encode())['passed'])
  value['failure']=None
  with self.assertRaises(ValueError):validate_report(json.dumps(value).encode())
 def test_package_hash_bytes_count_and_excluded_identity_are_exact(self):
  for patch in ({'sha256':'x'*64},{'bytes':0},{'bytes':640*1024*1024+1},{'fileCount':513},{'fileCount':True},{'node':'24.0.0'}):
   value=validate_report(json.dumps(report()).encode());value['package'].update(patch)
   with self.assertRaises(ValueError):validate_report(json.dumps(value).encode())
  value=report();value['excludedVaultContext']='PASS'
  with self.assertRaises(ValueError):validate_report(json.dumps(value).encode())

class PackagePublicationTests(unittest.TestCase):
 def fixture(self,root):
  from pathlib import Path
  import hashlib
  build=root/'build';build.mkdir();container=build/'Fonesi-Auto-owned';container.mkdir();payload=container/'package';payload.mkdir();(payload/'provenance').mkdir()
  raw=b'{"entries":[]}';(payload/'provenance'/'runtime-manifest.json').write_bytes(raw)
  manifest={'sourceHead':'a'*40,'sourceTree':'b'*40,'mode':'INTERNAL_PRODUCTION','files':[{'path':'provenance/runtime-manifest.json','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}]}
  (payload/'package-manifest.json').write_text(json.dumps(manifest));archive=container/'Fonesi-Auto.zip'
  import zipfile
  with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_STORED) as zipped:
   zipped.writestr('provenance/',b'');zipped.write(payload/'provenance'/'runtime-manifest.json','provenance/runtime-manifest.json');zipped.write(payload/'package-manifest.json','package-manifest.json')
  digest=hashlib.sha256(archive.read_bytes()).hexdigest()
  candidate=build/'candidate.json';candidate.write_text(json.dumps({'directory':str(payload),'zip':str(archive),'sha256':digest,'bytes':archive.stat().st_size}))
  value=validate_report(json.dumps(report()).encode());value['package'].update(sha256=digest,bytes=archive.stat().st_size,fileCount=1);base=root/'public';base.mkdir()
  return base,value,candidate,payload,archive
 def test_exclusive_bound_promotion_and_changed_archive_rejection(self):
  import tempfile
  from pathlib import Path
  from validate_package import bind_bundle
  with tempfile.TemporaryDirectory() as name:
   base,value,candidate,payload,archive=self.fixture(Path(name).resolve())
   failed=copy.deepcopy(value);failed['passed']=False
   with self.assertRaises(ValueError):bind_bundle(base,failed,candidate)
   self.assertFalse((base/'Fonesi-Auto.zip').exists())
   self.assertTrue(bind_bundle(base,value,candidate));self.assertEqual((base/'Fonesi-Auto.zip').read_bytes(),archive.read_bytes())
   with self.assertRaises(ValueError):bind_bundle(base,value,candidate)
  with tempfile.TemporaryDirectory() as name:
   base,value,candidate,payload,archive=self.fixture(Path(name).resolve());archive.write_bytes(b'changed')
   with self.assertRaises(ValueError):bind_bundle(base,value,candidate)
   self.assertFalse((base/'Fonesi-Auto.zip').exists())
 def test_payload_missing_extra_directory_and_changed_bytes_block_promotion(self):
  import tempfile
  from pathlib import Path
  from validate_package import bind_bundle
  for change in ('missing','extra','bytes'):
   with tempfile.TemporaryDirectory() as name:
    base,value,candidate,payload,archive=self.fixture(Path(name).resolve())
    if change=='missing':(payload/'provenance'/'runtime-manifest.json').unlink()
    elif change=='extra':(payload/'unexpected').mkdir()
    else:(payload/'provenance'/'runtime-manifest.json').write_bytes(b'changed')
    with self.assertRaises((ValueError,OSError)):bind_bundle(base,value,candidate)
    self.assertFalse((base/'Fonesi-Auto.zip').exists())
 def test_zip_content_must_match_payload_even_with_consistent_new_zip_digest(self):
  import tempfile,hashlib,zipfile
  from pathlib import Path
  from validate_package import bind_bundle
  with tempfile.TemporaryDirectory() as name:
   base,value,candidate,payload,archive=self.fixture(Path(name).resolve())
   archive.unlink()
   with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_STORED) as zipped:
    zipped.writestr('provenance/',b'');zipped.writestr('provenance/runtime-manifest.json',b'not the verified payload');zipped.write(payload/'package-manifest.json','package-manifest.json')
   digest=hashlib.sha256(archive.read_bytes()).hexdigest();value['package'].update(sha256=digest,bytes=archive.stat().st_size)
   metadata=json.loads(candidate.read_text());metadata.update(sha256=digest,bytes=archive.stat().st_size);candidate.write_text(json.dumps(metadata))
   with self.assertRaises(ValueError):bind_bundle(base,value,candidate)
   self.assertFalse((base/'Fonesi-Auto.zip').exists())

 def test_oversize_central_directory_rejects_before_zip_parser_allocation(self):
  import tempfile,hashlib,struct
  from pathlib import Path
  from unittest.mock import patch
  from validate_package import bind_bundle
  with tempfile.TemporaryDirectory() as name:
   base,value,candidate,payload,archive=self.fixture(Path(name).resolve())
   data=bytearray(archive.read_bytes());struct.pack_into('<L',data,len(data)-22+12,700000);archive.write_bytes(data)
   digest=hashlib.sha256(data).hexdigest();value['package'].update(sha256=digest,bytes=len(data))
   metadata=json.loads(candidate.read_text());metadata.update(sha256=digest,bytes=len(data));candidate.write_text(json.dumps(metadata))
   with patch('validate_package.zipfile.ZipFile') as parser:
    with self.assertRaises(ValueError):bind_bundle(base,value,candidate)
    parser.assert_not_called()
   self.assertFalse((base/'Fonesi-Auto.zip').exists())

 def test_owned_store_zip_extraction_is_exclusive_and_byte_identical(self):
  import tempfile
  from pathlib import Path
  from validate_package import extract_bundle
  with tempfile.TemporaryDirectory() as name:
   base,value,candidate,payload,archive=self.fixture(Path(name).resolve())
   run=base/'run';run.mkdir();(run/'.owner').write_text('12345678-1234-4234-8234-123456789abc')
   self.assertTrue(extract_bundle(run,candidate))
   for filename in ('package-manifest.json','provenance/runtime-manifest.json'):
    self.assertEqual((run/'relocated-package'/filename).read_bytes(),(payload/filename).read_bytes())
   with self.assertRaises(FileExistsError):extract_bundle(run,candidate)
   self.assertEqual((run/'relocated-package'/'package-manifest.json').read_bytes(),(payload/'package-manifest.json').read_bytes())
 def test_extractor_rejects_unsafe_member_names_before_destination_creation(self):
  import tempfile
  from pathlib import Path
  from validate_package import extract_bundle,safe_member_name
  for name in ('../outside','/absolute','a\\b','CON','x/COM1.txt','a:stream','a.','a//b','a/'*17+'b'):
   with self.assertRaises(ValueError):safe_member_name(name)
  with tempfile.TemporaryDirectory() as name:
   base,value,candidate,payload,archive=self.fixture(Path(name).resolve())
   run=base/'run';run.mkdir();(run/'.owner').write_text('12345678-1234-4234-8234-123456789abc')
   manifest=json.loads((payload/'package-manifest.json').read_text());manifest['files'][0]['path']='../outside';(payload/'package-manifest.json').write_text(json.dumps(manifest))
   with self.assertRaises(ValueError):extract_bundle(run,candidate)
   self.assertFalse((run/'relocated-package').exists())

 def test_unsupported_zip_flags_reject_with_fixed_cli_failure(self):
  import tempfile,hashlib,struct,io
  from pathlib import Path
  from unittest.mock import patch
  from contextlib import redirect_stdout
  from validate_package import bind_bundle,main
  with tempfile.TemporaryDirectory() as name:
   base,value,candidate,payload,archive=self.fixture(Path(name).resolve())
   data=bytearray(archive.read_bytes());central=struct.unpack_from('<L',data,len(data)-22+16)[0];struct.pack_into('<H',data,central+8,32);archive.write_bytes(data)
   digest=hashlib.sha256(data).hexdigest();value['package'].update(sha256=digest,bytes=len(data));metadata=json.loads(candidate.read_text());metadata.update(sha256=digest,bytes=len(data));candidate.write_text(json.dumps(metadata))
   with self.assertRaises(ValueError) as failure:bind_bundle(base,value,candidate)
   output=io.StringIO()
   with patch('sys.argv',['validate_package.py','extract',str(base)]),patch('validate_package.extract_bundle',side_effect=failure.exception),redirect_stdout(output):
    self.assertEqual(main(),1)
   self.assertEqual(output.getvalue(),'PACKAGE_VALIDATION_FAILED\n');self.assertFalse((base/'Fonesi-Auto.zip').exists())

if __name__=='__main__':unittest.main()
