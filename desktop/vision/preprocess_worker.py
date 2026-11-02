"""One fixed supplied RGBA transform; no acquisition, paths, commands or models."""
import hashlib
import json
import re
import struct
import sys

LIMIT = 16 * 1024 * 1024
KEYS = ('version','kind','requestId','captureId','deviceId','bindingId','generation','orientationEpoch','pipelineId','inputWidth','inputHeight','inputBytes','sourcePixelSha256','inputSha256','roi','scale','contrast')
PIPELINE = 'SUPPLIED_OPENCV_PREPROCESS_V1'


def integer(v, lo=0, hi=9007199254740991):
    return type(v) is int and lo <= v <= hi


def pairs(rows):
    d = {}
    for k, v in rows:
        if k in d:
            raise ValueError()
        d[k] = v
    return d


def canonical(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def envelope(stream):
    prefix = stream.read(4)
    if len(prefix) != 4:
        raise ValueError()
    n = struct.unpack('<I', prefix)[0]
    if not 1 <= n <= 4096:
        raise ValueError()
    raw = stream.read(n)
    h = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    if type(h) is not dict or tuple(h) != KEYS or canonical(h) != raw:
        raise ValueError()
    if h['version'] != 1 or type(h['version']) is not int or h['kind'] != 'PREPROCESS' or h['pipelineId'] != PIPELINE:
        raise ValueError()
    for k in ('requestId','captureId','deviceId','bindingId'):
        if type(h[k]) is not str or re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', h[k]) is None:
            raise ValueError()
    for k in ('sourcePixelSha256','inputSha256'):
        if type(h[k]) is not str or re.fullmatch(r'[0-9a-f]{64}',h[k]) is None:
            raise ValueError()
    if not integer(h['generation']) or not integer(h['orientationEpoch']) or not integer(h['inputBytes'],0,LIMIT):
        raise ValueError()
    data = stream.read(h['inputBytes'] + 1)
    if len(data) != h['inputBytes'] or stream.read(1) or hashlib.sha256(data).hexdigest() != h['inputSha256']:
        raise ValueError()
    return h, data


def process(h, data):
    w, height = h['inputWidth'], h['inputHeight']
    if not integer(w,1,4096) or not integer(height,1,4096) or w*height > 4194304 or len(data) != w*height*4:
        return 'INPUT_LIMIT', None, None, None
    r=h['roi']
    if type(r) is not dict or tuple(r) != ('x','y','width','height') or not all(integer(r[k], 1 if k in ('width','height') else 0) for k in r) or r['width']>w or r['height']>height or r['x']>w-r['width'] or r['y']>height-r['height']:
        return 'INVALID_ROI', None, None, None
    if h['scale'] not in ('HALF','ONE','DOUBLE') or type(h['scale']) is not str or h['contrast'] not in ('IDENTITY','GAIN_125') or type(h['contrast']) is not str:
        return 'INVALID_SCALE', None, None, None
    num=2 if h['scale']=='DOUBLE' else 1
    den=2 if h['scale']=='HALF' else 1
    ow,oh=r['width']*num//den,r['height']*num//den
    if r['width']%den or r['height']%den or not 1<=ow<=4096 or not 1<=oh<=4096 or ow*oh>4194304:
        return 'INVALID_SCALE', None, None, None
    import numpy as np
    import cv2
    cv2.setNumThreads(1)
    cv2.ocl.setUseOpenCL(False)
    a=np.frombuffer(data,dtype=np.uint8).reshape(height,w,4)
    if not np.all(a[:,:,3]==255):
        return 'UNSUPPORTED_ALPHA', None, None, None
    rgb=np.ascontiguousarray(a[r['y']:r['y']+r['height'],r['x']:r['x']+r['width'],:3])
    if h['scale']!='ONE':
        rgb=cv2.resize(rgb,(ow,oh),interpolation=cv2.INTER_AREA if den==2 else cv2.INTER_LINEAR)
    else:
        rgb=rgb.copy()
    clipped=0
    if h['contrast']=='GAIN_125':
        gain=cv2.multiply(rgb.astype(np.float32),np.full(rgb.shape,1.25,dtype=np.float32))
        clipped=int(np.count_nonzero(gain>255))
        rgb=np.clip(np.floor(gain+0.5),0,255).astype(np.uint8)
    out=np.empty((oh,ow,4),dtype=np.uint8)
    out[:,:,:3]=rgb
    out[:,:,3]=255
    mapping={'originalWidth':w,'originalHeight':height,'roi':r,'numerator':num,'denominator':den}
    return 'OK',out.tobytes(),mapping,(int(rgb.min()),int(rgb.max()),clipped,ow,oh)


def reply(h, code, data, mapping, stats):
    r={'version':1,'kind':'PREPROCESS_RESULT'}
    for k in ('requestId','captureId','deviceId','bindingId','generation','orientationEpoch','pipelineId'):
        r[k]=h[k]
    r.update(status='PROCESSED' if code=='OK' else 'REFUSED',code=code,sourcePixelSha256=h['sourcePixelSha256'],inputSha256=h['inputSha256'],outputWidth=stats[3] if stats else None,outputHeight=stats[4] if stats else None,outputBytes=len(data) if data else 0,outputSha256=hashlib.sha256(data).hexdigest() if data else None,mapping=mapping,minIntensity=stats[0] if stats else None,maxIntensity=stats[1] if stats else None,clippedChannels=stats[2] if stats else None)
    b=canonical(r)
    if len(b)>4096:
        raise ValueError()
    return struct.pack('<I',len(b))+b+(data or b'')


def main():
    try:
        h,data=envelope(sys.stdin.buffer)
    except BaseException:
        return 2
    try:
        result=process(h,data)
    except BaseException:
        result=('WORKER_FAILED',None,None,None)
    try:
        sys.stdout.buffer.write(reply(h,*result))
        sys.stdout.buffer.flush()
        return 0
    except BaseException:
        return 3


if __name__=='__main__':
    raise SystemExit(main())
