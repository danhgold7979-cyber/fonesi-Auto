"""Validate bounded raw JSON without exporting plaintext, ciphertext or error text."""
import json
import sys
from pathlib import Path
BASE={'runtime','owned_profile','async_api','available','baseline','result_shape','no_renderer','orderly_quit'}
STAGES=('create','restart','tamper')
EXCLUDED=['missing_profile','corrupt_profile','os_key_revocation','cross_user','cross_machine','production_backup']
class Invalid(ValueError):pass
def require(value):
    if not value:raise Invalid('INVALID_EVIDENCE')
def pairs(items):
    out={}
    for k,v in items:require(k not in out);out[k]=v
    return out
def parse(data):
    require(type(data) is bytes and len(data)<=65536)
    return json.loads(data.decode('utf-8'),object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(Invalid()))
def keys(obj,expected):require(type(obj) is dict and set(obj)==set(expected))
def integer(value,low,high):require(type(value) is int and low<=value<=high)
def validate(data):
    obj=parse(data);keys(obj,('schemaVersion','scope','installer','stages','directoryCleanup','failure'))
    require(type(obj['schemaVersion']) is int and obj['schemaVersion']==1 and obj['scope']=='HOSTED_RUNNER_ONLY')
    require(obj['failure'] in (None,'RUNTIME_FAILED') and obj['directoryCleanup'] is True)
    ins=obj['installer'];keys(ins,('status','exitCode','cleanupComplete'))
    require(ins['status']=='SUCCESS' and type(ins['exitCode']) is int and ins['exitCode']==0 and ins['cleanupComplete'] is True)
    require(type(obj['stages']) is list and 1<=len(obj['stages'])<=3)
    results=[]
    for entry,stage in zip(obj['stages'],STAGES):
        keys(entry,('stage','status','exitCode','cleanupComplete','stdoutTruncated','payload','ownedBytes'))
        require(entry['stage']==stage and entry['cleanupComplete'] is True and entry['stdoutTruncated'] is False)
        integer(entry['exitCode'],0,1);integer(entry['ownedBytes'],0,4194304)
        require(type(entry['payload']) is str);r=parse(entry['payload'].encode('utf-8'))
        keys(r,('schemaVersion','stage','passed','electron','node','cases','rotationHints','failure'))
        require(type(r['schemaVersion']) is int and r['schemaVersion']==1 and r['stage']==stage and r['electron']=='45.1.0' and r['node']=='24.22.1')
        keys(r['cases'],BASE|({'tail_truncation','tail_bitflip'} if stage=='tamper' else set()))
        require(all(type(v) is bool for v in r['cases'].values()))
        require(type(r['rotationHints']) is list and len(r['rotationHints'])<=3 and all(type(v) is bool for v in r['rotationHints']))
        require(r['failure'] in (None,'PROBE_FAILED','UNAVAILABLE','UNKNOWN'))
        passed=r['failure'] is None and all(r['cases'].values()) and len(r['rotationHints'])==3
        require(type(r['passed']) is bool and r['passed']==passed)
        require(entry['exitCode']==(0 if passed else 1) and entry['status']==('SUCCESS' if passed else 'NONZERO_EXIT'))
        results.append({**r,'cleanupComplete':True,'ownedBytes':entry['ownedBytes']})
    passed=len(results)==3 and all(r['passed'] for r in results)
    require((passed and obj['failure'] is None) or (not passed and obj['failure']=='RUNTIME_FAILED' and not results[-1]['passed'] and all(r['passed'] for r in results[:-1])))
    return {'schemaVersion':1,'scope':'HOSTED_RUNNER_ONLY','passed':passed,'installer':ins,'directoryCleanup':True,'stages':results,'notTested':EXCLUDED}
def main():
    target=Path(__file__).parent/'.lab-results/validated.json'
    try:
        target.unlink(missing_ok=True)
        with (target.parent/'unvalidated.json').open('rb') as f:data=f.read(65537)
        result=validate(data)
        target.write_text(json.dumps(result,ensure_ascii=True,indent=2)+'\n',encoding='utf-8')
        print('SECRET_SCHEMA_VALID_PASS' if result['passed'] else 'SECRET_SCHEMA_VALID_PROBE_FAIL')
        return 0 if result['passed'] else 1
    except (ValueError,TypeError,KeyError,OSError,RecursionError,OverflowError):
        print('SECRET_INVALID_OR_INCOMPLETE_EVIDENCE');return 1
if __name__=='__main__':sys.exit(main())
