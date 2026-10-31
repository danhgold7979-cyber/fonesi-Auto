"""Private raw supervisor evidence -> fixed-field public evidence. No raw log echo."""
import json
from validate_runtime import (CASES, OBSERVATIONS, VERSIONS, MAX_BYTES,
                              booleans, exact_record, reject, unique_pairs,
                              validate_process, validate_logging)

FAILURES = frozenset(('PREPARE_FAILED', 'INSTALL_FAILED', 'PACKAGE_PREPARE_FAILED',
                      'RUNTIME_FAILED', 'NEGATIVE_PROBE_FAILED', 'DIRECTORY_CLEANUP_FAILED', 'LOGGING_FIXTURE_FAILED'))


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


def decode_runtime(payload, mode, diagnostic):
    diagnostic['stage'] = 'RUN_' + mode.upper() + '_LINES'
    if type(payload) is not str or len(payload.encode('utf-16-le')) // 2 > 32768:
        reject()
    lines = payload.replace('\r\n', '\n').split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    classes = tuple('READY' if line == 'BOOTSTRAP_READY' else
                    'CLOSED' if line == 'BOOTSTRAP_CLOSED' else
                    'RESULT' if line.startswith('FOUNDATION_RESULT ') else
                    'EMPTY' if line == '' else 'WHITESPACE' if line.isspace() else 'OTHER'
                    for line in lines)
    diagnostic['stdout'] = {'mode': mode, 'count': len(lines), 'otherCount': classes.count('OTHER'), 'classes': classes[:8]}
    # CI5 observed one exact empty startup line. No whitespace stripping/filtering.
    if len(lines) == 4 and lines[0] == '':
        lines = lines[1:]
    if len(lines) != 3 or lines[:2] != ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED'] or not lines[2].startswith('FOUNDATION_RESULT '):
        reject()
    diagnostic['stage'] = 'RUN_' + mode.upper() + '_JSON'
    result = parse(lines[2][len('FOUNDATION_RESULT '):].encode('utf-8'))
    diagnostic['stage'] = 'RUN_' + mode.upper() + '_RESULT'
    exact_record(result, ('mode', 'versions', 'cases', 'observations', 'logging'))
    if result['mode'] != mode:
        reject()
    exact_record(result['versions'], VERSIONS)
    if result['versions'] != VERSIONS:
        reject()
    booleans(result['cases'], CASES)
    booleans(result['observations'], OBSERVATIONS)
    validate_logging(result['logging'])
    if (result['cases']['logging_persisted'] or result['cases']['logging_correlation']) and result['logging']['recordCount'] == 0:
        reject()
    return result


def validate(raw, diagnostic=None):
    if diagnostic is None:
        diagnostic = {}
    diagnostic['stage'] = 'JSON_PARSE'
    data = parse(raw)
    diagnostic['stage'] = 'OUTER_SCHEMA'
    exact_record(data, ('schemaVersion', 'scope', 'installer', 'runs', 'negatives',
                        'buildVerified', 'binaryHashMatched', 'runtimeCopyVerified', 'loggingFixtures', 'loggingDegraded',
                        'directoryCleanup', 'packageBytes', 'failure'))
    if type(data['schemaVersion']) is not int or data['schemaVersion'] != 1 or data['scope'] != 'HOSTED_RUNNER_ONLY':
        reject()
    failure = data['failure']
    if failure is not None and (type(failure) is not str or failure not in FAILURES):
        reject()
    diagnostic['failure'] = failure
    diagnostic['stage'] = 'OUTER_FLAGS'
    flags = ('buildVerified', 'binaryHashMatched', 'runtimeCopyVerified', 'directoryCleanup')
    for name in flags:
        if type(data[name]) is not bool:
            reject()
    bounded_size(data['packageBytes'], 512 * 1024 * 1024, nullable=failure is not None)
    passed = failure is None and all(data[name] for name in flags)
    diagnostic['stage'] = 'INSTALL_PROCESS'
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
    diagnostic['stage'] = 'RUN_COLLECTIONS'
    for name, allowed in (('runs', {'source', 'package'}), ('negatives', {'crash', 'tamper'})):
        if type(data[name]) is not dict or not set(data[name]).issubset(allowed):
            reject()
        if failure is None and set(data[name]) != allowed:
            reject()
    runs = {}
    for mode, run in data['runs'].items():
        diagnostic['stage'] = 'RUN_' + mode.upper() + '_SHAPE'
        exact_record(run, ('process', 'payload', 'ownedBytes', 'streamsClean'))
        diagnostic['stage'] = 'RUN_' + mode.upper() + '_PROCESS'
        process_ok = validate_process(run['process'])
        diagnostic['stage'] = 'RUN_' + mode.upper() + '_SIZE'
        bounded_size(run['ownedBytes'], 8 * 1024 * 1024, nullable=failure is not None)
        if type(run['payload']) is not str:
            reject()
        try:
            if len(run['payload'].encode('utf-16-le')) // 2 > 32768:
                reject()
        except UnicodeError:
            reject()
        # Failed/incomplete runs never gain synthetic missing cases. Drop private logs.
        result = decode_runtime(run['payload'], mode, diagnostic) if process_ok else None
        if result is None and failure is None:
            reject()
        if type(run['streamsClean']) is not bool:
            reject()
        runs[mode] = {'process': run['process'], 'ownedBytes': run['ownedBytes'], 'streamsClean': run['streamsClean'], 'result': result}
        passed = passed and run['streamsClean']
        passed = passed and result is not None and all(result['cases'].values())
    for kind, negative in data['negatives'].items():
        diagnostic['stage'] = 'NEGATIVE_' + kind.upper()
        fields = ('armed', 'observed', 'bootstrapFailed', 'unexpectedQuit') if kind == 'crash' else ('changed', 'bootstrapFailed', 'unexpectedReady')
        exact_record(negative, (*fields, 'process', 'ownedBytes', 'streamsClean', 'loggingScan'))
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
        if type(negative['streamsClean']) is not bool:
            reject()
        scan = negative['loggingScan']
        scan_result = None
        scan_ok = False
        if scan is not None:
            exact_record(scan, ('process', 'payload'))
            scan_ok = validate_process(scan['process'])
            if scan_ok:
                if type(scan['payload']) is not str or not scan['payload'].startswith('FOUNDATION_LOG_SCAN ') or not scan['payload'].endswith('\n'):
                    reject()
                scan_result = parse(scan['payload'][len('FOUNDATION_LOG_SCAN '):].encode('utf-8'))
                exact_record(scan_result, ('canonical', 'canaryAbsent', 'recordCount', 'crashArtifactCount'))
                for field in ('canonical', 'canaryAbsent'):
                    if type(scan_result[field]) is not bool:
                        reject()
                validate_logging({key: scan_result[key] for key in ('recordCount', 'crashArtifactCount')})
                scan_ok = scan_ok and scan_result['canonical'] and scan_result['canaryAbsent']
            negative['loggingScan'] = {'process': scan['process'], 'result': scan_result}
        elif failure is None:
            reject()
        passed = passed and negative_ok and expected and negative['streamsClean'] and scan_ok
    diagnostic['stage'] = 'LOGGING_DEGRADED'
    degraded = data['loggingDegraded']
    public_degraded = None
    if degraded is None:
        if failure is None:
            reject()
        passed = False
    else:
        exact_record(degraded, ('process', 'payload', 'streamsClean', 'fixedNotice', 'ownedBytes', 'unownedUnchanged'))
        process_ok = validate_process(degraded['process'])
        for key in ('streamsClean', 'fixedNotice', 'unownedUnchanged'):
            if type(degraded[key]) is not bool:
                reject()
        bounded_size(degraded['ownedBytes'], 8 * 1024 * 1024, nullable=failure is not None)
        result = None
        if type(degraded['payload']) is not str or len(degraded['payload'].encode('utf-16-le')) // 2 > 32768:
            reject()
        if process_ok:
            lines = degraded['payload'].replace('\r\n', '\n').split('\n')
            if lines and lines[-1] == '':
                lines.pop()
            if len(lines) == 4 and lines[0] == '':
                lines = lines[1:]
            if len(lines) != 3 or lines[:2] != ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED'] or not lines[2].startswith('FOUNDATION_DEGRADED_RESULT '):
                reject()
            result = parse(lines[2][len('FOUNDATION_DEGRADED_RESULT '):].encode('utf-8'))
            exact_record(result, ('cases', 'crashArtifactCount'))
            bounded_size(result['crashArtifactCount'], 256)
            booleans(result['cases'], ('publicReadAvailable', 'loggingDegraded', 'safeCorrelatedError', 'visibleDegradation', 'orderlyQuit', 'crashCanaryAbsent'))
        public_degraded = {key: degraded[key] for key in ('process', 'streamsClean', 'fixedNotice', 'ownedBytes', 'unownedUnchanged')}
        public_degraded['result'] = result
        passed = passed and process_ok and all(degraded[key] for key in ('streamsClean', 'fixedNotice', 'unownedUnchanged')) and result is not None and all(result['cases'].values())
    diagnostic['stage'] = 'LOGGING_FIXTURES'
    fixtures = data['loggingFixtures']
    expected_modes = {'concurrent', 'crash', 'recover', 'prepare', 'sharing', 'enospc', 'prepare-reparse', 'reparse', 'unowned', 'traversal'}
    if type(fixtures) is not dict or not set(fixtures).issubset(expected_modes):
        reject()
    if failure is None and set(fixtures) != expected_modes:
        reject()
    public_fixtures = {}
    for mode, fixture in fixtures.items():
        exact_record(fixture, ('process', 'payload', 'streamsClean'))
        process_ok = validate_process(fixture['process'])
        if type(fixture['payload']) is not str or type(fixture['streamsClean']) is not bool:
            reject()
        if len(fixture['payload'].encode('utf-16-le')) // 2 > 32768:
            reject()
        result = None
        if mode == 'crash':
            process = fixture['process']
            fixture_ok = (process['status'] == 'NONZERO_EXIT' and process['exitCode'] == 73 and
                          process['cleanupComplete'] and not process['stdoutTruncated'] and not process['stderrTruncated'] and
                          fixture['payload'].replace('\r\n', '\n') == 'FOUNDATION_STORE_CRASH_READY\n')
        else:
            fixture_ok = False
            if process_ok:
                prefix = 'FOUNDATION_STORE_RESULT '
                if not fixture['payload'].startswith(prefix) or not fixture['payload'].endswith('\n'):
                    reject()
                result = parse(fixture['payload'][len(prefix):].encode('utf-8'))
                exact_record(result, ('mode', 'passed'))
                if result['mode'] != mode or type(result['passed']) is not bool:
                    reject()
                fixture_ok = result['passed']
        public_fixtures[mode] = {'process': fixture['process'], 'streamsClean': fixture['streamsClean'], 'result': result, 'passed': fixture_ok and fixture['streamsClean']}
        passed = passed and public_fixtures[mode]['passed']
    public = {**data, 'runs': runs, 'loggingFixtures': public_fixtures, 'loggingDegraded': public_degraded, 'oldNavigationGate': 'FAIL_RETAINED', 'passed': passed}
    return public


def write_validated(raw_path, output_path, diagnostic=None):
    """Trusted owned caller paths; regular-file check, capped read, exclusive output.

    No hostile concurrent filesystem mutation guarantee. Existing outputs are
    refused, never overwritten or treated as this invocation's success.
    """
    if diagnostic is None:
        diagnostic = {}
    diagnostic['stage'] = 'IO_PARENT'
    import os
    import stat
    from pathlib import Path
    raw_path, output_path = Path(raw_path), Path(output_path)
    for path in (raw_path.parent, output_path.parent):
        if not path.is_absolute() or path.resolve() != path or not stat.S_ISDIR(path.lstat().st_mode):
            reject()
    if raw_path.parent != output_path.parent or not stat.S_ISREG(raw_path.lstat().st_mode):
        reject()
    diagnostic['stage'] = 'IO_READ'
    with raw_path.open('rb') as source:
        raw = source.read(MAX_BYTES + 1)
    result = validate(raw, diagnostic)
    diagnostic['stage'] = 'PUBLIC_SERIALIZE'
    public_bytes = (json.dumps(result, ensure_ascii=True, indent=2) + '\n').encode('utf-8')
    if len(public_bytes) > MAX_BYTES:
        reject()
    diagnostic['stage'] = 'OUTPUT_CREATE'
    descriptor = os.open(output_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    diagnostic['stage'] = 'OUTPUT_WRITE'
    with os.fdopen(descriptor, 'wb') as destination:
        destination.write(public_bytes)
    return result['passed']



DIAGNOSTIC_STAGES = frozenset((
    'IO_PARENT', 'IO_READ', 'JSON_PARSE', 'OUTER_SCHEMA', 'OUTER_FLAGS',
    'INSTALL_PROCESS', 'LOGGING_DEGRADED', 'LOGGING_FIXTURES', 'RUN_COLLECTIONS', 'NEGATIVE_CRASH', 'NEGATIVE_TAMPER',
    'PUBLIC_SERIALIZE', 'OUTPUT_CREATE', 'OUTPUT_WRITE',
    *(f'RUN_{mode}_{part}' for mode in ('SOURCE', 'PACKAGE')
      for part in ('SHAPE', 'PROCESS', 'SIZE', 'LINES', 'JSON', 'RESULT')),
))


def diagnostic_lines(diagnostic):
    # Fixed allowlists only; never emit exception messages or input field values.
    stage = diagnostic.get('stage')
    safe_stage = stage if type(stage) is str and stage in DIAGNOSTIC_STAGES else 'UNKNOWN'
    lines = ['FOUNDATION_VALIDATION_STAGE_' + safe_stage]
    summary = diagnostic.get('stdout')
    if (type(summary) is dict and set(summary) == {'mode', 'count', 'otherCount', 'classes'} and
            type(summary['mode']) is str and summary['mode'] in ('source', 'package') and
            type(summary['count']) is int and 0 <= summary['count'] <= 32769 and
            type(summary['otherCount']) is int and 0 <= summary['otherCount'] <= summary['count'] and
            type(summary['classes']) is tuple and len(summary['classes']) <= 8 and
            all(type(item) is str and item in ('READY', 'CLOSED', 'RESULT', 'EMPTY', 'WHITESPACE', 'OTHER')
                for item in summary['classes'])):
        lines.append('FOUNDATION_STDOUT_' + summary['mode'].upper() + '_COUNT_' +
                     str(summary['count']) + '_OTHER_' + str(summary['otherCount']) + '_ORDER_' + '_'.join(summary['classes']))
    failure = diagnostic.get('failure')
    if type(failure) is str and failure in FAILURES:
        lines.append('FOUNDATION_SUPERVISOR_STAGE_' + failure)
    return lines


def main():
    import sys
    from pathlib import Path
    if len(sys.argv) != 1:
        print('FOUNDATION_VALIDATION_INVALID')
        return 2
    root = Path(__file__).resolve().parents[1] / '.runtime'
    diagnostic = {}
    try:
        passed = write_validated(root / 'unvalidated.json', root / 'validated.json', diagnostic)
    except (OSError, ValueError, UnicodeError, RecursionError):
        print('FOUNDATION_VALIDATION_INVALID')
        for line in diagnostic_lines(diagnostic):
            print(line)
        return 2
    # Printed only after this invocation exclusively created and closed the output.
    print('FOUNDATION_VALIDATION_WRITTEN')
    print('FOUNDATION_HOSTED_PASS' if passed else 'FOUNDATION_HOSTED_FAIL')
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
