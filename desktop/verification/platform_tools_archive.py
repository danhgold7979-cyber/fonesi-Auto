"""Pinned development archive admission only; no download, binary execution or SDK acceptance.

A failed extraction retains its exclusive owned partial target for inspection. It never
adopts an existing target or performs recursive cleanup. Redistribution remains separate.
"""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import struct
from types import MappingProxyType
import zipfile
import zlib

OFFICIAL_URL = "https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip"
ARCHIVE_BYTES = 8044989
ARCHIVE_SHA256 = "45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99"
def _candidate():
    file = Path(__file__).resolve().with_name("platform-tools-candidate.json")
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode) or file.is_symlink() or not 0 < info.st_size <= 16384:
        raise ValueError("PLATFORM_TOOLS_ARCHIVE_REJECTED")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("PLATFORM_TOOLS_ARCHIVE_REJECTED")
            result[key] = value
        return result
    value = json.loads(file.read_bytes(), object_pairs_hook=unique)
    if (type(value) is not dict or set(value) != {"schema", "release", "archive", "files"}
            or type(value["schema"]) is not int or value["schema"] != 1 or value["release"] != "37.0.1"
            or value["archive"] != {"url": OFFICIAL_URL, "bytes": ARCHIVE_BYTES, "sha256": ARCHIVE_SHA256}
            or type(value["files"]) is not list or len(value["files"]) != 14):
        raise ValueError("PLATFORM_TOOLS_ARCHIVE_REJECTED")
    result = {}
    for row in value["files"]:
        if (type(row) is not dict or set(row) != {"path", "bytes", "sha256", "peMachine", "peMagic"}
                or type(row["path"]) is not str or re.fullmatch(r"[A-Za-z0-9._-]{1,64}", row["path"]) is None
                or type(row["bytes"]) is not int or not 0 < row["bytes"] <= 16 * 1024 * 1024
                or type(row["sha256"]) is not str or re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) is None):
            raise ValueError("PLATFORM_TOOLS_ARCHIVE_REJECTED")
        pe = row["path"].lower().endswith((".exe", ".dll"))
        if (pe and (type(row["peMachine"]) is not int or row["peMachine"] != 332 or type(row["peMagic"]) is not int or row["peMagic"] != 267)) or (not pe and (row["peMachine"] is not None or row["peMagic"] is not None)):
            raise ValueError("PLATFORM_TOOLS_ARCHIVE_REJECTED")
        result["platform-tools/" + row["path"]] = (row["bytes"], row["sha256"])
    if len(result) != 14 or len({name.lower() for name in result}) != 14 or list(result) != sorted(result) or sum(size for size, _ in result.values()) > 32 * 1024 * 1024:
        raise ValueError("PLATFORM_TOOLS_ARCHIVE_REJECTED")
    return MappingProxyType(result)

try:
    EXPECTED_FILES = _candidate()
except (OSError, ValueError, TypeError, KeyError, UnicodeError):
    EXPECTED_FILES = None
EXPECTED_DIRECTORIES = frozenset({"platform-tools/"})
OWNER_NAME = ".owner"
COMPLETE_NAME = ".platform-tools-complete.json"

class ArchiveRejected(ValueError):
    def __init__(self):
        super().__init__("PLATFORM_TOOLS_ARCHIVE_REJECTED")

def _reject():
    raise ArchiveRejected()

def _reparse(info):
    return bool(getattr(info, "st_file_attributes", 0) & 0x400)

def _plain_directory(path):
    if not path.is_absolute() or path.resolve() != path:
        _reject()
    for item in (path, *path.parents):
        info = item.lstat()
        if not stat.S_ISDIR(info.st_mode) or item.is_symlink() or _reparse(info):
            _reject()
    return path

def _regular(path, limit):
    _plain_directory(path.parent)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or path.is_symlink() or _reparse(info) or info.st_size > limit:
        _reject()
    return info

def _hash(stream, limit):
    stream.seek(0)
    digest = hashlib.sha256()
    count = 0
    while chunk := stream.read(65536):
        count += len(chunk)
        if count > limit:
            _reject()
        digest.update(chunk)
    return count, digest.hexdigest()

def _member_name(name):
    if type(name) is not str or not name or len(name) > 80 or "\\" in name:
        _reject()
    parts = name.removesuffix("/").split("/")
    if len(parts) > 2:
        _reject()
    for part in parts:
        if (re.fullmatch(r"[A-Za-z0-9._-]+", part) is None or part in (".", "..")
                or part.endswith(".") or re.match(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", part, re.I)):
            _reject()
    return name

def _member_bytes(zipped, item, output=None):
    expected_bytes, expected_hash = EXPECTED_FILES[item.filename]
    digest = hashlib.sha256()
    count = 0
    with zipped.open(item, "r") as source:
        while chunk := source.read(65536):
            count += len(chunk)
            if count > expected_bytes:
                _reject()
            digest.update(chunk)
            if output is not None:
                output.write(chunk)
    if (count, digest.hexdigest()) != (expected_bytes, expected_hash):
        _reject()

@contextmanager
def _verified_archive(path):
    if EXPECTED_FILES is None:
        _reject()
    _regular(path, ARCHIVE_BYTES)
    with path.open("rb") as stream:
        if _hash(stream, ARCHIVE_BYTES) != (ARCHIVE_BYTES, ARCHIVE_SHA256):
            _reject()
        if ARCHIVE_BYTES < 22:
            _reject()
        stream.seek(-22, 2)
        tail = stream.read(22)
        signature, disk, central_disk, on_disk, count, central_size, central_offset, comment = struct.unpack("<4s4H2LH", tail)
        if (signature != b"PK\x05\x06" or disk != 0 or central_disk != 0 or on_disk != 15
                or count != 15 or central_size > 4096 or central_offset + central_size + 22 != ARCHIVE_BYTES or comment != 0):
            _reject()
        with zipfile.ZipFile(stream, "r") as zipped:
            members = zipped.infolist()
            names = [_member_name(item.filename) for item in members]
            expected = set(EXPECTED_FILES) | EXPECTED_DIRECTORIES
            if (len(members) != 15 or set(names) != expected or len(set(name.lower() for name in names)) != 15):
                _reject()
            previous_end = 0
            for item in members:
                kind = stat.S_IFMT(item.external_attr >> 16)
                if (item.flag_bits not in (0, 0x800) or item.extra or item.comment or item.extract_version > 20
                        or item.header_offset != previous_end or kind not in (0, stat.S_IFDIR, stat.S_IFREG)):
                    _reject()
                stream.seek(item.header_offset)
                local = stream.read(30)
                if len(local) != 30:
                    _reject()
                fields = struct.unpack("<4s5H3L2H", local)
                if (fields[0] != b"PK\x03\x04" or fields[1] > 20 or fields[2] != item.flag_bits
                        or fields[3] != item.compress_type or fields[6] != item.CRC
                        or fields[7] != item.compress_size or fields[8] != item.file_size or fields[10] != 0):
                    _reject()
                raw_name = stream.read(fields[9])
                if raw_name != item.filename.encode("ascii"):
                    _reject()
                previous_end = item.header_offset + 30 + fields[9] + item.compress_size
                if previous_end > central_offset:
                    _reject()
                if item.is_dir():
                    if (item.filename not in EXPECTED_DIRECTORIES or item.file_size != 0
                            or item.compress_size != 0 or item.compress_type != zipfile.ZIP_STORED
                            or item.CRC != 0 or kind == stat.S_IFREG):
                        _reject()
                else:
                    if (kind == stat.S_IFDIR or item.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                            or item.file_size != EXPECTED_FILES[item.filename][0]
                            or not 0 <= item.compress_size <= ARCHIVE_BYTES):
                        _reject()
                    _member_bytes(zipped, item)
            if previous_end != central_offset or _hash(stream, ARCHIVE_BYTES) != (ARCHIVE_BYTES, ARCHIVE_SHA256):
                _reject()
            yield zipped, stream

def _summary():
    return {"version": 1, "scope": "PINNED_DEVELOPMENT_ARCHIVE", "archiveSha256": ARCHIVE_SHA256,
            "fileCount": 14, "expandedBytes": sum(size for size, _ in EXPECTED_FILES.values()),
            "binaryExecuted": False, "redistributionApproved": False}

def inspect_archive(path):
    try:
        with _verified_archive(Path(path)):
            return _summary()
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, NotImplementedError, struct.error, zipfile.BadZipFile, zlib.error, EOFError):
        raise ArchiveRejected() from None

def _write_new(path, value):
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")
    with path.open("xb") as output:
        output.write(raw)
        output.flush()
        os.fsync(output.fileno())
    if path.read_bytes() != raw:
        _reject()
    return raw

def _read_exact(path, expected):
    info = _regular(path, len(expected))
    if info.st_size != len(expected) or path.read_bytes() != expected:
        _reject()

def _exact_entries(folder, expected):
    _plain_directory(folder)
    names = set()
    with os.scandir(folder) as entries:
        for entry in entries:
            if len(names) >= len(expected) or entry.name not in expected or entry.is_symlink():
                _reject()
            info = entry.stat(follow_symlinks=False)
            if _reparse(info):
                _reject()
            names.add(entry.name)
    if names != set(expected):
        _reject()

def extract_archive(path, target, owner_id):
    try:
        path, target = Path(path), Path(target)
        if (type(owner_id) is not str or re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", owner_id) is None
                or not target.is_absolute() or target.parent / target.name != target):
            _reject()
        _plain_directory(target.parent)
        try:
            target.lstat()
        except FileNotFoundError:
            pass
        else:
            _reject()
        with _verified_archive(path) as (zipped, stream):
            target.mkdir(mode=0o700)
            owner = owner_id.encode("ascii")
            with (target / OWNER_NAME).open("xb") as output:
                output.write(owner)
                output.flush()
                os.fsync(output.fileno())
            _read_exact(target / OWNER_NAME, owner)
            (target / "platform-tools").mkdir(mode=0o700)
            for item in zipped.infolist():
                if item.is_dir():
                    continue
                _read_exact(target / OWNER_NAME, owner)
                destination = target / item.filename
                _plain_directory(destination.parent)
                with destination.open("xb") as output:
                    _member_bytes(zipped, item, output)
                    output.flush()
                    os.fsync(output.fileno())
                expected = EXPECTED_FILES[item.filename]
                _regular(destination, expected[0])
                with destination.open("rb") as copied:
                    if _hash(copied, expected[0]) != expected:
                        _reject()
            if _hash(stream, ARCHIVE_BYTES) != (ARCHIVE_BYTES, ARCHIVE_SHA256):
                _reject()
            _read_exact(target / OWNER_NAME, owner)
            _exact_entries(target, {OWNER_NAME, "platform-tools"})
            _exact_entries(target / "platform-tools", {Path(name).name for name in EXPECTED_FILES})
            for name, expected in EXPECTED_FILES.items():
                destination = target / name
                _regular(destination, expected[0])
                with destination.open("rb") as copied:
                    if _hash(copied, expected[0]) != expected:
                        _reject()
            _write_new(target / COMPLETE_NAME, _summary())
            return _summary()
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, NotImplementedError, struct.error, zipfile.BadZipFile, zlib.error, EOFError):
        raise ArchiveRejected() from None

def main(argv=None):
    import sys
    args = sys.argv[1:] if argv is None else argv
    try:
        if len(args) == 2 and args[0] == "inspect":
            inspect_archive(args[1]); print("PLATFORM_TOOLS_ARCHIVE_VERIFIED"); return 0
        if len(args) == 4 and args[0] == "extract":
            extract_archive(args[1], args[2], args[3]); print("PLATFORM_TOOLS_ARCHIVE_EXTRACTED"); return 0
        _reject()
    except ArchiveRejected:
        print("PLATFORM_TOOLS_ARCHIVE_REJECTED"); return 1

if __name__ == "__main__":
    raise SystemExit(main())
