"""Strict fixed evidence for native maintenance adapters; raw capture remains private."""
import json
import os
import re
import stat
from pathlib import Path
from validate_runtime import exact_record, unique_pairs, reject, validate_process, VERSIONS

CASES = ('retained_lease', 'profile_before_ready', 'native_keys', 'ready_schema',
         'cancel_folder_unchanged', 'cancel_accept_unchanged', 'cancel_restore_unchanged',
         'list_native_display', 'manual_backup', 'location_identity', 'location_persisted',
         'ordinary_retention_7', 'protected_retained', 'acceptance_receipt',
         'restore_new_root', 'restore_quarantined', 'source_unchanged_by_restore', 'service_closed')


DIAGNOSTIC_STAGES = ('INITIALIZE', 'ROOT_OWNER', 'RESULT_READ', 'CAPTURE_READ', 'RESULT_SCHEMA', 'CAPTURE_SCHEMA', 'PROCESS', 'STDOUT', 'OUTPUT_WRITE')
_diagnostic_stage = 'INITIALIZE'


def diagnostic_marker():
    return 'PERSISTENCE_MAINTENANCE_VALIDATION_STAGE_' + (_diagnostic_stage if _diagnostic_stage in DIAGNOSTIC_STAGES else 'UNKNOWN')


def parse(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= 65536:
        reject()
    return json.loads(raw.decode('utf8'), object_pairs_hook=unique_pairs,
                      parse_constant=lambda _: reject())


def validate_raw(result_raw, capture_raw, mode):
    global _diagnostic_stage
    _diagnostic_stage = 'RESULT_SCHEMA'
    if mode not in ('source', 'package'):
        reject()
    result = parse(result_raw)
    exact_record(result, ('version', 'scope', 'mode', 'versions', 'cases', 'ordinaryCount', 'protectedCount', 'releasedSafetyCount'))
    exact_record(result['versions'], VERSIONS)
    exact_record(result['cases'], CASES)
    if (type(result['version']) is not int or result['version'] != 1 or
            result['scope'] != 'NATIVE_ADAPTER_MAINTENANCE' or result['mode'] != mode or result['versions'] != VERSIONS or
            any(type(result['cases'][key]) is not bool for key in CASES)):
        reject()
    for key, limit in (('ordinaryCount', 7), ('protectedCount', 2), ('releasedSafetyCount', 2)):
        if type(result[key]) is not int or not 0 <= result[key] <= limit:
            reject()
    _diagnostic_stage = 'CAPTURE_SCHEMA'
    capture = parse(capture_raw)
    exact_record(capture, ('process', 'stdout', 'stderr'))
    _diagnostic_stage = 'PROCESS'
    process_passed = validate_process(capture['process'])
    for key in ('stdout', 'stderr'):
        if type(capture[key]) is not str or len(capture[key].encode('utf-16-le')) // 2 > 32768:
            reject()
    _diagnostic_stage = 'STDOUT'
    lines = capture['stdout'].replace('\r\n', '\n').split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    if len(lines) == 2 and lines[0] == '':
        lines.pop(0)
    if lines != ['PERSISTENCE_MAINTENANCE_ORDERLY']:
        reject()
    failures = {'PERSISTENCE_MAINTENANCE_FAILED', 'PERSISTENCE_MAINTENANCE_DEADLINE'}
    passed = (process_passed and all(result['cases'].values()) and result['ordinaryCount'] == 7 and
              result['protectedCount'] == 1 and result['releasedSafetyCount'] == 1 and
              not failures.intersection(capture['stderr'].splitlines()))
    return {**result, 'process': dict(capture['process']), 'orderlyQuitObserved': True, 'passed': passed}


def validate_public(value, mode):
    keys = ('version', 'scope', 'mode', 'versions', 'cases', 'ordinaryCount', 'protectedCount', 'releasedSafetyCount')
    exact_record(value, keys + ('process', 'orderlyQuitObserved', 'passed'))
    if type(value['orderlyQuitObserved']) is not bool or not value['orderlyQuitObserved'] or type(value['passed']) is not bool:
        reject()
    raw = json.dumps({key: value[key] for key in keys}).encode('utf8')
    capture = json.dumps({'process': value['process'], 'stdout': 'PERSISTENCE_MAINTENANCE_ORDERLY\n', 'stderr': ''}).encode('utf8')
    rebuilt = validate_raw(raw, capture, mode)
    if value['passed'] and not rebuilt['passed']:
        reject()
    return value['passed']


def read(root, name):
    file = root / name
    if root.resolve() != root or not stat.S_ISDIR(root.lstat().st_mode):
        reject()
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > 65536:
        reject()
    with file.open('rb') as source:
        return source.read(65537)


def stage(root, mode):
    global _diagnostic_stage
    _diagnostic_stage = 'ROOT_OWNER'
    if mode not in ('source', 'package') or not root.is_absolute():
        reject()
    token = read(root, '.owner')
    if re.fullmatch(rb'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', token) is None:
        reject()
    _diagnostic_stage = 'RESULT_READ'
    result_raw = read(root, f'persistence-maintenance-result-{mode}.json')
    _diagnostic_stage = 'CAPTURE_READ'
    capture_raw = read(root, f'persistence-maintenance-capture-{mode}.json')
    public = validate_raw(result_raw, capture_raw, mode)
    if read(root, '.owner') != token:
        reject()
    raw = json.dumps(public, ensure_ascii=True, separators=(',', ':')).encode('ascii')
    if len(raw) > 65536:
        reject()
    _diagnostic_stage = 'OUTPUT_WRITE'
    output = root / f'persistence-maintenance-public-{mode}.json'
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as target:
        target.write(raw)
        target.flush()
        os.fsync(target.fileno())
    if read(root, output.name) != raw:
        reject()
    return public['passed']


def main():
    import sys
    try:
        if len(sys.argv) != 3:
            reject()
        passed = stage(Path(sys.argv[1]), sys.argv[2])
    except (OSError, ValueError, UnicodeError, RecursionError):
        print(diagnostic_marker())
        print('PERSISTENCE_MAINTENANCE_VALIDATION_INVALID')
        return 2
    print('PERSISTENCE_MAINTENANCE_VALIDATION_PASS' if passed else 'PERSISTENCE_MAINTENANCE_VALIDATION_FAIL')
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
