"""Synthetic byte-policy faults; exact official-candidate inspection is run separately."""
from contextlib import contextmanager, redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import stat
import struct
import tempfile
from types import MappingProxyType
import unittest
from unittest.mock import patch
import zipfile
import platform_tools_archive as archive

OWNER = "12345678-1234-4234-8234-123456789abc"

@contextmanager
def fixture(change=None):
    with tempfile.TemporaryDirectory(prefix="platform-tools-policy-") as temporary:
        root = Path(temporary).resolve()
        files = {name: ("synthetic owned bytes for " + name).encode("ascii") for name in archive.EXPECTED_FILES}
        entries = [("platform-tools/", b"", True)] + [(name, data, False) for name, data in files.items()]
        if change:
            entries = change(entries)
        source = root / "candidate.zip"
        with zipfile.ZipFile(source, "x") as zipped:
            for name, data, directory in entries:
                info = zipfile.ZipInfo(name)
                info.compress_type = zipfile.ZIP_STORED if directory else zipfile.ZIP_DEFLATED
                info.external_attr = ((stat.S_IFDIR | 0o700) << 16 | 0x10) if directory else ((stat.S_IFREG | 0o600) << 16)
                zipped.writestr(info, data)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        expected = MappingProxyType({name: (len(data), hashlib.sha256(data).hexdigest()) for name, data in files.items()})
        with patch.multiple(archive, ARCHIVE_BYTES=source.stat().st_size, ARCHIVE_SHA256=digest, EXPECTED_FILES=expected):
            yield root, source, files

class ArchivePolicyTests(unittest.TestCase):
    def test_static_shared_manifest_exact_official_pin_and_fourteen_members(self):
        self.assertEqual(archive.ARCHIVE_BYTES, 8044989)
        self.assertEqual(archive.ARCHIVE_SHA256, "45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99")
        self.assertEqual(len(archive.EXPECTED_FILES), 14)
        self.assertEqual(sum(size for size, _ in archive.EXPECTED_FILES.values()), 17529398)
        manifest = json.loads(Path(archive.__file__).with_name("platform-tools-candidate.json").read_text())
        self.assertEqual(dict(archive.EXPECTED_FILES), {"platform-tools/"+row["path"]:(row["bytes"],row["sha256"]) for row in manifest["files"]})

    def test_synthetic_exact_archive_inspection_and_exclusive_extraction(self):
        with fixture() as (root, source, files):
            summary = archive.inspect_archive(source)
            self.assertFalse(summary["binaryExecuted"])
            self.assertFalse(summary["redistributionApproved"])
            target = root / "fresh"
            self.assertEqual(archive.extract_archive(source, target, OWNER), summary)
            self.assertEqual((target/archive.OWNER_NAME).read_text(), OWNER)
            self.assertEqual(json.loads((target/archive.COMPLETE_NAME).read_text()), summary)
            self.assertEqual(set(path.name for path in (target/"platform-tools").iterdir()), {Path(name).name for name in files})
            for name, data in files.items():
                self.assertEqual((target/name).read_bytes(), data)
            with self.assertRaises(archive.ArchiveRejected):
                archive.extract_archive(source, target, OWNER)
            self.assertEqual((target/next(iter(files))).read_bytes(), next(iter(files.values())))

    def test_wrong_archive_bytes_or_sha_refuses_before_target_creation(self):
        with fixture() as (root, source, _):
            for mutate in (lambda raw:raw+b"x", lambda raw:bytes([raw[0]^1])+raw[1:]):
                original=source.read_bytes();source.write_bytes(mutate(original))
                with self.assertRaises(archive.ArchiveRejected):
                    archive.extract_archive(source, root/"never", OWNER)
                self.assertFalse((root/"never").exists());source.write_bytes(original)

    def test_missing_extra_traversal_and_case_alias_members_refuse(self):
        changes = [lambda rows: rows[:-1], lambda rows: rows+[("platform-tools/unexpected",b"x",False)],
                   lambda rows: rows[:-1]+[("../outside",rows[-1][1],False)],
                   lambda rows: rows[:-1]+[(rows[1][0].upper(),rows[-1][1],False)]]
        for change in changes:
            with self.subTest(change=change), fixture(change) as (root, source, _):
                with self.assertRaises(archive.ArchiveRejected):archive.extract_archive(source,root/"never",OWNER)
                self.assertFalse((root/"never").exists())

    def test_member_hash_mismatch_even_when_archive_pin_matches_refuses(self):
        with fixture(lambda rows: rows[:1]+[(rows[1][0],b"changed",False)]+rows[2:]) as (root, source, _):
            with self.assertRaises(archive.ArchiveRejected):archive.extract_archive(source,root/"never",OWNER)
            self.assertFalse((root/"never").exists())

    def test_crc_unsupported_flags_symlink_and_central_allocation_bounds(self):
        for kind in ("crc", "flag", "symlink", "central", "deflate"):
            with self.subTest(kind=kind), fixture() as (root, source, _):
                data=bytearray(source.read_bytes());central=struct.unpack_from("<L",data,len(data)-6)[0]
                # Skip the first directory central header to alter a file.
                first_name=struct.unpack_from("<H",data,central+28)[0];entry=central+46+first_name
                if kind=="crc":struct.pack_into("<L",data,entry+16,1)
                elif kind=="flag":struct.pack_into("<H",data,entry+8,32)
                elif kind=="symlink":struct.pack_into("<L",data,entry+38,(stat.S_IFLNK|0o777)<<16)
                elif kind=="deflate":
                    local=struct.unpack_from("<L",data,entry+42)[0];name_length=struct.unpack_from("<H",data,local+26)[0]
                    data[local+30+name_length]=255
                else:struct.pack_into("<L",data,len(data)-10,999999)
                source.write_bytes(data)
                with patch.object(archive,"ARCHIVE_SHA256",hashlib.sha256(data).hexdigest()):
                    with self.assertRaises(archive.ArchiveRejected):archive.extract_archive(source,root/"never",OWNER)
                self.assertFalse((root/"never").exists())

    def test_existing_target_is_preserved_and_symlink_flag_refuses(self):
        with fixture() as (root, source, _):
            target=root/"target";target.mkdir();(target/"retain").write_text("owned original")
            with self.assertRaises(archive.ArchiveRejected):archive.extract_archive(source,target,OWNER)
            self.assertEqual((target/"retain").read_text(),"owned original")
            # The lstat failure path is tested without needing Windows symlink privilege.
            with patch.object(Path,"is_symlink",lambda item: item == source):
                with self.assertRaises(archive.ArchiveRejected):archive.inspect_archive(source)

    def test_settled_partial_write_failure_retains_owned_target_without_completion_marker(self):
        with fixture() as (root,source,_):
            original=archive._member_bytes;writes=0
            def injected(zipped,item,output=None):
                nonlocal writes
                if output is not None:
                    output.write(b"partial");writes+=1;raise OSError("private injected disk failure")
                return original(zipped,item,output)
            target=root/"partial"
            with patch.object(archive,"_member_bytes",injected):
                with self.assertRaisesRegex(archive.ArchiveRejected,"^PLATFORM_TOOLS_ARCHIVE_REJECTED$"):
                    archive.extract_archive(source,target,OWNER)
            self.assertEqual(writes,1);self.assertEqual((target/archive.OWNER_NAME).read_text(),OWNER)
            self.assertFalse((target/archive.COMPLETE_NAME).exists())
            self.assertEqual(next((target/"platform-tools").iterdir()).read_bytes(),b"partial")

    def test_cli_has_fixed_diagnostics_no_raw_input_and_no_download_or_execution(self):
        output=io.StringIO()
        with redirect_stdout(output):self.assertEqual(archive.main(["inspect","/private/path/not-present"]),1)
        self.assertEqual(output.getvalue(),"PLATFORM_TOOLS_ARCHIVE_REJECTED\n")
        with fixture() as (root,source,_):
            output=io.StringIO()
            with redirect_stdout(output):self.assertEqual(archive.main(["extract",str(source),str(root/"new"),OWNER]),0)
            self.assertEqual(output.getvalue(),"PLATFORM_TOOLS_ARCHIVE_EXTRACTED\n")

    def test_late_unknown_output_preserves_evidence_without_success_marker(self):
        with fixture() as (root,source,_):
            target=root/"late";original=archive._member_bytes
            def injected(zipped,item,output=None):
                original(zipped,item,output)
                if output is not None and item.filename==list(archive.EXPECTED_FILES)[-1]:
                    (target/"platform-tools"/"unexpected").write_bytes(b"retain uncertainty")
            with patch.object(archive,"_member_bytes",injected):
                with self.assertRaises(archive.ArchiveRejected):archive.extract_archive(source,target,OWNER)
            self.assertEqual((target/"platform-tools"/"unexpected").read_bytes(),b"retain uncertainty")
            self.assertFalse((target/archive.COMPLETE_NAME).exists())

    def test_missing_reviewed_manifest_and_invalid_owner_are_fixed_refusals(self):
        with fixture() as (root,source,_):
            with patch.object(archive,"EXPECTED_FILES",None):
                with self.assertRaises(archive.ArchiveRejected):archive.inspect_archive(source)
            for token in ("short",OWNER.upper(),OWNER+"\n",None):
                with self.assertRaises(archive.ArchiveRejected):archive.extract_archive(source,root/"never",token)
                self.assertFalse((root/"never").exists())

if __name__=="__main__":unittest.main()
