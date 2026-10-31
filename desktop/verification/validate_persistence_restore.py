"""Fixed copied-profile native restore evidence; no private paths or IDs emitted."""
import sys
from validate_runtime import exact_record, booleans, reject, validate_process, VERSIONS
from validate_persistence import _parse, _read_owned, _write_new, _admit_root

CASES = ('restored_lease', 'profile_before_ready', 'copied_key_material',
         'original_bootstrap_authenticated', 'proof_bound', 'schema_two', 'root_quarantined',
         'sql_quarantined', 'automatic_backup_disabled', 'source_unchanged', 'service_closed')
SCOPE = 'COPIED_PROFILE_RESTORE_REOPEN'


def _mode(mode):
    if type(mode) is not str or mode not in ('source', 'package'):
        reject()


def _result(value, mode):
    _mode(mode)
    exact_record(value, ('version', 'scope', 'mode', 'versions', 'cases'))
    if type(value['version']) is not int or value['version'] != 1 or value['scope'] != SCOPE or value['mode'] != mode:
        reject()
    exact_record(value['versions'], VERSIONS)
    if value['versions'] != VERSIONS:
        reject()
    booleans(value['cases'], CASES)


def validate_raw(result_raw, capture_raw, mode):
    value, capture = _parse(result_raw), _parse(capture_raw)
    _result(value, mode)
    exact_record(capture, ('process', 'stdout', 'stderr'))
    process_passed = validate_process(capture['process'])
    for key in ('stdout', 'stderr'):
        text = capture[key]
        if type(text) is not str:
            reject()
        try:
            if len(text.encode('utf-16-le')) // 2 > 32768:
                reject()
        except UnicodeError:
            reject()
    lines = capture['stdout'].replace('\r\n', '\n').split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    if len(lines) == 2 and lines[0] == '':
        lines.pop(0)
    if lines != ['PERSISTENCE_RESTORE_ORDERLY']:
        reject()
    no_failure = not any(line in ('PERSISTENCE_RESTORE_FAILED', 'PERSISTENCE_RESTORE_DEADLINE')
                         for line in capture['stderr'].splitlines())
    return {'version': 1, 'scope': SCOPE, 'mode': mode, 'versions': dict(VERSIONS),
            'cases': {key: value['cases'][key] for key in CASES},
            'process': dict(capture['process']), 'orderlyQuitObserved': True,
            'failureMarkerAbsent': no_failure,
            'passed': process_passed and all(value['cases'].values()) and no_failure}


def validate_public(value, mode):
    exact_record(value, ('version', 'scope', 'mode', 'versions', 'cases', 'process',
                         'orderlyQuitObserved', 'failureMarkerAbsent', 'passed'))
    _result({key: value[key] for key in ('version', 'scope', 'mode', 'versions', 'cases')}, mode)
    process_passed = validate_process(value['process'])
    for key in ('orderlyQuitObserved', 'failureMarkerAbsent', 'passed'):
        if type(value[key]) is not bool:
            reject()
    if value['orderlyQuitObserved'] is not True:
        reject()
    derived = process_passed and all(value['cases'].values()) and value['failureMarkerAbsent']
    if value['passed'] != derived:
        reject()
    return derived


def stage(root, mode):
    _mode(mode)
    admitted, token = _admit_root(root)
    public = validate_raw(_read_owned(admitted, f'persistence-restore-result-{mode}.json'),
                          _read_owned(admitted, f'persistence-restore-capture-{mode}.json'), mode)
    if _admit_root(root)[1] != token:
        reject()
    _write_new(admitted, f'persistence-restore-public-{mode}.json', public)
    return public['passed']


def main(args):
    try:
        if len(args) != 2:
            reject()
        passed = stage(args[0], args[1])
    except (ValueError, TypeError, OSError, UnicodeError, RecursionError, KeyError):
        print('PERSISTENCE_RESTORE_VALIDATION_INVALID')
        return 2
    print('PERSISTENCE_RESTORE_VALIDATION_PASS' if passed else 'PERSISTENCE_RESTORE_VALIDATION_FAIL')
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
