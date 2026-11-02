"""Synthetic provenance/receipts only: no compiler, SDK, DLL, DEX or device execution."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid
import validate_derived_pair_build as v


def entry(ns, path, size=1, digest='a' * 64):
    return {'namespace': ns, 'path': path, 'bytes': size, 'sha256': digest}


def fixture():
    upstream, effective, patch_sha, readme = v.authority()
    report = dict.fromkeys(v.REPORT_KEYS)
    report.update(version=1, scope=v.SCOPE, sourceCommit=v.UPSTREAM, sourceTree=v.TREE,
                  autoSourceCommit='1' * 40, autoSourceTree='2' * 40,
                  sourceArchiveSha256=v.ARCHIVE, sourceManifestSha256=v.SELECTION,
                  patchSha256=patch_sha, sourceUnchanged=True, toolsUnchanged=True,
                  outputInspected=True, directoryCleanup=True, failure=None, passed=True)
    for stage in v.STAGES:
        report[stage] = {'status': 'EMPTY_OUTPUT', 'exitCode': 0, 'cleanupComplete': True,
                         'stdoutTruncated': False, 'stderrTruncated': False}
    source = {'version': 1, 'upstreamCommit': v.UPSTREAM, 'upstreamTree': v.TREE,
              'autoCommit': report['autoSourceCommit'], 'autoTree': report['autoSourceTree'],
              'archiveSha256': v.ARCHIVE, 'selectionManifestSha256': v.SELECTION,
              'patchSha256': patch_sha, 'upstream': upstream, 'effective': effective}
    tools = {'version': 1, 'runnerImage': 'win22/20261101.1', 'jdkVersion': '17.0.17+10',
             'jdkVendor': 'TEMURIN', 'platformApi': 36, 'platformRevision': '2',
             'buildToolsVersion': '36.0.0', 'consumerCompilerVersion': '4.8.9032.0', 'files': []}
    for ns, paths in {'JDK17': ('bin/java.exe', 'bin/javac.exe', 'release'),
                      'ANDROID36': ('android.jar', 'framework.aidl', 'source.properties'),
                      'BUILD_TOOLS36': ('aidl.exe', 'lib/d8.jar', 'core-lambda-stubs.jar', 'source.properties'),
                      'FRAMEWORK64': ('csc.exe', 'mscorlib.dll', 'System.dll', 'System.Core.dll')}.items():
        tools['files'].extend(entry(ns, p) for p in paths)
    tools['files'].sort(key=lambda r: (r['namespace'], r['path']))
    deps = {'version': 1, 'entries': [{**r, 'role': 'BUNDLED_SOURCE', 'license': 'APACHE_2_0'}
                                     for r in effective if r['namespace'] == 'SERVER']}
    deps['entries'].append({**entry('FULL_SOURCE', 'README.md', readme['bytes'], readme['sha256']),
                            'role': 'BUNDLED_SOURCE', 'license': 'APACHE_2_0'})
    deps['entries'].sort(key=lambda r: (r['namespace'], r['path']))
    generated = {'version': 1, 'files': sorted([
        *(entry('GENERATED', p, len(v.BUILD_CONFIG), v.sha(v.BUILD_CONFIG)) if p.endswith('/BuildConfig.java') else entry('GENERATED', p) for p in v.GENERATED),
        entry('CLASSES', 'com/genymobile/scrcpy/Server.class')], key=lambda r: (r['namespace'], r['path']))}
    commands = {'version': 1, 'stages': [
        {'stage': stage, 'executable': {'namespace': exe[0], 'path': exe[1]},
         'workingDirectory': 'EXECUTABLE_DIRECTORY', 'arguments': args, 'actualInvocationSha256': 'b' * 64}
        for stage, (exe, args) in zip(v.STAGES, v.expected_commands(source, generated))]}
    outputs = {'version': 1,
       'server': {'name': 'server.jar', 'bytes': 512, 'sha256': 'c' * 64,
                  'entries': [{'name': 'classes.dex', 'bytes': 256, 'sha256': 'd' * 64}]},
       'consumer': {'name': 'RetainedVideoConsumer.dll', 'bytes': 1024, 'sha256': 'e' * 64,
                    'machine': 34404, 'optionalMagic': 523},
       'dexClasses': ['Lcom/genymobile/scrcpy/Server;'],
       'dexNamespaces': [{'prefix': 'com.genymobile.scrcpy', 'count': 1}]}
    report['serverOutput'] = {'bytes': 512, 'sha256': 'c' * 64, 'dexBytes': 256, 'dexSha256': 'd' * 64}
    report['consumerOutput'] = {'bytes': 1024, 'sha256': 'e' * 64}
    manifests = dict(zip(v.NAMES[:6], (source, tools, deps, generated, commands, outputs)))
    report['effectiveManifestSha256'] = v.sha(v.canonical(effective))
    for name, field in zip(v.NAMES[:6], v.DIGESTS[:6]):
        report[field] = v.sha(v.canonical(manifests[name]))
    manifests['server-build.json'] = {'version': 1, 'upstreamCommit': v.UPSTREAM,
        'sourcePatchSha256': patch_sha, 'toolchainManifestSha256': report['toolchainManifestSha256'],
        'dependenciesManifestSha256': report['dependenciesManifestSha256'],
        'buildCommandSha256': report['buildCommandSha256'], 'serverBytes': 512,
        'serverSha256': 'c' * 64, 'protocolId': v.PROTOCOL}
    manifests['consumer-build.json'] = {'version': 1, 'sourceCommit': report['autoSourceCommit'],
        'compilerSha256': 'a' * 64, 'compilerVersion': '4.8.9032.0',
        'arguments': ['/nologo', '/target:library', '/platform:x64', '/optimize+'],
        'frameworkReferences': {'System.dll': 'a' * 64, 'System.Core.dll': 'a' * 64},
        'sources': {p: next(r['sha256'] for r in effective if r['namespace'] == 'CONSUMER' and r['path'] == p) for p in v.CS},
        'consumerSha256': 'e' * 64}
    return report, manifests


def bind(report, manifests):
    raw = {k: v.canonical(val) for k, val in manifests.items()}
    for name, field in zip(v.NAMES, v.DIGESTS):
        report[field] = v.sha(raw[name]) if name in raw else None
    return raw


def failed():
    report = dict.fromkeys(v.REPORT_KEYS)
    report.update(version=1, scope=v.SCOPE, sourceCommit=v.UPSTREAM, sourceTree=v.TREE,
                  autoSourceCommit='1' * 40, autoSourceTree='2' * 40,
                  sourceArchiveSha256=v.ARCHIVE, sourceManifestSha256=v.SELECTION,
                  sourceUnchanged=False, toolsUnchanged=False, outputInspected=False,
                  directoryCleanup=False, failure='TOOLS_UNAVAILABLE', passed=False)
    return report


class ValidatorTests(unittest.TestCase):
    def test_complete_eight_manifest_synthetic_policy_composition(self):
        r, m = fixture()
        self.assertTrue(v.validate_report(r, bind(r, m))['passed'])

    def test_duplicate_order_noncanonical_and_private_keys_refuse(self):
        for raw in (b'{"a":1,"a":2}', b'{"a":1}\n', b'{ "a":1}', b'{"a":-0}', b'\xef\xbb\xbf{}'):
            with self.subTest(raw=raw), self.assertRaises(ValueError): v.parse(raw)
        r = failed(); r['privatePath'] = 'C:/private'
        with self.assertRaises(ValueError): v.validate_report(r, {})
        r = failed(); r = dict(reversed(list(r.items())))
        with self.assertRaises(ValueError): v.validate_report(r, {})

    def test_actual_pin_and_source_changes_refuse_even_with_rehashed_evidence(self):
        for key in ('bytes', 'sha256'):
            r, m = fixture(); m['source.json']['upstream'][0][key] = 1 if key == 'bytes' else '0' * 64
            with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))
        r, m = fixture(); m['source.json']['effective'][0]['sha256'] = '0' * 64
        r['effectiveManifestSha256'] = v.sha(v.canonical(m['source.json']['effective']))
        with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))

    def test_tool_path_case_alias_and_caps_refuse(self):
        for name in ('C:/secret', '../secret', 'a\\b', 'CON.txt', 'name.', 'a//b', '/root', 'a/' * 16 + 'b'):
            with self.subTest(name=name), self.assertRaises(ValueError): v.path(name)
        r, m = fixture(); m['tools.json']['files'][0]['bytes'] = 268435457
        with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))
        r, m = fixture(); row = copy.deepcopy(m['tools.json']['files'][0]); row['path'] = row['path'].upper()
        m['tools.json']['files'].append(row); m['tools.json']['files'].sort(key=lambda x:(x['namespace'], x['path']))
        with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))

    def test_command_extra_processor_and_host_path_refuse(self):
        for extra in ('-processor', 'C:/private/extra.jar', '@private.args'):
            r, m = fixture(); m['commands.json']['stages'][2]['arguments'].append(extra)
            with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))

    def test_build_crossbindings_and_consumer_upstream_identity_refuse(self):
        for name, key in (('consumer-build.json', 'sourceCommit'), ('server-build.json', 'serverSha256')):
            r, m = fixture(); m[name][key] = v.UPSTREAM if key == 'sourceCommit' else '0' * 64
            with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))

    def test_dex_namespace_and_count_must_be_derived(self):
        for name in ('Lkotlin/Runtime;', 'Lcom/genymobile/scrcpy/../Server;', 'Lcom/genymobile/scrcpy/Server;\n'):
            r, m = fixture(); m['outputs.json']['dexClasses'] = [name]
            with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))
        r, m = fixture(); m['outputs.json']['dexNamespaces'][0]['count'] = 2
        with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))

    def test_failure_null_stages_are_preserved_and_cannot_be_promoted(self):
        r = failed()
        self.assertEqual(v.validate_report(r, {}), r)
        r['passed'] = True
        with self.assertRaises(ValueError): v.validate_report(r, {})
        r = failed(); r['failure'] = None
        with self.assertRaises(ValueError): v.validate_report(r, {})

    def test_known_nonzero_timeout_and_missing_retirement_never_pass(self):
        for status, code, retired in (('NONZERO_EXIT', 7, True), ('TIMEOUT', None, False), ('SUCCESS', 0, False)):
            r = failed(); r['failure'] = 'COMPILE_FAILED'; r['aidlClipboard'] = {
                'status': status, 'exitCode': code, 'cleanupComplete': retired,
                'stdoutTruncated': False, 'stderrTruncated': False}
            self.assertFalse(v.validate_report(r, {})['passed'])
            r['aidlDisplay'] = {'status': 'SUCCESS', 'exitCode': 0, 'cleanupComplete': True,
                                'stdoutTruncated': False, 'stderrTruncated': False}
            with self.assertRaises(ValueError): v.validate_report(r, {})

    def test_absent_manifest_digest_or_invented_cleanup_refuse(self):
        r = failed(); r['outputsManifestSha256'] = 'a' * 64
        with self.assertRaises(ValueError): v.validate_report(r, {})
        r, m = fixture(); r['directoryCleanup'] = False
        with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))

    def test_output_inspection_cannot_be_claimed_after_failed_stage(self):
        r, m = fixture()
        r['consumerCsc']['status'] = 'NONZERO_EXIT'; r['consumerCsc']['exitCode'] = 1
        r['failure'] = 'COMPILE_FAILED'; r['passed'] = False
        with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))

    def test_bound_failure_publication_keeps_scratch_and_json_only(self):
        with tempfile.TemporaryDirectory() as temp:
            # Fixture custody starts from one canonical spelling (Windows TEMP may use 8.3).
            temp = str(Path(temp).resolve())
            base = Path(temp) / '.derived-pair-build-runtime'; base.mkdir()
            # Canonicalizing the fixture does not relax production alias refusal.
            with patch.object(type(base), 'resolve', return_value=base / 'alias'):
                with self.assertRaises(ValueError): v.directory(base)
            self.assertEqual(v.directory(base), base)
            root = Path(temp) / ('derived-pair-' + str(uuid.uuid4())); root.mkdir()
            for folder in (base, root): (folder / '.owner').write_text(str(uuid.uuid4()), encoding='ascii')
            (root / 'private').mkdir(); (root / 'evidence').mkdir()
            context = dict(zip(v.CONTEXT_KEYS, (1, '1' * 40, '2' * 40, 'win22/20261101.1',
                temp, temp, temp, temp, '17.0.17', 'TEMURIN', '2', '36.0.0', '4.8.9032.0')))
            raw_context = v.canonical(context)
            (base / 'context.json').write_bytes(raw_context)
            (root / 'private/context.json').write_bytes(raw_context)
            (root / 'private/report.json').write_bytes(v.canonical(failed()))
            with patch.object(v, 'base_path', return_value=base), patch('tempfile.gettempdir', return_value=temp):
                v.stage(root); v.cleanup(base)
                self.assertFalse(v.publish(base))
                public = v.parse((base / 'upload/report.json').read_bytes())
                self.assertFalse(public['directoryCleanup']); self.assertEqual(public['failure'], 'TOOLS_UNAVAILABLE')
                self.assertTrue(root.exists())
                self.assertEqual([p.name for p in (base / 'upload').iterdir()], ['report.json'])
                with self.assertRaises((ValueError, FileExistsError)): v.publish(base)

    def test_actual_private_static_zip_dex_pe_bytes_are_bound_without_loading(self):
        import struct
        import hashlib
        import zlib
        import zipfile
        import io
        descriptor = b'Lcom/genymobile/scrcpy/Server;'
        dex = bytearray(152 + 1 + len(descriptor) + 1)
        dex[:8] = b'dex\n035\0'
        for offset, value in ((32,len(dex)), (36,112), (40,0x12345678), (56,1), (60,112),
                              (64,1), (68,116), (96,1), (100,120), (112,152)):
            struct.pack_into('<I', dex, offset, value)
        dex[152] = len(descriptor); dex[153:153+len(descriptor)] = descriptor
        dex[12:32] = hashlib.sha1(dex[32:]).digest()
        struct.pack_into('<I', dex, 8, zlib.adler32(dex[12:]) & 0xffffffff)
        class StreamingZip(io.BytesIO):
            def seekable(self): return False
            def seek(self, *args): raise OSError('NONSEEKABLE_FIXTURE')
        archive = StreamingZip()
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('classes.dex', dex)
        with zipfile.ZipFile(io.BytesIO(archive.getvalue())) as z:
            self.assertEqual(z.infolist()[0].flag_bits & 8, 8)
        from test_derived_pair_build import pe_fixture
        dll = pe_fixture()
        with tempfile.TemporaryDirectory() as temp:
            # Fixture custody starts from one canonical spelling (Windows TEMP may use 8.3).
            temp = str(Path(temp).resolve())
            root = Path(temp); (root/'evidence').mkdir()
            (root/'evidence/server.jar').write_bytes(archive.getvalue())
            (root/'evidence/RetainedVideoConsumer.dll').write_bytes(dll)
            (root/'output').mkdir()
            (root/'output/classes.zip').write_bytes(archive.getvalue())
            (root/'output/RetainedVideoConsumer.dll').write_bytes(dll)
            from derived_pair_build import inspect_outputs
            produced, produced_zip, _ = inspect_outputs(root)
            self.assertEqual(produced_zip, archive.getvalue())
            self.assertEqual(produced['server']['sha256'], v.sha(archive.getvalue()))
            r, m = fixture()
            r['serverOutput'] = {'bytes':len(archive.getvalue()), 'sha256':v.sha(archive.getvalue()),
                                 'dexBytes':len(dex), 'dexSha256':v.sha(dex)}
            r['consumerOutput'] = {'bytes':len(dll), 'sha256':v.sha(dll)}
            # Shared synthetic CLI metadata fixture; never compiled or loaded.
            v.check_output_bytes(root, r, {'outputs.json':v.canonical(m['outputs.json'])})
            # Actual isolated Python has no sibling directory on sys.path.
            import subprocess
            import sys
            (root/'report.json').write_bytes(v.canonical(r))
            (root/'outputs.json').write_bytes(v.canonical(m['outputs.json']))
            script = ('import importlib.util,sys,pathlib; '
                      's=importlib.util.spec_from_file_location("validator",sys.argv[1]); '
                      'v=importlib.util.module_from_spec(s); s.loader.exec_module(v); '
                      'r=pathlib.Path(sys.argv[2]); '
                      'v.check_output_bytes(r,v.parse((r/"report.json").read_bytes()),'
                      '{"outputs.json":(r/"outputs.json").read_bytes()}); print("ISOLATED_STATIC_PASS")')
            result = subprocess.run([sys.executable, '-I', '-B', '-c', script,
                                     str(Path(v.__file__).resolve()), str(root)],
                                    capture_output=True, timeout=10, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, b'ISOLATED_STATIC_PASS\n')
            self.assertEqual(result.stderr, b'')
            broken = bytearray(dll); broken[132] = 0
            (root/'evidence/RetainedVideoConsumer.dll').write_bytes(broken)
            with self.assertRaises(ValueError): v.check_output_bytes(root, r, {'outputs.json':v.canonical(m['outputs.json'])})
            r['consumerOutput']['sha256'] = v.sha(broken)
            with self.assertRaises(ValueError): v.check_output_bytes(root, r, {'outputs.json':v.canonical(m['outputs.json'])})
            missing_cli = bytearray(dll); struct.pack_into('<II', missing_cli, 152 + 112 + 14 * 8, 0, 0)
            (root/'evidence/RetainedVideoConsumer.dll').write_bytes(missing_cli)
            r['consumerOutput']['sha256'] = v.sha(missing_cli)
            with self.assertRaises(ValueError): v.check_output_bytes(root, r, {'outputs.json':v.canonical(m['outputs.json'])})
            (root/'evidence/RetainedVideoConsumer.dll').write_bytes(dll)
            r['consumerOutput']['sha256'] = v.sha(dll)
            forbidden = bytearray(archive.getvalue())
            central = forbidden.index(b'PK\x01\x02')
            struct.pack_into('<H', forbidden, 6, 0x28)
            struct.pack_into('<H', forbidden, central + 8, 0x28)
            (root/'evidence/server.jar').write_bytes(forbidden)
            (root/'output/classes.zip').write_bytes(forbidden)
            r['serverOutput']['sha256'] = v.sha(forbidden)
            with self.assertRaises(ValueError): inspect_outputs(root)
            with self.assertRaises(ValueError): v.check_output_bytes(root, r, {'outputs.json':v.canonical(m['outputs.json'])})

    def test_generated_build_config_hash_cannot_be_replaced(self):
        r, m = fixture()
        row = next(x for x in m['generated.json']['files'] if x['path'].endswith('/BuildConfig.java'))
        row['sha256'] = 'f' * 64
        with self.assertRaises(ValueError): v.validate_report(r, bind(r, m))

    def test_publisher_requires_actual_absence_and_all_eight_bound_json_files(self):
        # Model an already validated staged handoff with synthetic process facts.
        # This does not exercise or claim a real compiler campaign.
        with tempfile.TemporaryDirectory() as temp:
            # Fixture custody starts from one canonical spelling (Windows TEMP may use 8.3).
            temp = str(Path(temp).resolve())
            base = Path(temp)/'.derived-pair-build-runtime'; base.mkdir(); (base/'upload').mkdir()
            token = str(uuid.uuid4()); run_id = str(uuid.uuid4())
            (base/'.owner').write_text(token)
            root = Path(temp)/('derived-pair-'+run_id); root.mkdir(); (root/'.owner').write_text(run_id)
            context = dict(zip(v.CONTEXT_KEYS, (1, '1'*40, '2'*40, 'win22/20261101.1',
                temp,temp,temp,temp,'17.0.17','TEMURIN','2','36.0.0','4.8.9032.0')))
            context_raw = v.canonical(context); (base/'context.json').write_bytes(context_raw)
            report, manifests = fixture(); report['directoryCleanup'] = False; report['passed'] = False
            raw_manifests = bind(report, manifests); report_raw = v.canonical(report)
            for name, raw in raw_manifests.items(): (base/'upload'/name).write_bytes(raw)
            (base/'staged-report.json').write_bytes(report_raw)
            binding = {'version':1,'scratchRoot':str(root),'runId':run_id,'owner':run_id,
                       'baseOwner':token,'contextSha256':v.sha(context_raw),'reportSha256':v.sha(report_raw)}
            (base/'staging.json').write_bytes(v.canonical(binding))
            (root/'.owner').unlink(); root.rmdir()
            with patch.object(v, 'base_path', return_value=base), patch('tempfile.gettempdir', return_value=temp):
                v.cleanup(base)
                (base/'upload/tools.json').write_bytes(raw_manifests['tools.json']+b'\n')
                with self.assertRaises(ValueError): v.publish(base)
                self.assertFalse((base/'upload/report.json').exists())
                (base/'upload/tools.json').write_bytes(raw_manifests['tools.json'])
                self.assertTrue(v.publish(base))
                self.assertEqual(set(p.name for p in (base/'upload').iterdir()), {*v.NAMES, 'report.json'})
                self.assertTrue(v.parse((base/'upload/report.json').read_bytes())['directoryCleanup'])

    def test_read_file_cross_api_windows_ctime_uses_common_birthtime(self):
        self._read_stat_fixture({})

    def test_read_file_same_api_ctime_change_still_refuses(self):
        for location in ('path_after', 'fd_after'):
            with self.subTest(location=location), self.assertRaises(ValueError):
                self._read_stat_fixture({location: {'st_ctime_ns': 999}})

    def test_read_file_replacement_birthtime_and_link_change_refuse(self):
        for location, change in (('fd_before', {'st_ino': 999}),
                                 ('path_after', {'st_ino': 999}),
                                 ('fd_before', {'st_birthtime_ns': 999}),
                                 ('fd_after', {'st_nlink': 2})):
            with self.subTest(location=location, change=change), self.assertRaises(ValueError):
                self._read_stat_fixture({location: change})

        with self.assertRaises(ValueError):
            self._read_stat_fixture({'omit_birth': True})

    def _read_stat_fixture(self, changes):
        from types import SimpleNamespace
        import os
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp).resolve() / 'bytes.bin'
            payload = b'line\r\ncontrol\x1aend'
            file.write_bytes(payload)
            actual = file.stat()
            fields = {k: getattr(actual, k) for k in
                      ('st_mode', 'st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_nlink')}
            fields.update(st_birthtime_ns=50, st_file_attributes=0)
            stats = {}
            for key in ('path_before', 'path_after', 'fd_before', 'fd_after'):
                stats[key] = SimpleNamespace(**(fields | {'st_ctime_ns': 100 if key.startswith('path') else 200} | changes.get(key, {})))
            if changes.get('omit_birth'):
                for record in stats.values(): del record.st_birthtime_ns
            with patch.object(type(file), 'lstat', side_effect=[stats['path_before'], stats['path_after']]), \
                    patch.object(os, 'fstat', side_effect=[stats['fd_before'], stats['fd_after']]), \
                    patch.object(v.sys, 'platform', 'win32'):
                self.assertEqual(v.read_file(file, 1024), payload)

    def test_bound_cleanup_receipt_cannot_retarget_or_reuse_owner(self):
        with tempfile.TemporaryDirectory() as temp:
            # Fixture custody starts from one canonical spelling (Windows TEMP may use 8.3).
            temp = str(Path(temp).resolve())
            base = Path(temp) / '.derived-pair-build-runtime'; base.mkdir()
            token = str(uuid.uuid4()); (base / '.owner').write_text(token)
            record = {'version': 1, 'scratchRoot': temp + '/elsewhere', 'runId': token,
                      'owner': token, 'baseOwner': token, 'contextSha256': 'a' * 64, 'reportSha256': 'b' * 64}
            (base / 'staging.json').write_bytes(v.canonical(record))
            with patch.object(v, 'base_path', return_value=base), patch('tempfile.gettempdir', return_value=temp):
                with self.assertRaises(ValueError): v.cleanup(base)
            self.assertFalse((base / 'cleanup.json').exists())


if __name__ == '__main__':
    unittest.main()
