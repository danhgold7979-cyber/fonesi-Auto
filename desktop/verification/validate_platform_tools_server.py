"""Fixed development-only owned-server evidence. No endpoints, keys, paths or raw streams."""
import hashlib
import json
from pathlib import Path

from validate_platform_tools import (ARCHIVE_SHA, UUID, exact, parse, plain, read,
                                     write_new, candidate_at, normal_process)

SCOPE = 'HOSTED_ADB_SERVER_DEVELOPMENT_ONLY'
CASES = ('archiveVerified', 'inventoryVerified', 'sourceBound', 'suppressionConfigured',
         'nativeProfileOwned', 'existingProfileRefused', 'profileCleaned',
         'candidateUnchanged', 'commandForegroundOnly')
SCENARIOS = ('occupied', 'healthy', 'death', 'timeout')
FACTS = ('listenerOwned', 'hostVersionObserved', 'endpointReleased',
         'foreignOwnerUnchanged', 'launchRefused', 'forcedStop', 'deadlineObserved',
         'prematureDeathObserved')
FAILURES = ('PREFLIGHT_FAILED', 'PROFILE_REJECTED', 'SERVER_FAILED',
            'RETIREMENT_FAILED', 'CLEANUP_FAILED')
PREFLIGHT = ('inventoryVerified', 'architectureVerified', 'archiveVerified', 'sourceBound')
# Exact reviewed closure shared with the source controller, finalized before execution.
SOURCES = ('src/main/platform-tools-files.ts', 'verification/platform-tools-candidate.json',
           'verification/platform-tools-server-control.cjs', 'verification/Invoke-PlatformToolsServer.ps1',
           'verification/Test-PlatformToolsServer.ps1', 'verification/platform_tools_archive.py',
           'verification/validate_platform_tools_server.py', 'native/IsolatedAdbServer.cs',
           '../tools/phase-00/HostProbeNative.cs', 'verification/WindowsBoundary.psm1',
           'verification/OwnedFiles.psm1', 'verification/persistence-restore-contract.cjs',
           'verification/validate_platform_tools.py')


def reject():
    raise ValueError('PLATFORM_TOOLS_SERVER_VALIDATION_REJECTED')


def blank():
    return {'version': 1, 'scope': SCOPE, 'candidateSha256': ARCHIVE_SHA,
            'revision': '37.0.1', 'binaryArchitecture': 'IA32', 'hostArchitecture': 'X64',
            'cases': {key: False for key in CASES},
            'scenarios': {name: {'process': None, **{key: False for key in FACTS}}
                          for name in SCENARIOS},
            'directoryCleanup': False, 'failure': None}


def expected_facts(name):
    true = {'endpointReleased', 'foreignOwnerUnchanged', 'launchRefused'} if name == 'occupied' else {
        'listenerOwned', 'hostVersionObserved', 'endpointReleased', 'forcedStop'}
    if name == 'death': true.add('prematureDeathObserved')
    if name == 'timeout': true.add('deadlineObserved')
    return {key: key in true for key in FACTS}


def scenario(value, name):
    exact(value, ('process',) + FACTS)
    if any(type(value[key]) is not bool for key in FACTS): reject()
    process = value['process']
    if process is not None:
        normal_process(process)  # Exact types/status/exit consistency, even for failed evidence.
    if name == 'occupied':
        process_ok = process is None
    else:
        process_ok = (process is not None and process['status'] == 'NONZERO_EXIT'
                      and type(process['exitCode']) is int and process['exitCode'] != 0
                      and process['cleanupComplete'] and not process['stdoutTruncated']
                      and not process['stderrTruncated'])
    return process_ok and all(value[key] == expected_facts(name)[key] for key in FACTS)


def normalize(value):
    prototype = blank()
    keys = tuple(prototype)
    exact(value, keys + (('passed',) if 'passed' in value else ()))
    for key in ('version', 'scope', 'candidateSha256', 'revision', 'binaryArchitecture', 'hostArchitecture'):
        if type(value[key]) is not type(prototype[key]) or value[key] != prototype[key]: reject()
    exact(value['cases'], CASES)
    if any(type(item) is not bool for item in value['cases'].values()): reject()
    exact(value['scenarios'], SCENARIOS)
    results = [scenario(value['scenarios'][name], name) for name in SCENARIOS]
    if type(value['directoryCleanup']) is not bool: reject()
    failure = value['failure']
    if failure is not None and (type(failure) is not str or failure not in FAILURES): reject()
    passed = all(results) and all(value['cases'].values()) and value['directoryCleanup'] and failure is None
    if 'passed' in value and (type(value['passed']) is not bool or value['passed'] != passed): reject()
    # Reconstruct only the exact whitelisted public values. No arbitrary caller strings survive.
    return {**{key: value[key] for key in keys}, 'passed': passed}


def runner_capture(value):
    exact(value, ('process', 'stdout', 'stderr'))
    valid = normal_process(value['process'])
    for key in ('stdout', 'stderr'):
        if type(value[key]) is not str: reject()
        try: length = len(value[key].encode('utf-16-le')) // 2
        except UnicodeError: reject()
        if length > 32768: reject()
    return (valid and value['stdout'].replace('\r\n', '\n') == 'P202_SERVER_OBSERVED\n'
            and value['stderr'] == '')


def stage(root):
    root = plain(Path(root))
    if root.parent.name != '.platform-tools-server-runtime' or not root.name.startswith('run-') or not UUID.fullmatch(root.name[4:]): reject()
    token = read(root / '.owner', 36).decode('ascii')
    if not UUID.fullmatch(token): reject()
    admission = parse(read(root / 'admission.json'))
    exact(admission, ('version', 'runToken', 'sources', 'candidateManifestSha256', 'operation'))
    if type(admission['version']) is not int or admission['version'] != 1 or admission['runToken'] != token or admission['operation'] != 'ISOLATED_SERVER_DEVELOPMENT': reject()
    if not SOURCES: reject()  # No unbound draft can produce accepted stage evidence.
    exact(admission['sources'], SOURCES)
    desktop = Path(__file__).resolve().parent.parent
    for name in SOURCES:
        if admission['sources'][name] != hashlib.sha256(read((desktop / name).resolve())).hexdigest(): reject()
    if admission['candidateManifestSha256'] != hashlib.sha256(read(desktop / 'verification/platform-tools-candidate.json')).hexdigest(): reject()
    preflight = parse(read(root / 'preflight.json'))
    exact(preflight, PREFLIGHT)
    if any(type(flag) is not bool for flag in preflight.values()): reject()
    value = normalize(parse(read(root / 'server.json')))
    if value['directoryCleanup']: reject()  # Stage runs before owned run-tree cleanup.
    candidate_at(root, token)
    runner_ok = runner_capture(parse(read(root / 'runner-capture.json')))
    if not runner_ok and value['failure'] is None:
        value['failure'] = 'SERVER_FAILED'
    if not all(preflight.values()) and value['failure'] is None:
        value['failure'] = 'PREFLIGHT_FAILED'
    value.pop('passed')
    result = normalize(value)
    if read(root / '.owner', 36) != token.encode('ascii'): reject()
    write_new(root / 'server-public.json', result)
    return result


def publish(source, output):
    result = normalize(parse(read(Path(source))))
    write_new(Path(output), result)
    return result


def main(argv=None):
    import sys
    args = sys.argv[1:] if argv is None else argv
    try:
        if len(args) == 2 and args[0] == 'stage':
            result = stage(args[1])
            print('PLATFORM_TOOLS_SERVER_STAGE_VALIDATED')
            complete = all(result['cases'].values()) and all(scenario(result['scenarios'][name], name) for name in SCENARIOS) and result['failure'] is None
            return 0 if complete else 1
        if len(args) == 3 and args[0] == 'publish':
            result = publish(args[1], args[2])
            print('PLATFORM_TOOLS_SERVER_VALIDATION_WRITTEN')
            print('PLATFORM_TOOLS_SERVER_HOSTED_PASS' if result['passed'] else 'PLATFORM_TOOLS_SERVER_HOSTED_FAIL')
            return 0 if result['passed'] else 1
        reject()
    except (ValueError, OSError, UnicodeError, TypeError, KeyError, RecursionError):
        print('PLATFORM_TOOLS_SERVER_VALIDATION_REJECTED')
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
