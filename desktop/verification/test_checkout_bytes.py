"""Actual Git checkout regression: Windows conversion cannot change reviewed bytes."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest


class CheckoutBytesTests(unittest.TestCase):
    def test_windows_checkout_preserves_reviewed_bytes(self):
        root = Path(__file__).resolve().parents[2]
        review = json.loads((root / 'desktop/dependency-review.json').read_text())
        asset_source = (root / 'desktop/src/main/asset-policy.ts').read_text()
        asset_hash = re.search(r"ASSET_SHA256 = '([0-9a-f]{64})'", asset_source).group(1)
        expected = {
            'tools/phase-00/desktop-stack-lab/package-lock.json': review['sourceLockSha256'],
            'tools/phase-00/desktop-stack-lab/dependency-review.json': review['sourceReviewSha256'],
            'desktop/tests/fixtures/unavailable.html': asset_hash,
        }
        biome = json.loads((root / 'desktop/biome-review.json').read_text())
        expected['biome.json'] = biome['configurationSha256']
        for name in ('foundation/src/contracts/validate.ts', 'foundation/scripts/check.mjs',
                     'foundation/package.json', 'foundation/package-lock.json',
                     'foundation/dependency-review.json', 'foundation/tsconfig.json',
                     'foundation/README.md'):
            original = (root / name).read_bytes()
            self.assertNotIn(b'\r\n', original)
            expected[name] = hashlib.sha256(original).hexdigest()
        with tempfile.TemporaryDirectory(prefix='auto-owned-checkout-') as directory:
            result = subprocess.run(
                ['git', '-c', 'core.autocrlf=true', '-c', 'core.eol=crlf',
                 'checkout-index', '--prefix=' + Path(directory).as_posix() + '/', '--', *expected],
                cwd=root, capture_output=True, timeout=10, check=False)
            self.assertEqual(result.returncode, 0, 'CHECKOUT_FAILED')
            for name, digest in expected.items():
                raw = (Path(directory) / name).read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), digest)
                self.assertNotIn(b'\r\n', raw)


if __name__ == '__main__':
    unittest.main()
