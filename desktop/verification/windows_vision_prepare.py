"""Fixed-root host PREPARE/FREEZE library. No candidate imports or launchers.

Production calls require the separately reviewed native staging lease throughout.
These functions do not grant execution approval and do not install packages.
There is deliberately no CLI or caller-selectable production root. Private
_at helpers are explicit synthetic-test seams, not platform admission evidence.
"""
import hashlib
import math
import os
from pathlib import Path
import time
from typing import NamedTuple

import windows_vision_catalog as catalog_api
import windows_vision_materialize as material

MODEL_PREFIX = 'en_PP-OCRv5_mobile_rec_infer'
MODEL_NAMES = frozenset(('inference.pdiparams', 'inference.json', 'inference.yml'))
HOST_SOURCE_NAMES = frozenset(('windows_vision_host.py', 'windows_vision_prepare.py',
    'windows_vision_catalog.py', 'windows_vision_materialize.py',
    'windows_materialization_catalog.json', 'windows_python_members.json',
    'preprocess-requirements-windows.lock', 'ocr-requirements-windows.lock', 'source-index.json'))
HOST_WORK_DIRECTORIES = frozenset(('home', 'tmp', 'appdata', 'localappdata'))


class Operations(NamedTuple):
    """Explicit test seam: defaults are source-owned real acquisition/inspection."""
    acquire: object = catalog_api.acquire_one
    inspect: object = material.inspect_wheel
    stage: object = material.stage_tar
    clock: object = time.monotonic


def _deadline(deadline, clock, initial=False):
    if (type(deadline) not in (int, float) or not math.isfinite(deadline)
            or deadline <= clock() or (initial and deadline - clock() > 600)):
        raise ValueError('DEADLINE')


def _read_bound(path, expected_sha256, limit=material.MAX_INVENTORY):
    if type(expected_sha256) is not str or material.SHA.fullmatch(expected_sha256) is None:
        raise ValueError('SOURCE_SHA')
    with material._opened(path) as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit or hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise ValueError('SOURCE_IDENTITY')
    return raw


def load_members(path, expected_sha256):
    value = material._json(_read_bound(path, expected_sha256))
    return _members(value, prefix='python')


def _members(value, prefix):
    if type(value) is not list or not 1 <= len(value) <= material.MAX_ENTRIES:
        raise ValueError('MEMBER_SCHEMA')
    result = {}
    for row in value:
        if (type(row) is not dict or set(row) != {'path', 'bytes', 'sha256'}
                or type(row['path']) is not str or not row['path'].startswith(prefix + '/')
                or row['path'] in result):
            raise ValueError('MEMBER_SCHEMA')
        result[row['path']] = material.ArtifactPin(row['bytes'], row['sha256'])
    material._catalog(result)
    return result


def _artifact_pin(artifact):
    return material.ArtifactPin(artifact['size'], artifact['sha256'])


def _roots():
    if os.name != 'nt':
        raise ValueError('WINDOWS_HOST_REQUIRED')
    # No environment or argument is allowed to redirect these fixed paths.
    return Path(catalog_api.ROOT), Path(catalog_api.ACQUISITION)


def _reserved_empty(path):
    material.guarded_path(path, True)
    children = material._children(path, material.MAX_ENTRIES)
    for child in children:
        if child.name != 'work':
            raise ValueError('RESERVED_ROOT_NOT_FRESH')
        material.guarded_path(child, True)
        if not material._empty_directory(child):
            raise ValueError('RESERVED_WORK_NOT_EMPTY')


def validate_host_context(context):
    """External native-owner context, never a self-authorizing excluded file."""
    if (type(context) is not dict or set(context) != {'version', 'hostSourceHashes', 'currentWork'}
            or type(context['version']) is not int or context['version'] != 1
            or type(context['hostSourceHashes']) is not dict
            or set(context['hostSourceHashes']) != HOST_SOURCE_NAMES
            or type(context['currentWork']) is not str
            or not context['currentWork'].startswith('work/')
            or material.UUID.fullmatch(context['currentWork'][5:]) is None):
        raise ValueError('HOST_CONTEXT_SCHEMA')
    for digest in context['hostSourceHashes'].values():
        if type(digest) is not str or material.SHA.fullmatch(digest) is None:
            raise ValueError('HOST_CONTEXT_HASH')
    return context


def _reserved_acquisition(path, context):
    validate_host_context(context)
    material.guarded_path(path, True)
    if {p.name for p in material._children(path, 2)} != {'host-source', 'work'}:
        raise ValueError('ACQUISITION_NAMESPACE')
    before = material._tree_snapshot(path)
    source = path / 'host-source'
    material.guarded_path(source, True)
    if {p.name for p in material._children(source, len(HOST_SOURCE_NAMES))} != HOST_SOURCE_NAMES:
        raise ValueError('HOST_SOURCE_SET')
    total, index_raw = 0, None
    for name, digest in context['hostSourceHashes'].items():
        raw = _read_bound(source / name, digest, material.MAX_INVENTORY - total)
        total += len(raw)
        if name == 'source-index.json':
            index_raw = raw
    index = material._json(index_raw)
    expected_index = {name: digest for name, digest in context['hostSourceHashes'].items()
                      if name != 'source-index.json'}
    if (type(index) is not dict or set(index) != {'version', 'files'}
            or type(index['version']) is not int or index['version'] != 1
            or type(index['files']) is not dict or index['files'] != expected_index):
        raise ValueError('HOST_SOURCE_INDEX')
    work = path / 'work'
    material.guarded_path(work, True)
    identifier = context['currentWork'][5:]
    if {p.name for p in material._children(work, 1)} != {identifier}:
        raise ValueError('CURRENT_WORK_SET')
    current = work / identifier
    material.guarded_path(current, True)
    if {p.name for p in material._children(current, len(HOST_WORK_DIRECTORIES))} != HOST_WORK_DIRECTORIES:
        raise ValueError('CURRENT_WORK_DIRECTORIES')
    for name in HOST_WORK_DIRECTORIES:
        directory = current / name
        material.guarded_path(directory, True)
        if not material._empty_directory(directory):
            raise ValueError('CURRENT_WORK_NOT_EMPTY')
    if before != material._tree_snapshot(path):
        raise ValueError('HOST_CONTEXT_CHANGED')
    return current


def _host_sources(acquisition, context, catalog_path, catalog_sha256, members_path,
                  members_sha256, lock_sources):
    validate_host_context(context)
    source = acquisition / 'host-source'
    expected_locks = {name: source / (name + '-requirements-windows.lock')
                      for name in ('preprocess', 'ocr')}
    if (Path(catalog_path) != source / 'windows_materialization_catalog.json'
            or Path(members_path) != source / 'windows_python_members.json'
            or catalog_sha256 != context['hostSourceHashes']['windows_materialization_catalog.json']
            or members_sha256 != context['hostSourceHashes']['windows_python_members.json']
            or type(lock_sources) is not dict or set(lock_sources) != set(expected_locks)
            or any(Path(lock_sources[k]) != v for k, v in expected_locks.items())):
        raise ValueError('HOST_SOURCE_BINDING')


def prepare(catalog_path, catalog_sha256, members_path, members_sha256,
            lock_sources, deadline, *, host_context):
    """Acquire/inspect/stage exact catalog under already native-reserved roots.

Source hashes and lock source paths are trusted-supervisor inputs, not IPC.
The absolute monotonic deadline is carried unchanged through every acquisition;
caller supervision additionally enforces retirement/time limits during hashing.
"""
    root, acquisition = _roots()
    _deadline(deadline, time.monotonic, initial=True)
    _host_sources(acquisition, host_context, catalog_path, catalog_sha256,
                  members_path, members_sha256, lock_sources)
    current = _reserved_acquisition(acquisition, host_context)
    if Path.cwd() != current:
        raise ValueError('CURRENT_WORK_IDENTITY')
    # Native owner retains the directory handle/identity; lexical cwd is an
    # additional binding, not a claim that Python replaces native custody.
    # Source identity checked with bounded guarded read before catalog parsing.
    _read_bound(catalog_path, catalog_sha256, catalog_api.MAX_CATALOG)
    catalog = catalog_api.load_catalog(catalog_path, catalog_sha256)
    if members_sha256 != catalog['python']['memberInventorySha256']:
        raise ValueError('MEMBER_SOURCE_IDENTITY')
    members = load_members(members_path, members_sha256)
    return _prepare_at(root, acquisition, catalog, members, lock_sources, deadline, Operations(), host_context=host_context)


def _prepare_at(root, acquisition, catalog, python_members, lock_sources, deadline, operations,
                *, host_context=None):
    """Synthetic-root seam; production calls only through fixed-root prepare."""
    _deadline(deadline, operations.clock, initial=True)
    _reserved_empty(root)
    if host_context is None:
        # Legacy empty-root synthetic seam only; public prepare requires context.
        _reserved_empty(acquisition)
    else:
        _reserved_acquisition(acquisition, host_context)
    if root == acquisition or root in acquisition.parents or acquisition in root.parents:
        raise ValueError('ROOT_OVERLAP')
    if type(lock_sources) is not dict or set(lock_sources) != {'preprocess', 'ocr'}:
        raise ValueError('LOCK_SOURCES')
    material._catalog(python_members)
    if any(not name.startswith('python/') for name in python_members):
        raise ValueError('PYTHON_MEMBERS')
    model_members = _members(catalog['model']['members'], MODEL_PREFIX)
    if set(model_members) != {MODEL_PREFIX + '/' + name for name in MODEL_NAMES}:
        raise ValueError('MODEL_MEMBERS')
    # All local source material is checked before network or destination writes.
    locks = {name: _read_bound(lock_sources[name], catalog[name]['lockSha256'])
             for name in ('preprocess', 'ocr')}
    _deadline(deadline, operations.clock)
    for name in ('preprocess-wheelhouse', 'ocr-wheelhouse', 'locks'):
        (acquisition / name).mkdir(mode=0o700)
        material.guarded_path(acquisition / name, True)
    reports, acquired_bytes = [], 0

    def acquire(artifact, directory):
        nonlocal acquired_bytes
        _deadline(deadline, operations.clock)
        material.guarded_path(directory, True)
        destination = directory / artifact['filename']
        operations.acquire(artifact, destination, deadline)
        _deadline(deadline, operations.clock)
        # Do not trust injected/acquisition return values as content evidence.
        material.verify_artifact(destination, _artifact_pin(artifact))
        acquired_bytes += artifact['size']
        return destination

    python_archive = acquire(catalog['python'], acquisition)
    for name in ('preprocess', 'ocr'):
        closure = catalog[name]
        for artifact in closure['wheels']:
            wheel_path = acquire(artifact, acquisition / (name + '-wheelhouse'))
            report = operations.inspect(wheel_path, _artifact_pin(artifact), artifact['startup'])
            _deadline(deadline, operations.clock)
            reports.append({'closure': name, 'filename': artifact['filename'],
                            'sha256': artifact['sha256'], 'bytes': artifact['size'],
                            'fileCount': len(report['files']),
                            'approvedStartup': report['approvedStartup'],
                            'entryPoints': report['entryPoints']})
        lock = acquisition / 'locks' / closure['lock']
        with lock.open('xb') as stream:
            stream.write(locks[name])
        material.verify_artifact(lock, material.ArtifactPin(len(locks[name]), closure['lockSha256']))
    model_archive = acquire(catalog['model'], acquisition)
    _deadline(deadline, operations.clock)
    operations.stage(python_archive, _artifact_pin(catalog['python']), root / 'python',
                     python_members, strip_prefix='python')
    _deadline(deadline, operations.clock)
    (root / 'model').mkdir(mode=0o700)
    material.guarded_path(root / 'model', True)
    operations.stage(model_archive, _artifact_pin(catalog['model']), root / 'model' / 'english',
                     model_members, strip_prefix=MODEL_PREFIX)
    _deadline(deadline, operations.clock)
    # Source/tooling and both installed venvs are deliberately not claimed here.
    result = {'version': 1, 'kind': 'WINDOWS_PREPARE_RESULT',
              'scope': 'MATERIALIZATION_ONLY', 'execution': 'NOT_RUN',
              'acquiredBytes': acquired_bytes, 'wheelCount': len(reports),
              'pythonFiles': len(python_members), 'modelFiles': len(model_members),
              'wheels': reports}
    material.canonical(result)
    return result


def freeze(approved_inventory=None, approved_sha256=None, *, original_special_files=None):
    """Read exact installed bytes; optional approved hash refuses any difference.

Does not write/rewrite an index or normalize installed bytes. Caller publishes
canonical result at installed-inventory.json only after review, and binds its
hash externally. A null approval means observation only, never model admission. The separate
    original_special_files map must derive from the exact externally held Python
    member catalog; it preserves original provider bytecode/metadata, never
    permits new compilation or removes these bytes from the inventory.
"""
    root, _ = _roots()
    return _freeze_at(root, approved_inventory, approved_sha256,
                      original_special_files=original_special_files)


def _freeze_at(root, approved_inventory=None, approved_sha256=None, *, original_special_files=None):
    material.guarded_path(root, True)
    # A PREPARE-only tree is not a complete installed freeze.
    for namespace in material.CODE_ROOTS:
        material.guarded_path(root / namespace, True)
    observed = material.inventory_tree(root, original_special_files=original_special_files)
    raw = material.canonical(observed)
    digest = hashlib.sha256(raw).hexdigest()
    if approved_inventory is not None:
        material.compare_inventory(approved_inventory, observed)
    if approved_sha256 is not None:
        if (type(approved_sha256) is not str or material.SHA.fullmatch(approved_sha256) is None
                or digest != approved_sha256):
            raise ValueError('APPROVED_INVENTORY_HASH')
    return {'version': 1, 'kind': 'WINDOWS_FREEZE_RESULT', 'scope': 'MATERIALIZATION_ONLY',
            'inventory': observed, 'inventorySha256': digest,
            'comparison': 'MATCH' if approved_inventory is not None or approved_sha256 is not None else 'NOT_REQUESTED',
            'execution': 'NOT_RUN'}
