"""Fixed, source-only retained VERSION evidence; no device/server or managed-fixture claim."""
import json
import re
import stat
from pathlib import Path
from validate_runtime import exact_record, unique_pairs, reject, validate_process
from validate_persistence import _admit_root, _read_owned, _write_new

SCOPE = 'HOSTED_RETAINED_VERSION_SOURCE_ONLY'
CASES = ('mainReady', 'schema4Observed', 'archiveProvisioned', 'setupRetired',
         'actualRuntimeAdmitted', 'parentReceiptBound', 'versionObserved',
         'invocationRetired', 'helperStarted', 'helperRetired', 'helperExitZero',
         'helperDirectoryRemoved', 'mainClosed')
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
            *INTEGRITY, 'directoryCleanup', 'failure')
    exact_record(value, keys + (('passed',) if 'passed' in value else ()))
    if (type(value['version']) is not int or value['version'] != 1 or value['scope'] != SCOPE or
            value['excludedVaultContext'] != 'P106_UNMET_NOT_RERUN'):
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
    return {'version': 1, 'scope': SCOPE, 'excludedVaultContext': 'P106_UNMET_NOT_RERUN',
            'bootstrap': bootstrap, 'observation': observed, 'process': process,
            **{key: value[key] for key in INTEGRITY},
            'directoryCleanup': value['directoryCleanup'], 'failure': value['failure'],
            'passed': passed}


def stage(root):
    root, token = _admit_root(root)
    if (root.parent.name != '.retained-host-runtime' or
            root.name != 'r'):
        reject()
    names = ('launcher-capture.json', 'bootstrap.json', 'retained-host-result.json', 'integrity.json')
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
            'RETAINED_HOST_FAILED', 'PERSISTENCE_LAUNCH_PROBE_FAILED',
            'BOOTSTRAP_FAILED', 'BOOTSTRAP_CLEANUP_FAILED')):
        reject()
    integrity = parse(raw['integrity.json'])
    exact_record(integrity, ('version', *INTEGRITY))
    if type(integrity['version']) is not int or integrity['version'] != 1:
        reject()
    value = validate({'version': 1, 'scope': SCOPE,
                      'excludedVaultContext': 'P106_UNMET_NOT_RERUN',
                      'bootstrap': parse(raw['bootstrap.json']),
                      'observation': parse(raw['retained-host-result.json']),
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



MANAGED_SCOPE = 'RETAINED_PROTOCOL_MANAGED_FIXTURE_ONLY'
COMPILER_CODES = ('CS0122', 'CS0052', 'CS0051', 'CS0117', 'CS1061', 'CS0246', 'CS0103', 'CS1002', 'OTHER')
MANAGED_STAGES = ('ADMISSION', 'COMPILE', 'FIXTURE', 'CLEANUP')
MANAGED_V2_HASHES = {'server': '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7', 'session': 'c22e40441fb6bc9bd7d1b1b1aaced656572c3ded8c2666d006449dd8b2f45470', 'protocol': '187637ea62b9455ad1bb0fd6730c7a8ac7a0ed86b906277c1407fed17905a9dc', 'admission': '2e5602d3965b753ae536cf51a9467af77e59fc1b477ae06029dcfbd56e9c3110', 'fixture': '17471cdc8fe506dda87ba0f598615c202d2857e9fbe85d449745a2d9c904dad4', 'probe': 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89', 'gate': '3fa9cbfcc7106239b4001bcf4d6c09495c86f47bdc22cdcb48080a62ab57d4f3', 'wrapper': 'f382bf579b186749c6662b3f268dd8b262838f2f5b6fb932144c535856a2c396', 'boundary': 'd796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf', 'ownedFiles': '17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29'}

MANAGED_V3_HASHES = {'server': '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7', 'session': 'c22e40441fb6bc9bd7d1b1b1aaced656572c3ded8c2666d006449dd8b2f45470', 'protocol': '3082dce2e17b728747187f3213863302bb2506a0ace746ff273b28759eff121d', 'admission': '2e5602d3965b753ae536cf51a9467af77e59fc1b477ae06029dcfbd56e9c3110', 'fixture': '85b463edf046860370e20a4cbd05f456369f9ef8a42654d604e51134657083ae', 'probe': 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89', 'gate': '7988ea94db09b3567787fcb33eec5c616391210341aba0dd69e257e3e0940397', 'wrapper': 'c07aa2b221eea816045ecc4bfb881fc2309e4097680d059ea9a788fc73dfe3fb', 'boundary': 'd796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf', 'ownedFiles': '17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29'}

MANAGED_V4_HASHES = {'server': '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7', 'session': 'd192f132cd7c4463ae2e3cd65d75f34b95ae10cdfab92dfb1eb61d3b60446d4f', 'protocol': '1959feb7f83d005fddf9c6df0762ca5c7dd21946fe3c2f1b8bd9056b2e426757', 'admission': '2e5602d3965b753ae536cf51a9467af77e59fc1b477ae06029dcfbd56e9c3110', 'fixture': '1e7a2def3b57a3b79cfc51b6dc6143807aab7513d3bb387d9a8ac2ecf9303d8a', 'probe': 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89', 'gate': 'd1ba3f6cb95018fab74492d4f89579e1dc5ff6b04518085c7881c996accf4236', 'wrapper': '6a018a9694a155e28b849e620f55061cff76ed32a5a105195fc74c7f0b6fba6b', 'boundary': 'd796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf', 'ownedFiles': '17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29'}


MANAGED_V5_HASHES = {'server': '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7', 'session': 'be62300592244f1474fa340101976cb86ad5ed5c6734b98b28dc545d6b00ce71', 'protocol': '8af014e0d5082ec3bc0c2872c06114b34f621bfd6097fea61b86d7ba832df5fd', 'admission': '2e5602d3965b753ae536cf51a9467af77e59fc1b477ae06029dcfbd56e9c3110', 'fixture': 'c10522693707ac3e526756044cf87b58abf9c037704031bfeeca7af26ae92aff', 'probe': 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89', 'gate': '5f23e3ae03fd349edac4ff582c99106914980669329d07421e2f4031e4651804', 'wrapper': '63d276e48a1f2d39cb45f259bca2c24e7a4017938d6fd1098133b1888820e141', 'boundary': 'd796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf', 'ownedFiles': '17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29'}

def validate_managed(value):
    if type(value) is not dict or type(value.get('version')) is not int or value['version'] not in (1, 2, 3, 4, 5):
        reject()
    version = value['version']
    keys = ('version', 'scope', 'compileProcess', 'fixtureProcess', 'groupsPassed', 'compilerDiagnostics', 'sourceUnchanged', 'directoryCleanup', 'passed')
    exact_record(value, keys + (('inputHashes',) if version >= 2 else ()))
    groups = {1: 8, 2: 10, 3: 19, 4: 27, 5: 39}[version]
    expected_hashes = {2: MANAGED_V2_HASHES, 3: MANAGED_V3_HASHES, 4: MANAGED_V4_HASHES, 5: MANAGED_V5_HASHES}.get(version, {})
    hashes = {}
    if version >= 2:
        hashes = value['inputHashes']
        if type(hashes) is not dict or any(k not in expected_hashes or type(v) is not str or v != expected_hashes[k] for k, v in hashes.items()):
            reject()
        if hashes and tuple(hashes) != tuple(expected_hashes):
            reject()
    if (type(value['version']) is not int or
            value['scope'] != MANAGED_SCOPE or type(value['groupsPassed']) is not int or
            value['groupsPassed'] not in (0, groups)):
        reject()
    for key in ('sourceUnchanged', 'directoryCleanup', 'passed'):
        if type(value[key]) is not bool:
            reject()
    codes = value['compilerDiagnostics']
    if (type(codes) is not list or len(codes) > len(COMPILER_CODES) or
            any(type(code) is not str or code not in COMPILER_CODES for code in codes) or
            len(set(codes)) != len(codes) or
            codes != [code for code in COMPILER_CODES if code in codes]):
        reject()
    processes = {}
    for key in ('compileProcess', 'fixtureProcess'):
        row = value[key]
        if row is not None:
            validate_process(row)
            row = {k: row[k] for k in ('status', 'exitCode', 'cleanupComplete',
                                       'stdoutTruncated', 'stderrTruncated')}
        processes[key] = row
    def successful(row, statuses):
        return bool(row and row['status'] in statuses and row['exitCode'] == 0 and
                    row['cleanupComplete'] and not row['stdoutTruncated'] and not row['stderrTruncated'])
    passed = bool(successful(processes['compileProcess'], ('SUCCESS', 'EMPTY_OUTPUT')) and
                  successful(processes['fixtureProcess'], ('SUCCESS',)) and
                  value['groupsPassed'] == groups and (version == 1 or hashes == expected_hashes) and value['sourceUnchanged'] and
                  value['directoryCleanup'] and not codes)
    if value['passed'] != passed:
        reject()
    return {'version': version, 'scope': MANAGED_SCOPE, **processes,
            'groupsPassed': value['groupsPassed'], 'compilerDiagnostics': list(codes),
            'sourceUnchanged': value['sourceUnchanged'],
            **({'inputHashes': dict(hashes)} if version >= 2 else {}),
            'directoryCleanup': value['directoryCleanup'], 'passed': passed}


def managed_output(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= 16384:
        reject()
    try:
        text = raw.decode('utf-8').replace('\r\n', '\n')
    except UnicodeError:
        reject()
    if not text.endswith('\n') or '\r' in text:
        reject()
    lines = text[:-1].split('\n')
    if not 2 <= len(lines) <= 4:
        reject()
    markers = ('RETAINED_MANAGED_FIXTURE_PASS', 'RETAINED_MANAGED_FIXTURE_FAIL')
    if lines[-1] not in markers:
        reject()
    stages = lines[:-2]
    allowed = tuple('RETAINED_MANAGED_STAGE_' + stage for stage in MANAGED_STAGES)
    if any(line not in allowed for line in stages) or len(set(stages)) != len(stages):
        reject()
    if len(stages) == 2 and (stages[0] == allowed[-1] or stages[1] != allowed[-1]):
        reject()
    value = validate_managed(parse(lines[-2].encode('utf-8')))
    if (lines[-1] == markers[0]) != value['passed'] or (stages and value['passed']):
        reject()
    return value


def managed(base, current_server=False, current_discovery=False, current_metadata=False):
    if (not base.is_absolute() or base.resolve() != base or
            not stat.S_ISDIR(base.lstat().st_mode)):
        reject()
    file = base / '.retained-managed-output.txt'
    if not 0 < file.lstat().st_size <= 16384:
        reject()
    value = managed_output(_read_owned(base, file.name))
    if current_server and value['version'] != 3:
        reject()
    if current_discovery and value['version'] != 4:
        reject()
    if current_metadata and value['version'] != 5:
        reject()
    _write_new(base, 'retained-managed-validated.json', value)
    return value['passed']


def main(argv=None):
    import sys
    args = sys.argv[1:] if argv is None else argv
    try:
        if len(args) == 2 and args[0] == 'stage':
            ok = stage(Path(args[1]))
            print('RETAINED_HOST_STAGE_VALIDATED')
            return 0 if ok else 1
        if args in (['managed'], ['managed-server'], ['managed-discovery'], ['managed-metadata']):
            ok = managed(Path(__file__).resolve().parents[1], args == ['managed-server'], args == ['managed-discovery'], args == ['managed-metadata'])
            print('RETAINED_MANAGED_VALIDATION_WRITTEN')
            print('RETAINED_MANAGED_VALIDATION_PASS' if ok else 'RETAINED_MANAGED_VALIDATION_FAIL')
            return 0 if ok else 1
        if args != ['publish']:
            reject()
        ok = publish(Path(__file__).resolve().parents[1] / '.retained-host-runtime')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        print('RETAINED_MANAGED_VALIDATION_INVALID' if args in (['managed'], ['managed-server'], ['managed-discovery'], ['managed-metadata']) else 'RETAINED_HOST_VALIDATION_INVALID')
        return 2
    print('RETAINED_HOST_VALIDATION_WRITTEN')
    print('RETAINED_HOST_VALIDATION_PASS' if ok else 'RETAINED_HOST_VALIDATION_FAIL')
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
