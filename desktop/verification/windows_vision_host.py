"""Fixed trusted-host staging entry, never a candidate/runtime launcher.

Invoked only by the retained native HostStagingProfile via -I -S -B and its
fixed source bootstrap. The hosted stdlib is explicitly trusted, not claimed to
be a newly hash-admitted candidate closure. No subprocess or vendor imports.
"""
import hashlib
import os
from pathlib import Path
import sys
import time

import windows_vision_catalog as catalog
import windows_vision_materialize as material
import windows_vision_prepare as prepare

_STAGE = 'ADMISSION'

SOURCE_NAMES = frozenset((
    'windows_vision_host.py', 'windows_vision_catalog.py',
    'windows_vision_materialize.py', 'windows_vision_prepare.py',
    'windows_materialization_catalog.json', 'windows_python_members.json',
    'windows_reproduction_baseline.json',
    'preprocess-requirements-windows.lock', 'ocr-requirements-windows.lock',
))


def source_index(directory, expected_hash):
    """Index pin comes from native read-held source map, not from itself."""
    if type(expected_hash) is not str or material.SHA.fullmatch(expected_hash) is None:
        raise ValueError('SOURCE_INDEX_PIN')
    raw = prepare._read_bound(directory / 'source-index.json', expected_hash, 8192)
    value = material._json(raw)
    if (type(value) is not dict or set(value) != {'version', 'files'}
            or type(value['version']) is not int or value['version'] != 1
            or type(value['files']) is not dict or set(value['files']) != SOURCE_NAMES):
        raise ValueError('SOURCE_INDEX_SCHEMA')
    hashes = dict(value['files'])
    for name, digest in hashes.items():
        prepare._read_bound(directory / name, digest, 2 * 1024 * 1024)
    hashes['source-index.json'] = expected_hash
    actual = {p.name for p in material._children(directory, len(hashes))}
    if actual != set(hashes):
        raise ValueError('SOURCE_INDEX_MEMBERS')
    return hashes


def host_identity():
    if (os.name != 'nt' or sys.implementation.name != 'cpython'
            or sys.version_info[:2] != (3, 12) or sys.version_info.releaselevel != 'final'
            or sys.maxsize != 9223372036854775807 or not sys.flags.isolated
            or not sys.flags.no_site or not sys.dont_write_bytecode):
        raise ValueError('HOST_POLICY')
    executable = Path(sys.executable)
    material.guarded_path(executable, False)
    # Native admission already binds canonical observed toolcache/executable.
    # Report only finite version/hash, not private host path or arbitrary sys.version.
    with material._opened(executable) as stream:
        pin = material._digest(stream, 16 * 1024 * 1024)
    return {'implementation': 'CPython', 'version': '.'.join(map(str, sys.version_info[:3])),
            'executableSha256': pin.sha256, 'isolated': True, 'siteDisabled': True,
            'bytecodeDisabled': True, 'trust': 'EXISTING_HOSTED_CI_TOOLCHAIN'}


def write_report(directory, name, value):
    if name not in ('prepare.json', 'installed-inventory.json'):
        raise ValueError('REPORT_NAME')
    material.guarded_path(directory, True)
    raw = material.canonical(value)
    if len(raw) > material.MAX_INVENTORY:
        raise ValueError('REPORT_LIMIT')
    path = directory / name
    with path.open('xb') as stream:
        stream.write(raw)
    material.verify_artifact(path, material.ArtifactPin(len(raw), hashlib.sha256(raw).hexdigest()))
    return hashlib.sha256(raw).hexdigest()


def run():
    global _STAGE
    _STAGE = 'ADMISSION'
    if len(sys.argv) != 1:
        raise ValueError('ARGUMENTS')
    identity = host_identity()
    stage = os.environ.get('FONESI_VISION_HOST_STAGE')
    if stage not in ('PREPARE', 'FREEZE'):
        raise ValueError('STAGE')
    acquisition = Path(catalog.ACQUISITION)
    source = acquisition / 'host-source'
    material.guarded_path(source, True)
    _STAGE = 'SOURCE_INDEX'
    hashes = source_index(source, os.environ.get('FONESI_VISION_HOST_INDEX_SHA256'))
    baseline = prepare.load_reproduction_baseline(
        source / 'windows_reproduction_baseline.json',
        hashes['windows_reproduction_baseline.json'], hashes)
    work = Path.cwd()
    material.guarded_path(work, True)
    try:
        relative_work = work.relative_to(acquisition).as_posix()
    except ValueError:
        raise ValueError('WORK') from None
    parts = relative_work.split('/')
    if len(parts) != 2 or parts[0] != 'work' or material.UUID.fullmatch(parts[1]) is None:
        raise ValueError('WORK')
    context = {'version': 1, 'hostSourceHashes': hashes, 'currentWork': relative_work}
    reports = acquisition / 'reports'
    _STAGE = stage
    if stage == 'PREPARE':
        # Native supervisor's original absolute 600 s deadline is authoritative.
        # This local timeout only additionally bounds each network operation;
        # it never extends native custody or resets the overall work deadline.
        result = prepare.prepare(source / 'windows_materialization_catalog.json',
                                 hashes['windows_materialization_catalog.json'],
                                 source / 'windows_python_members.json',
                                 hashes['windows_python_members.json'],
                                 {name: source / (name + '-requirements-windows.lock')
                                  for name in ('preprocess', 'ocr')},
                                 time.monotonic() + 599, host_context=context)
        _STAGE = 'REPORT'
        reports.mkdir(mode=0o700)
        digest = write_report(reports, 'prepare.json', result)
        summary = {'wheelCount': result['wheelCount'], 'pythonFiles': result['pythonFiles'],
                   'modelFiles': result['modelFiles'], 'acquiredBytes': result['acquiredBytes']}
    else:
        members = prepare.load_members(source / 'windows_python_members.json',
                                       hashes['windows_python_members.json'])
        originals = {name: pin for name, pin in members.items() if material._special_original(name)}
        result = prepare.freeze(original_special_files=originals)
        _STAGE = 'REPORT'
        digest = write_report(reports, 'installed-inventory.json', result['inventory'])
        if digest != result['inventorySha256']:
            raise ValueError('INVENTORY_HASH')
        comparison = prepare.compare_reproduction(result['inventory'], baseline['inventory'])
        summary = {'files': len(result['inventory']['files']),
                   'runtimeBytes': result['inventory']['runtimeBytes'],
                   **comparison}
    return receipt(identity, stage, digest, summary)


def receipt(identity, stage, digest, summary):
    return {'version': 1, 'scope': 'TRUSTED_HOST_STAGING_ONLY', 'stage': stage,
            'hostVersion': identity['version'], 'hostExecutableSha256': identity['executableSha256'],
            'hostIsolated': True, 'hostSiteDisabled': True, 'hostBytecodeDisabled': True,
            'hostTrust': 'EXISTING_HOSTED_CI_TOOLCHAIN', 'reportSha256': digest,
            'wheelCount': summary.get('wheelCount'), 'pythonFiles': summary.get('pythonFiles'),
            'modelFiles': summary.get('modelFiles'), 'acquiredBytes': summary.get('acquiredBytes'),
            'runtimeFiles': summary.get('files'), 'runtimeBytes': summary.get('runtimeBytes'),
            'comparison': summary.get('comparison'),
            'inventoryBytes': summary.get('inventoryBytes'),
            'expectedInventorySha256': summary.get('expectedInventorySha256'),
            'candidateInference': 'NOT_RUN'}


def main():
    try:
        raw = material.canonical(run())
        if len(raw) > 8192:
            raise ValueError('OUTPUT_LIMIT')
        sys.stdout.buffer.write(raw + b'\n')
        return 0
    except Exception as error:
        # No arbitrary exception text, URL, environment or local path.
        kind = type(error).__name__
        if kind not in {'ValueError', 'OSError', 'TimeoutError', 'URLError', 'HTTPError',
                        'JSONDecodeError', 'PermissionError', 'FileExistsError',
                        'FileNotFoundError', 'ModuleNotFoundError', 'RuntimeError'}:
            kind = 'Other'
        sys.stderr.buffer.write(material.canonical({'stage': _STAGE, 'type': kind}) + b'\n')
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
