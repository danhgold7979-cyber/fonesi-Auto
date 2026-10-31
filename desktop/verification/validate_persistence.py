"""Private P1-05 stage evidence. Never serialize returned private witness publicly."""
import json
import re
from validate_runtime import exact_record, unique_pairs, reject, validate_process, VERSIONS

STAGES = ('provision', 'orderly-auth', 'abrupt-auth', 'final-auth')
CASES = ('profilePreparedBeforeReady', 'leaseVerified', 'backupAuthenticated',
         'existingBackupMatched', 'schemaZero', 'unprovenMigrationRejected',
         'noActiveDatabase', 'serviceClosed')
WITNESS = ('storeId', 'backupId', 'locationId', 'encryptedSha256')


def witness(value):
    exact_record(value, WITNESS)
    for key in WITNESS[:3]:
        if type(value[key]) is not str or re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', value[key]) is None:
            reject()
    if type(value['encryptedSha256']) is not str or re.fullmatch(r'[0-9a-f]{64}', value['encryptedSha256']) is None:
        reject()
    return dict(value)


def validate_stage(raw, process, stdout, stderr, expected, mode, stage):
    """Return (fixed public stage, private original-backup witness).

    Caller owns native Job/process evidence and exclusive private file selection.
    This function proves schema/consistency, never actual native execution itself.
    """
    if mode not in ('source', 'package') or stage not in STAGES:
        reject()
    if type(raw) is not bytes or not 0 < len(raw) <= 65536:
        reject()
    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_pairs,
                           parse_constant=lambda _: reject())
    except (ValueError, UnicodeError, RecursionError):
        reject()
    exact_record(value, ('version', 'mode', 'stage', 'versions', 'cases', 'receipt'))
    if type(value['version']) is not int or value['version'] != 1 or value['mode'] != mode or value['stage'] != stage:
        reject()
    exact_record(value['versions'], VERSIONS)
    if value['versions'] != VERSIONS:
        reject()
    exact_record(value['cases'], CASES)
    if any(type(value['cases'][key]) is not bool for key in CASES):
        reject()
    original = witness(value['receipt'])
    if stage == 'provision':
        if expected is not None or value['cases']['existingBackupMatched']:
            reject()
        matched = True
    else:
        matched = original == witness(expected)
        if value['cases']['existingBackupMatched'] != matched:
            reject()
    process_passed = validate_process(process)
    for text in (stdout, stderr):
        if type(text) is not str:
            reject()
        try:
            if len(text.encode('utf-16-le')) // 2 > 32768:
                reject()
        except UnicodeError:
            reject()
    lines = stdout.replace('\r\n', '\n').split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    # Electron may add one observed empty startup line; never strip other content.
    if len(lines) == 2 and lines[0] == '':
        lines = lines[1:]
    orderly = lines == ['PERSISTENCE_ORDERLY_QUIT']
    abrupt = lines == ['PERSISTENCE_ABRUPT_CRASH_ARMED']
    if not orderly and not abrupt:
        reject()
    no_forbidden_quit = 'PERSISTENCE_UNEXPECTED_QUIT' not in stderr.splitlines()
    # Native provider stderr stays private. Fixed failure markers must never pass.
    no_failure = not any(line in ('PERSISTENCE_PROBE_FAILED', 'PERSISTENCE_PROBE_DEADLINE') for line in stderr.splitlines())
    if stage == 'abrupt-auth':
        expected_exit = (process['status'] == 'NONZERO_EXIT' and type(process['exitCode']) is int and process['exitCode'] != 0 and
                         process['cleanupComplete'] and not process['stdoutTruncated'] and not process['stderrTruncated'])
        native_passed = abrupt and not orderly and expected_exit
    else:
        native_passed = orderly and not abrupt and process_passed
    cases_passed = all(value['cases'][key] for key in CASES if key != 'existingBackupMatched')
    public = {'mode': mode, 'stage': stage, 'versions': dict(VERSIONS), 'cases': value['cases'],
              'process': dict(process), 'orderlyQuitObserved': orderly,
              'abruptExitObserved': abrupt, 'oldBackupWitnessMatched': stage != 'provision' and matched,
              'passed': cases_passed and matched and native_passed and no_forbidden_quit and no_failure}
    return public, original


def read_private_bounded(path):
    """Caller supplies an owned regular path; cap allocation before parsing."""
    with open(path, 'rb') as source:
        return source.read(65537)


def validate_sequence(stages, mode):
    """Only the complete, matching four-stage sequence can yield a private proof.

    Trusted supervisor enforces execution order and exclusive lease lifetime;
    this validator does not derive chronology from caller-supplied JSON.
    """
    exact_record(stages, STAGES)
    expected = None
    public_stages = []
    passed = True
    for stage in STAGES:
        item = stages[stage]
        exact_record(item, ('raw', 'process', 'stdout', 'stderr'))
        public, original = validate_stage(item['raw'], item['process'], item['stdout'],
                                          item['stderr'], expected, mode, stage)
        if stage == 'provision':
            expected = original
        passed = passed and public['passed']
        public_stages.append(public)
    proof = None
    if passed:
        proof = {'version': 1, **expected, 'state': 'ORDERLY_AND_ABRUPT_RECOVERED'}
    return {'mode': mode, 'stages': public_stages, 'passed': passed}, proof


def _read_owned(root, name):
    import stat
    path = root / name
    if path.parent.resolve() != path.parent or not stat.S_ISREG(path.lstat().st_mode):
        reject()
    return read_private_bounded(path)


def _parse(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= 65536:
        reject()
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=unique_pairs,
                          parse_constant=lambda _: reject())
    except (ValueError, UnicodeError, RecursionError):
        reject()


def _write_new(root, name, value):
    import os
    path = root / name
    if path.parent.resolve() != path.parent:
        reject()
    raw = json.dumps(value, ensure_ascii=True, separators=(',', ':')).encode('utf8')
    if len(raw) > 65536:
        reject()
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(raw)
        output.flush()
        os.fsync(output.fileno())
    if _read_owned(path.parent, path.name) != raw:
        reject()


def _stage_input(root, mode, stage):
    capture = _parse(_read_owned(root, f'persistence-capture-{mode}-{stage}.json'))
    exact_record(capture, ('process', 'stdout', 'stderr'))
    return {'raw': _read_owned(root, f'persistence-{mode}-{stage}.json'), **capture}


def _admit_root(path):
    import stat
    from pathlib import Path
    root = Path(path)
    if not root.is_absolute() or root.resolve() != root or not stat.S_ISDIR(root.lstat().st_mode):
        reject()
    token = _read_owned(root, '.owner').decode('ascii')
    if re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', token) is None:
        reject()
    return root, token


def stage_files(root, mode, stage):
    item = _stage_input(root, mode, stage)
    expected = None if stage == 'provision' else _parse(_read_owned(root, f'persistence-witness-{mode}.json'))
    public, original = validate_stage(item['raw'], item['process'], item['stdout'], item['stderr'], expected, mode, stage)
    _write_new(root, f'persistence-public-{mode}-{stage}.json', public)
    if public['passed'] and stage == 'provision':
        _write_new(root, f'persistence-witness-{mode}.json', original)
    return public['passed']


def finalize_files(root, parent_token, mode):
    stages = {stage: _stage_input(root, mode, stage) for stage in STAGES}
    public, proof = validate_sequence(stages, mode)
    # Only the trusted supervisor invokes this after native stages; exact retained
    # lease and root provenance must still match before proof creation.
    state = _parse(_read_owned(root, f'persistence-state-{mode}.json'))
    exact_record(state, ('version', 'parentToken', 'ownerToken', 'storeId'))
    data = root / f'data-{mode}'
    if _admit_root(root)[1] != parent_token:
        reject()
    import os
    import stat
    for key in ('parentToken', 'ownerToken', 'storeId'):
        if type(state[key]) is not str or re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', state[key]) is None:
            reject()
    lock_path = data / '.writer-lock'
    if lock_path.resolve() != lock_path or not stat.S_ISDIR(lock_path.lstat().st_mode):
        reject()
    with os.scandir(lock_path) as entries:
        first = next(entries, None)
        if first is None or first.name != 'owner.json' or next(entries, None) is not None:
            reject()
    owner = _parse(_read_owned(data, '.persistence-owner.json'))
    lock = _parse(_read_owned(data / '.writer-lock', 'owner.json'))
    exact_record(owner, ('version', 'storeId', 'kind', 'restoreReceiptId'))
    exact_record(lock, ('version', 'storeId', 'ownerToken'))
    if type(owner['version']) is not int or type(lock['version']) is not int:
        reject()
    if (type(state['version']) is not int or state['version'] != 1 or state['parentToken'] != parent_token or
            owner != {'version': 1, 'storeId': state['storeId'], 'kind': 'FRESH', 'restoreReceiptId': None} or
            lock != {'version': 1, 'storeId': state['storeId'], 'ownerToken': state['ownerToken']}):
        reject()
    if public['passed']:
        if proof is None or proof['storeId'] != state['storeId']:
            reject()
        _write_new(data, 'key-durability-proof.json', proof)
    _write_new(root, f'persistence-public-{mode}.json', public)
    return public['passed']


FAILURES = ('PREPARE_FAILED', 'PACKAGE_FAILED', 'CONTROL_FAILED', 'PREFLIGHT_FAILED',
            'NATIVE_STAGE_FAILED', 'STAGE_VALIDATION_FAILED', 'SEQUENCE_VALIDATION_FAILED', 'CLEANUP_FAILED')


def validate_public_mode(value, mode):
    exact_record(value, ('mode', 'stages', 'passed'))
    if value['mode'] != mode or type(value['passed']) is not bool or type(value['stages']) is not list or len(value['stages']) != 4:
        reject()
    passed = True
    for stage, item in zip(STAGES, value['stages']):
        exact_record(item, ('mode', 'stage', 'versions', 'cases', 'process', 'orderlyQuitObserved', 'abruptExitObserved', 'oldBackupWitnessMatched', 'passed'))
        if item['mode'] != mode or item['stage'] != stage:
            reject()
        exact_record(item['versions'], VERSIONS)
        if item['versions'] != VERSIONS:
            reject()
        exact_record(item['cases'], CASES)
        if any(type(item['cases'][key]) is not bool for key in CASES):
            reject()
        for key in ('orderlyQuitObserved', 'abruptExitObserved', 'oldBackupWitnessMatched', 'passed'):
            if type(item[key]) is not bool:
                reject()
        process_passed = validate_process(item['process'])
        if stage == 'abrupt-auth':
            process = item['process']
            process_passed = (process['status'] == 'NONZERO_EXIT' and type(process['exitCode']) is int and process['exitCode'] != 0 and
                              process['cleanupComplete'] and not process['stdoutTruncated'] and not process['stderrTruncated'])
        correct_exit = (item['abruptExitObserved'] and not item['orderlyQuitObserved']) if stage == 'abrupt-auth' else (item['orderlyQuitObserved'] and not item['abruptExitObserved'])
        expected_existing = stage != 'provision'
        derived = (process_passed and correct_exit and item['oldBackupWitnessMatched'] == expected_existing and
                   item['cases']['existingBackupMatched'] == expected_existing and
                   all(item['cases'][key] for key in CASES if key != 'existingBackupMatched'))
        # A fixed failure marker can make an otherwise positive record fail. It
        # may never make negative evidence pass; do not upgrade false claims.
        if item['passed'] and not derived:
            reject()
        passed = passed and item['passed']
    if value['passed'] != passed:
        reject()
    return passed


def validate_ready(capture, database, mode):
    exact_record(capture, ('process', 'stdout', 'stderr'))
    process_passed = validate_process(capture['process'])
    for name in ('stdout', 'stderr'):
        if type(capture[name]) is not str or len(capture[name].encode('utf-16-le')) // 2 > 32768:
            reject()
    lines = capture['stdout'].replace('\r\n', '\n').split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    if len(lines) == 5 and lines[0] == '':
        lines.pop(0)
    if len(lines) != 4 or lines[:3] != ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED', 'PERSISTENCE_MAIN_ORDERLY'] or not lines[3].startswith('PERSISTENCE_MAIN_RESULT '):
        reject()
    runtime = _parse(lines[3][len('PERSISTENCE_MAIN_RESULT '):].encode('utf8'))
    exact_record(runtime, ('mode', 'versions', 'mainReady', 'orderlyQuit'))
    exact_record(runtime['versions'], VERSIONS)
    if runtime['mode'] != mode or runtime['versions'] != VERSIONS or any(type(runtime[x]) is not bool for x in ('mainReady', 'orderlyQuit')):
        reject()
    exact_record(database, ('version', 'mode', 'schemaVersion', 'quarantined', 'automaticAdmissionRecorded', 'protectedCount', 'ordinaryCount', 'totalCount'))
    for name in ('version', 'schemaVersion', 'protectedCount', 'ordinaryCount', 'totalCount'):
        if type(database[name]) is not int or not 0 <= database[name] <= 64:
            reject()
    if database['version'] != 1 or database['mode'] != mode or any(type(database[x]) is not bool for x in ('quarantined', 'automaticAdmissionRecorded')):
        reject()
    passed = (process_passed and runtime['mainReady'] and runtime['orderlyQuit'] and
              database['schemaVersion'] == 2 and not database['quarantined'] and database['automaticAdmissionRecorded'] and
              database['protectedCount'] == 2 and database['ordinaryCount'] == 1 and database['totalCount'] == 3 and
              not any(x in capture['stderr'].splitlines() for x in ('PERSISTENCE_MAIN_FAILED', 'PERSISTENCE_MAIN_DEADLINE', 'BOOTSTRAP_FAILED', 'BOOTSTRAP_CLEANUP_FAILED', 'PERSISTENCE_SHUTDOWN_FAILED', 'LOGGING_DEGRADED')))
    return {'mode': mode, 'versions': dict(VERSIONS), 'process': dict(capture['process']),
            'mainReady': runtime['mainReady'], 'orderlyQuit': runtime['orderlyQuit'], 'database': database, 'passed': passed}


def ready_files(root, mode):
    public = validate_ready(_parse(_read_owned(root, f'persistence-ready-capture-{mode}.json')),
                            _parse(_read_owned(root, f'persistence-ready-database-{mode}.json')), mode)
    _write_new(root, f'persistence-ready-public-{mode}.json', public)
    return public['passed']


def validate_report(raw):
    value = _parse(raw)
    version = value.get('schemaVersion') if type(value) is dict else None
    exact_record(value, ('schemaVersion', 'scope', 'modes', 'runtimeCopyVerified', 'directoryCleanup', 'failure') + (('ready',) if version in (2, 3) else ()) + (('store', 'maintenance', 'restore') if version == 3 else ()))
    scopes = {1: 'HOSTED_KEY_MECHANISM_ONLY', 2: 'HOSTED_KEY_AND_MAIN_READY', 3: 'HOSTED_KEY_MAIN_STORE_MAINTENANCE_RESTORE'}
    if type(version) is not int or version not in scopes or value['scope'] != scopes[version]:
        reject()
    if type(value['modes']) is not dict or not set(value['modes']).issubset({'source', 'package'}):
        reject()
    if any(type(value[key]) is not bool for key in ('runtimeCopyVerified', 'directoryCleanup')):
        reject()
    if value['failure'] is not None and (type(value['failure']) is not str or value['failure'] not in FAILURES):
        reject()
    if value['failure'] is None and set(value['modes']) != {'source', 'package'}:
        reject()
    passed = value['failure'] is None and value['runtimeCopyVerified'] and value['directoryCleanup']
    for mode, item in value['modes'].items():
        passed = validate_public_mode(item, mode) and passed
    if version in (2, 3):
        if type(value['ready']) is not dict or not set(value['ready']).issubset({'source', 'package'}):
            reject()
        if value['failure'] is None and set(value['ready']) != {'source', 'package'}:
            reject()
        for mode, item in value['ready'].items():
            exact_record(item, ('mode', 'versions', 'process', 'mainReady', 'orderlyQuit', 'database', 'passed'))
            runtime = {key: item[key] for key in ('mode', 'versions', 'mainReady', 'orderlyQuit')}
            capture = {'process': item['process'], 'stdout': 'BOOTSTRAP_READY\nBOOTSTRAP_CLOSED\nPERSISTENCE_MAIN_ORDERLY\nPERSISTENCE_MAIN_RESULT ' + json.dumps(runtime) + '\n', 'stderr': ''}
            rebuilt = validate_ready(capture, item['database'], mode)
            if type(item['passed']) is not bool or (item['passed'] and not rebuilt['passed']):
                reject()
            passed = item['passed'] and passed
    if version == 3:
        from validate_persistence_store import validate_public as validate_store
        from validate_persistence_maintenance import validate_public as validate_maintenance
        from validate_persistence_restore import validate_public as validate_restore
        for field in ('store', 'maintenance', 'restore'):
            if type(value[field]) is not dict or not set(value[field]).issubset({'source', 'package'}):
                reject()
            if value['failure'] is None and set(value[field]) != {'source', 'package'}:
                reject()
        for mode, boundaries in value['store'].items():
            if type(boundaries) is not dict or not set(boundaries).issubset({'BEFORE_COMMIT', 'AFTER_COMMIT'}):
                reject()
            if value['failure'] is None and set(boundaries) != {'BEFORE_COMMIT', 'AFTER_COMMIT'}:
                reject()
            for boundary, stages in boundaries.items():
                if type(stages) is not dict or not set(stages).issubset({'crash', 'reopen'}):
                    reject()
                if value['failure'] is None and set(stages) != {'crash', 'reopen'}:
                    reject()
                for stage, item in stages.items():
                    passed = validate_store(item, mode, boundary, stage) and passed
        for mode, item in value['maintenance'].items():
            passed = validate_maintenance(item, mode) and passed
        for mode, item in value['restore'].items():
            passed = validate_restore(item, mode) and passed
    return {**value, 'passed': passed}


def publish_report():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1] / '.persistence-runtime'
    if root.resolve() != root or not root.is_dir():
        reject()
    public = validate_report(_read_owned(root, 'unvalidated.json'))
    _write_new(root, 'validated.json', public)
    return public['passed']


def main():
    import sys
    if sys.argv[1:] == ['publish']:
        try:
            passed = publish_report()
        except (OSError, ValueError, UnicodeError, RecursionError):
            print('PERSISTENCE_VALIDATION_INVALID')
            return 2
        print('PERSISTENCE_VALIDATION_WRITTEN')
        print('PERSISTENCE_HOSTED_PASS' if passed else 'PERSISTENCE_HOSTED_FAIL')
        return 0 if passed else 1
    if len(sys.argv) not in (4, 5):
        print('PERSISTENCE_VALIDATION_INVALID')
        return 2
    action, path, mode = sys.argv[1:4]
    if mode not in ('source', 'package') or action not in ('stage', 'finalize', 'ready'):
        print('PERSISTENCE_VALIDATION_INVALID')
        return 2
    try:
        root, token = _admit_root(path)
        if action == 'stage':
            if len(sys.argv) != 5 or sys.argv[4] not in STAGES:
                reject()
            passed = stage_files(root, mode, sys.argv[4])
        else:
            if len(sys.argv) != 4:
                reject()
            passed = ready_files(root, mode) if action == 'ready' else finalize_files(root, token, mode)
    except (OSError, ValueError, UnicodeError, RecursionError):
        print('PERSISTENCE_VALIDATION_INVALID')
        return 2
    print('PERSISTENCE_VALIDATION_PASS' if passed else 'PERSISTENCE_VALIDATION_FAIL')
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
