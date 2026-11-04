"""Strict actual main/Help VERSION evidence; historical managed evidence is reused, not rerun."""
import json
import re
import stat
from pathlib import Path
from validate_runtime import exact_record, unique_pairs, reject, validate_process
from validate_persistence import _admit_root, _read_owned, _write_new

SCOPE = 'HOSTED_MAIN_RUNTIME_VERSION_SOURCE_ONLY'
HISTORY = 'REUSED_C955D1CA_NOT_RERUN'
CASES = ('mainReady', 'schema4Observed', 'archiveProvisioned', 'setupRetired', 'readOnlyNoHelper', 'versionControlsPresent', 'pendingAcknowledged', 'versionVerified', 'installationBound', 'schema7Intents', 'schema7Result', 'helperAbsent', 'serviceRetired', 'mainClosed')
BOOTSTRAP = ('auditedCopy', 'provisioned', 'authenticated', 'mainReady', 'schema4',
             'migration3BackupAuthenticated', 'migration4ReceiptBound',
             'durableStartupCommitted', 'captureStoreEmpty', 'leaseReleased', 'journalSettled')
FAILURES = ('PREPARE_FAILED', 'INSTALL_FAILED', 'CONTROL_FAILED', 'NATIVE_FAILED',
            'VALIDATION_FAILED', 'CLEANUP_FAILED')
INTEGRITY = ('originalArchiveUnchanged', 'originalSourceUnchanged')


def parse(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= 65536:
        reject()
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=unique_pairs,
                          parse_constant=lambda _: reject())
    except (UnicodeError, ValueError, RecursionError):
        reject()


def booleans(value, keys):
    exact_record(value, keys)
    if any(type(v) is not bool for v in value.values()):
        reject()
    return {key: value[key] for key in keys}


def observation(value):
    exact_record(value, ('version', 'scope', 'cases', 'readyCount', 'closedCount'))
    if (type(value['version']) is not int or value['version'] != 1 or
            value['scope'] != SCOPE or type(value['readyCount']) is not int or
            value['readyCount'] != 1 or type(value['closedCount']) is not int or
            value['closedCount'] != 1):
        reject()
    return {'version': 1, 'scope': SCOPE, 'cases': booleans(value['cases'], CASES),
            'readyCount': 1, 'closedCount': 1}


def validate(value):
    if type(value) is not dict:
        reject()
    keys = ('version', 'scope', 'excludedVaultContext', 'bootstrap', 'observation', 'process',
            *INTEGRITY, 'directoryCleanup', 'failure', 'historicalManagedEvidence')
    exact_record(value, keys + (('passed',) if 'passed' in value else ()))
    if (type(value['version']) is not int or value['version'] != 2 or value['scope'] != SCOPE or
            value['excludedVaultContext'] != 'P106_UNMET_NOT_RERUN' or value['historicalManagedEvidence'] != HISTORY):
        reject()
    if any(type(value[key]) is not bool for key in (*INTEGRITY, 'directoryCleanup')):
        reject()
    if value['failure'] is not None and value['failure'] not in FAILURES:
        reject()
    bootstrap = value['bootstrap']
    if bootstrap is not None:
        exact_record(bootstrap, ('version', 'cases'))
        if type(bootstrap['version']) is not int or bootstrap['version'] != 1:
            reject()
        bootstrap = {'version': 1, 'cases': booleans(bootstrap['cases'], BOOTSTRAP)}
    observed = observation(value['observation']) if value['observation'] is not None else None
    process = value['process']
    normal = False
    if process is not None:
        normal = validate_process(process)
        process = {key: process[key] for key in ('status', 'exitCode', 'cleanupComplete',
                                               'stdoutTruncated', 'stderrTruncated')}
    if value['failure'] is None and any(v is None for v in (bootstrap, observed, process)):
        reject()
    passed = bool(value['failure'] is None and value['directoryCleanup'] and normal and
                  value['originalArchiveUnchanged'] and value['originalSourceUnchanged'] and
                  bootstrap and all(bootstrap['cases'].values()) and
                  observed and all(observed['cases'].values()))
    if 'passed' in value and (type(value['passed']) is not bool or value['passed'] != passed):
        reject()
    return {'version': 2, 'scope': SCOPE, 'historicalManagedEvidence': HISTORY, 'excludedVaultContext': 'P106_UNMET_NOT_RERUN',
            'bootstrap': bootstrap, 'observation': observed, 'process': process,
            **{key: value[key] for key in INTEGRITY},
            'directoryCleanup': value['directoryCleanup'], 'failure': value['failure'],
            'passed': passed}


HISTORICAL_HASHES = {'desktop/native/IsolatedAdbServer.cs': '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7', 'desktop/native/RetainedAdbSession.cs': 'ee8081174a680e8ff43283ed8b43ffc789a47c46596bb2c13ae0ec7555274655', 'desktop/native/RetainedAdbProtocol.cs': '187637ea62b9455ad1bb0fd6730c7a8ac7a0ed86b906277c1407fed17905a9dc', 'desktop/native/RetainedHostAdmission.cs': '2e5602d3965b753ae536cf51a9467af77e59fc1b477ae06029dcfbd56e9c3110', 'desktop/tests/fixtures/RetainedAdbProtocolFixture.cs': '5c16986dd90468dc5e3408465b18ca332d5f2a317a2c8abb0e574fcc8984f387', 'desktop/verification/Invoke-RetainedManagedFixture.ps1': '7446fdb1c47aaa077b65dc30abca658762844ce19fa851a573476540653433d2', 'desktop/scripts/retained-managed-fixture.mjs': '7cbbe255f265c9e906a7db95e1625075cb0fc5c8277b248172b695a708069bca', 'tools/phase-00/HostProbeNative.cs': 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89', 'desktop/verification/WindowsBoundary.psm1': 'd796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf', 'desktop/verification/OwnedFiles.psm1': '17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29'}

def verify_private(raw):
    h = parse(raw['historical-managed.json'])
    exact_record(h, ('version', 'reportSha256', 'sourceHashes'))
    if type(h['version']) is not int or h != {'version': 1, 'reportSha256': '41e93f3cef944512e6d48d2ebebe526f7c56615c7d66a3aab1e542d177b82a0d', 'sourceHashes': HISTORICAL_HASHES}:
        reject()
    observed = observation(parse(raw['main-runtime-version-observed.json']))
    final = observation(parse(raw['main-runtime-version-result.json']))
    if any(observed['cases'][k] != (k not in ('schema7Intents', 'schema7Result')) for k in CASES):
        reject()
    expected = {**observed, 'cases': {**observed['cases'], 'schema7Intents': True, 'schema7Result': True}}
    if final != expected:
        reject()
    b = parse(raw['main-runtime-version-binding.json'])
    exact_record(b, ('version', 'operationId', 'installationRevision', 'expectedRevision', 'pendingRevision', 'verifiedRevision', 'reads', 'requestId'))
    if (type(b['version']) is not int or b['version'] != 1 or type(b['operationId']) is not str or
            re.fullmatch(r'[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}', b['operationId']) is None or
            any(type(b[k]) is not int or not 0 <= b[k] <= 9007199254740991 for k in ('installationRevision', 'expectedRevision', 'pendingRevision', 'verifiedRevision', 'reads')) or
            b['installationRevision'] < 1 or not 1 <= b['reads'] <= 41 or not b['expectedRevision'] < b['pendingRevision'] < b['verifiedRevision'] or
            type(b['requestId']) is not str or re.fullmatch(r'p[1-9][0-9]{0,15}', b['requestId']) is None or int(b['requestId'][1:]) > 9007199254740991):
        reject()


def stage(root):
    root, token = _admit_root(root)
    if (root.parent.name != '.retained-host-runtime' or
            root.name != 'r'):
        reject()
    names = ('launcher-capture.json', 'bootstrap.json', 'main-runtime-version-result.json', 'integrity.json', 'main-runtime-version-observed.json', 'main-runtime-version-binding.json', 'historical-managed.json')
    raw = {name: _read_owned(root, name) for name in names}
    capture = parse(raw['launcher-capture.json'])
    exact_record(capture, ('process', 'stdout', 'stderr'))
    normal = validate_process(capture['process'])
    for key in ('stdout', 'stderr'):
        if type(capture[key]) is not str or len(capture[key].encode('utf-16-le')) // 2 > 32768:
            reject()
    if not normal or capture['stdout'].replace('\r\n', '\n') not in (
            'PERSISTENCE_DESKTOP_CLOSED\n', '\nPERSISTENCE_DESKTOP_CLOSED\n'):
        reject()
    if any(line in capture['stderr'].splitlines() for line in (
            'RETAINED_HOST_FAILED', 'MAIN_RUNTIME_VERSION_FAILED', 'PERSISTENCE_LAUNCH_PROBE_FAILED',
            'BOOTSTRAP_FAILED', 'BOOTSTRAP_CLEANUP_FAILED')):
        reject()
    integrity = parse(raw['integrity.json'])
    exact_record(integrity, ('version', *INTEGRITY))
    if type(integrity['version']) is not int or integrity['version'] != 1:
        reject()
    verify_private(raw)
    value = validate({'version': 2, 'scope': SCOPE, 'historicalManagedEvidence': HISTORY,
                      'excludedVaultContext': 'P106_UNMET_NOT_RERUN',
                      'bootstrap': parse(raw['bootstrap.json']),
                      'observation': parse(raw['main-runtime-version-result.json']),
                      'process': capture['process'],
                      **{key: integrity[key] for key in INTEGRITY},
                      'directoryCleanup': False, 'failure': None})
    # Bind the exact inspected records and retained marker through exclusive publication.
    if _admit_root(root)[1] != token or any(_read_owned(root, name) != raw[name] for name in names):
        reject()
    _write_new(root, 'public.json', value)
    return bool(all(value['bootstrap']['cases'].values()) and
                all(value['observation']['cases'].values()) and
                all(value[key] for key in INTEGRITY))


def publish(base):
    if (not base.is_absolute() or base.resolve() != base or
            not stat.S_ISDIR(base.lstat().st_mode)):
        reject()
    value = validate(parse(_read_owned(base, 'unvalidated.json')))
    _write_new(base, 'validated.json', value)
    return value['passed']




def main(argv=None):
    import sys
    args = sys.argv[1:] if argv is None else argv
    try:
        if len(args) == 2 and args[0] == 'stage':
            ok = stage(Path(args[1]))
            print('MAIN_RUNTIME_VERSION_STAGE_VALIDATED')
            return 0 if ok else 1
        if args != ['publish']:
            reject()
        ok = publish(Path(__file__).resolve().parents[1] / '.retained-host-runtime')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        print('MAIN_RUNTIME_VERSION_VALIDATION_INVALID')
        return 2
    print('MAIN_RUNTIME_VERSION_VALIDATION_WRITTEN')
    print('MAIN_RUNTIME_VERSION_VALIDATION_PASS' if ok else 'MAIN_RUNTIME_VERSION_VALIDATION_FAIL')
    return 0 if ok else 1

if __name__ == '__main__':
    raise SystemExit(main())
