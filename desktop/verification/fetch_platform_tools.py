"""Fetch one pinned official development archive; no execution, installation or redistribution."""
import hashlib
from http.client import HTTPException
import os
from pathlib import Path
import time
import urllib.request
from platform_tools_archive import ARCHIVE_BYTES, ARCHIVE_SHA256, OFFICIAL_URL, _plain_directory

def fetch_candidate(parent):
    parent=Path(parent);_plain_directory(parent)
    directory=parent/'.platform-tools-input'
    directory.mkdir(mode=0o700)  # Never adopts a previous/partial input directory.
    target=directory/'platform-tools_r37.0.1-win.zip'
    started=time.monotonic();count=0;digest=hashlib.sha256()
    request=urllib.request.Request(OFFICIAL_URL,headers={'User-Agent':'Fonesi-Auto-pinned-development-inspection'})
    with urllib.request.urlopen(request,timeout=30) as response, target.open('xb') as output:
        if response.status!=200: raise ValueError('DOWNLOAD_REJECTED')
        while True:
            if time.monotonic()-started>60: raise ValueError('DOWNLOAD_REJECTED')
            chunk=response.read(min(65536,ARCHIVE_BYTES-count+1))
            if not chunk: break
            count+=len(chunk)
            if count>ARCHIVE_BYTES: raise ValueError('DOWNLOAD_REJECTED')
            digest.update(chunk);output.write(chunk)
        output.flush();os.fsync(output.fileno())
    if count!=ARCHIVE_BYTES or digest.hexdigest()!=ARCHIVE_SHA256: raise ValueError('DOWNLOAD_REJECTED')
    if hashlib.sha256(target.read_bytes()).hexdigest()!=ARCHIVE_SHA256: raise ValueError('DOWNLOAD_REJECTED')
    return target

def main(argv=None):
    import sys
    args=sys.argv[1:] if argv is None else argv
    try:
        if len(args)!=1: raise ValueError('DOWNLOAD_REJECTED')
        fetch_candidate(args[0]);print('PLATFORM_TOOLS_DOWNLOAD_VERIFIED');return 0
    except (OSError,ValueError,TimeoutError,HTTPException):
        print('PLATFORM_TOOLS_DOWNLOAD_REJECTED');return 1
if __name__=='__main__':raise SystemExit(main())
