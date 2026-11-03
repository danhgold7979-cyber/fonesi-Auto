"""Finite source-owned Windows materialization catalog; never runs a candidate.

The caller must retain the native staging lease. Downloads use the trusted host,
not candidate TLS. This module has no CLI, installer, subprocess, retry or cleanup.
"""
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

from windows_vision_materialize import ArtifactPin, verify_artifact, relative_path

ROOT = r'D:\a\_temp\fonesi-p4-windows-candidate-v1'
ACQUISITION = r'D:\a\_temp\fonesi-p4-windows-acquisition-v1'
MAX_CATALOG = 2 * 1024 * 1024
MAX_DOWNLOAD = 512 * 1024 * 1024
SHA = re.compile(r'[0-9a-f]{64}\Z')


def _closed(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        raise ValueError('CATALOG_SCHEMA')


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('DUPLICATE_KEY')
        result[key] = value
    return result


def _artifact(value, extra=()):
    _closed(value, ('filename', 'url', 'size', 'sha256', *extra))
    relative_path(value['filename'])
    if '/' in value['filename'] or type(value['size']) is not int or not 0 < value['size'] <= MAX_DOWNLOAD:
        raise ValueError('ARTIFACT')
    if type(value['sha256']) is not str or SHA.fullmatch(value['sha256']) is None:
        raise ValueError('ARTIFACT')
    u = urllib.parse.urlsplit(value['url'])
    if u.scheme != 'https' or u.username or u.password or u.port or u.query or u.fragment:
        raise ValueError('ORIGIN')
    if u.hostname == 'files.pythonhosted.org':
        if not u.path.startswith('/packages/') or not u.path.endswith('/' + value['filename']):
            raise ValueError('ORIGIN')
    elif u.hostname == 'github.com':
        expected = '/astral-sh/python-build-standalone/releases/download/20261026/'
        if not u.path.startswith(expected) or urllib.parse.unquote(u.path[len(expected):]) != value['filename']:
            raise ValueError('ORIGIN')
    elif u.hostname == 'paddle-model-ecology.bj.bcebos.com':
        if u.path != '/paddlex/official_inference_model/paddle3.0.0/en_PP-OCRv5_mobile_rec_infer.tar':
            raise ValueError('ORIGIN')
    else:
        raise ValueError('ORIGIN')


def load_catalog(path, expected_sha256):
    with Path(path).open('rb') as stream:
        raw = stream.read(MAX_CATALOG + 1)
    if len(raw) > MAX_CATALOG or hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise ValueError('CATALOG_IDENTITY')
    value = json.loads(raw.decode('utf-8'), object_pairs_hook=_pairs)
    _closed(value, ('version', 'scope', 'executionApproval', 'rootPolicy', 'epoch', 'python', 'preprocess', 'ocr', 'model'))
    if (type(value['version']) is not int or value['version'] != 1
            or value['scope'] != 'WINDOWS_MATERIALIZATION_ONLY'
            or value['executionApproval'] != 'NOT_GRANTED'
            or value['rootPolicy'] != 'HOSTED_WINDOWS_FIXED_V1' or value['epoch'] != '946684800'):
        raise ValueError('POLICY')
    _artifact(value['python'], ('memberInventory', 'memberInventorySha256'))
    if (value['python']['memberInventory'] != 'windows_python_members.json'
            or SHA.fullmatch(value['python']['memberInventorySha256']) is None):
        raise ValueError('MEMBERS')
    _artifact(value['model'], ('members',))
    members = value['model']['members']
    if type(members) is not list or len(members) != 3:
        raise ValueError('MODEL_MEMBERS')
    seen_members = set()
    for member in members:
        _closed(member, ('path', 'bytes', 'sha256'))
        relative_path(member['path'])
        if (member['path'] in seen_members or type(member['bytes']) is not int
                or not 0 <= member['bytes'] <= MAX_DOWNLOAD
                or type(member['sha256']) is not str or SHA.fullmatch(member['sha256']) is None):
            raise ValueError('MODEL_MEMBERS')
        seen_members.add(member['path'])
    if seen_members != {'en_PP-OCRv5_mobile_rec_infer/' + name for name in
                       ('inference.json', 'inference.pdiparams', 'inference.yml')}:
        raise ValueError('MODEL_MEMBERS')
    for name, count, total in [('preprocess', 2, 52681299), ('ocr', 72, 219436463)]:
        closure = value[name]
        _closed(closure, ('lock', 'lockSha256', 'wheels'))
        if closure['lock'] != name + '-requirements-windows.lock' or SHA.fullmatch(closure['lockSha256']) is None:
            raise ValueError('LOCK')
        wheels = closure['wheels']
        if type(wheels) is not list or len(wheels) != count or sum(w['size'] for w in wheels) != total:
            raise ValueError('CLOSURE_SIZE')
        seen = set()
        for wheel in wheels:
            _artifact(wheel, ('startup',))
            key = wheel['filename'].casefold()
            if key in seen or not key.endswith('.whl'):
                raise ValueError('WHEEL_ALIAS')
            seen.add(key)
            if type(wheel['startup']) is not dict:
                raise ValueError('STARTUP')
            for member, digest in wheel['startup'].items():
                relative_path(member)
                if type(digest) is not str or SHA.fullmatch(digest) is None:
                    raise ValueError('STARTUP')
    return value


class _Redirect(urllib.request.HTTPRedirectHandler):
    """Only GitHub's immutable asset CDN redirect is admitted; no generic redirect."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        source, target = urllib.parse.urlsplit(req.full_url), urllib.parse.urlsplit(newurl)
        if (source.hostname != 'github.com' or target.scheme != 'https'
                or target.hostname != 'release-assets.githubusercontent.com'
                or target.username or target.password or target.port or target.fragment):
            raise ValueError('REDIRECT_REFUSED')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def acquire_one(artifact, destination, deadline):
    """One exact request; failure retains partial bytes, never retries or reuses.

    Destination must be in the externally retained fresh acquisition tree. The
    native lease, overall deadline and source catalog hash are caller obligations.
    No raw URL/response/environment is returned as public diagnostic evidence.
    """
    _artifact({k: artifact[k] for k in ('filename', 'url', 'size', 'sha256')})
    if type(deadline) not in (int, float) or not 0 < deadline - time.monotonic() <= 600:
        raise ValueError('DEADLINE')
    destination = Path(destination)
    if destination.name != artifact['filename']:
        raise ValueError('DESTINATION')
    # Disable proxy inheritance and credentials; only explicit official URL.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _Redirect())
    with destination.open('xb') as output:
        with opener.open(artifact['url'], timeout=min(15, deadline - time.monotonic())) as response:
            if response.status != 200 or response.headers.get('Content-Encoding', 'identity') != 'identity':
                raise ValueError('RESPONSE')
            total = 0
            while True:
                if time.monotonic() >= deadline:
                    raise ValueError('DEADLINE')
                block = response.read(min(65536, artifact['size'] - total + 1))
                if not block:
                    break
                total += len(block)
                if total > artifact['size']:
                    raise ValueError('DOWNLOAD_LIMIT')
                output.write(block)
    verify_artifact(destination, ArtifactPin(artifact['size'], artifact['sha256']))
    return {'bytes': artifact['size'], 'sha256': artifact['sha256']}
