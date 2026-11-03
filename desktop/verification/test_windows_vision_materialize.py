"""Synthetic stdlib-only tests; no vendor archive/install/native execution."""
import base64
import csv
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
from unittest import mock
import zipfile

SPEC = importlib.util.spec_from_file_location('materialize', Path(__file__).with_name('windows_vision_materialize.py'))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def pin(data):
    return M.ArtifactPin(len(data), hashlib.sha256(data).hexdigest())


class Case(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()  # test-owned aliases canonicalize once

    def file(self, name, data=b''):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def archive(self, members):
        path = self.root / 'trusted.tar.gz'
        with tarfile.open(path, 'w:gz', format=tarfile.USTAR_FORMAT) as archive:
            for name, content, kind in members:
                item = tarfile.TarInfo(name)
                item.type = kind
                if kind == tarfile.REGTYPE:
                    item.size = len(content)
                    archive.addfile(item, io.BytesIO(content))
                else:
                    item.linkname = content.decode() if content else ''
                    archive.addfile(item)
        return path, pin(path.read_bytes())

    def wheel(self, extra=None, corrupt=False, unlisted=False):
        files = {'demo/__init__.py': b'x = 1\n', 'demo-1.dist-info/METADATA':
                 b'Metadata-Version: 2.1\nName: demo\nVersion: 1\nRequires-Python: >=3.10\nRequires-Dist: numpy>=2; python_version >= "3.9"\n',
                 'demo-1.dist-info/WHEEL': b'Wheel-Version: 1.0\nTag: cp313-cp313-win_amd64\n',
                 'demo-1.dist-info/REQUESTED': b'',
                 'demo-1.dist-info/entry_points.txt': b'[console_scripts]\ndemo=demo:main\n'}
        files.update(extra or {})
        rows = []
        for name, data in files.items():
            digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b'=').decode()
            rows.append([name, 'sha256=' + digest, str(len(data))])
        if corrupt:
            rows[0][1] = 'sha256=' + 'A' * 43
        rows.append(['demo-1.dist-info/RECORD', '', ''])
        record = io.StringIO()
        csv.writer(record).writerows(rows)
        files['demo-1.dist-info/RECORD'] = record.getvalue().encode()
        if unlisted:
            files['unexpected.py'] = b'x'
        path = self.root / 'demo.whl'
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, data in files.items():
                archive.writestr(name, data)
        return path, pin(path.read_bytes())


class PathTests(Case):
    def test_safe_exact_spelling_and_unicode(self):
        for value in ['python/Lib/module.py', 'model/english/đ.txt', 'source/empty']:
            self.assertEqual(M.relative_path(value), value)

    def test_invalid_windows_paths(self):
        for value in ['', '/a', '../a', 'a/../b', 'a/./b', 'a//b', 'a/',
                      'C:/a', 'a\\b', 'a:b', 'a?', 'a*', 'a<', 'a|', 'a"',
                      'a\x00', 'a\ud800', 'a.', 'a ', 'CON', 'aux.txt', 'COM¹.txt',
                      'LPT9', 'CONIN$', 'x' * 241]:
            with self.subTest(value=repr(value)), self.assertRaises(ValueError):
                M.relative_path(value)

    def test_duplicate_case_and_parent_case_aliases(self):
        for names in [['a', 'a'], ['a', 'A'], ['Lib/a', 'lib/b']]:
            with self.assertRaises(ValueError):
                M.checked_names(names)

    def test_reparse_stat_refused_without_platform_emulation(self):
        class Attributes:
            st_mode = stat.S_IFDIR
            st_file_attributes = 0x400
        with self.assertRaisesRegex(ValueError, 'LINK_OR_TYPE'):
            M._kind(Attributes(), True)


class ArtifactTests(Case):
    def test_exact_artifact_and_zero_bytes(self):
        for data in [b'', b'exact\r\n']:
            path = self.file('artifact', data)
            self.assertEqual(M.verify_artifact(path, pin(data)), pin(data))

    def test_wrong_size_hash_and_pin_types(self):
        path = self.file('artifact', b'abc')
        for p in [pin(b'ab'), pin(b'abcd'), M.ArtifactPin(3, '0' * 64),
                  M.ArtifactPin(True, '0' * 64), M.ArtifactPin(-1, '0' * 64),
                  M.ArtifactPin(3, 'A' * 64)]:
            with self.assertRaises(ValueError):
                M.verify_artifact(path, p)

    def test_symbolic_file_and_ancestor_refused(self):
        if os.name == 'nt':
            # Explicit synthetic observed-link policy; no admin/developer-mode
            # symlink creation requirement and no native-race claim.
            class LinkState:
                st_mode = stat.S_IFLNK
                st_file_attributes = 0x400
            with mock.patch.object(Path, 'lstat', return_value=LinkState()):
                with self.assertRaisesRegex(ValueError, 'LINK_OR_TYPE'):
                    M.guarded_path(self.root / 'link')
            return
        actual = self.file('real/file', b'x')
        link = self.root / 'link'
        link.symlink_to(actual)
        with self.assertRaises(ValueError): M.verify_artifact(link, pin(b'x'))
        directory = self.root / 'directory'
        directory.symlink_to(actual.parent, target_is_directory=True)
        with self.assertRaises(ValueError): M.verify_artifact(directory / 'file', pin(b'x'))

    def test_hardlinked_file_refused(self):
        actual = self.file('file', b'x')
        os.link(actual, self.root / 'other')
        with self.assertRaises(ValueError): M.verify_artifact(actual, pin(b'x'))

    def test_changed_artifact_detected_on_context_exit(self):
        path = self.file('file', b'abc')
        with self.assertRaises(ValueError):
            with M._verified(path, pin(b'abc')):
                path.write_bytes(b'xyz')


class WheelTests(Case):
    def test_record_every_file_zero_bytes_and_report_entrypoints(self):
        path, expected = self.wheel()
        result = M.inspect_wheel(path, expected)
        self.assertEqual(len(result['files']), 6)
        self.assertEqual(result['requiresPython'], '>=3.10')
        self.assertEqual(result['requiresDist'], ['numpy>=2; python_version >= "3.9"'])
        self.assertIn('demo=demo:main', result['entryPoints'])
        self.assertEqual(result['approvedStartup'], {})

    def test_record_hash_and_unlisted_file_refuse(self):
        for kwargs in [{'corrupt': True}, {'unlisted': True}]:
            path, expected = self.wheel(**kwargs)
            with self.assertRaises(ValueError): M.inspect_wheel(path, expected)

    def test_startup_requires_exact_approved_hash_not_boolean(self):
        path, expected = self.wheel(extra={'shim.pth': b'import dangerous\n'})
        for approval in [None, {'shim.pth': '0' * 64}, {'shim.pth': True}]:
            with self.assertRaises(ValueError): M.inspect_wheel(path, expected, approval)
        result = M.inspect_wheel(path, expected, {'shim.pth': pin(b'import dangerous\n').sha256})
        self.assertEqual(set(result['approvedStartup']), {'shim.pth'})

    def test_unknown_customize_and_data_scripts_refuse(self):
        for name in ['sitecustomize.py', 'demo/usercustomize.py', 'demo.data/scripts/tool',
                     'sitecustomize/__init__.py', 'usercustomize/__init__.pyc',
                     'sitecustomize.cp313-win_amd64.pyd', 'usercustomize.pyc',
                     '__pycache__/sitecustomize.cpython-313.pyc']:
            path, expected = self.wheel(extra={name: b'x'})
            with self.assertRaisesRegex(ValueError, 'STARTUP_REVIEW_REQUIRED'):
                M.inspect_wheel(path, expected)

    def test_bad_zip_paths_aliases_and_file_ancestor(self):
        for extra in [{'../escape': b'x'}, {'DEMO/other.py': b'x'}, {'demo': b'x'}]:
            path, expected = self.wheel(extra=extra)
            with self.assertRaises(ValueError): M.inspect_wheel(path, expected)

    def test_zip_symlink_refused(self):
        path, _ = self.wheel()
        with zipfile.ZipFile(path, 'a') as archive:
            item = zipfile.ZipInfo('link')
            item.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(item, 'demo/__init__.py')
        with self.assertRaisesRegex(ValueError, 'ZIP_TYPE'):
            M.inspect_wheel(path, pin(path.read_bytes()))

    def test_zip_limits_enforced_before_member_read(self):
        path, expected = self.wheel()
        with mock.patch.object(M, 'MAX_ENTRIES', 2), self.assertRaisesRegex(ValueError, 'ENTRY_LIMIT'):
            M.inspect_wheel(path, expected)
        with mock.patch.object(M, 'MAX_TOTAL', 1), self.assertRaisesRegex(ValueError, 'TOTAL_LIMIT'):
            M.inspect_wheel(path, expected)


class StagingTests(Case):
    def test_exact_fresh_manual_staging_preserves_raw_and_zero(self):
        path, expected = self.archive([('python/file', b'a\r\nb', tarfile.REGTYPE),
                                      ('python/empty', b'', tarfile.REGTYPE)])
        dest = self.root / 'fresh'
        result = M.stage_tar(path, expected, dest, {'python/file': pin(b'a\r\nb'), 'python/empty': pin(b'')})
        self.assertEqual((dest / 'python/file').read_bytes(), b'a\r\nb')
        self.assertEqual(result['runtimeBytes'], 4)
        self.assertEqual((dest / 'python/empty').stat().st_size, 0)
        with self.assertRaisesRegex(ValueError, 'DESTINATION_EXISTS'):
            M.stage_tar(path, expected, dest, {'python/file': pin(b'a\r\nb'), 'python/empty': pin(b'')})

    def test_provider_prefix_into_fresh_child_of_reserved_parent(self):
        path, expected = self.archive([('python/python.exe', b'fixture', tarfile.REGTYPE),
                                      ('python/Lib/empty', b'', tarfile.REGTYPE)])
        reserved = self.root / 'reserved'
        reserved.mkdir()
        result = M.stage_tar(path, expected, reserved / 'python',
                             {'python/python.exe': pin(b'fixture'), 'python/Lib/empty': pin(b'')},
                             strip_prefix='python')
        self.assertEqual((reserved / 'python/python.exe').read_bytes(), b'fixture')
        self.assertFalse((reserved / 'python/python').exists())
        self.assertEqual(result['files'][0]['path'], 'python/Lib/empty')

    def test_exact_english_prefix_into_fresh_model_directory(self):
        prefix = 'en_PP-OCRv5_mobile_rec_infer'
        path, expected = self.archive([(prefix + '/inference.yml', b'fixture', tarfile.REGTYPE)])
        parent = self.root / 'model'
        parent.mkdir()
        M.stage_tar(path, expected, parent / 'english',
                    {prefix + '/inference.yml': pin(b'fixture')}, strip_prefix=prefix)
        self.assertEqual((parent / 'english/inference.yml').read_bytes(), b'fixture')

    def test_prefix_scope_mismatch_refuses_before_creating_child(self):
        path, expected = self.archive([('other/file', b'x', tarfile.REGTYPE)])
        for prefix in ['other', 'python']:
            with self.assertRaisesRegex(ValueError, 'STRIP_PREFIX'):
                M.stage_tar(path, expected, self.root / 'fresh', {'other/file': pin(b'x')}, strip_prefix=prefix)
        self.assertFalse((self.root / 'fresh').exists())

    def test_archive_catalog_mismatch_never_creates_destination(self):
        path, expected = self.archive([('python/file', b'abc', tarfile.REGTYPE)])
        dest = self.root / 'fresh'
        with self.assertRaisesRegex(ValueError, 'CATALOG_MISMATCH'):
            M.stage_tar(path, expected, dest, {'python/other': pin(b'abc')})
        self.assertFalse(dest.exists())

    def test_bad_member_hash_preserves_failed_staging(self):
        path, expected = self.archive([('python/file', b'abc', tarfile.REGTYPE)])
        dest = self.root / 'fresh'
        with self.assertRaisesRegex(ValueError, 'MEMBER_HASH'):
            M.stage_tar(path, expected, dest, {'python/file': pin(b'xyz')})
        self.assertEqual((dest / 'python/file').read_bytes(), b'abc')

    def test_tar_links_special_traversal_and_duplicate_refuse(self):
        for members in [[('python/file', b'other', tarfile.SYMTYPE)],
                        [('python/file', b'other', tarfile.LNKTYPE)],
                        [('python/file', b'', tarfile.FIFOTYPE)],
                        [('../outside', b'x', tarfile.REGTYPE)],
                        [('python/file', b'x', tarfile.REGTYPE)] * 2]:
            path, expected = self.archive(members)
            with self.assertRaises(ValueError):
                M.stage_tar(path, expected, self.root / 'fresh', {'python/file': pin(b'x')})
            self.assertFalse((self.root / 'fresh').exists())

    def test_tar_case_alias_and_file_ancestor_refuse(self):
        for names in [('python/a', 'Python/b'), ('python', 'python/b')]:
            path, expected = self.archive([(n, b'x', tarfile.REGTYPE) for n in names])
            with self.assertRaises(ValueError):
                M.stage_tar(path, expected, self.root / 'fresh', {n: pin(b'x') for n in names})


class InventoryTests(Case):
    def tree(self):
        self.file('candidate/python/Lib/base.py', b'a\r\n')
        self.file('candidate/preprocess-runtime/pyvenv.cfg', b'fixed absolute path')
        self.file('candidate/ocr-runtime/Scripts/tool.exe', b'launcher')
        self.file('candidate/ocr-runtime/Lib/site-packages/x.dist-info/REQUESTED', b'')
        return self.root / 'candidate'

    def test_every_generated_config_launcher_and_empty_file_included(self):
        root = self.tree()
        result = M.inventory_tree(root)
        self.assertEqual(len(result['files']), 4)
        self.assertEqual(result['runtimeBytes'], 30)
        self.assertTrue(M.compare_inventory(result, result))

    def test_raw_bytes_not_normalized(self):
        root = self.tree()
        before = M.inventory_tree(root)
        (root / 'python/Lib/base.py').write_bytes(b'a\n')
        with self.assertRaisesRegex(ValueError, 'INVENTORY_MISMATCH'):
            M.compare_inventory(before, M.inventory_tree(root))

    def test_unknown_code_is_included_and_comparison_refuses(self):
        root = self.tree()
        before = M.inventory_tree(root)
        (root / 'python/new.py').write_bytes(b'')
        after = M.inventory_tree(root)
        self.assertEqual(len(after['files']), 5)
        with self.assertRaises(ValueError): M.compare_inventory(before, after)

    def test_unexpected_top_level_and_operational_content_refuse(self):
        root = self.tree()
        (root / 'work').mkdir()
        M.inventory_tree(root)
        (root / 'work/code.py').write_bytes(b'')
        with self.assertRaisesRegex(ValueError, 'WORK_NOT_EMPTY'): M.inventory_tree(root)
        (root / 'work/code.py').unlink()
        (root / 'unknown.json').write_bytes(b'{}')
        with self.assertRaisesRegex(ValueError, 'UNKNOWN_NAMESPACE'): M.inventory_tree(root)

    def test_pyc_and_direct_url_never_ignored(self):
        root = self.tree()
        for name in ['cache.pyc', 'cache.pyo', 'direct_url.json']:
            path = root / 'python' / name
            path.write_bytes(b'')
            with self.assertRaisesRegex(ValueError, 'UNEXPECTED_GENERATED_FILE'): M.inventory_tree(root)
            path.unlink()

    def test_exact_provider_original_special_files_preserved_and_inventoried(self):
        root = self.tree()
        originals = {}
        for relative, data in [('python/Lib/original.pyc', b'original bytecode'),
                               ('python/Lib/legacy.pyo', b''),
                               ('python/Lib/site-packages/pip.dist-info/direct_url.json', b'{"original":true}')]:
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            originals[relative] = pin(data)
        with self.assertRaisesRegex(ValueError, 'UNEXPECTED_GENERATED_FILE'):
            M.inventory_tree(root)
        result = M.inventory_tree(root, original_special_files=originals)
        self.assertEqual(len(result['files']), 7)
        for relative, expected in originals.items():
            self.assertIn({'path': relative, 'sha256': expected.sha256}, result['files'])
            self.assertEqual(pin((root / relative).read_bytes()), expected)
        (root / 'installed-inventory.json').write_bytes(M.canonical(result))
        self.assertEqual(M.inventory_tree(root, originals), result)

    def test_provider_original_special_changed_size_hash_or_missing_refuses(self):
        root = self.tree()
        relative = 'python/Lib/original.pyc'
        path = root / relative
        path.write_bytes(b'original')
        originals = {relative: pin(b'original')}
        for data in [b'changed!', b'short']:
            path.write_bytes(data)
            with self.assertRaisesRegex(ValueError, 'ORIGINAL_SPECIAL_CHANGED'):
                M.inventory_tree(root, originals)
        path.unlink()
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_SPECIAL_MISSING'):
            M.inventory_tree(root, originals)

    def test_original_map_cannot_admit_venv_special_or_normal_file(self):
        root = self.tree()
        for relative in ['ocr-runtime/generated.pyc', 'preprocess-runtime/generated.pyo',
                         'source/direct_url.json', 'python/ordinary.py', '../python/a.pyc']:
            with self.subTest(relative=relative), self.assertRaises(ValueError):
                M.inventory_tree(root, {relative: pin(b'')})
        for invalid in [[], {'python/a.pyc': True}, {'python/a.pyc': M.ArtifactPin(True, 'a' * 64)}]:
            with self.assertRaises(ValueError): M.inventory_tree(root, invalid)

    def test_allowing_one_original_does_not_allow_new_special_anywhere(self):
        root = self.tree()
        original = 'python/Lib/original.pyc'
        (root / original).write_bytes(b'original')
        originals = {original: pin(b'original')}
        for relative in ['python/Lib/generated.pyc', 'ocr-runtime/generated.pyc',
                         'preprocess-runtime/direct_url.json', 'python/generated.pyo']:
            path = root / relative
            path.write_bytes(b'')
            with self.assertRaisesRegex(ValueError, 'UNEXPECTED_GENERATED_FILE'):
                M.inventory_tree(root, originals)
            path.unlink()

    def test_index_is_closed_canonical_and_exact_not_self_hashed(self):
        root = self.tree()
        result = M.inventory_tree(root)
        index = root / 'installed-inventory.json'
        index.write_bytes(M.canonical(result))
        self.assertEqual(M.inventory_tree(root), result)
        index.write_bytes(json.dumps(result).encode())
        with self.assertRaisesRegex(ValueError, 'INDEX_NONCANONICAL'): M.inventory_tree(root)
        result['runtimeBytes'] += 1
        index.write_bytes(M.canonical(result))
        with self.assertRaisesRegex(ValueError, 'INVENTORY_MISMATCH'): M.inventory_tree(root)

    def test_inventory_schema_duplicate_order_bounds_and_no_exclusions(self):
        good = {'version': 1, 'files': [{'path': 'python/a', 'sha256': 'a' * 64}], 'runtimeBytes': 0}
        M.validate_inventory(good)
        for bad in [{**good, 'excluded': ['x']}, {**good, 'version': True},
                    {**good, 'runtimeBytes': -1}, {**good, 'files': good['files'] * 2},
                    {**good, 'files': [{'path': 'z', 'sha256': 'a' * 64}, {'path': 'a', 'sha256': 'a' * 64}]}]:
            with self.assertRaises(ValueError): M.validate_inventory(bad)
        with mock.patch.object(M, 'MAX_INVENTORY', 8), self.assertRaisesRegex(ValueError, 'INVENTORY_LIMIT'):
            M.validate_inventory(good)

    def test_tree_membership_change_during_hashing_refuses(self):
        root = self.tree()
        original = M._digest
        touched = False
        def mutate(stream, limit):
            nonlocal touched
            result = original(stream, limit)
            if not touched:
                touched = True
                (root / 'python/late.py').write_bytes(b'')
            return result
        with mock.patch.object(M, '_digest', side_effect=mutate):
            with self.assertRaisesRegex(ValueError, 'TREE_CHANGED'):
                M.inventory_tree(root)

    def test_directory_iteration_stops_before_unbounded_sort(self):
        class Entry:
            path = str(self.root / 'synthetic')
        class Entries:
            calls = 0
            def __enter__(inner): return inner
            def __exit__(inner, *args): pass
            def __iter__(inner): return inner
            def __next__(inner):
                inner.calls += 1
                if inner.calls > 4: raise AssertionError('unbounded iteration')
                return Entry()
        entries = Entries()
        with mock.patch.object(M.os, 'scandir', return_value=entries):
            with self.assertRaisesRegex(ValueError, 'ENTRY_LIMIT'):
                M._children(self.root, 3)
        self.assertEqual(entries.calls, 4)

    def test_inventory_entry_and_total_limits(self):
        root = self.tree()
        with mock.patch.object(M, 'MAX_ENTRIES', 2), self.assertRaisesRegex(ValueError, 'ENTRY_LIMIT'):
            M.inventory_tree(root)
        with mock.patch.object(M, 'MAX_TOTAL', 1), self.assertRaisesRegex(ValueError, 'TOTAL_LIMIT'):
            M.inventory_tree(root)


if __name__ == '__main__':
    unittest.main()
