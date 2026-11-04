"""Strict, bounded evidence contract; validation is not runtime execution proof."""
import json

MAX_BYTES = 65536
CASES = frozenset((
    'runtime_versions', 'mode_identity', 'main_bundle_loaded', 'diagnostic_rendered',
    'secure_preferences', 'approved_preload', 'no_node_globals', 'bounded_public_bridge',
    'native_menu_absent', 'isolated_world_separate', 'popup_denied',
    'permission_denied', 'download_denied', 'network_policy_denied',
    'unknown_asset_denied', 'lifecycle_close_reopen', 'document_open_public_only',
    'reload_session_revoked', 'about_blank_sender_denied', 'orderly_quit',
    'health_read', 'settings_read', 'ipc_request_denials', 'ipc_sender_denials', 'react_explicit_read', 'logging_correlation', 'legacy_protocol_compatibility',
    'logging_persisted', 'logging_canary_absent',
))
OBSERVATIONS = frozenset(('documentOpenUrlUnchanged', 'reloadUrlUnchanged',
                          'aboutBlankUrlChanged', 'aboutBlankDenialObserved'))
VERSIONS = {'electron': '45.1.0', 'node': '24.22.1', 'chrome': '156.0.8078.49'}


class InvalidEvidence(ValueError):
    """Fixed failure class; never contains input values."""


def reject():
    raise InvalidEvidence('INVALID_RUNTIME_EVIDENCE')


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            reject()
        result[key] = value
    return result


def exact_record(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        reject()


def booleans(value, keys):
    exact_record(value, keys)
    if any(type(item) is not bool for item in value.values()):
        reject()


def validate_process(process):
    exact_record(process, ('status', 'exitCode', 'cleanupComplete',
                           'stdoutTruncated', 'stderrTruncated'))
    if type(process['status']) is not str or process['status'] not in (
            'SUCCESS', 'NONZERO_EXIT', 'TIMEOUT', 'CAPTURE_FAILED',
            'LAUNCH_FAILED', 'ACCESS_DENIED', 'CLEANUP_FAILED', 'EMPTY_OUTPUT'):
        reject()
    exit_code = process['exitCode']
    if exit_code is not None and (type(exit_code) is not int or
                                  not -2147483648 <= exit_code <= 2147483647):
        reject()
    for field in ('cleanupComplete', 'stdoutTruncated', 'stderrTruncated'):
        if type(process[field]) is not bool:
            reject()
    if process['status'] in ('TIMEOUT', 'LAUNCH_FAILED', 'ACCESS_DENIED') and exit_code is not None:
        reject()
    if process['status'] == 'CLEANUP_FAILED' and process['cleanupComplete']:
        reject()
    if process['status'] in ('SUCCESS', 'EMPTY_OUTPUT') and exit_code != 0:
        reject()
    if process['status'] == 'NONZERO_EXIT' and (exit_code is None or exit_code == 0):
        reject()
    return (process['status'] == 'SUCCESS' and process['cleanupComplete'] and
            not process['stdoutTruncated'] and not process['stderrTruncated'])


def validate_logging(value):
    exact_record(value, ('recordCount', 'crashArtifactCount'))
    for key, ceiling in (('recordCount', 32768), ('crashArtifactCount', 256)):
        if type(value[key]) is not int or not 0 <= value[key] <= ceiling:
            reject()


def validate(raw):
    """Accept exact fixed-schema bytes, including truthful false case results.

    A valid document is not necessarily passing. Missing evidence is rejected;
    orderly application quit and native Job cleanup are separate requirements.
    """
    if type(raw) is not bytes or not 0 < len(raw) <= MAX_BYTES:
        reject()
    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_pairs,
                           parse_constant=lambda _: reject())
    except (ValueError, UnicodeError, RecursionError):
        reject()
    exact_record(value, ('schemaVersion', 'oldNavigationGate', 'runs'))
    if type(value['schemaVersion']) is not int or value['schemaVersion'] != 1:
        reject()
    if value['oldNavigationGate'] != 'FAIL_RETAINED':
        reject()
    runs = value['runs']
    exact_record(runs, ('source', 'package'))
    passed = True
    for mode in ('source', 'package'):
        run = runs[mode]
        exact_record(run, ('mode', 'versions', 'cases', 'observations', 'logging', 'process'))
        if run['mode'] != mode:
            reject()
        exact_record(run['versions'], VERSIONS)
        if run['versions'] != VERSIONS:
            reject()
        booleans(run['cases'], CASES)
        booleans(run['observations'], OBSERVATIONS)
        validate_logging(run['logging'])
        if (run['cases']['logging_persisted'] or run['cases']['logging_correlation']) and run['logging']['recordCount'] == 0:
            reject()
        process_passed = validate_process(run['process'])
        passed = passed and all(run['cases'].values()) and process_passed
    return {'validation': 'VALID', 'passed': passed, 'evidence': value}


def read_bounded(path):
    """Cap the read before allocation; caller owns trusted regular-file selection."""
    with open(path, 'rb') as source:
        return source.read(MAX_BYTES + 1)
