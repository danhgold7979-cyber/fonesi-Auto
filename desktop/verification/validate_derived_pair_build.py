"""Compile-only paired evidence admission. No binary loading, execution or artifact admission."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

SCOPE = 'DERIVED_SCRCPY_PAIR_COMPILE_ONLY'
UPSTREAM = 'a60891aea193d92e7e5c3942700eca63f9d19a5f'
TREE = 'eb740a30415199219479610728420ebcfd8a9064'
ARCHIVE = 'a0d699fc7388b8252416c49e6293639de39ab76a03e7302ddced56c284d45200'
SELECTION = 'f96d6623e1e7ae129a398d8886a5676b47e85b64c40075e5740d9cbf7f036e29'
FULL = '94c62a3f7586e56da49e4a66612e0860d7ca4d8efdca46f4673a7dc195e7749e'
PROTOCOL = 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1'
BUILD_CONFIG = b'package com.genymobile.scrcpy;\n\npublic final class BuildConfig {\n  public static final boolean DEBUG = false;\n  public static final String VERSION_NAME = "5.0.1";\n}\n'
STAGES = ('aidlClipboard', 'aidlDisplay', 'javac', 'd8', 'consumerCsc')
NAMES = ('source.json', 'tools.json', 'dependencies.json', 'generated.json',
         'commands.json', 'outputs.json', 'server-build.json', 'consumer-build.json')
CAPS = (262144, 8388608, 524288, 2097152, 262144, 1048576, 8192, 8192)
DIGESTS = ('sourceEvidenceSha256', 'toolchainManifestSha256', 'dependenciesManifestSha256',
           'generatedInputsSha256', 'buildCommandSha256', 'outputsManifestSha256',
           'serverBuildManifestSha256', 'consumerBuildManifestSha256')
CS = ('native/IsolatedAdbServer.cs', 'native/RetainedAdbSession.cs',
      'native/RetainedAdbProtocol.cs', 'native/RetainedHostAdmission.cs',
      'native/RetainedVideoSession.cs')
PACKAGES = ('android/content', 'android/view', 'com/genymobile/scrcpy',
            *('com/genymobile/scrcpy/' + x for x in
              ('audio', 'control', 'device', 'display', 'model', 'opengl', 'util', 'video', 'wrappers')))
GENERATED = ('android/content/IOnPrimaryClipChangedListener.java',
             'android/view/IDisplayWindowListener.java', 'com/genymobile/scrcpy/BuildConfig.java')
FAILURES = ('SOURCE_REJECTED', 'PATCH_REJECTED', 'TOOLS_UNAVAILABLE', 'TOOLS_REJECTED',
            'COMPILE_FAILED', 'OUTPUT_REJECTED', 'UNRETIRED', 'CLEANUP_FAILED', 'INTERNAL_FAILURE')
STATUSES = ('SUCCESS', 'EMPTY_OUTPUT', 'NONZERO_EXIT', 'TIMEOUT', 'CAPTURE_FAILED',
            'LAUNCH_FAILED', 'ACCESS_DENIED', 'CLEANUP_FAILED')
REPORT_KEYS = ('version', 'scope', 'sourceCommit', 'sourceTree', 'autoSourceCommit',
               'autoSourceTree', 'sourceArchiveSha256', 'sourceManifestSha256',
               'sourceEvidenceSha256', 'patchSha256', 'effectiveManifestSha256',
               'generatedInputsSha256', 'toolchainManifestSha256', 'dependenciesManifestSha256',
               'buildCommandSha256', 'outputsManifestSha256', 'serverBuildManifestSha256',
               'consumerBuildManifestSha256', *STAGES, 'serverOutput', 'consumerOutput',
               'sourceUnchanged', 'toolsUnchanged', 'outputInspected', 'directoryCleanup',
               'failure', 'passed')


def reject():
    raise ValueError('DERIVED_PAIR_VALIDATION_REJECTED')


def exact(value, keys):
    if type(value) is not dict or tuple(value) != tuple(keys):
        reject()


def integer(value, maximum=9007199254740991, minimum=0):
    if type(value) is not int or not minimum <= value <= maximum:
        reject()
    return value


def digest(value, size=64):
    if type(value) is not str or not re.fullmatch('[0-9a-f]{' + str(size) + '}', value):
        reject()
    return value


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            reject()
        result[key] = value
    return result


def parse(raw, cap=65536):
    if type(raw) is not bytes or not 0 < len(raw) <= cap:
        reject()
    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=unique,
                           parse_constant=lambda _: reject())
        if canonical(value) != raw:
            reject()
        return value
    except (UnicodeError, ValueError, RecursionError, OverflowError):
        reject()


def path(value):
    if type(value) is not str or not 1 <= len(value) <= 512 or not value.isascii():
        reject()
    parts = value.split('/')
    if len(parts) > 16:
        reject()
    for part in parts:
        if (not part or part in ('.', '..') or part[-1:] in (' ', '.') or
                re.search(r'[\x00-\x1f\x7f\\:<>"|?*]', part) or
                re.fullmatch(r'(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', part)):
            reject()
    return value


def records(items, namespaces, cap, byte_cap, file_cap, extra=()):
    if type(items) is not list or len(items) > cap:
        reject()
    result = {}
    previous = None
    folded = set()
    total = 0
    for item in items:
        exact(item, ('namespace', 'path', 'bytes', 'sha256', *extra))
        if item['namespace'] not in namespaces:
            reject()
        key = (item['namespace'], path(item['path']))
        lower = (key[0].lower(), key[1].lower())
        if lower in folded or (previous is not None and key <= previous):
            reject()
        folded.add(lower)
        previous = key
        total += integer(item['bytes'], file_cap)
        digest(item['sha256'])
        result[key] = item
    if total > byte_cap:
        reject()
    return result


def process(value):
    exact(value, ('status', 'exitCode', 'cleanupComplete', 'stdoutTruncated', 'stderrTruncated'))
    if value['status'] not in STATUSES:
        reject()
    code = value['exitCode']
    if code is not None:
        integer(code, 2147483647, -2147483648)
    if any(type(value[k]) is not bool for k in ('cleanupComplete', 'stdoutTruncated', 'stderrTruncated')):
        reject()
    if value['status'] in ('SUCCESS', 'EMPTY_OUTPUT') and code != 0:
        reject()
    if value['status'] == 'NONZERO_EXIT' and code in (None, 0):
        reject()
    if value['status'] in ('TIMEOUT', 'LAUNCH_FAILED', 'ACCESS_DENIED') and code is not None:
        reject()
    if value['status'] == 'CLEANUP_FAILED' and value['cleanupComplete']:
        reject()
    return (value['status'] in ('SUCCESS', 'EMPTY_OUTPUT') and code == 0 and
            value['cleanupComplete'] and not value['stdoutTruncated'] and not value['stderrTruncated'])


def version(value, pattern=r'[0-9A-Za-z.+_-]{1,64}'):
    if type(value) is not str or not re.fullmatch(pattern, value):
        reject()


def output_records(value):
    exact(value, ('version', 'server', 'consumer', 'dexClasses', 'dexNamespaces'))
    server, consumer = value['server'], value['consumer']
    exact(server, ('name', 'bytes', 'sha256', 'entries'))
    exact(consumer, ('name', 'bytes', 'sha256', 'machine', 'optionalMagic'))
    if server['name'] != 'server.jar' or consumer['name'] != 'RetainedVideoConsumer.dll':
        reject()
    for item in (server, consumer):
        integer(item['bytes'], 8388608, 1)
        digest(item['sha256'])
    if type(consumer['machine']) is not int or consumer['machine'] != 34404 or type(consumer['optionalMagic']) is not int or consumer['optionalMagic'] != 523:
        reject()
    if type(server['entries']) is not list or len(server['entries']) != 1:
        reject()
    dex = server['entries'][0]
    exact(dex, ('name', 'bytes', 'sha256'))
    if dex['name'] != 'classes.dex':
        reject()
    integer(dex['bytes'], 16777216, 112)
    digest(dex['sha256'])
    classes = value['dexClasses']
    if type(classes) is not list or not 1 <= len(classes) <= 2048:
        reject()
    counts = {}
    folded = set()
    previous = None
    for name in classes:
        if (type(name) is not str or not 1 <= len(name) <= 256 or
                not re.fullmatch(r'L[A-Za-z_$][A-Za-z0-9_$]*(?:/[A-Za-z_$][A-Za-z0-9_$]*)*;', name) or
                (previous is not None and name <= previous)):
            reject()
        if name.lower() in folded: reject()
        folded.add(name.lower())
        previous = name
        package = name[1:-1].rsplit('/', 1)[0]
        if package not in PACKAGES:
            reject()
        prefix = package.replace('/', '.')
        counts[prefix] = counts.get(prefix, 0) + 1
    expected = [{'prefix': k, 'count': counts[k]} for k in sorted(counts)]
    if value['dexNamespaces'] != expected or type(value['dexNamespaces']) is not list:
        reject()
    for item in value['dexNamespaces']:
        exact(item, ('prefix', 'count'))
        integer(item['count'], 2048, 1)
    return server, consumer, dex


def read_file(file, cap):
    file = Path(file)
    before = file.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or getattr(before, 'st_file_attributes', 0) & 0x400 or not 0 < before.st_size <= cap:
        reject()
    with file.open('rb') as handle:
        opened = os.fstat(handle.fileno())
        raw = handle.read(cap + 1)
        after = os.fstat(handle.fileno())
    final = file.lstat()
    identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    if any(identity(s) != identity(before) for s in (opened, after, final)) or len(raw) != before.st_size:
        reject()
    return raw


def authority():
    desktop = Path(__file__).resolve().parent.parent
    folder = desktop / 'video-source'
    selected_raw = read_file(folder / 'verified-selected-source-manifest.json', 262144)
    full_raw = read_file(folder / 'verified-full-source-manifest.json', 262144)
    if sha(selected_raw) != SELECTION or sha(full_raw) != FULL:
        reject()
    selected = json.loads(selected_raw)['files']
    full = json.loads(full_raw)['files']
    patch_raw = read_file(folder / 'auto-video-nonce-v1.patch', 1048576)
    provenance = json.loads(read_file(folder / 'source-provenance.json', 65536))
    if provenance['patchSha256'] != sha(patch_raw) or provenance['upstreamCommit'] != UPSTREAM:
        reject()
    upstream = [{k: f[k] for k in ('path', 'bytes', 'gitBlobSha1', 'sha256')} for f in selected]
    modifications = {f['path']: f for f in provenance['files']}
    effective = []
    for f in selected:
        modification = modifications.get(f['path'])
        if modification and (modification['upstreamSha256'] != f['sha256'] or modification['upstreamBytes'] != f['bytes']):
            reject()
        effective.append({'namespace': 'SERVER', 'path': f['path'],
                          'bytes': modification['derivedBytes'] if modification else f['bytes'],
                          'sha256': modification['derivedSha256'] if modification else f['sha256']})
    for name in CS:
        raw = read_file(desktop / name, 1048576)
        effective.append({'namespace': 'CONSUMER', 'path': name, 'bytes': len(raw), 'sha256': sha(raw)})
    effective.sort(key=lambda v: (v['namespace'], v['path']))
    readme = next(f for f in full if f['path'] == 'README.md')
    return upstream, effective, sha(patch_raw), readme


def expected_commands(source, generated):
    java = sorted('${SOURCE}/' + f['path'] for f in source['effective']
                  if f['namespace'] == 'SERVER' and f['path'].endswith('.java'))
    classes = sorted('${CLASSES}/' + f['path'] for f in generated['files'] if f['namespace'] == 'CLASSES')
    aidl = '${SOURCE}/server/src/main/aidl'
    return (
        (('BUILD_TOOLS36', 'aidl.exe'), ['-o${GENERATED}/', '-I' + aidl,
          aidl + '/android/content/IOnPrimaryClipChangedListener.aidl']),
        (('BUILD_TOOLS36', 'aidl.exe'), ['-o${GENERATED}/', '-I' + aidl, '-p',
          '${ANDROID36}/framework.aidl', aidl + '/android/view/IDisplayWindowListener.aidl']),
        (('JDK17', 'bin/javac.exe'), ['-J-Xmx512m', '-J-Duser.home=${PRIVATE}/java-home',
          '-J-Djava.io.tmpdir=${PRIVATE}/java-tmp', '-proc:none', '-encoding', 'UTF-8',
          '-bootclasspath', '${ANDROID36}/android.jar', '-cp',
          '${BUILD_TOOLS36}/core-lambda-stubs.jar;${GENERATED}/', '-d', '${CLASSES}/',
          '-source', '1.8', '-target', '1.8', *java]),
        (('JDK17', 'bin/java.exe'), ['-Xmx512m', '-Duser.home=${PRIVATE}/java-home',
          '-Djava.io.tmpdir=${PRIVATE}/java-tmp', '-cp', '${BUILD_TOOLS36}/lib/d8.jar',
          'com.android.tools.r8.D8', '--classpath', '${ANDROID36}/android.jar',
          '--output', '${OUTPUT}/classes.zip', *classes]),
        (('FRAMEWORK64', 'csc.exe'), ['/noconfig', '/nostdlib+', '/nologo', '/target:library',
          '/platform:x64', '/optimize+', '/out:${OUTPUT}/RetainedVideoConsumer.dll',
          '/reference:${FRAMEWORK64}/mscorlib.dll', '/reference:${FRAMEWORK64}/System.dll',
          '/reference:${FRAMEWORK64}/System.Core.dll', *('${SOURCE}/consumer/' + p for p in CS)]),
    )


def validate_manifest_set(raws, report):
    if type(raws) is not dict or set(raws) - set(NAMES) or sum(len(v) for v in raws.values()) > 13 * 1048576:
        reject()
    values = {}
    for name, cap, field in zip(NAMES, CAPS, DIGESTS):
        if name not in raws:
            if report[field] is not None:
                reject()
            continue
        if report[field] != sha(raws[name]):
            reject()
        value = parse(raws[name], cap)
        if type(value) is not dict or type(value.get('version')) is not int or value['version'] != 1:
            reject()
        values[name] = value
    upstream, effective, patch, readme = authority()
    if report['patchSha256'] not in (None, patch):
        reject()
    source = values.get('source.json')
    inventory = {}
    if source is not None:
        exact(source, ('version', 'upstreamCommit', 'upstreamTree', 'autoCommit', 'autoTree',
                       'archiveSha256', 'selectionManifestSha256', 'patchSha256', 'upstream', 'effective'))
        expected = (UPSTREAM, TREE, report['autoSourceCommit'], report['autoSourceTree'], ARCHIVE, SELECTION, patch)
        if tuple(source[k] for k in tuple(source)[1:8]) != expected or source['upstream'] != upstream or source['effective'] != effective:
            reject()
        for row in source['upstream']:
            exact(row, ('path', 'bytes', 'gitBlobSha1', 'sha256'))
            path(row['path']); integer(row['bytes'], 65536); digest(row['gitBlobSha1'], 40); digest(row['sha256'])
        inventory.update(records(source['effective'], ('SERVER', 'CONSUMER'), 100, 2097152, 1048576))
        if len(source['upstream']) != 95 or len(source['effective']) != 100 or report['effectiveManifestSha256'] != sha(canonical(source['effective'])):
            reject()
    elif report['effectiveManifestSha256'] is not None:
        reject()
    tools = values.get('tools.json')
    if tools is not None:
        exact(tools, ('version', 'runnerImage', 'jdkVersion', 'jdkVendor', 'platformApi',
                      'platformRevision', 'buildToolsVersion', 'consumerCompilerVersion', 'files'))
        version(tools['runnerImage'], r'win22/[0-9]+(?:\.[0-9]+)*')
        if len(tools['runnerImage']) > 64:
            reject()
        for key in ('jdkVersion', 'platformRevision', 'consumerCompilerVersion'):
            version(tools[key])
        if not re.match(r'17(?:[.+_-]|$)', tools['jdkVersion']) or tools['jdkVendor'] not in ('MICROSOFT', 'TEMURIN', 'ORACLE', 'OTHER') or type(tools['platformApi']) is not int or tools['platformApi'] != 36 or tools['buildToolsVersion'] != '36.0.0':
            reject()
        inventory.update(records(tools['files'], ('JDK17', 'ANDROID36', 'BUILD_TOOLS36', 'FRAMEWORK64'), 10000, 2147483648, 268435456))
        required = (('JDK17', 'bin/java.exe'), ('JDK17', 'bin/javac.exe'),
                    ('ANDROID36', 'android.jar'), ('ANDROID36', 'framework.aidl'),
                    ('BUILD_TOOLS36', 'aidl.exe'), ('BUILD_TOOLS36', 'lib/d8.jar'),
                    ('BUILD_TOOLS36', 'core-lambda-stubs.jar'),
                    *(('FRAMEWORK64', x) for x in ('csc.exe', 'mscorlib.dll', 'System.dll', 'System.Core.dll')))
        if any(k not in inventory for k in required):
            reject()
    dependencies = values.get('dependencies.json')
    if dependencies is not None:
        exact(dependencies, ('version', 'entries'))
        if source is None or tools is None:
            reject()
        deps = records(dependencies['entries'], ('SERVER', 'CONSUMER', 'JDK17', 'ANDROID36', 'BUILD_TOOLS36', 'FRAMEWORK64', 'FULL_SOURCE'), 512, 2147483648, 268435456, ('role', 'license'))
        for key, row in deps.items():
            origin = readme if key == ('FULL_SOURCE', 'README.md') else inventory.get(key)
            if origin is None or row['bytes'] != origin['bytes'] or row['sha256'] != origin['sha256'] or row['role'] not in ('BUILD_TOOL', 'COMPILE_ONLY', 'BUNDLED_SOURCE') or row['license'] not in ('APACHE_2_0', 'GPL_CLASSPATH', 'SDK_TERMS', 'OTHER', 'UNRESOLVED'):
                reject()
        required_notices = (('SERVER', 'LICENSE'), ('FULL_SOURCE', 'README.md'),
            ('SERVER', 'server/src/main/aidl/android/content/IOnPrimaryClipChangedListener.aidl'),
            ('SERVER', 'server/src/main/aidl/android/view/IDisplayWindowListener.aidl'),
            ('SERVER', 'server/src/main/java/android/content/IContentProvider.java'))
        if any(k not in deps for k in required_notices):
            reject()
    generated = values.get('generated.json')
    if generated is not None:
        exact(generated, ('version', 'files'))
        gen = records(generated['files'], ('GENERATED', 'CLASSES'), 2048, 33554432, 33554432)
        if not any(ns == 'CLASSES' for ns, _ in gen) or {p for ns, p in gen if ns == 'GENERATED'} != set(GENERATED):
            reject()
        config = gen[('GENERATED', 'com/genymobile/scrcpy/BuildConfig.java')]
        if (config['bytes'], config['sha256']) != (len(BUILD_CONFIG), sha(BUILD_CONFIG)): reject()
        for namespace, name in gen:
            if namespace == 'CLASSES' and (name.rsplit('/', 1)[0] not in PACKAGES or not re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]*\.class', name.rsplit('/', 1)[-1])):
                reject()
    commands = values.get('commands.json')
    if commands is not None:
        exact(commands, ('version', 'stages'))
        if source is None or tools is None or generated is None or type(commands['stages']) is not list or len(commands['stages']) != 5:
            reject()
        for stage, row, (exe, args) in zip(STAGES, commands['stages'], expected_commands(source, generated)):
            exact(row, ('stage', 'executable', 'workingDirectory', 'arguments', 'actualInvocationSha256'))
            exact(row['executable'], ('namespace', 'path'))
            if row['stage'] != stage or tuple(row['executable'].values()) != exe or row['workingDirectory'] != 'EXECUTABLE_DIRECTORY' or row['arguments'] != args:
                reject()
            if len(args) > 2048 or any(type(a) is not str or not a.isascii() or len(a) > 2048 for a in args):
                reject()
            digest(row['actualInvocationSha256'])
    outputs = values.get('outputs.json')
    if outputs is not None:
        server, consumer, dex = output_records(outputs)
        if report['serverOutput'] != {k: server[k] for k in ('bytes', 'sha256')} | {'dexBytes': dex['bytes'], 'dexSha256': dex['sha256']} or report['consumerOutput'] != {k: consumer[k] for k in ('bytes', 'sha256')}:
            reject()
    elif report['serverOutput'] is not None or report['consumerOutput'] is not None:
        reject()
    server_build = values.get('server-build.json')
    if server_build is not None:
        exact(server_build, ('version', 'upstreamCommit', 'sourcePatchSha256', 'toolchainManifestSha256', 'dependenciesManifestSha256', 'buildCommandSha256', 'serverBytes', 'serverSha256', 'protocolId'))
        if outputs is None or commands is None or dependencies is None:
            reject()
        if server_build != {'version': 1, 'upstreamCommit': UPSTREAM, 'sourcePatchSha256': patch,
              'toolchainManifestSha256': report['toolchainManifestSha256'], 'dependenciesManifestSha256': report['dependenciesManifestSha256'],
              'buildCommandSha256': report['buildCommandSha256'], 'serverBytes': outputs['server']['bytes'],
              'serverSha256': outputs['server']['sha256'], 'protocolId': PROTOCOL}:
            reject()
    consumer_build = values.get('consumer-build.json')
    if consumer_build is not None:
        exact(consumer_build, ('version', 'sourceCommit', 'compilerSha256', 'compilerVersion', 'arguments', 'frameworkReferences', 'sources', 'consumerSha256'))
        if outputs is None or tools is None or source is None or commands is None:
            reject()
        version(consumer_build['compilerVersion'], r'[0-9]+(?:\.[0-9]+){1,3}')
        if len(consumer_build['compilerVersion']) > 64:
            reject()
        exact(consumer_build['frameworkReferences'], ('System.dll', 'System.Core.dll'))
        exact(consumer_build['sources'], CS)
        expected_refs = {p: inventory[('FRAMEWORK64', p)]['sha256'] for p in ('System.dll', 'System.Core.dll')}
        expected_sources = {p: inventory[('CONSUMER', p)]['sha256'] for p in CS}
        if (consumer_build['sourceCommit'] != report['autoSourceCommit'] or
                consumer_build['compilerSha256'] != inventory[('FRAMEWORK64', 'csc.exe')]['sha256'] or
                consumer_build['compilerVersion'] != tools['consumerCompilerVersion'] or
                consumer_build['arguments'] != ['/nologo', '/target:library', '/platform:x64', '/optimize+'] or
                consumer_build['frameworkReferences'] != expected_refs or consumer_build['sources'] != expected_sources or
                consumer_build['consumerSha256'] != outputs['consumer']['sha256']):
            reject()
    return values


def validate_report(value, manifests, expected_auto_commit=None, expected_auto_tree=None):
    exact(value, REPORT_KEYS)
    if type(value['version']) is not int or value['version'] != 1 or value['scope'] != SCOPE:
        reject()
    if (value['sourceCommit'], value['sourceTree'], value['sourceArchiveSha256'], value['sourceManifestSha256']) != (UPSTREAM, TREE, ARCHIVE, SELECTION):
        reject()
    for key, expected in (('autoSourceCommit', expected_auto_commit), ('autoSourceTree', expected_auto_tree)):
        digest(value[key], 40)
        if expected is not None and value[key] != expected:
            reject()
    for key in (*DIGESTS, 'patchSha256', 'effectiveManifestSha256'):
        if value[key] is not None:
            digest(value[key])
    stopped = False
    successful = True
    for stage in STAGES:
        p = value[stage]
        if p is None:
            stopped = True
            successful = False
        else:
            if stopped:
                reject()
            if not process(p):
                stopped = True
                successful = False
    for key in ('sourceUnchanged', 'toolsUnchanged', 'outputInspected', 'directoryCleanup', 'passed'):
        if type(value[key]) is not bool:
            reject()
    if value['failure'] is not None and value['failure'] not in FAILURES:
        reject()
    if value['serverOutput'] is not None:
        exact(value['serverOutput'], ('bytes', 'sha256', 'dexBytes', 'dexSha256'))
        integer(value['serverOutput']['bytes'], 8388608, 1); integer(value['serverOutput']['dexBytes'], 16777216, 112)
        digest(value['serverOutput']['sha256']); digest(value['serverOutput']['dexSha256'])
    if value['consumerOutput'] is not None:
        exact(value['consumerOutput'], ('bytes', 'sha256'))
        integer(value['consumerOutput']['bytes'], 8388608, 1); digest(value['consumerOutput']['sha256'])
    admitted = validate_manifest_set(manifests, value)
    if value['outputInspected'] and ('outputs.json' not in admitted or not successful): reject()
    complete = (successful and len(admitted) == 8 and value['sourceUnchanged'] and
                value['toolsUnchanged'] and value['outputInspected'])
    if value['failure'] is None and not complete:
        reject()
    passed = bool(complete and value['failure'] is None and value['directoryCleanup'])
    if value['passed'] != passed:
        reject()
    return dict(value)

CONTEXT_KEYS = ('version', 'autoCommit', 'autoTree', 'runnerImage', 'jdkRoot', 'platformRoot',
                'buildToolsRoot', 'frameworkRoot', 'jdkVersion', 'jdkVendor', 'platformRevision',
                'buildToolsVersion', 'consumerCompilerVersion')
BINDING_KEYS = ('version', 'scratchRoot', 'runId', 'owner', 'baseOwner', 'contextSha256', 'reportSha256')
UUID_PATTERN = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'


def directory(folder):
    folder = Path(folder)
    s = folder.lstat()
    if not stat.S_ISDIR(s.st_mode) or getattr(s, 'st_file_attributes', 0) & 0x400 or folder.resolve() != folder.absolute():
        reject()
    return folder


def owner(folder):
    directory(folder)
    raw = read_file(Path(folder) / '.owner', 36)
    if not re.fullmatch(UUID_PATTERN.encode(), raw):
        reject()
    return raw.decode('ascii')


def base_path():
    return Path(__file__).resolve().parent.parent / '.derived-pair-build-runtime'


def scratch(folder):
    import tempfile
    folder = directory(folder)
    match = re.fullmatch('derived-pair-(' + UUID_PATTERN + ')', folder.name)
    if not match or folder.parent.resolve() != Path(tempfile.gettempdir()).resolve():
        reject()
    return folder, match.group(1), owner(folder)


def write_new(file, raw):
    directory(Path(file).parent)
    with open(file, 'xb') as handle:
        handle.write(raw)
        handle.flush()
        os.fsync(handle.fileno())


def load_manifests(folder):
    folder = directory(folder)
    files = {}
    for name, cap in zip(NAMES, CAPS):
        p = folder / name
        if p.exists() or p.is_symlink():
            files[name] = read_file(p, cap)
    return files


def validate_context(raw):
    value = parse(raw)
    exact(value, CONTEXT_KEYS)
    if type(value['version']) is not int or value['version'] != 1:
        reject()
    digest(value['autoCommit'], 40); digest(value['autoTree'], 40)
    version(value['runnerImage'], r'win22/[0-9]+(?:\.[0-9]+)*')
    for key in ('jdkRoot', 'platformRoot', 'buildToolsRoot', 'frameworkRoot'):
        if type(value[key]) is not str or not 1 <= len(value[key]) <= 2048 or '\x00' in value[key] or not Path(value[key]).is_absolute():
            reject()
    return value


def check_invocations(root, context, report, manifests):
    commands = parse(manifests['commands.json'], 262144) if 'commands.json' in manifests else None
    for stage in STAGES:
        record = root / 'private' / ('process-' + stage + '.json')
        if report[stage] is None:
            if record.exists() or record.is_symlink():
                reject()
            continue
        if parse(read_file(record, 4096), 4096) != report[stage]:
            reject()
        plan = parse(read_file(root / 'private' / ('plan-' + stage + '.json'), 131072), 131072)
        exact(plan, ('version', 'stage', 'executable', 'arguments', 'deadlineMs', 'workingDirectory'))
        if plan['version'] != 1 or type(plan['version']) is not int or plan['stage'] != stage or plan['workingDirectory'] != 'EXECUTABLE_DIRECTORY':
            reject()
        integer(plan['deadlineMs'], 120000 if stage in ('javac', 'd8') else 30000, 1)
        if commands is not None:
            row = commands['stages'][STAGES.index(stage)]
            roots = {'JDK17': context['jdkRoot'], 'ANDROID36': context['platformRoot'],
                     'BUILD_TOOLS36': context['buildToolsRoot'], 'FRAMEWORK64': context['frameworkRoot'],
                     **{k.upper(): str(root / k) for k in ('source', 'generated', 'classes', 'output', 'private')}}
            args = []
            for argument in row['arguments']:
                for key, location in roots.items():
                    argument = argument.replace('${' + key + '}/', str(location) + os.sep)
                args.append(argument)
            executable = str(Path(roots[row['executable']['namespace']]) / row['executable']['path'])
            actual = {'executable': executable, 'workingDirectory': str(Path(executable).parent), 'arguments': args}
            if plan['executable'] != executable or plan['arguments'] != args or sha(canonical(actual)) != row['actualInvocationSha256']:
                reject()


def check_output_bytes(root, report, manifests):
    # The controller performs static DEX/PE inspection; independently bind its
    # retained evidence to actual private bytes before those bytes are deleted.
    import io
    import struct
    import zipfile
    import zlib
    if 'outputs.json' not in manifests:
        return
    output = parse(manifests['outputs.json'], 1048576)
    server = read_file(root / 'evidence' / 'server.jar', 8388608)
    consumer = read_file(root / 'evidence' / 'RetainedVideoConsumer.dll', 8388608)
    if (len(server), sha(server)) != (report['serverOutput']['bytes'], report['serverOutput']['sha256']) or (len(consumer), sha(consumer)) != (report['consumerOutput']['bytes'], report['consumerOutput']['sha256']):
        reject()
    with zipfile.ZipFile(io.BytesIO(server)) as archive:
        members = archive.infolist()
        if len(members) != 1 or members[0].filename != 'classes.dex' or members[0].file_size > 16777216 or members[0].flag_bits & ~0x808 or members[0].compress_type not in (0, 8) or stat.S_ISLNK(members[0].external_attr >> 16):
            reject()
        dex = archive.read(members[0])
    if (len(dex), sha(dex)) != (report['serverOutput']['dexBytes'], report['serverOutput']['dexSha256']):
        reject()
    if len(dex) < 112 or not re.fullmatch(b'dex\n0(?:35|37|38|39|40|41)\x00', dex[:8]):
        reject()
    u32 = lambda offset: struct.unpack_from('<I', dex, offset)[0]
    if u32(32) != len(dex) or u32(36) != 112 or u32(40) != 0x12345678 or u32(8) != zlib.adler32(dex[12:]) & 0xffffffff or dex[12:32] != hashlib.sha1(dex[32:]).digest():
        reject()
    strings, strings_at, types, types_at, classes, classes_at = (u32(n) for n in (56, 60, 64, 68, 96, 100))
    if not 1 <= classes <= 2048 or strings > 1048576 or types > 65536 or strings_at + 4 * strings > len(dex) or types_at + 4 * types > len(dex) or classes_at + 32 * classes > len(dex):
        reject()
    names = []
    for i in range(classes):
        type_id = u32(classes_at + i * 32)
        if type_id >= types:
            reject()
        string_id = u32(types_at + type_id * 4)
        if string_id >= strings:
            reject()
        offset = u32(strings_at + string_id * 4)
        size = 0
        for j in range(5):
            if offset >= len(dex): reject()
            b = dex[offset]; offset += 1
            size |= (b & 127) << (7 * j)
            if b < 128: break
        else:
            reject()
        if not 1 <= size <= 256 or offset + size >= len(dex) or dex[offset + size] != 0:
            reject()
        try:
            names.append(dex[offset:offset + size].decode('ascii'))
        except UnicodeError:
            reject()
    if sorted(names) != output['dexClasses']:
        reject()
    # Shared bounded static CLR reader, never Assembly.Load or execution.
    import importlib.util
    sibling = Path(__file__).resolve().with_name('derived_pair_build.py')
    spec = importlib.util.spec_from_file_location('derived_pair_build_static_inspector', sibling)
    if spec is None or spec.loader is None: reject()
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if module.inspect_pe(consumer) != {'machine': 34404, 'optionalMagic': 523}: reject()
    if len(consumer) < 64 or consumer[:2] != b'MZ': reject()
    pe = struct.unpack_from('<I', consumer, 60)[0]
    if pe + 26 > len(consumer) or consumer[pe:pe + 4] != b'PE\0\0' or struct.unpack_from('<H', consumer, pe + 4)[0] != 34404 or struct.unpack_from('<H', consumer, pe + 24)[0] != 523:
        reject()


def stage(root):
    root, run_id, token = scratch(root)
    base = directory(base_path()); base_token = owner(base)
    context_raw = read_file(root / 'private' / 'context.json', 65536)
    context = validate_context(context_raw)
    if read_file(base / 'context.json', 65536) != context_raw:
        reject()
    raw = read_file(root / 'private' / 'report.json', 65536)
    report = parse(raw)
    if report.get('directoryCleanup') is not False or report.get('passed') is not False:
        reject()
    if set(p.name for p in (root / 'evidence').iterdir()) - set((*NAMES, 'server.jar', 'RetainedVideoConsumer.dll')): reject()
    manifests = load_manifests(root / 'evidence')
    validate_report(report, manifests, context['autoCommit'], context['autoTree'])
    if 'generated.json' in manifests:
        for row in parse(manifests['generated.json'], 2097152)['files']:
            raw_generated = read_file(root / row['namespace'].lower() / row['path'], 33554432)
            if (len(raw_generated), sha(raw_generated)) != (row['bytes'], row['sha256']): reject()
    if 'tools.json' in manifests:
        tools = parse(manifests['tools.json'], 8388608)
        for key in ('runnerImage', 'jdkVersion', 'jdkVendor', 'platformRevision', 'buildToolsVersion', 'consumerCompilerVersion'):
            if tools[key] != context[key]: reject()
    check_invocations(root, context, report, manifests)
    check_output_bytes(root, report, manifests)
    upload = base / 'upload'
    upload.mkdir()
    for name in NAMES:
        if name in manifests: write_new(upload / name, manifests[name])
    if owner(base) != base_token or owner(root) != token or read_file(root / 'private' / 'report.json', 65536) != raw or read_file(root / 'private' / 'context.json', 65536) != context_raw or load_manifests(root / 'evidence') != manifests:
        reject()
    write_new(base / 'staged-report.json', raw)
    binding = {'version': 1, 'scratchRoot': str(root), 'runId': run_id, 'owner': token,
               'baseOwner': base_token, 'contextSha256': sha(context_raw), 'reportSha256': sha(raw)}
    write_new(base / 'staging.json', canonical(binding))


def staging(base):
    base = directory(base)
    if base != base_path(): reject()
    record = parse(read_file(base / 'staging.json', 4096), 4096)
    exact(record, BINDING_KEYS)
    if type(record['version']) is not int or record['version'] != 1 or record['baseOwner'] != owner(base): reject()
    for key in ('runId', 'owner', 'baseOwner'):
        if type(record[key]) is not str or not re.fullmatch(UUID_PATTERN, record[key]): reject()
    digest(record['contextSha256']); digest(record['reportSha256'])
    import tempfile
    if record['scratchRoot'] != str(Path(tempfile.gettempdir()).resolve() / ('derived-pair-' + record['runId'])):
        reject()
    context_raw = read_file(base / 'context.json', 65536)
    if sha(context_raw) != record['contextSha256']: reject()
    context = validate_context(context_raw)
    raw = read_file(base / 'staged-report.json', 65536)
    if sha(raw) != record['reportSha256']: reject()
    return record, context, parse(raw)


def cleanup(base):
    base = Path(base)
    binding, _, _ = staging(base)
    root = Path(binding['scratchRoot'])
    absent = not os.path.lexists(root)
    if not absent and owner(root) != binding['owner']: reject()
    write_new(base / 'cleanup.json', canonical({**binding, 'directoryCleanup': absent}))


def publish(base):
    base = Path(base)
    binding, context, report = staging(base)
    receipt = parse(read_file(base / 'cleanup.json', 4096), 4096)
    exact(receipt, (*BINDING_KEYS, 'directoryCleanup'))
    if {k: receipt[k] for k in BINDING_KEYS} != binding or type(receipt['directoryCleanup']) is not bool:
        reject()
    absent = not os.path.lexists(binding['scratchRoot'])
    if receipt['directoryCleanup'] != absent: reject()
    if not absent and owner(binding['scratchRoot']) != binding['owner']: reject()
    manifests = load_manifests(base / 'upload')
    if set(p.name for p in (base / 'upload').iterdir()) != set(manifests): reject()
    report['directoryCleanup'] = absent
    if not absent and report['failure'] is None: report['failure'] = 'CLEANUP_FAILED'
    report['passed'] = bool(absent and report['failure'] is None)
    validate_report(report, manifests, context['autoCommit'], context['autoTree'])
    if owner(base) != binding['baseOwner'] or (not os.path.lexists(binding['scratchRoot'])) != absent: reject()
    write_new(base / 'upload' / 'report.json', canonical(report))
    return report['passed']


def main(argv):
    if len(argv) != 2: reject()
    command, location = argv
    if command == 'stage':
        stage(location); print('DERIVED_PAIR_STAGED')
    elif command == 'cleanup':
        cleanup(location); print('DERIVED_PAIR_CLEANUP_RECORDED')
    elif command == 'publish':
        passed = publish(location)
        print('DERIVED_PAIR_VALIDATION_WRITTEN')
        print('DERIVED_PAIR_VALIDATION_PASS' if passed else 'DERIVED_PAIR_VALIDATION_FAIL')
    else: reject()


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception:
        print('DERIVED_PAIR_VALIDATION_FAILED')
        sys.exit(1)
