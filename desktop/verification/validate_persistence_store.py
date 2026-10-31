"""Bounded fixed-schema transaction-crash evidence; never runtime proof by itself."""
import sys
from validate_runtime import exact_record, booleans, reject, validate_process
from validate_persistence import _parse, _read_owned, _write_new, _admit_root

MODES = ('source', 'package')
BOUNDARIES = ('BEFORE_COMMIT', 'AFTER_COMMIT')
STAGES = ('crash', 'reopen')
COMMON = ('profilePreparedBeforeReady', 'leaseVerified', 'prerequisiteAuthenticated',
          'primaryDatabaseUnchanged')
FAILURE_MARKERS = ('PERSISTENCE_STORE_FAILED', 'PERSISTENCE_STORE_DEADLINE')


def case_names(stage):
    if stage == 'crash':
        return COMMON + ('commitBoundaryReached',)
    if stage == 'reopen':
        return COMMON + ('schemaVersionExpected', 'historyExpected', 'integrityValid', 'migrationBusyDenied', 'databaseClosed')
    reject()


def _identity(mode, boundary, stage):
    if (type(mode) is not str or mode not in MODES or type(boundary) is not str or
            boundary not in BOUNDARIES or type(stage) is not str or stage not in STAGES):
        reject()


def _text(value):
    if type(value) is not str:
        reject()
    try:
        if len(value.encode('utf-16-le')) // 2 > 32768:
            reject()
    except UnicodeError:
        reject()


def _process_pass(process, stage):
    success = validate_process(process)
    if stage == 'reopen':
        return success
    return (process['status'] == 'NONZERO_EXIT' and type(process['exitCode']) is int and
            process['exitCode'] != 0 and process['cleanupComplete'] and
            not process['stdoutTruncated'] and not process['stderrTruncated'])


def validate_stage(raw, process, stdout, stderr, mode, boundary, stage):
    """Validate original raw bytes/capture; drop every private stream from output."""
    _identity(mode, boundary, stage)
    value = _parse(raw)
    exact_record(value, ('version', 'mode', 'stage', 'boundary', 'cases'))
    if (type(value['version']) is not int or value['version'] != 1 or value['mode'] != mode or
            value['boundary'] != boundary or value['stage'] != stage):
        reject()
    names = case_names(stage)
    booleans(value['cases'], names)
    process_passed = _process_pass(process, stage)
    _text(stdout)
    _text(stderr)
    lines = stdout.replace('\r\n', '\n').split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    if len(lines) == 2 and lines[0] == '':
        lines = lines[1:]
    marker = (f'PERSISTENCE_STORE_{boundary}_ARMED' if stage == 'crash'
              else 'PERSISTENCE_STORE_REOPEN_CLOSED')
    if lines != [marker]:
        reject()
    no_failure = not any(line in FAILURE_MARKERS for line in stderr.splitlines())
    return {'mode': mode, 'boundary': boundary, 'stage': stage,
            'cases': {key: value['cases'][key] for key in names}, 'process': dict(process),
            'crashArmedObserved': stage == 'crash', 'orderlyQuitObserved': stage == 'reopen',
            'failureMarkerAbsent': no_failure,
            'passed': all(value['cases'].values()) and process_passed and no_failure}


def validate_public(value, mode, boundary, stage):
    """Recheck fixed aggregate input without normalizing private raw evidence."""
    _identity(mode, boundary, stage)
    exact_record(value, ('mode', 'boundary', 'stage', 'cases', 'process',
                         'crashArmedObserved', 'orderlyQuitObserved', 'failureMarkerAbsent', 'passed'))
    if value['mode'] != mode or value['boundary'] != boundary or value['stage'] != stage:
        reject()
    booleans(value['cases'], case_names(stage))
    for key in ('crashArmedObserved', 'orderlyQuitObserved', 'failureMarkerAbsent', 'passed'):
        if type(value[key]) is not bool:
            reject()
    if value['crashArmedObserved'] != (stage == 'crash') or value['orderlyQuitObserved'] != (stage == 'reopen'):
        reject()
    derived = (all(value['cases'].values()) and _process_pass(value['process'], stage) and
               value['failureMarkerAbsent'])
    # Process schema must be checked even if a preceding false case short-circuits.
    _process_pass(value['process'], stage)
    if value['passed'] != derived:
        reject()
    return value['passed']


def stage_files(root, mode, boundary, stage):
    _identity(mode, boundary, stage)
    suffix = f'{mode}-{boundary.lower()}-{stage}'
    capture = _parse(_read_owned(root, f'persistence-store-capture-{suffix}.json'))
    exact_record(capture, ('process', 'stdout', 'stderr'))
    public = validate_stage(_read_owned(root, f'persistence-store-{suffix}.json'),
                            capture['process'], capture['stdout'], capture['stderr'],
                            mode, boundary, stage)
    _write_new(root, f'persistence-store-public-{suffix}.json', public)
    return public['passed']


def main(argv):
    try:
        if len(argv) != 4:
            reject()
        path, mode, boundary, stage = argv
        _identity(mode, boundary, stage)
        root, _ = _admit_root(path)
        passed = stage_files(root, mode, boundary, stage)
    except (ValueError, TypeError, OSError, UnicodeError, RecursionError, KeyError):
        print('PERSISTENCE_STORE_VALIDATION_INVALID')
        return 2
    print('PERSISTENCE_STORE_VALIDATION_PASS' if passed else 'PERSISTENCE_STORE_VALIDATION_FAIL')
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
