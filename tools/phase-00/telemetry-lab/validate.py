"""Fail-closed, bounded public evidence schema. Never print rejected content."""
import datetime as dt
import json
import math
from pathlib import Path
import re
import sys

GROUPS = {
    'cpu': {'cpu.total': 'percent'},
    'ram': {'ram.available': 'bytes'},
    'capacity': {'ram.total': 'bytes'},
    'disk': {'disk.read': 'bytes_per_second', 'disk.write': 'bytes_per_second'},
    'network': {'network.receive': 'bytes_per_second', 'network.send': 'bytes_per_second'},
    'gpu': {'gpu.engineAvailability': 'count'},
}
REASONS = {'NOT_PROBED', 'UNSUPPORTED_LOCALE', 'SOURCE_MISSING', 'ACCESS_DENIED',
           'INVALID_DATA', 'TIMEOUT', 'UNEXPECTED_FAILURE'}

def require(condition):
    if not condition:
        raise ValueError('INVALID_TELEMETRY_EVIDENCE')

def exact(obj, keys):
    require(type(obj) is dict and set(obj) == set(keys.split()))

def numeric(value, upper=9007199254740991):
    require(type(value) in (int, float) and math.isfinite(value) and 0 <= value <= upper)

def timestamp(value):
    require(type(value) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z', value) is not None)
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))

def pairs(items):
    out = {}
    for key, value in items:
        require(key not in out)
        out[key] = value
    return out

def validate(raw):
    require(type(raw) is bytes and len(raw) <= 65536)
    def reject_constant(_):
        raise ValueError('INVALID_TELEMETRY_EVIDENCE')
    obj = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=reject_constant)
    exact(obj, 'scope schemaVersion complete supervisorFailure groups notProbed')
    require(obj['scope'] == 'HOSTED_RUNNER_ONLY' and type(obj['schemaVersion']) is int and obj['schemaVersion'] == 1)
    require(type(obj['complete']) is bool and type(obj['groups']) is list and len(obj['groups']) <= 6)
    require(obj['notProbed'] == ['gpu.decode', 'gpu.vram', 'temperature'])
    require(not obj['complete'] or len(obj['groups']) == 6)
    require(obj['supervisorFailure'] in (None, 'HELPER_FAILED', 'WORKER_INVOCATION_FAILED', 'CLEANUP_UNCONFIRMED'))
    require(not obj['complete'] or obj['supervisorFailure'] is None)
    available = set()
    for index, group in enumerate(obj['groups']):
        exact(group, 'group readStartUtc readEndUtc durationMs workerCpuMs workerWorkingSetBytes metrics cleanupComplete')
        name = list(GROUPS)[index]
        require(group['group'] == name and type(group['cleanupComplete']) is bool)
        require(not obj['complete'] or group['cleanupComplete'])
        start, end = timestamp(group['readStartUtc']), timestamp(group['readEndUtc'])
        require(end >= start)
        numeric(group['durationMs'], 20000)
        for field in ('workerCpuMs', 'workerWorkingSetBytes'):
            if group[field] is not None:
                numeric(group[field])
        metrics = group['metrics']
        require(type(metrics) is list and len(metrics) == len(GROUPS[name]))
        for metric, (source, unit) in zip(metrics, GROUPS[name].items()):
            exact(metric, 'sourceId unit status reason samples')
            require(metric['sourceId'] == source and metric['unit'] == unit)
            if metric['status'] == 'UNKNOWN':
                require(metric['reason'] in REASONS and metric['samples'] is None)
                continue
            require(metric['status'] == 'AVAILABLE' and metric['reason'] == 'OK' and group['cleanupComplete'])
            samples = metric['samples']
            require(type(samples) is list and len(samples) == (1 if name == 'capacity' else 2))
            previous = None
            for sample in samples:
                exact(sample, 'providerSampleUtc values')
                if name == 'capacity':
                    require(sample['providerSampleUtc'] is None)
                else:
                    moment = timestamp(sample['providerSampleUtc'])
                    require(start <= moment <= end and (previous is None or moment > previous))
                    previous = moment
                values = sample['values']
                require(type(values) is list and 1 <= len(values) <= (64 if name == 'network' else 1))
                for value in values:
                    numeric(value, 100 if source == 'cpu.total' else 64 if name == 'gpu' else 9007199254740991)
                    if name in ('capacity', 'gpu'):
                        require(value > 0)
                    if name == 'gpu':
                        require(type(value) in (int, float) and value == int(value))
            available.add(source)
    passed = obj['complete'] and {'cpu.total', 'ram.available', 'ram.total'} <= available
    # A schema-valid UNKNOWN is still UNKNOWN; no all-sensors support claim.
    return obj, passed

if __name__ == '__main__':
    root = Path(__file__).parent / '.lab-results'
    target = root / 'validated.json'
    try:
        target.unlink(missing_ok=True)
        with (root / 'unvalidated.json').open('rb') as source:
            raw = source.read(65537)
        obj, passed = validate(raw)
        obj['requiredCpuRamDataAvailable'] = passed
        target.write_text(json.dumps(obj, indent=2, allow_nan=False), encoding='utf-8')
        print('SCHEMA_VALID_REQUIRED_DATA_PASS' if passed else 'SCHEMA_VALID_REQUIRED_DATA_BLOCKED')
        sys.exit(0 if passed else 1)
    except (ValueError, TypeError, OSError, UnicodeError, OverflowError, RecursionError):
        print('FAIL_TELEMETRY_SCHEMA_OR_IO')
        sys.exit(1)
