import hashlib
from http.client import IncompleteRead
from contextlib import redirect_stdout
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import fetch_platform_tools as f

class Response(io.BytesIO):
    status=200
class FetchPlatformToolsTests(unittest.TestCase):
    def test_exact_pinned_bytes_only_no_overwrite(self):
        data=b'synthetic archive, never executable'
        with tempfile.TemporaryDirectory() as folder,patch.object(f,'ARCHIVE_BYTES',len(data)),patch.object(f,'ARCHIVE_SHA256',hashlib.sha256(data).hexdigest()),patch.object(f.urllib.request,'urlopen',return_value=Response(data)) as request:
            root=Path(folder).resolve();target=f.fetch_candidate(root);self.assertEqual(target.read_bytes(),data)
            self.assertEqual(request.call_args.args[0].full_url,f.OFFICIAL_URL)
            with self.assertRaises(FileExistsError):f.fetch_candidate(root)
    def test_overflow_wrong_hash_and_partial_retained_without_success(self):
        for data,size,digest in [(b'abcd',3,hashlib.sha256(b'abc').hexdigest()),(b'abc',3,'0'*64),(b'a',3,'0'*64)]:
            with tempfile.TemporaryDirectory() as folder,patch.object(f,'ARCHIVE_BYTES',size),patch.object(f,'ARCHIVE_SHA256',digest),patch.object(f.urllib.request,'urlopen',return_value=Response(data)):
                root=Path(folder).resolve()
                with self.assertRaises(ValueError):f.fetch_candidate(root)
                self.assertTrue((root/'.platform-tools-input').is_dir())
    def test_incomplete_http_read_is_fixed_failure_not_raw_traceback(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(f.urllib.request,'urlopen',side_effect=IncompleteRead(b'PRIVATE_CANARY')):
            out=io.StringIO()
            with redirect_stdout(out):code=f.main([str(Path(folder).resolve())])
            self.assertEqual(code,1);self.assertEqual(out.getvalue(),'PLATFORM_TOOLS_DOWNLOAD_REJECTED\n')
    def test_total_deadline_and_fixed_error_cli(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(f.urllib.request,'urlopen',return_value=Response(b'x')),patch.object(f.time,'monotonic',side_effect=[0,61]):
            with self.assertRaises(ValueError):f.fetch_candidate(Path(folder).resolve())
        self.assertEqual(f.main([]),1)
if __name__=='__main__':unittest.main()
