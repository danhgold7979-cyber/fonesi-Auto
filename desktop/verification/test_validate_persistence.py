import json
import unittest
from validate_runtime import InvalidEvidence, VERSIONS
from validate_persistence import CASES, validate_stage, validate_sequence

WITNESS = {'storeId': '12345678-1234-1234-1234-123456789abc',
           'backupId': '22345678-1234-1234-1234-123456789abc',
           'locationId': '32345678-1234-1234-1234-123456789abc',
           'encryptedSha256': 'a' * 64}


def fixture(stage='provision'):
    return {'version': 1, 'mode': 'source', 'stage': stage, 'versions': dict(VERSIONS),
            'cases': {key: stage != 'provision' if key == 'existingBackupMatched' else True for key in CASES},
            'receipt': dict(WITNESS)}


def run(value, process=None, stdout=None, stderr=''):
    abrupt = value['stage'] == 'abrupt-auth'
    if process is None:
        process = {'status': 'NONZERO_EXIT' if abrupt else 'SUCCESS', 'exitCode': -1073741819 if abrupt else 0,
                   'cleanupComplete': True, 'stdoutTruncated': False, 'stderrTruncated': False}
    if stdout is None:
        stdout = ('PERSISTENCE_ABRUPT_CRASH_ARMED' if abrupt else 'PERSISTENCE_ORDERLY_QUIT') + '\n'
    return validate_stage(json.dumps(value).encode(), process, stdout, stderr,
                          None if value['stage'] == 'provision' else WITNESS,
                          value['mode'], value['stage'])


class PersistenceStageTests(unittest.TestCase):
    def test_four_exact_stages_and_private_witness_separation(self):
        for stage in ('provision', 'orderly-auth', 'abrupt-auth', 'final-auth'):
            public, private = run(fixture(stage))
            self.assertTrue(public['passed'])
            self.assertEqual(private, WITNESS)
            encoded = json.dumps(public)
            for secret in WITNESS.values():
                self.assertNotIn(secret, encoded)

    def test_no_false_case_or_unretired_process_passes(self):
        for case in CASES:
            if case == 'existingBackupMatched':
                continue
            value = fixture()
            value['cases'][case] = False
            self.assertFalse(run(value)[0]['passed'])
        process = {'status': 'SUCCESS', 'exitCode': 0, 'cleanupComplete': False,
                   'stdoutTruncated': False, 'stderrTruncated': False}
        self.assertFalse(run(fixture(), process=process)[0]['passed'])

    def test_orderly_marker_cannot_replace_abrupt_exit_and_reverse(self):
        self.assertFalse(run(fixture('abrupt-auth'), stdout='PERSISTENCE_ORDERLY_QUIT\n')[0]['passed'])
        self.assertFalse(run(fixture(), stdout='PERSISTENCE_ABRUPT_CRASH_ARMED\n')[0]['passed'])
        self.assertFalse(run(fixture('abrupt-auth'), stderr='PERSISTENCE_UNEXPECTED_QUIT\n')[0]['passed'])

    def test_unknown_extra_duplicate_and_malformed_private_fields_reject(self):
        value = fixture()
        value['receipt']['path'] = 'PRIVATE'
        with self.assertRaises(InvalidEvidence):
            run(value)
        value = fixture('final-auth')
        value['receipt']['backupId'] = '42345678-1234-1234-1234-123456789abc'
        with self.assertRaises(InvalidEvidence):
            run(value)
        value['cases']['existingBackupMatched'] = False
        self.assertFalse(run(value)[0]['passed'])
        value = fixture()
        value['cases']['schemaZero'] = 1
        with self.assertRaises(InvalidEvidence):
            run(value)

    def test_fixed_framing_never_hides_unknown_output(self):
        self.assertTrue(run(fixture(), stdout='\r\nPERSISTENCE_ORDERLY_QUIT\r\n')[0]['passed'])
        for text in ('PRIVATE\nPERSISTENCE_ORDERLY_QUIT\n', '\n\nPERSISTENCE_ORDERLY_QUIT\n',
                     'PERSISTENCE_ORDERLY_QUIT\nPERSISTENCE_ORDERLY_QUIT\n', ' \nPERSISTENCE_ORDERLY_QUIT\n'):
            with self.assertRaises(InvalidEvidence):
                run(fixture(), stdout=text)
        self.assertFalse(run(fixture(), stderr='PERSISTENCE_PROBE_FAILED\n')[0]['passed'])

    def test_raw_duplicate_and_nonfinite_documents_reject_before_normalization(self):
        value = fixture()
        raw = json.dumps(value).encode()
        process = {'status': 'SUCCESS', 'exitCode': 0, 'cleanupComplete': True,
                   'stdoutTruncated': False, 'stderrTruncated': False}
        for altered in (raw.replace(b'"version": 1', b'"version":0,"version":1'),
                        raw.replace(b'"schemaZero": true', b'"schemaZero":false,"schemaZero":true'),
                        raw.replace(b'"version": 1', b'"version":NaN')):
            with self.assertRaises(InvalidEvidence):
                validate_stage(altered, process, 'PERSISTENCE_ORDERLY_QUIT\n', '', None, 'source', 'provision')


class PersistenceSequenceTests(unittest.TestCase):
    def test_only_complete_retired_matching_sequence_can_issue_private_proof(self):
        stages = {}
        for stage in ('provision', 'orderly-auth', 'abrupt-auth', 'final-auth'):
            abrupt = stage == 'abrupt-auth'
            stages[stage] = {'raw': json.dumps(fixture(stage)).encode(),
                             'process': {'status': 'NONZERO_EXIT' if abrupt else 'SUCCESS',
                                         'exitCode': -1073741819 if abrupt else 0,
                                         'cleanupComplete': True, 'stdoutTruncated': False,
                                         'stderrTruncated': False},
                             'stdout': ('PERSISTENCE_ABRUPT_CRASH_ARMED' if abrupt else 'PERSISTENCE_ORDERLY_QUIT') + '\n',
                             'stderr': ''}
        public, proof = validate_sequence(stages, 'source')
        self.assertTrue(public['passed'])
        self.assertEqual(proof, {'version': 1, **WITNESS, 'state': 'ORDERLY_AND_ABRUPT_RECOVERED'})
        self.assertNotIn(WITNESS['backupId'], json.dumps(public))
        stages['abrupt-auth']['process']['cleanupComplete'] = False
        public, proof = validate_sequence(stages, 'source')
        self.assertFalse(public['passed'])
        self.assertIsNone(proof)
        del stages['final-auth']
        with self.assertRaises(InvalidEvidence):
            validate_sequence(stages, 'source')


class PersistencePrivateFilesTests(unittest.TestCase):
    def test_private_file_stages_and_final_proof_are_exclusive_and_lease_bound(self):
        import tempfile
        from pathlib import Path
        from validate_persistence import stage_files, finalize_files
        token = '42345678-1234-1234-1234-123456789abc'
        owner = '52345678-1234-1234-1234-123456789abc'
        def write(path, value):
            path.write_text(json.dumps(value, separators=(',', ':')), encoding='utf8')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / '.owner').write_text(token, encoding='ascii')
            data = root / 'data-source'
            data.mkdir()
            lock = data / '.writer-lock'
            lock.mkdir()
            write(data / '.persistence-owner.json', {'version': 1, 'storeId': WITNESS['storeId'], 'kind': 'FRESH', 'restoreReceiptId': None})
            write(lock / 'owner.json', {'version': 1, 'storeId': WITNESS['storeId'], 'ownerToken': owner})
            write(root / 'persistence-state-source.json', {'version': 1, 'parentToken': token, 'ownerToken': owner, 'storeId': WITNESS['storeId']})
            for stage in ('provision', 'orderly-auth', 'abrupt-auth', 'final-auth'):
                abrupt = stage == 'abrupt-auth'
                write(root / f'persistence-source-{stage}.json', fixture(stage))
                write(root / f'persistence-capture-source-{stage}.json', {
                    'process': {'status': 'NONZERO_EXIT' if abrupt else 'SUCCESS', 'exitCode': -1 if abrupt else 0,
                                'cleanupComplete': True, 'stdoutTruncated': False, 'stderrTruncated': False},
                    'stdout': ('PERSISTENCE_ABRUPT_CRASH_ARMED' if abrupt else 'PERSISTENCE_ORDERLY_QUIT') + '\n',
                    'stderr': ''})
                self.assertTrue(stage_files(root, 'source', stage))
                self.assertFalse((data / 'key-durability-proof.json').exists())
            with self.assertRaises(InvalidEvidence):
                finalize_files(root, '62345678-1234-1234-1234-123456789abc', 'source')
            self.assertFalse((data / 'key-durability-proof.json').exists())
            (root / '.owner').write_text('62345678-1234-1234-1234-123456789abc', encoding='ascii')
            with self.assertRaises(InvalidEvidence):
                finalize_files(root, token, 'source')
            (root / '.owner').write_text(token, encoding='ascii')
            (lock / 'unexpected').write_text('fixed', encoding='ascii')
            with self.assertRaises(InvalidEvidence):
                finalize_files(root, token, 'source')
            (lock / 'unexpected').unlink()
            for file in (lock / 'owner.json', data / '.persistence-owner.json'):
                original = json.loads(file.read_text())
                write(file, {**original, 'version': True})
                with self.assertRaises(InvalidEvidence):
                    finalize_files(root, token, 'source')
                write(file, original)
                self.assertFalse((data / 'key-durability-proof.json').exists())
            state_file = root / 'persistence-state-source.json'
            state_original = json.loads(state_file.read_text())
            lock_original = json.loads((lock / 'owner.json').read_text())
            for bad in (None, '', 'not-a-uuid', 123):
                write(state_file, {**state_original, 'ownerToken': bad})
                write(lock / 'owner.json', {**lock_original, 'ownerToken': bad})
                with self.assertRaises(InvalidEvidence):
                    finalize_files(root, token, 'source')
                self.assertFalse((data / 'key-durability-proof.json').exists())
            write(state_file, state_original)
            write(lock / 'owner.json', lock_original)
            self.assertTrue(finalize_files(root, token, 'source'))
            proof = json.loads((data / 'key-durability-proof.json').read_text())
            self.assertEqual(proof, {'version': 1, **WITNESS, 'state': 'ORDERLY_AND_ABRUPT_RECOVERED'})
            with self.assertRaises(FileExistsError):
                finalize_files(root, token, 'source')

    def test_existing_stage_output_never_authorizes_another_validation(self):
        import tempfile
        from pathlib import Path
        from validate_persistence import stage_files
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'persistence-source-provision.json').write_text(json.dumps(fixture()), encoding='utf8')
            (root / 'persistence-capture-source-provision.json').write_text(json.dumps({
                'process': {'status': 'SUCCESS', 'exitCode': 0, 'cleanupComplete': True,
                            'stdoutTruncated': False, 'stderrTruncated': False},
                'stdout': 'PERSISTENCE_ORDERLY_QUIT\n', 'stderr': ''}), encoding='utf8')
            (root / 'persistence-public-source-provision.json').write_text('STALE', encoding='ascii')
            with self.assertRaises(FileExistsError):
                stage_files(root, 'source', 'provision')
            self.assertFalse((root / 'persistence-witness-source.json').exists())


class PersistencePublicReportTests(unittest.TestCase):
    def public_mode(self, mode):
        stages = []
        for stage in ('provision', 'orderly-auth', 'abrupt-auth', 'final-auth'):
            value = fixture(stage)
            value['mode'] = mode
            stages.append(run(value)[0])
        return {'mode': mode, 'stages': stages, 'passed': True}

    def test_public_report_is_strict_fixed_fields_and_derives_pass(self):
        from validate_persistence import validate_report
        value = {'schemaVersion': 1, 'scope': 'HOSTED_KEY_MECHANISM_ONLY',
                 'modes': {mode: self.public_mode(mode) for mode in ('source', 'package')},
                 'runtimeCopyVerified': True, 'directoryCleanup': True, 'failure': None}
        self.assertTrue(validate_report(json.dumps(value).encode())['passed'])
        value['directoryCleanup'] = False
        self.assertFalse(validate_report(json.dumps(value).encode())['passed'])
        value['modes']['source']['stages'][2]['process']['cleanupComplete'] = False
        with self.assertRaises(InvalidEvidence):
            validate_report(json.dumps(value).encode())

    def test_public_report_rejects_private_fields_and_duplicate_success_masking(self):
        from validate_persistence import validate_report
        value = {'schemaVersion': 1, 'scope': 'HOSTED_KEY_MECHANISM_ONLY',
                 'modes': {'source': self.public_mode('source')},
                 'runtimeCopyVerified': True, 'directoryCleanup': False, 'failure': 'NATIVE_STAGE_FAILED'}
        raw = json.dumps(value).encode()
        self.assertFalse(validate_report(raw)['passed'])
        with self.assertRaises(InvalidEvidence):
            validate_report(raw.replace(b'"directoryCleanup": false', b'"directoryCleanup":false,"directoryCleanup":true'))
        value['modes']['source']['stages'][0]['receipt'] = WITNESS
        with self.assertRaises(InvalidEvidence):
            validate_report(json.dumps(value).encode())
