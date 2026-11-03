"""Bounded stdlib staging primitives, NOT an installer or execution admission.

Callers supply an independently reviewed artifact/member catalog. No network,
process launcher, package import, extractall, or generic CLI exists here. On
Windows the native supervisor MUST additionally retain guarded parent/root/file
handles for the entire operation. lstat/identity checks here reject observed
links/reparse points; they are not a replacement for that native custody or an
OS sandbox. Failed staging is preserved, never automatically deleted/reused.
"""
import base64
import csv
from contextlib import contextmanager
import email
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import tarfile
from typing import NamedTuple
import zipfile

MAX_ENTRIES = 50_000
MAX_FILE = 512 * 1024 * 1024
MAX_TOTAL = 4 * 1024 * 1024 * 1024
MAX_INVENTORY = 16 * 1024 * 1024
CHUNK = 64 * 1024
CODE_ROOTS = frozenset(('python', 'preprocess-runtime', 'ocr-runtime', 'source', 'tooling', 'model'))
SHA = re.compile(r'[0-9a-f]{64}\Z')
UUID = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\Z')


class ArtifactPin(NamedTuple):
    size: int
    sha256: str


def fail(code):
    raise ValueError(code)


def pin_check(pin):
    if (type(pin) is not ArtifactPin or type(pin.size) is not int
            or not 0 <= pin.size <= MAX_FILE or type(pin.sha256) is not str
            or SHA.fullmatch(pin.sha256) is None):
        fail('PIN')


def relative_path(value):
    """Exact slash-separated Windows-safe relative spelling, no normalization."""
    if type(value) is not str or not 1 <= len(value) <= 240:
        fail('PATH')
    try:
        value.encode('utf-8')
    except UnicodeError:
        fail('PATH')
    if any(ord(c) < 32 or c in '\\<>:"|?*' for c in value):
        fail('PATH')
    for part in value.split('/'):
        if (part in ('', '.', '..') or part.endswith((' ', '.'))
                or part.split('.')[0].upper() in {
                    'CON', 'PRN', 'AUX', 'NUL', 'CONIN$', 'CONOUT$',
                    *(f'COM{i}' for i in '123456789¹²³'),
                    *(f'LPT{i}' for i in '123456789¹²³')}):
            fail('PATH')
    return value


def checked_names(names):
    seen, spelling, files = set(), {}, set()
    for name in names:
        relative_path(name)
        key = name.casefold()
        if key in seen:
            fail('DUPLICATE_PATH')
        seen.add(key)
        parts = name.split('/')
        for index in range(1, len(parts) + 1):
            prefix = '/'.join(parts[:index])
            old = spelling.setdefault(prefix.casefold(), prefix)
            if old != prefix:
                fail('CASE_ALIAS')
        files.add(name)
        if len(files) > MAX_ENTRIES:
            fail('ENTRY_LIMIT')
    # File/ancestor conflicts are checked by archive/tree-specific callers.
    return files


def _identity(s):
    return (s.st_dev, s.st_ino, s.st_mode, s.st_nlink, s.st_size,
            s.st_mtime_ns, s.st_ctime_ns, getattr(s, 'st_birthtime_ns', None),
            getattr(s, 'st_file_attributes', 0))


def _cross_identity(s, windows):
    if not windows:
        return _identity(s)
    # CPython Windows path stat uses creation time for legacy ctime and adds
    # extension-derived execute bits; fd stat can use ChangeTime/no extension.
    # Compare common fields across channels, full snapshots within each one.
    birth = getattr(s, 'st_birthtime_ns', None)
    if type(birth) is not int:
        fail('FILE_IDENTITY_UNAVAILABLE')
    return (s.st_dev, s.st_ino, s.st_mode & ~0o111, s.st_nlink, s.st_size,
            s.st_mtime_ns, birth, s.st_file_attributes)


def _kind(s, directory):
    if (stat.S_ISLNK(s.st_mode) or getattr(s, 'st_file_attributes', 0) & 0x400
            or (not stat.S_ISDIR(s.st_mode) if directory else not stat.S_ISREG(s.st_mode))
            or (not directory and s.st_nlink != 1)):
        fail('LINK_OR_TYPE')


def guarded_path(path, directory=False):
    original = os.fspath(path)
    path = Path(path)
    if original != str(path):
        fail('ABSOLUTE_CANONICAL_PATH')
    if not path.is_absolute() or str(path) != os.path.abspath(path):
        fail('ABSOLUTE_CANONICAL_PATH')
    for ancestor in reversed(path.parents):
        _kind(ancestor.lstat(), True)
    _kind(path.lstat(), directory)
    return path


@contextmanager
def _opened(path):
    path = guarded_path(path)
    before = path.lstat()
    _kind(before, False)
    windows = os.name == 'nt'
    flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(path, flags)
    try:
        current = os.fstat(descriptor)
        _kind(current, False)
        if _cross_identity(before, windows) != _cross_identity(current, windows):
            fail('FILE_CHANGED')
        with os.fdopen(descriptor, 'rb', closefd=False) as stream:
            yield stream
        final_fd, final_path = os.fstat(descriptor), path.lstat()
        _kind(final_fd, False)
        _kind(final_path, False)
        if (_identity(current) != _identity(final_fd)
                or _identity(before) != _identity(final_path)
                or _cross_identity(final_fd, windows) != _cross_identity(final_path, windows)):
            fail('FILE_CHANGED')
    finally:
        os.close(descriptor)


def _digest(stream, limit):
    digest, count = hashlib.sha256(), 0
    while True:
        data = stream.read(min(CHUNK, limit - count + 1))
        if not data:
            break
        count += len(data)
        if count > limit:
            fail('FILE_LIMIT')
        digest.update(data)
    return ArtifactPin(count, digest.hexdigest())


def verify_artifact(path, pin):
    pin_check(pin)
    with _opened(path) as stream:
        if _digest(stream, pin.size) != pin:
            fail('ARTIFACT_HASH')
    return pin


@contextmanager
def _verified(path, pin):
    pin_check(pin)
    with _opened(path) as stream:
        if _digest(stream, pin.size) != pin:
            fail('ARTIFACT_HASH')
        stream.seek(0)
        yield stream
        stream.seek(0)
        if _digest(stream, pin.size) != pin:
            fail('ARTIFACT_CHANGED')


def _catalog(catalog):
    if type(catalog) is not dict or not catalog:
        fail('CATALOG')
    checked_names(catalog)
    total = 0
    for name, pin in catalog.items():
        pin_check(pin)
        total += pin.size
        if any('/'.join(name.split('/')[:i]) in catalog for i in range(1, len(name.split('/')))):
            fail('FILE_ANCESTOR')
    if total > MAX_TOTAL:
        fail('TOTAL_LIMIT')


def _startup(name):
    leaf = name.rsplit('/', 1)[-1].casefold()
    parts = name.casefold().split('/')
    customization = {'sitecustomize', 'usercustomize'}
    # Include packages, cache/bytecode and ABI-tagged native module forms.
    return (leaf.endswith('.pth') or leaf.split('.')[0] in customization
            or any(part in customization for part in parts[:-1])
            or '.data/scripts/' in name.casefold())


def inspect_wheel(path, pin, approved_startup=None):
    """Verify every payload's RECORD. Startup hooks require exact approved hashes.

entry_points.txt is reported, not executed or treated as interpreter startup.
The caller must separately review these commands and dependency markers.
"""
    approved_startup = {} if approved_startup is None else approved_startup
    if type(approved_startup) is not dict:
        fail('STARTUP_CATALOG')
    checked_names(approved_startup)
    with _verified(path, pin) as stream, zipfile.ZipFile(stream) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ENTRIES:
            fail('ENTRY_LIMIT')
        names = [i.filename.rstrip('/') if i.is_dir() else i.filename for i in infos]
        checked_names(names)
        files, total = {}, 0
        for item in infos:
            mode = item.external_attr >> 16
            if (stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR))
                    or item.flag_bits & 1 or item.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                fail('ZIP_TYPE')
            if item.is_dir():
                if stat.S_IFMT(mode) not in (0, stat.S_IFDIR):
                    fail('ZIP_TYPE')
                if item.file_size:
                    fail('ZIP_DIRECTORY')
                continue
            if stat.S_IFMT(mode) not in (0, stat.S_IFREG):
                fail('ZIP_TYPE')
            if not 0 <= item.file_size <= MAX_FILE:
                fail('FILE_LIMIT')
            total += item.file_size
            if total > MAX_TOTAL:
                fail('TOTAL_LIMIT')
            files[item.filename] = item
        for name in files:
            if any('/'.join(name.split('/')[:i]) in files for i in range(1, len(name.split('/')))):
                fail('FILE_ANCESTOR')
        records = [n for n in files if n.endswith('.dist-info/RECORD') and n.count('/') == 1]
        if len(records) != 1 or files[records[0]].file_size > MAX_INVENTORY:
            fail('RECORD')
        record = records[0]
        rows = list(csv.reader(io.StringIO(archive.read(record).decode('utf-8'))))
        if (len(rows) != len(files) or any(len(r) != 3 for r in rows)
                or len({r[0] for r in rows}) != len(rows) or {r[0] for r in rows} != set(files)):
            fail('RECORD_SET')
        inventory, startup = [], {}
        for name, encoded, size in rows:
            with archive.open(name) as member:
                observed = _digest(member, files[name].file_size)
            if observed.size != files[name].file_size:
                fail('RECORD_SIZE')
            if name == record:
                if encoded or size:
                    fail('RECORD_SELF')
            else:
                expected = 'sha256=' + base64.urlsafe_b64encode(bytes.fromhex(observed.sha256)).rstrip(b'=').decode('ascii')
                if encoded != expected or size != str(observed.size):
                    fail('RECORD_HASH')
            inventory.append({'path': name, 'sha256': observed.sha256})
            if _startup(name):
                startup[name] = observed.sha256
        if startup != approved_startup:
            fail('STARTUP_REVIEW_REQUIRED')
        prefix = record.rsplit('/', 1)[0]
        metadata_name = prefix + '/METADATA'
        wheel_name = prefix + '/WHEEL'
        for name in (metadata_name, wheel_name):
            if name not in files or files[name].file_size > MAX_INVENTORY:
                fail('WHEEL_METADATA')
        metadata = email.message_from_bytes(archive.read(metadata_name))
        entries = prefix + '/entry_points.txt'
        if entries in files and files[entries].file_size > MAX_INVENTORY:
            fail('ENTRY_POINTS_LIMIT')
        result = {'version': 1, 'files': sorted(inventory, key=lambda r: r['path']),
                'runtimeBytes': total, 'requiresPython': metadata.get('Requires-Python'),
                'requiresDist': metadata.get_all('Requires-Dist') or [],
                'wheel': archive.read(wheel_name).decode('utf-8'),
                'entryPoints': archive.read(entries).decode('utf-8') if entries in files else None,
                'approvedStartup': startup}
        canonical(result)
        return result


def stage_tar(path, pin, destination, expected_members, strip_prefix=None):
    """Manual exact-catalog staging into a newly created directory.

Caller must hold native parent/root custody during actual Windows use. Partial
outputs on any fault remain for investigation; no delete/overwrite or resume.
    strip_prefix='python' places the exact provider python/... catalog into a
    fresh candidate/python child beneath an already reserved candidate parent.
    The only other prefix is the exact EN archive en_PP-OCRv5_mobile_rec_infer
    for fresh candidate/model/english; no arbitrary remapping is admitted.
"""
    _catalog(expected_members)
    if strip_prefix not in (None, 'python', 'en_PP-OCRv5_mobile_rec_infer'):
        fail('STRIP_PREFIX')
    if strip_prefix and any(not name.startswith(strip_prefix + '/') for name in expected_members):
        fail('STRIP_PREFIX')
    destination = Path(destination)
    guarded_path(destination.parent, True)
    relative_path(destination.name)
    if destination.exists() or destination.is_symlink():
        fail('DESTINATION_EXISTS')
    with _verified(path, pin) as stream, tarfile.open(fileobj=stream, mode='r:*') as archive:
        members, names, total = [], [], 0
        for item in archive:
            name = item.name.rstrip('/') if item.isdir() else item.name
            relative_path(name)
            names.append(name)
            if len(names) > MAX_ENTRIES:
                fail('ENTRY_LIMIT')
            if item.pax_headers or item.issparse() or not (item.isfile() or item.isdir()):
                fail('TAR_TYPE')
            if not 0 <= item.size <= MAX_FILE or (item.isdir() and item.size):
                fail('FILE_LIMIT')
            total += item.size
            if total > MAX_TOTAL:
                fail('TOTAL_LIMIT')
            members.append((name, item))
        checked_names(names)
        if strip_prefix and any(name != strip_prefix and not name.startswith(strip_prefix + '/') for name in names):
            fail('STRIP_PREFIX')
        actual = {name: item for name, item in members if item.isfile()}
        if set(actual) != set(expected_members) or any(actual[n].size != p.size for n, p in expected_members.items()):
            fail('CATALOG_MISMATCH')
        for name, item in members:
            if any('/'.join(name.split('/')[:i]) in actual for i in range(1, len(name.split('/')))):
                fail('FILE_ANCESTOR')
        destination.mkdir(mode=0o700)
        for name, item in members:
            placed = name
            if strip_prefix:
                if name == strip_prefix and item.isdir():
                    continue
                if not name.startswith(strip_prefix + '/'):
                    fail('STRIP_PREFIX')
                placed = name[len(strip_prefix) + 1:]
            target = destination.joinpath(*placed.split('/'))
            for directory in reversed(target.parents):
                if directory == destination or destination in directory.parents:
                    if not directory.exists():
                        directory.mkdir(mode=0o700)
                    guarded_path(directory, True)
            if item.isdir():
                if not target.exists():
                    target.mkdir(mode=0o700)
                guarded_path(target, True)
                continue
            digest, count = hashlib.sha256(), 0
            with archive.extractfile(item) as source, target.open('xb') as output:
                while True:
                    data = source.read(min(CHUNK, item.size - count + 1))
                    if not data:
                        break
                    count += len(data)
                    if count > item.size:
                        fail('TAR_SIZE')
                    digest.update(data)
                    output.write(data)
            if ArtifactPin(count, digest.hexdigest()) != expected_members[name]:
                fail('MEMBER_HASH')
            guarded_path(target)
    return validate_inventory({'version': 1, 'files': [{'path': n, 'sha256': expected_members[n].sha256}
                                  for n in sorted(expected_members)], 'runtimeBytes': total})


def canonical(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
    if len(raw) > MAX_INVENTORY:
        fail('INVENTORY_LIMIT')
    return raw


def validate_inventory(value):
    if (type(value) is not dict or set(value) != {'version', 'files', 'runtimeBytes'}
            or type(value['version']) is not int or value['version'] != 1
            or type(value['runtimeBytes']) is not int or not 0 <= value['runtimeBytes'] <= MAX_TOTAL
            or type(value['files']) is not list or len(value['files']) > MAX_ENTRIES):
        fail('INVENTORY_SCHEMA')
    names = []
    for row in value['files']:
        if (type(row) is not dict or set(row) != {'path', 'sha256'}
                or type(row['sha256']) is not str or SHA.fullmatch(row['sha256']) is None):
            fail('INVENTORY_SCHEMA')
        names.append(row['path'])
    checked_names(names)
    if names != sorted(names):
        fail('INVENTORY_ORDER')
    canonical(value)
    return value


def compare_inventory(expected, observed):
    validate_inventory(expected)
    validate_inventory(observed)
    if expected != observed:
        fail('INVENTORY_MISMATCH')
    return True


def _json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                fail('JSON_DUPLICATE')
            result[key] = value
        return result
    if len(raw) > MAX_INVENTORY:
        fail('INVENTORY_LIMIT')
    return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                      parse_constant=lambda _: fail('JSON_NUMBER'))


def _children(directory, remaining):
    # Path.iterdir/os.listdir may eagerly allocate the whole directory. scandir
    # keeps iteration bounded BEFORE collection/sort, including on Python3.11.
    children = []
    with os.scandir(directory) as entries:
        for entry in entries:
            if len(children) >= remaining:
                fail('ENTRY_LIMIT')
            children.append(Path(entry.path))
    return sorted(children, key=lambda path: path.name)


def _empty_directory(directory):
    with os.scandir(directory) as entries:
        return next(entries, None) is None


def _tree_snapshot(root):
    """Bounded observed membership/identity snapshot; native custody still required."""
    pending, rows = [root], []
    while pending:
        directory = pending.pop()
        guarded_path(directory, True)
        for path in _children(directory, MAX_ENTRIES - len(rows)):
            relative = path.relative_to(root).as_posix()
            relative_path(relative)
            state = path.lstat()
            directory_kind = stat.S_ISDIR(state.st_mode)
            _kind(state, directory_kind)
            rows.append((relative, _identity(state)))
            if len(rows) > MAX_ENTRIES:
                fail('ENTRY_LIMIT')
            if directory_kind:
                pending.append(path)
    checked_names([row[0] for row in rows])
    return sorted(rows)


def _special_original(path):
    leaf = path.rsplit('/', 1)[-1].casefold()
    return leaf.endswith(('.pyc', '.pyo')) or leaf == 'direct_url.json'


def _original_special_catalog(value):
    if value is None:
        return {}
    if type(value) is not dict:
        fail('ORIGINAL_SPECIAL_CATALOG')
    if value:
        _catalog(value)
    for path in value:
        if not path.startswith('python/') or not _special_original(path):
            fail('ORIGINAL_SPECIAL_PATH')
    return dict(value)


def inventory_tree(root, original_special_files=None):
    """Freeze every code-root regular byte, including configs/launchers/empty files.

Closed operational schema: optional empty work/; optional canonical
installed-inventory.json must exactly describe observed code files. No receipt
or other operational file is implicitly excluded. Receipt support awaits an
explicit adopted closed schema. Unknown top-level namespaces and pyc refuse.
"""
    originals = _original_special_catalog(original_special_files)
    seen_originals = set()
    root = guarded_path(root, True)
    before = _tree_snapshot(root)
    rows, total, entries, seen = [], 0, 0, []
    index = None
    index_raw = None
    for child in _children(root, MAX_ENTRIES):
        relative_path(child.name)
        if child.name == 'work':
            guarded_path(child, True)
            if not _empty_directory(child):
                fail('WORK_NOT_EMPTY')
            continue
        if child.name == 'installed-inventory.json':
            with _opened(child) as stream:
                index_raw = stream.read(MAX_INVENTORY + 1)
                index = _json(index_raw)
            continue
        if child.name not in CODE_ROOTS:
            fail('UNKNOWN_NAMESPACE')
        guarded_path(child, True)
        pending = [child]
        while pending:
            directory = pending.pop()
            guarded_path(directory, True)
            for path in _children(directory, MAX_ENTRIES - entries):
                relative = path.relative_to(root).as_posix()
                relative_path(relative)
                seen.append(relative)
                entries += 1
                if entries > MAX_ENTRIES:
                    fail('ENTRY_LIMIT')
                state = path.lstat()
                if stat.S_ISDIR(state.st_mode):
                    _kind(state, True)
                    pending.append(path)
                else:
                    _kind(state, False)
                    special = _special_original(relative)
                    if special and relative not in originals:
                        fail('UNEXPECTED_GENERATED_FILE')
                    if state.st_size > MAX_FILE:
                        fail('FILE_LIMIT')
                    total += state.st_size
                    if total > MAX_TOTAL:
                        fail('TOTAL_LIMIT')
                    with _opened(path) as stream:
                        pin = _digest(stream, state.st_size)
                    if pin.size != state.st_size:
                        fail('FILE_CHANGED')
                    if special:
                        if pin != originals[relative]:
                            fail('ORIGINAL_SPECIAL_CHANGED')
                        seen_originals.add(relative)
                    rows.append({'path': relative, 'sha256': pin.sha256})
    checked_names(seen)
    if seen_originals != set(originals):
        fail('ORIGINAL_SPECIAL_MISSING')
    result = validate_inventory({'version': 1, 'files': sorted(rows, key=lambda r: r['path']), 'runtimeBytes': total})
    if index is not None:
        compare_inventory(index, result)
        if index_raw != canonical(index):
            fail('INDEX_NONCANONICAL')
    if before != _tree_snapshot(root):
        fail('TREE_CHANGED')
    return result
