"""Actual cv2 processing of synthetic images; no hardware/acquisition effects."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import subprocess
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'vision' / 'preprocess_worker.py'
PYTHON = '/tmp/auto-p4-preprocess-runtime-v1/bin/python'
spec = importlib.util.spec_from_file_location('supplied_preprocess', SCRIPT)
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
ID = '00000000-0000-4000-8000-000000000001'


def header(data, width=2, height=2, **changes):
    h = dict(version=1, kind='PREPROCESS', requestId=ID, captureId=ID, deviceId=ID, bindingId=ID,
             generation=0, orientationEpoch=0, pipelineId=w.PIPELINE, inputWidth=width, inputHeight=height,
             inputBytes=len(data), sourcePixelSha256='a'*64, inputSha256=hashlib.sha256(data).hexdigest(),
             roi=dict(x=0,y=0,width=width,height=height), scale='ONE', contrast='IDENTITY')
    h.update(changes)
    return h


def frame(h, data):
    b=w.canonical(h)
    return struct.pack('<I',len(b))+b+data


def run(h, data):
    result=subprocess.run([PYTHON,'-I','-B',str(SCRIPT)],input=frame(h,data),capture_output=True,timeout=5,
                          env={'LANG':'C.UTF-8','OMP_NUM_THREADS':'1','OPENBLAS_NUM_THREADS':'1'})
    assert result.returncode == 0 and result.stderr == b''
    n=struct.unpack('<I',result.stdout[:4])[0]
    return json.loads(result.stdout[4:4+n]), result.stdout[4+n:]


class PreprocessWorkerTests(unittest.TestCase):
    def test_real_gain_round_half_up_and_rgb_clipping(self):
        d=bytes([2,204,255,255])*4
        r,p=run(header(d,contrast='GAIN_125'),d)
        self.assertEqual(p,bytes([3,255,255,255])*4)
        self.assertEqual((r['minIntensity'],r['maxIntensity'],r['clippedChannels']),(3,255,4))
        self.assertEqual(r['outputSha256'],hashlib.sha256(p).hexdigest())

    def test_real_area_interpolation(self):
        d=b''.join(bytes([v,v,v,255]) for v in [0,4,8,12])
        r,p=run(header(d,scale='HALF'),d)
        self.assertEqual(p,bytes([6,6,6,255]))
        self.assertEqual(r['mapping']['denominator'],2)

    def test_real_linear_interpolation_and_crop(self):
        d=b''.join(bytes([v,v,v,255]) for v in [0,100,200,255])
        r,p=run(header(d,scale='DOUBLE',roi=dict(x=1,y=0,width=1,height=2)),d)
        self.assertEqual((r['outputWidth'],r['outputHeight']),(2,4))
        self.assertEqual(list(p[::4]),[100,100,139,139,216,216,255,255])

    def test_alpha_typed_refusal_zero_image(self):
        d=bytes([1,2,3,254])*4
        r,p=run(header(d),d)
        self.assertEqual(r['code'],'UNSUPPORTED_ALPHA')
        self.assertEqual(p,b'')
        self.assertIsNone(r['mapping'])

    def test_typed_dimension_roi_scale_refusals(self):
        d=bytes([1,2,3,255])*4
        for change,code in [({'inputWidth':4097},'INPUT_LIMIT'),({'roi':dict(x=2,y=0,width=1,height=1)},'INVALID_ROI'),({'scale':'HALF','roi':dict(x=0,y=0,width=1,height=1)},'INVALID_SCALE')]:
            r,p=run(header(d,**change),d)
            self.assertEqual(r['code'],code)
            self.assertEqual(p,b'')

    def test_actual_malformed_process_exit_has_no_fabricated_reply_or_traceback(self):
        p=subprocess.run([PYTHON,'-I','-B',str(SCRIPT)],input=b'\xff'*4,capture_output=True,timeout=5)
        self.assertEqual((p.returncode,p.stdout,p.stderr),(2,b'',b''))

    def test_duplicate_noncanonical_truncated_trailing_hash_envelope(self):
        d=bytes([1,2,3,255])*4;h=header(d);b=w.canonical(h)
        variants=[frame(h,d)+b'x',frame(h,d)[:-1],frame({**h,'inputSha256':'f'*64},d)]
        for raw in [b.replace(b'"version":1',b'"version":1,"version":1'),b.replace(b'"generation":0',b'"generation":-0'),b+b' ']:
            variants.append(struct.pack('<I',len(raw))+raw+d)
        for raw in variants:
            with self.assertRaises(ValueError):w.envelope(io.BytesIO(raw))

    def test_fixed_source_has_no_file_or_subprocess_operation_surface(self):
        text=SCRIPT.read_text()
        for forbidden in ('import subprocess','import socket','imread(', 'imwrite(', 'VideoCapture(', 'eval(', 'exec('):self.assertNotIn(forbidden,text)
        self.assertIn('cv2.multiply',text)
        self.assertIn('cv2.setNumThreads(1)',text)


if __name__=='__main__':
    unittest.main()
