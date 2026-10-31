"""Strict private native capture to fixed vault evidence. No plaintext/reference output."""
import json
import re
from validate_runtime import exact_record, unique_pairs, reject, validate_process, VERSIONS
STAGES=('create','replace','denied','delete','deleted')
CASES=('profileBeforeReady','leaseVerified','providerBound','operationVerified','referenceDenial','auditFlushed','auditCanonical','canaryAbsent','closed')

def parse(raw):
    if type(raw) is not bytes or not 0<len(raw)<=65536: reject()
    return json.loads(raw.decode('utf8'),object_pairs_hook=unique_pairs,parse_constant=lambda _:reject())

def validate_raw(raw,capture_raw,mode,stage,artifact_raw):
    if mode not in ('source','package') or stage not in STAGES: reject()
    value=parse(raw);capture=parse(capture_raw);artifacts=parse(artifact_raw)
    exact_record(artifacts,('version','mode','stage','canaryAbsent','fileCount','dumpCount'))
    if type(artifacts['version']) is not int or artifacts['version']!=1 or artifacts['mode']!=mode or artifacts['stage']!=stage or type(artifacts['canaryAbsent']) is not bool or type(artifacts['fileCount']) is not int or not 1<=artifacts['fileCount']<=768 or type(artifacts['dumpCount']) is not int or not 0<=artifacts['dumpCount']<=artifacts['fileCount']:reject()
    exact_record(value,('version','mode','stage','versions','cases','recordCount','accessDeniedCode'))
    exact_record(value['versions'],VERSIONS);exact_record(value['cases'],CASES)
    if type(value['version']) is not int or value['version']!=1 or value['mode']!=mode or value['stage']!=stage or value['versions']!=VERSIONS or any(type(value['cases'][k]) is not bool for k in CASES) or type(value['recordCount']) is not int or not 1<=value['recordCount']<=128: reject()
    if (stage=='denied' and (type(value['accessDeniedCode']) is not str or value['accessDeniedCode'] not in ('EACCES','EPERM','EBUSY'))) or (stage!='denied' and value['accessDeniedCode'] is not None):reject()
    exact_record(capture,('process','stdout','stderr'));process_ok=validate_process(capture['process'])
    for key in ('stdout','stderr'):
        if type(capture[key]) is not str or len(capture[key].encode('utf-16-le'))//2>32768: reject()
    lines=capture['stdout'].replace('\r\n','\n').split('\n')
    if lines and lines[-1]=='':lines.pop()
    if len(lines)==2 and lines[0]=='':lines.pop(0)
    if lines!=['VAULT_ORDERLY']:reject()
    canaries=('P106_SYNTHETIC_VAULT_INITIAL_CANARY','P106_SYNTHETIC_VAULT_REPLACED_CANARY')
    import base64
    for canary in canaries:
        if any(canary in capture[key] or base64.b64encode(canary.encode()).decode() in capture[key] for key in ('stdout','stderr')):reject()
    forbidden=any(x in ('VAULT_FAILED','VAULT_DEADLINE','VAULT_UNEXPECTED_QUIT') for x in capture['stderr'].splitlines())
    passed=process_ok and all(value['cases'].values()) and not forbidden and artifacts['canaryAbsent']
    return {**value,'artifacts':artifacts,'process':capture['process'],'passed':passed}

def validate_public(value,mode,stage):
    exact_record(value,('version','mode','stage','versions','cases','recordCount','accessDeniedCode','artifacts','process','passed'))
    raw={k:value[k] for k in ('version','mode','stage','versions','cases','recordCount','accessDeniedCode')}
    capture={'process':value['process'],'stdout':'VAULT_ORDERLY\n','stderr':''}
    derived=validate_raw(json.dumps(raw).encode(),json.dumps(capture).encode(),mode,stage,json.dumps(value['artifacts']).encode())
    if type(value['passed']) is not bool or (value['passed'] and not derived['passed']):reject()
    return value['passed']

def stage_files(root,mode,stage):
    from validate_persistence import _read_owned,_write_new
    if mode not in ('source','package') or stage not in STAGES:reject()
    token=_read_owned(root,'.owner')
    if re.fullmatch(rb'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',token) is None:reject()
    value=validate_raw(_read_owned(root,f'persistence-vault-result-{mode}-{stage}.json'),_read_owned(root,f'persistence-vault-capture-{mode}-{stage}.json'),mode,stage,_read_owned(root,f'persistence-vault-artifacts-{mode}-{stage}.json'))
    if _read_owned(root,'.owner')!=token:reject()
    _write_new(root,f'persistence-vault-public-{mode}-{stage}.json',value)
    return value['passed']

CONTEXT_CASES=('ownerBefore','distinctContext','foreignPositive','ownerBlobDenied','reverted','ownerAfter')
CONTEXT_STATUSES=('PASS','INVALID_INPUT','OWNER_CONTEXT_INVALID','OWNER_PROVIDER_UNAVAILABLE','TOKEN_UNAVAILABLE','IMPERSONATION_UNAVAILABLE','CONTROL_FAILED')
def validate_context(raw,capture_raw,mode):
    if mode not in ('source','package'):reject()
    value=parse(raw);capture=parse(capture_raw)
    exact_record(value,('version','status')+CONTEXT_CASES)
    if type(value['version']) is not int or value['version']!=1 or type(value['status']) is not str or value['status'] not in CONTEXT_STATUSES or any(type(value[k]) is not bool for k in CONTEXT_CASES):reject()
    exact_record(capture,('process','stdout','stderr'));process_ok=validate_process(capture['process'])
    for key in ('stdout','stderr'):
        if type(capture[key]) is not str or len(capture[key].encode('utf-16-le'))//2>32768:reject()
    if capture['stdout'].replace('\r\n','\n')!='VAULT_CONTEXT_RESULT\n' or capture['stderr']!='':reject()
    if value['status']=='PASS' and not all(value[k] for k in CONTEXT_CASES):reject()
    return {'version':1,'mode':mode,'status':value['status'],'cases':{k:value[k] for k in CONTEXT_CASES},'process':capture['process'],'passed':process_ok and value['status']=='PASS' and all(value[k] for k in CONTEXT_CASES)}

def validate_context_public(value,mode):
    exact_record(value,('version','mode','status','cases','process','passed'));exact_record(value['cases'],CONTEXT_CASES)
    if value['mode']!=mode:reject()
    rebuilt=validate_context(json.dumps({'version':value['version'],'status':value['status'],**value['cases']}).encode(),json.dumps({'process':value['process'],'stdout':'VAULT_CONTEXT_RESULT\n','stderr':''}).encode(),mode)
    if type(value['passed']) is not bool or value['passed']!=rebuilt['passed']:reject()
    return value['passed']

def context_files(root,mode):
    from validate_persistence import _read_owned,_write_new
    if mode not in ('source','package'):reject()
    token=_read_owned(root,'.owner')
    if re.fullmatch(rb'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',token) is None:reject()
    value=validate_context(_read_owned(root,f'persistence-vault-context-result-{mode}.json'),_read_owned(root,f'persistence-vault-context-capture-{mode}.json'),mode)
    if _read_owned(root,'.owner')!=token:reject()
    _write_new(root,f'persistence-vault-context-public-{mode}.json',value)
    print('VAULT_CONTEXT_STATUS_'+value['status'])
    return value['passed']

def main():
    import sys
    from pathlib import Path
    try:
        if len(sys.argv)!=4:reject()
        passed=context_files(Path(sys.argv[1]),sys.argv[2]) if sys.argv[3]=='context' else stage_files(Path(sys.argv[1]),sys.argv[2],sys.argv[3])
    except (ValueError,OSError,UnicodeError,RecursionError):
        print('VAULT_VALIDATION_INVALID');return 2
    print('VAULT_VALIDATION_PASS' if passed else 'VAULT_VALIDATION_FAIL');return 0 if passed else 1
if __name__=='__main__':raise SystemExit(main())
