"""Default stdlib-only tests; opt-in frozen-runtime NumPy channel-order proof."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import unittest
import os
import tempfile
from unittest import mock

SPEC = importlib.util.spec_from_file_location('ocr_worker', Path(__file__).parents[1]/'vision/ocr_evaluation_worker.py')
WORKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKER)


def fixture(language='EN'):
    data = bytes([12, 34, 56, 255])
    uid = '00000000-0000-4000-8000-000000000001'
    h = dict(version=1, kind='OCR_EVALUATION', requestId=uid, captureId=uid,
             deviceId=uid, bindingId=uid, generation=1, orientationEpoch=0,
             language=language, sourcePixelSha256='a'*64,
             inputSha256=hashlib.sha256(data).hexdigest(), width=1, height=1, inputBytes=4)
    return h, data


def frame(h, data):
    raw=WORKER.canonical(h)
    return struct.pack('<I',len(raw))+raw+data


class FrameTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('FONESI_OCR_COLOR_PROOF') == '1',
                         'explicit frozen-runtime NumPy proof only')
    def test_actual_numpy_rgba_to_bgr(self):
        import numpy as np
        pixels = bytes([17, 61, 203, 255, 231, 42, 9, 255,
                        5, 99, 153, 255, 87, 11, 244, 255])
        result = WORKER.bgr_pixels(pixels, 2, 2, np)
        self.assertEqual(result.tolist(), [[[203, 61, 17], [9, 42, 231]],
                                          [[153, 99, 5], [244, 11, 87]]])
        self.assertEqual(result.shape, (2, 2, 3))
        self.assertEqual(result.dtype, np.dtype('uint8'))
        self.assertTrue(result.flags.c_contiguous)
        self.assertEqual(pixels[0:4], bytes([17, 61, 203, 255]))

    def test_model_admission_real_files_refuse_tamper_missing_extra_and_link(self):
        # Synthetic model bytes exercise actual filesystem/hash admission, not OCR.
        with tempfile.TemporaryDirectory(prefix='p4-ocr-model-admission-') as directory:
            root = Path(directory).resolve()
            files = {'inference.json': b'json', 'inference.yml': b'yaml',
                     'inference.pdiparams': b'parameters'}
            expected = {name: (len(data), hashlib.sha256(data).hexdigest())
                        for name, data in files.items()}
            for name, data in files.items(): (root/name).write_bytes(data)
            with mock.patch.object(WORKER, 'MODEL_ROOT', str(root)), \
                 mock.patch.object(WORKER, 'MODEL_FILES', expected):
                WORKER.admit_model()
                target = root/'inference.json'
                target.write_bytes(b'JSON')
                with self.assertRaises(ValueError): WORKER.admit_model()
                target.write_bytes(files[target.name])
                target.unlink()
                with self.assertRaises(ValueError): WORKER.admit_model()
                target.write_bytes(files[target.name])
                extra = root/'extra'; extra.write_bytes(b'x')
                with self.assertRaises(ValueError): WORKER.admit_model()
                extra.unlink()
                target.unlink(); target.symlink_to(root/'inference.yml')
                with self.assertRaises(OSError): WORKER.admit_model()
                target.unlink(); target.write_bytes(files[target.name])
                WORKER.admit_model()
        self.assertNotIn('paddleocr', sys.modules)

    def test_positive_exact_frame(self):
        h,data=fixture()
        self.assertEqual(WORKER.envelope(io.BytesIO(frame(h,data))),(h,data))

    def test_vi_refusal_before_model_admission(self):
        h,data=fixture('VI')
        previous=WORKER.admit_model
        WORKER.admit_model=lambda: (_ for _ in ()).throw(AssertionError('must not inspect model'))
        try:
            r=WORKER.evaluate(h,data)
            self.assertEqual(r,('UNAVAILABLE','VI_CHARACTER_REPERTOIRE_UNSUPPORTED',None,None,None))
            self.assertNotIn('paddleocr',sys.modules)
        finally:
            WORKER.admit_model=previous

    def test_bounds_before_image_read(self):
        for key,value in [('width',2049),('height',257),('width',False),('inputBytes',2097153)]:
            with self.subTest(key=key,value=value):
                h,data=fixture();h[key]=value
                with self.assertRaises(ValueError):WORKER.envelope(io.BytesIO(frame(h,data)))

    def test_extra_duplicate_reordered_and_noncanonical(self):
        h,data=fixture();raw=WORKER.canonical(h)
        for changed in [raw.replace(b'"version":1',b'"version":1,"version":1'),
                        raw.replace(b'"version":1',b'"version":1,"extra":1'),
                        json.dumps(h).encode(),WORKER.canonical(dict(reversed(list(h.items()))))]:
            with self.assertRaises(ValueError):WORKER.envelope(io.BytesIO(struct.pack('<I',len(changed))+changed+data))

    def test_payload_hash_alpha_truncated_trailing(self):
        h,data=fixture()
        for bad in [frame(h,data)[:-1],frame(h,data)+b'x',frame(h,b'xxxx')]:
            with self.assertRaises(ValueError):WORKER.envelope(io.BytesIO(bad))
        data=bytes([12,34,56,0]);h['inputSha256']=hashlib.sha256(data).hexdigest()
        with self.assertRaises(ValueError):WORKER.envelope(io.BytesIO(frame(h,data)))

    def test_bad_id_hash_language_number(self):
        for key,value in [('requestId','../../file'),('sourcePixelSha256','x'*64),('language','EN-US'),('generation',-1),('version',True)]:
            h,data=fixture();h[key]=value
            with self.assertRaises(ValueError):WORKER.envelope(io.BytesIO(frame(h,data)))

    def test_reply_failure_is_attributed_not_success(self):
        h,_=fixture('VI');b=WORKER.reply(h,('UNAVAILABLE','VI_CHARACTER_REPERTOIRE_UNSUPPORTED',None,None,None))
        n=struct.unpack('<I',b[:4])[0];r=json.loads(b[4:])
        self.assertEqual(n,len(b)-4)
        self.assertEqual(r['capability'],'UNQUALIFIED')
        self.assertEqual(r['scope'],'EVALUATION_ONLY')
        self.assertIsNone(r['model']);self.assertIsNone(r['text']);self.assertIsNone(r['rawScore'])
        self.assertEqual(r['inputSha256'],h['inputSha256'])

    def test_diagnostic_excludes_exception_text_and_full_paths(self):
        # Synthetic vendor failure seam, not model/runtime evidence.
        script = str(Path(__file__).parents[1]/'vision/ocr_evaluation_worker.py')
        code = ("import importlib.util; s=importlib.util.spec_from_file_location('w',"+repr(script)+
                "); w=importlib.util.module_from_spec(s); s.loader.exec_module(w); "
                "w.evaluate=lambda *args: (_ for _ in ()).throw(RuntimeError('PRIVATE_SENTINEL /private/user/path')); "
                "raise SystemExit(w.main())")
        h,data=fixture()
        result=subprocess.run([sys.executable,'-I','-B','-c',code],input=frame(h,data),capture_output=True,timeout=5)
        self.assertEqual(result.returncode,0)
        self.assertLessEqual(len(result.stderr),513)
        self.assertNotIn(b'PRIVATE_SENTINEL',result.stderr)
        self.assertNotIn(b'/private/user/path',result.stderr)
        diagnostic=json.loads(result.stderr)
        self.assertEqual(diagnostic['type'],'RuntimeError')
        self.assertEqual(diagnostic['stage'],'ADMISSION')
        self.assertIsNone(diagnostic['blockedEvent'])
        self.assertIsNone(diagnostic['source'])
        self.assertEqual(json.loads(result.stdout[4:])['code'],'WORKER_UNAVAILABLE')

    def test_exact_probe_allowlist_once_without_executing_processes(self):
        with mock.patch.object(WORKER, 'validate_probe_context') as validate, mock.patch.object(WORKER,'clean_probe_environment',return_value={'fixed':'env'}):
            for command in WORKER.PROBE_COUNTS:
                WORKER.PROBE_COUNTS[command]=0
                args=('/bin/sh',['/bin/sh','-c',command],None,{'fixed':'env'})
                WORKER.audit('subprocess.Popen',args)
                self.assertEqual(WORKER.PROBE_COUNTS[command],1)
                with self.assertRaises(RuntimeError):WORKER.audit('subprocess.Popen',args)
                WORKER.PROBE_COUNTS[command]=0
            self.assertEqual(validate.call_count,4)

    def test_probe_argv_cwd_env_and_socket_variants_refuse(self):
        command=next(iter(WORKER.PROBE_COUNTS))
        cases=[('/bin/sh',['/bin/sh','-c',command+' '],None,None),
               ('/bin/bash',['/bin/sh','-c',command],None,None),
               ('/bin/sh',['/bin/sh','-c',command,'extra'],None,None),
               ('/bin/sh',['/bin/sh','-c',command],'/tmp',None),
               ('/bin/sh',['/bin/sh','-c',command],None,{}),
               ('which',['which','ccache'],None,None)]
        with mock.patch.object(WORKER,'validate_probe_context') as validate, mock.patch.object(WORKER,'clean_probe_environment',return_value={'fixed':'env'}):
            for args in cases:
                with self.assertRaises(RuntimeError):WORKER.audit('subprocess.Popen',args)
            validate.assert_not_called()

    def test_probe_context_failure_never_grants_permit(self):
        command=next(iter(WORKER.PROBE_COUNTS));WORKER.PROBE_COUNTS[command]=0
        with mock.patch.object(WORKER,'validate_probe_context',side_effect=ValueError('CONTEXT')), mock.patch.object(WORKER,'clean_probe_environment',return_value={'fixed':'env'}):
            with self.assertRaises(ValueError):WORKER.audit('subprocess.Popen',('/bin/sh',['/bin/sh','-c',command],None,{'fixed':'env'}))
        self.assertEqual(WORKER.PROBE_COUNTS[command],0)

    def test_clean_environment_adapter_drops_vendor_loader_marker(self):
        calls=[]
        class FakePopen:
            def __init__(self,*args,**kwargs):calls.append((args,kwargs))
        adapter=WORKER.probe_popen_class(FakePopen)
        with mock.patch.object(WORKER,'_PROBE_ROOT','/tmp/auto-p4-ocr-job-synthetic'), mock.patch.dict(os.environ,{'LD_LIBRARY_PATH':'PRIVATE_LOADER_SENTINEL','BASH_FUNC_echo%%':'PRIVATE_FUNCTION'}):
            adapter("ldd --version | awk '/ldd/{print $NF}'",stdout=subprocess.PIPE,stderr=subprocess.PIPE,shell=True)
            adapter('cat /proc/cpuinfo | grep -i avx',shell=True,text=True,stdout=subprocess.PIPE,bufsize=-1)
            self.assertEqual(len(calls),2)
            for _,kwargs in calls:
                self.assertEqual(len(kwargs['env']),8)
                self.assertNotIn('LD_LIBRARY_PATH',kwargs['env'])
                self.assertNotIn('PRIVATE_LOADER_SENTINEL',str(kwargs['env']))
                self.assertEqual(kwargs['env'],WORKER.clean_probe_environment())
            self.assertIsNot(calls[0][1]['env'],calls[1][1]['env'])
            for extra in ({'env':{}},{'cwd':'/tmp'},{'preexec_fn':lambda:None},{'shell':1}):
                kwargs={'stdout':subprocess.PIPE,'stderr':subprocess.PIPE,'shell':True,**extra}
                with self.assertRaises(RuntimeError):adapter("ldd --version | awk '/ldd/{print $NF}'",**kwargs)
            with self.assertRaises(RuntimeError):adapter('cat /proc/cpuinfo | grep -i avx',shell=True,text=1,stdout=subprocess.PIPE,bufsize=-1)
            self.assertEqual(len(calls),2)

    def test_probe_audit_rejects_inherited_or_nonclosed_environment(self):
        command=next(iter(WORKER.PROBE_COUNTS));WORKER.PROBE_COUNTS[command]=0
        with mock.patch.object(WORKER,'_PROBE_ROOT','/tmp/auto-p4-ocr-job-synthetic'), mock.patch.object(WORKER,'validate_probe_context') as validate:
            clean=WORKER.clean_probe_environment()
            for env in (None,{},dict(clean,LD_LIBRARY_PATH='untrusted'),dict(clean,PATH='/other')):
                with self.assertRaises(RuntimeError):WORKER.audit('subprocess.Popen',('/bin/sh',['/bin/sh','-c',command],None,env))
            validate.assert_not_called()

    def test_actual_installed_probe_tool_hashes_read_only(self):
        WORKER.verify_probe_tools()
        bad=(*WORKER.PROBE_TOOLS[0][:2],'0'*64)
        with mock.patch.object(WORKER,'PROBE_TOOLS',(bad,)):
            with self.assertRaises(ValueError):WORKER.verify_probe_tools()

    def test_probe_context_rechecks_environment_cwd_and_group(self):
        with tempfile.TemporaryDirectory(prefix='auto-p4-ocr-job-') as root:
            for name in ('home','tmp','cache'):Path(root,name).mkdir()
            env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','HOME':root+'/home','TMPDIR':root+'/tmp','TMP':root+'/tmp','TEMP':root+'/tmp','PADDLE_PDX_CACHE_HOME':root+'/cache'}
            old=os.getcwd()
            try:
                os.chdir(root)
                with mock.patch.dict(os.environ,env,clear=True), mock.patch.object(WORKER.os,'getpgrp',return_value=os.getpid()), mock.patch.object(WORKER.os,'getsid',return_value=os.getpid()):
                    WORKER.prepare_probe_context()
                    for key in ('PATH','HOME','TMPDIR','PADDLE_PDX_CACHE_HOME','LANG'):
                        with mock.patch.dict(os.environ,{key:'altered'}):
                            with self.assertRaises(ValueError):WORKER.validate_probe_context()
                    for key in ('BASH_ENV','ENV','SHELLOPTS','BASHOPTS','BASH_FUNC_echo%%'):
                        with mock.patch.dict(os.environ,{key:'untrusted'}):
                            with self.assertRaises(ValueError):WORKER.validate_probe_context()
                    with mock.patch.object(WORKER.os,'getpgrp',return_value=os.getpid()+1):
                        with self.assertRaises(ValueError):WORKER.validate_probe_context()
                    os.chdir(old)
                    with self.assertRaises(ValueError):WORKER.validate_probe_context()
            finally:
                os.chdir(old)
                WORKER._PROBE_ROOT=None;WORKER._PROBE_IDENTITIES=None

    def test_unowned_current_directory_never_admits_probe_context(self):
        with self.assertRaises(ValueError):WORKER.prepare_probe_context()

    def test_audit_denies_external_effect_events(self):
        for event in ['socket.connect','socket.__new__','subprocess.Popen','os.system','os.exec','os.posix_spawn','os.fork']:
            with self.assertRaises(RuntimeError):WORKER.audit(event,())
        WORKER.audit('open',())


if __name__=='__main__':unittest.main()
