import copy
import json
import unittest
from validate import GROUPS, validate

def fixture():
    groups = []
    for group, specs in GROUPS.items():
        metrics = []
        for source, unit in specs.items():
            samples = [{'providerSampleUtc': None, 'values': [4096]}] if group == 'capacity' else [
                {'providerSampleUtc': f'2026-10-30T19:00:0{i}Z', 'values': [1 if group == 'gpu' else 0]} for i in (1, 2)]
            metrics.append(dict(sourceId=source, unit=unit, status='AVAILABLE', reason='OK', samples=samples))
        groups.append(dict(group=group, readStartUtc='2026-10-30T19:00:00Z', readEndUtc='2026-10-30T19:00:03Z',
                           durationMs=3000, workerCpuMs=2, workerWorkingSetBytes=1024, metrics=metrics, cleanupComplete=True))
    return dict(scope='HOSTED_RUNNER_ONLY', schemaVersion=1, complete=True, supervisorFailure=None, groups=groups,
                notProbed=['gpu.decode', 'gpu.vram', 'temperature'])

def encode(obj): return json.dumps(obj).encode()

class EvidenceTests(unittest.TestCase):
    def test_valid_zero_is_available(self):
        doc, passed = validate(encode(fixture()))
        self.assertTrue(passed)
        self.assertEqual(doc['groups'][0]['metrics'][0]['samples'][0]['values'], [0])

    def test_capacity_observed_not_provider_time(self):
        obj = fixture(); obj['groups'][2]['metrics'][0]['samples'][0]['providerSampleUtc'] = '2026-10-30T19:00:01Z'
        with self.assertRaises(ValueError): validate(encode(obj))

    def test_missing_is_null_unknown_not_zero(self):
        obj = fixture(); metric = obj['groups'][0]['metrics'][0]
        metric.update(status='UNKNOWN', reason='SOURCE_MISSING', samples=None)
        self.assertFalse(validate(encode(obj))[1])
        metric['samples'] = []
        with self.assertRaises(ValueError): validate(encode(obj))

    def test_optional_gpu_unknown_not_sensor_pass(self):
        obj = fixture(); obj['groups'][5]['metrics'][0].update(status='UNKNOWN', reason='SOURCE_MISSING', samples=None)
        doc, passed = validate(encode(obj))
        self.assertTrue(passed)
        self.assertEqual(doc['groups'][5]['metrics'][0]['status'], 'UNKNOWN')

    def test_nonfinite_negative_percent_and_boolean(self):
        for value in (float('nan'), float('inf'), -1, 101, True):
            obj = fixture(); obj['groups'][0]['metrics'][0]['samples'][0]['values'] = [value]
            with self.subTest(value=value), self.assertRaises(ValueError): validate(encode(obj))

    def test_rates_must_advance_inside_observed_window(self):
        for stamp in ('2026-10-30T19:00:01Z', '2026-10-30T20:00:00Z', None):
            obj = fixture(); obj['groups'][0]['metrics'][0]['samples'][1]['providerSampleUtc'] = stamp
            with self.subTest(stamp=stamp), self.assertRaises(ValueError): validate(encode(obj))

    def test_wrong_units_source_and_raw_paths_reject(self):
        for field, value in [('unit', 'percent?'), ('sourceId', r'C:\private\user'), ('reason', r'C:\private\error')]:
            obj = fixture(); obj['groups'][0]['metrics'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): validate(encode(obj))
        obj = fixture(); obj['groups'][0]['rawPath'] = r'C:\private'
        with self.assertRaises(ValueError): validate(encode(obj))

    def test_network_array_limit_and_gpu_count(self):
        obj = fixture(); obj['groups'][4]['metrics'][0]['samples'][0]['values'] = [0] * 65
        with self.assertRaises(ValueError): validate(encode(obj))
        obj = fixture(); obj['groups'][5]['metrics'][0]['samples'][0]['values'] = [1.5]
        with self.assertRaises(ValueError): validate(encode(obj))

    def test_cleanup_failure_cannot_pass(self):
        obj = fixture(); obj['groups'][0]['cleanupComplete'] = False
        with self.assertRaises(ValueError): validate(encode(obj))
        obj = fixture(); obj['complete'] = False; obj['groups'] = []
        self.assertFalse(validate(encode(obj))[1])

    def test_duplicate_keys_extra_bytes_and_wrong_groups(self):
        raw = encode(fixture()).replace(b'"complete": true', b'"complete": false, "complete": true')
        for data in (raw, b' ' * 65537):
            with self.assertRaises(ValueError): validate(data)
        obj = fixture(); obj['groups'].reverse()
        with self.assertRaises(ValueError): validate(encode(obj))

    def test_timeout_and_access_denied_remain_unknown(self):
        for reason in ('TIMEOUT', 'ACCESS_DENIED', 'INVALID_DATA', 'UNSUPPORTED_LOCALE'):
            obj = fixture(); obj['groups'][1]['metrics'][0].update(status='UNKNOWN', reason=reason, samples=None)
            self.assertFalse(validate(encode(obj))[1])

if __name__ == '__main__': unittest.main()
