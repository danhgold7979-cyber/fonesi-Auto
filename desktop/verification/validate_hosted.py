"""Private raw supervisor evidence -> fixed-field public evidence. No raw log echo."""
import json
from validate_runtime import (CASES, OBSERVATIONS, VERSIONS, MAX_BYTES,
                              booleans, exact_record, reject, unique_pairs,
                              validate_process)

FAILURES = frozenset(('PREPARE_FAILED', 'INSTALL_FAILED', 'PACKAGE_PREPARE_FAILED',
                      'RUNTIME_FAILED', 'NEGATIVE_PROBE_FAILED', 'DIRECTORY_CLEANUP_FAILED'))


def parse(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= MAX_BYTES:
        reject()
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=unique_pairs,
                          parse_constant=lambda _: reject())
    except (ValueError, UnicodeError, RecursionError):
        reject()


def bounded_size(value, ceiling, nullable=False):
    if nullable and value is None:
        return
    if type(value) is not int or not 0 <= value <= ceiling:
        reject()


def decode_runtime(payload, mode):
    if type(payload) is not str or len(payload.encode('utf-16-le')) // 2 > 32768:
        reject()
    lines = payload.replace('\r\n', '\n').split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    if len(lines) != 3 or lines[:2] != ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED'] or not lines[2].startswith('FOUNDATION_RESULT '):
        reject()
    result = parse(lines[2][len('FOUNDATION_RESULT '):].encode('utf-8'))
    exact_record(result, ('mode', 'versions', 'cases', 'observations'))
    if result['mode'] != mode:
        reject()
    exact_record(result['versions'], VERSIONS)
    if result['versions'] != VERSIONS:
        reject()
    booleans(result['cases'], CASES)
    booleans(result['observations'], OBSERVATIONS)
    return result


def validate(raw):
    data = parse(raw)
    exact_record(data, ('schemaVersion', 'scope', 'installer', 'runs', 'negatives',
                        'buildVerified', 'binaryHashMatched', 'runtimeCopyVerified',
                        'directoryCleanup', 'packageBytes', 'failure'))
    if type(data['schemaVersion']) is not int or data['schemaVersion'] != 1 or data['scope'] != 'HOSTED_RUNNER_ONLY':
        reject()
    failure = data['failure']
    if failure is not None and (type(failure) is not str or failure not in FAILURES):
        reject()
    flags = ('buildVerified', 'binaryHashMatched', 'runtimeCopyVerified', 'directoryCleanup')
    for name in flags:
        if type(data[name]) is not bool:
            reject()
    bounded_size(data['packageBytes'], 512 * 1024 * 1024, nullable=failure is not None)
    passed = failure is None and all(data[name] for name in flags)
    installer = data['installer']
    if installer is None:
        if failure is None:
            reject()
        passed = False
    else:
        exact_record(installer, ('process', 'officialMarker'))
        process_ok = validate_process(installer['process'])
        if type(installer['officialMarker']) is not bool:
            reject()
        passed = passed and process_ok and installer['officialMarker']
    for name, allowed in (('runs', {'source', 'package'}), ('negatives', {'crash', 'tamper'})):
        if type(data[name]) is not dict or not set(data[name]).issubset(allowed):
            reject()
        if failure is None and set(data[name]) != allowed:
            reject()
    runs = {}
    for mode, run in data['runs'].items():
        exact_record(run, ('process', 'payload', 'ownedBytes'))
        process_ok = validate_process(run['process'])
        bounded_size(run['ownedBytes'], 8 * 1024 * 1024, nullable=failure is not None)
        if type(run['payload']) is not str:
            reject()
        try:
            if len(run['payload'].encode('utf-16-le')) // 2 > 32768:
                reject()
        except UnicodeError:
            reject()
        # Failed/incomplete runs never gain synthetic missing cases. Drop private logs.
        result = decode_runtime(run['payload'], mode) if process_ok else None
        if result is None and failure is None:
            reject()
        runs[mode] = {'process': run['process'], 'ownedBytes': run['ownedBytes'], 'result': result}
        passed = passed and result is not None and all(result['cases'].values())
    for kind, negative in data['negatives'].items():
        fields = ('armed', 'observed', 'bootstrapFailed', 'unexpectedQuit') if kind == 'crash' else ('changed', 'bootstrapFailed', 'unexpectedReady')
        exact_record(negative, (*fields, 'process', 'ownedBytes'))
        validate_process(negative['process'])
        bounded_size(negative['ownedBytes'], 8 * 1024 * 1024, nullable=failure is not None)
        for field in fields:
            if type(negative[field]) is not bool:
                reject()
        process = negative['process']
        negative_ok = (process['status'] == 'NONZERO_EXIT' and process['exitCode'] == 1 and
                       process['cleanupComplete'] and not process['stdoutTruncated'] and not process['stderrTruncated'])
        expected = (negative['armed'] and negative['observed'] and negative['bootstrapFailed'] and
                    not negative['unexpectedQuit']) if kind == 'crash' else (
                    negative['changed'] and negative['bootstrapFailed'] and not negative['unexpectedReady'])
        passed = passed and negative_ok and expected
    public = {**data, 'runs': runs, 'oldNavigationGate': 'FAIL_RETAINED', 'passed': passed}
    return public


def write_validated(raw_path, output_path):
    """Trusted owned caller paths; regular-file check, capped read, exclusive output.

    No hostile concurrent filesystem mutation guarantee. Existing outputs are
    refused, never overwritten or treated as this invocation's success.
    """
    import os
    import stat
    from pathlib import Path
    raw_path, output_path = Path(raw_path), Path(output_path)
    for path in (raw_path.parent, output_path.parent):
        if not path.is_absolute() or path.resolve() != path or not stat.S_ISDIR(path.lstat().st_mode):
            reject()
    if raw_path.parent != output_path.parent or not stat.S_ISREG(raw_path.lstat().st_mode):
        reject()
    with raw_path.open('rb') as source:
        result = validate(source.read(MAX_BYTES + 1))
    public_bytes = (json.dumps(result, ensure_ascii=True, indent=2) + '\n').encode('utf-8')
    if len(public_bytes) > MAX_BYTES:
        reject()
    descriptor = os.open(output_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, 'wb') as destination:
        destination.write(public_bytes)
    return result['passed']


def main():
    import sys
    from pathlib import Path
    if len(sys.argv) != 1:
        print('FOUNDATION_VALIDATION_INVALID')
        return 2
    root = Path(__file__).resolve().parents[1] / '.runtime'
    try:
        passed = write_validated(root / 'unvalidated.json', root / 'validated.json')
    except (OSError, ValueError, UnicodeError, RecursionError):
        print('FOUNDATION_VALIDATION_INVALID')
        return 2
    # Printed only after this invocation exclusively created and closed the output.
    print('FOUNDATION_VALIDATION_WRITTEN')
    print('FOUNDATION_HOSTED_PASS' if passed else 'FOUNDATION_HOSTED_FAIL')
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
