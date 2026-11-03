"""Strict four-stage retained rollback evidence; no raw paths, records or process output published."""
import re
from pathlib import Path
from validate_runtime import exact_record, reject, validate_process
from validate_persistence import _admit_root, _read_owned, _write_new
from validate_retained_host import parse, booleans, validate_managed, BOOTSTRAP
from validate_package_runtime_version import package_value, package_binding

SCOPE = 'HOSTED_RETAINED_ROLLBACK_PACKAGE_ONLY'
STAGES = ('SEED', 'UPGRADE', 'ROLLBACK', 'REOPEN')
OBSERVER_CASES = ('mainReady', 'setupActionCorrect', 'selectedReleaseObserved', 'installTargetObserved',
                  'versionObserved', 'versionServiceRetired', 'setupRetired', 'runtimeCustodyRetired',
                  'helperDirectoryRemoved', 'mainClosed')
CONTROL_CASES = ('schema4Observed', 'durableEpochObserved', 'provisionChainObserved', 'auditBound',
                 'previousHistoryUnchanged', 'launchReleased')
CASES = OBSERVER_CASES + CONTROL_CASES
INTEGRITY = ('originalArchivesUnchanged', 'originalSourceUnchanged', 'originalPackageUnchanged')
FAILURES = ('PREPARE_FAILED', 'MANAGED_FAILED', 'INSTALL_FAILED', 'CONTROL_FAILED',
            'NATIVE_FAILED', 'VALIDATION_FAILED', 'CLEANUP_FAILED')


def observation(value, stage):
    exact_record(value, ('version', 'scope', 'stage', 'cases', 'readyCount', 'closedCount'))
    if (type(value['version']) is not int or value['version'] != 1 or value['scope'] != SCOPE or
            value['stage'] != stage or type(value['readyCount']) is not int or value['readyCount'] != 1 or
            type(value['closedCount']) is not int or value['closedCount'] != 1):
        reject()
    return {'version': 1, 'scope': SCOPE, 'stage': stage, 'cases': booleans(value['cases'], CASES),
            'readyCount': 1, 'closedCount': 1}


def validate(value):
    keys = ('version', 'scope', 'excludedVaultContext', 'managedEvidence', 'package', 'bootstrap',
            'stages', *INTEGRITY, 'directoryCleanup', 'failure')
    exact_record(value, keys + (('passed',) if type(value) is dict and 'passed' in value else ()))
    if (type(value['version']) is not int or value['version'] != 1 or value['scope'] != SCOPE or
            value['excludedVaultContext'] != 'P106_UNMET_NOT_RERUN'):
        reject()
    if any(type(value[k]) is not bool for k in (*INTEGRITY, 'directoryCleanup')):
        reject()
    if value['failure'] is not None and value['failure'] not in FAILURES:
        reject()
    managed = None if value['managedEvidence'] is None else validate_managed(value['managedEvidence'])
    if managed and (managed['version'] != 2 or managed['groupsPassed'] != 10 or not managed['passed']):
        reject()
    package = package_value(value['package'])
    bootstrap = value['bootstrap']
    if bootstrap is not None:
        exact_record(bootstrap, ('version', 'cases'))
        if type(bootstrap['version']) is not int or bootstrap['version'] != 1:
            reject()
        bootstrap = {'version': 1, 'cases': booleans(bootstrap['cases'], BOOTSTRAP)}
    exact_record(value['stages'], STAGES)
    stages = {}
    incomplete = False
    complete = True
    for name in STAGES:
        row = value['stages'][name]
        if row is None:
            incomplete = True
            complete = False
            stages[name] = None
            continue
        if incomplete or managed is None or package is None:
            reject()
        exact_record(row, ('observation', 'process'))
        process = row['process']
        normal = False if process is None else validate_process(process)
        obs = None if row['observation'] is None else observation(row['observation'], name)
        if obs is not None and not normal:
            reject()
        done = bool(normal and obs and all(obs['cases'].values()))
        complete = complete and done
        incomplete = not done
        stages[name] = {'observation': obs, 'process': None if process is None else dict(process)}
    passed = bool(value['failure'] is None and complete and managed and package and bootstrap and
                  all(bootstrap['cases'].values()) and all(value[k] for k in INTEGRITY) and value['directoryCleanup'])
    if value['failure'] is None and not (complete and managed and package and bootstrap):
        reject()
    if 'passed' in value and (type(value['passed']) is not bool or value['passed'] != passed):
        reject()
    return {'version': 1, 'scope': SCOPE, 'excludedVaultContext': 'P106_UNMET_NOT_RERUN',
            'managedEvidence': managed, 'package': package, 'bootstrap': bootstrap, 'stages': stages,
            **{k: value[k] for k in INTEGRITY}, 'directoryCleanup': value['directoryCleanup'],
            'failure': value['failure'], 'passed': passed}


def binding(value, stage):
    exact_record(value, ('version', 'stage', 'setup', 'runtime'))
    if type(value['version']) is not int or value['version'] != 1 or value['stage'] != stage:
        reject()
    ids = []
    for kind in ('setup', 'runtime'):
        op = value[kind]
        if kind == 'setup' and stage == 'REOPEN':
            if op is not None:
                reject()
            continue
        keys = ('operationId', 'expectedRevision', 'pendingRevision', 'verifiedRevision', 'reads', 'requestId', 'action') if kind == 'setup' else ('operationId', 'installationRevision', 'expectedRevision', 'pendingRevision', 'verifiedRevision', 'reads', 'requestId')
        exact_record(op, keys)
        if type(op['operationId']) is not str or re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', op['operationId']) is None:
            reject()
        ids.append(op['operationId'])
        if any(type(op[k]) is not int or not 0 <= op[k] <= 9007199254740991 for k in ('expectedRevision', 'pendingRevision', 'verifiedRevision', 'reads')) or not op['expectedRevision'] < op['pendingRevision'] < op['verifiedRevision'] or op['reads'] != (3 if kind == 'setup' else 2):
            reject()
        if type(op['requestId']) is not str or re.fullmatch(r'p[1-9][0-9]{0,15}', op['requestId']) is None or int(op['requestId'][1:]) > 9007199254740991:
            reject()
        if kind == 'setup':
            if op['action'] != ('ROLLBACK' if stage == 'ROLLBACK' else 'INSTALL'):
                reject()
        elif type(op['installationRevision']) is not int or op['installationRevision'] != min(STAGES.index(stage)+1, 3):
            reject()
    if len(ids) != len(set(ids)):
        reject()


def stage(root):
    root, token = _admit_root(root)
    if root.name != 'r' or root.parent.name != '.retained-host-runtime':
        reject()
    names = ['bootstrap.json', 'integrity.json', 'package-binding.json', 'managed-evidence.json']
    for name in STAGES:
        names.extend([f'launcher-{name}-capture.json', f'rollback-{name}-observed.json',
                      f'rollback-{name}-result.json', f'rollback-{name}-binding.json'])
    raw = {name: _read_owned(root, name) for name in names}
    integrity = parse(raw['integrity.json'])
    exact_record(integrity, ('version', *INTEGRITY, 'package'))
    if type(integrity['version']) is not int or integrity['version'] != 1:
        reject()
    package = package_value(integrity['package'])
    package_binding(raw['package-binding.json'], package)
    rows = {}
    for name in STAGES:
        cap = parse(raw[f'launcher-{name}-capture.json'])
        exact_record(cap, ('process', 'stdout', 'stderr'))
        for key in ('stdout', 'stderr'):
            if type(cap[key]) is not str or len(cap[key].encode('utf-16-le'))//2 > 32768:
                reject()
        if not validate_process(cap['process']) or cap['stdout'].replace('\r\n', '\n') not in ('PERSISTENCE_DESKTOP_CLOSED\n', '\nPERSISTENCE_DESKTOP_CLOSED\n'):
            reject()
        if any(line in cap['stderr'].splitlines() for line in ('RETAINED_ROLLBACK_FAILED', 'PERSISTENCE_LAUNCH_PROBE_FAILED', 'BOOTSTRAP_FAILED', 'BOOTSTRAP_CLEANUP_FAILED')):
            reject()
        observed = observation(parse(raw[f'rollback-{name}-observed.json']), name)
        result = observation(parse(raw[f'rollback-{name}-result.json']), name)
        if any(observed['cases'][k] != (k in OBSERVER_CASES) for k in CASES) or not all(result['cases'].values()):
            reject()
        binding(parse(raw[f'rollback-{name}-binding.json']), name)
        rows[name] = {'observation': result, 'process': cap['process']}
    result = validate({'version': 1, 'scope': SCOPE, 'excludedVaultContext': 'P106_UNMET_NOT_RERUN',
                       'managedEvidence': parse(raw['managed-evidence.json']), 'package': package,
                       'bootstrap': parse(raw['bootstrap.json']), 'stages': rows,
                       **{k: integrity[k] for k in INTEGRITY}, 'directoryCleanup': False, 'failure': None})
    if _admit_root(root)[1] != token or any(_read_owned(root, name) != data for name, data in raw.items()):
        reject()
    _write_new(root, 'public.json', result)
    return all(result[k] for k in INTEGRITY) and all(result['bootstrap']['cases'].values())


def managed_gate(root):
    root, token = _admit_root(root)
    if root.name != 'r' or root.parent.name != '.retained-host-runtime':
        reject()
    base = root.parent.parent
    raw = _read_owned(base, 'retained-managed-validated.json')
    value = validate_managed(parse(raw))
    if value['version'] != 2 or value['groupsPassed'] != 10 or not value['passed']:
        reject()
    if _admit_root(root)[1] != token or _read_owned(base, 'retained-managed-validated.json') != raw:
        reject()
    _write_new(root, 'managed-evidence.json', value)
    return True


def publish(base):
    # Same exclusive report publisher as existing campaigns; its parent is admitted by the workflow.
    if not base.is_absolute() or base.resolve() != base or not base.is_dir() or base.is_symlink():
        reject()
    value = validate(parse(_read_owned(base, 'unvalidated.json')))
    _write_new(base, 'validated.json', value)
    return value['passed']


def main(argv=None):
    import sys
    args = sys.argv[1:] if argv is None else argv
    try:
        if len(args) == 2 and args[0] == 'managed-gate':
            managed_gate(Path(args[1]))
            print('RETAINED_ROLLBACK_MANAGED_PASS')
            return 0
        if len(args) == 2 and args[0] == 'stage':
            ok = stage(Path(args[1]))
            print('RETAINED_ROLLBACK_STAGE_VALIDATED')
            return 0 if ok else 1
        if args != ['publish']:
            reject()
        ok = publish(Path(__file__).resolve().parents[1] / '.retained-host-runtime')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        print('RETAINED_ROLLBACK_VALIDATION_INVALID')
        return 2
    print('RETAINED_ROLLBACK_VALIDATION_WRITTEN')
    print('RETAINED_ROLLBACK_VALIDATION_PASS' if ok else 'RETAINED_ROLLBACK_VALIDATION_FAIL')
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
