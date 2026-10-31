"""Fixed evidence only; instrumentation is not genuine native-widget interaction."""
import json
from validate_runtime import exact_record, unique_pairs, reject
CASES = ('audited_copy','first_provisioned','first_authenticated','first_main_ready','first_lease_released',
         'second_no_reprovision','same_old_backup','second_main_ready','second_lease_released','v2_orderly_proof',
         'schema2','automatic_admission_persisted','backups_persisted','dialog_answers_instrumented')


def validate_raw(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= 65536:
        reject()
    value = json.loads(raw.decode('utf8'), object_pairs_hook=unique_pairs, parse_constant=lambda _: reject())
    return validate_public(value)


def validate_public(value):
    exact_record(value, ('version','result','cleanupComplete'))
    result=value['result']
    exact_record(result, ('version','scope','cases','protectedCount','ordinaryCount'))
    exact_record(result['cases'], CASES)
    if type(value['version']) is not int or value['version'] != 1 or type(result['version']) is not int or result['version'] != 1:
        reject()
    if result['scope'] != 'INSTRUMENTED_PRODUCTION_LAUNCHER' or type(value['cleanupComplete']) is not bool or any(type(result['cases'][k]) is not bool for k in CASES):
        reject()
    for key, limit in (('protectedCount',2),('ordinaryCount',1)):
        if type(result[key]) is not int or not 0 <= result[key] <= limit:
            reject()
    return value['cleanupComplete'] and all(result['cases'].values()) and result['protectedCount']==2 and result['ordinaryCount']==1


def publish(root):
    import os
    import stat
    if not root.is_absolute() or root.resolve() != root or not stat.S_ISDIR(root.lstat().st_mode):
        reject()
    source = root / 'launcher-e2e-result.json'
    info = source.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > 65536 or source.resolve() != source:
        reject()
    with source.open('rb') as handle:
        raw = handle.read(65537)
    passed = validate_raw(raw)
    value = json.loads(raw.decode('utf8'), object_pairs_hook=unique_pairs)
    output = json.dumps(value, ensure_ascii=True, separators=(',', ':')).encode('ascii')
    if len(output) > 65536:
        reject()
    with (root / 'launcher-e2e-validated.json').open('xb') as handle:
        handle.write(output)
        handle.flush()
        os.fsync(handle.fileno())
    return passed


def main():
    import sys
    from pathlib import Path
    try:
        if len(sys.argv) != 1:
            reject()
        passed = publish(Path(__file__).resolve().parents[1] / '.runtime')
    except (OSError, ValueError, UnicodeError, RecursionError):
        print('PERSISTENCE_LAUNCHER_VALIDATION_INVALID')
        return 2
    print('PERSISTENCE_LAUNCHER_VALIDATION_WRITTEN')
    print('PERSISTENCE_LAUNCHER_VALIDATION_PASS' if passed else 'PERSISTENCE_LAUNCHER_VALIDATION_FAIL')
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
