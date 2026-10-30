"""Strict raw evidence gate; no row data, paths or raw error text accepted."""
import json
import sys
from pathlib import Path
CASES = {'runtime','module','engine','parameters','bigint','constraints','rollback','commit','wal_reopen','contention','extensions','finalization','no_renderer'}
class Invalid(ValueError): pass
def require(value):
    if not value: raise Invalid('INVALID_EVIDENCE')
def pairs(items):
    out = {}
    for key, value in items:
        require(key not in out); out[key] = value
    return out
def parse(data):
    require(isinstance(data, bytes) and len(data) <= 65536)
    return json.loads(data.decode('utf-8'),object_pairs_hook=pairs,parse_constant=lambda _: (_ for _ in ()).throw(Invalid()))
def keys(obj, expected): require(type(obj) is dict and set(obj) == set(expected))
def integer(value, low, high): require(type(value) is int and low <= value <= high)
def validate(data):
    obj=parse(data)
    keys(obj,('schemaVersion','scope','installer','runtimes','directoryCleanup','failure'))
    require(type(obj['schemaVersion']) is int and obj['schemaVersion']==1 and obj['scope']=='HOSTED_RUNNER_ONLY')
    require(obj['failure'] is None and obj['directoryCleanup'] is True)
    ins=obj['installer'];keys(ins,('status','exitCode','cleanupComplete'))
    require(ins['status']=='SUCCESS' and type(ins['exitCode']) is int and ins['exitCode']==0 and ins['cleanupComplete'] is True)
    require(type(obj['runtimes']) is list and len(obj['runtimes'])==2)
    results=[]
    for entry,mode in zip(obj['runtimes'],('node','electron')):
        keys(entry,('mode','status','exitCode','cleanupComplete','stdoutTruncated','payload','ownedBytes'))
        require(entry['mode']==mode and entry['status'] in ('SUCCESS','NONZERO_EXIT') and entry['cleanupComplete'] is True and entry['stdoutTruncated'] is False)
        integer(entry['exitCode'],0,1);integer(entry['ownedBytes'],0,4194304)
        require(type(entry['payload']) is str)
        result=parse(entry['payload'].encode('utf-8'))
        keys(result,('schemaVersion','mode','passed','node','electron','sqlite','cases','failure','statementExecutions'))
        require(type(result['schemaVersion']) is int and result['schemaVersion']==1 and result['mode']==mode)
        require(result['node']=='24.22.1' and result['electron']==('45.1.0' if mode=='electron' else None))
        require(result['sqlite'] in (None,'3.53.4'))
        keys(result['cases'],CASES);require(all(type(v) is bool for v in result['cases'].values()))
        require(result['failure'] in (None,'MODULE_UNAVAILABLE','PROBE_FAILED','FINALIZATION_FAILED'))
        integer(result['statementExecutions'],0,63)
        passed=result['failure'] is None and all(result['cases'].values()) and result['sqlite']=='3.53.4'
        require(type(result['passed']) is bool and result['passed']==passed and entry['exitCode']==(0 if passed else 1) and entry['status']==('SUCCESS' if passed else 'NONZERO_EXIT'))
        results.append({**result,'cleanupComplete':True,'ownedBytes':entry['ownedBytes']})
    return {'schemaVersion':1,'scope':'HOSTED_RUNNER_ONLY','passed':all(r['passed'] for r in results),'directoryCleanup':True,'installer':ins,'runtimes':results}
def main():
    target=Path(__file__).parent/'.lab-results/validated.json'
    target.unlink(missing_ok=True)
    try:
        with (target.parent/'unvalidated.json').open('rb') as f: data=f.read(65537)
        result=validate(data)
        target.write_text(json.dumps(result,ensure_ascii=True,indent=2)+'\n',encoding='utf-8')
        print('SQLITE_SCHEMA_VALID_PASS' if result['passed'] else 'SQLITE_SCHEMA_VALID_PROBE_FAIL')
        return 0 if result['passed'] else 1
    except (ValueError,TypeError,KeyError,OSError,RecursionError,OverflowError):
        print('SQLITE_INVALID_OR_INCOMPLETE_EVIDENCE');return 1
if __name__=='__main__':sys.exit(main())
