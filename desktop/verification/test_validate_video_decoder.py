"""Negative source mutation tests; never launches Electron or claims decoded output."""
import re
import tempfile
import unittest
from pathlib import Path

import validate_video_decoder as boundary

ROOT = Path(__file__).resolve().parents[2]


class VideoDecoderSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = {name: (ROOT / 'desktop/verification' / name).read_text(encoding='utf-8')
                       for name in boundary.FILES}

    def refused(self, sources):
        with self.assertRaisesRegex(ValueError, '^VIDEO_DECODER_SOURCE_REJECTED$'):
            boundary.validate_sources(sources)

    def test_current_sources(self):
        self.assertTrue(boundary.validate_sources(self.sources))
        self.assertTrue(boundary.validate_tree(ROOT))

    def test_each_required_guard_mutation(self):
        # Independently mutate each required guard, not just one fixture per file.
        for name, guards in boundary.REQUIRED.items():
            source = re.sub(r'\(([A-Za-z_$][\w$]*)\)\s*=>', r'\1=>', self.sources[name])
            for guard in guards:
                with self.subTest(file=name, guard=guard):
                    changed = dict(self.sources)
                    pattern = r'\s*'.join(re.escape(char) for char in guard)
                    changed[name], count = re.subn(pattern, 'REMOVED_GUARD', source)
                    self.assertGreater(count, 0)
                    self.refused(changed)

        for name, guards in boundary.ORDERED.items():
            source = re.sub(r'\(([A-Za-z_$][\w$]*)\)\s*=>', r'\1=>', self.sources[name])
            for left, right in zip(guards, guards[1:]):
                with self.subTest(file=name, swapped=(left, right)):
                    patterns = [r'\s*'.join(re.escape(char) for char in guard) for guard in (left, right)]
                    matches = [re.search(pattern, source) for pattern in patterns]
                    self.assertTrue(all(matches))
                    first, second = matches
                    self.assertLess(first.start(), second.start())
                    changed = dict(self.sources)
                    changed[name] = (source[:first.start()] + second.group() +
                                     source[first.end():second.start()] + first.group() +
                                     source[second.end():])
                    self.refused(changed)

    def test_unadmitted_imports(self):
        for name in boundary.IMPORTS:
            for added in ("import 'node:child_process';", "import '../src/main.ts';",
                          "import '../src/retained-adb-launcher.ts';", "await import('node:net');",
                          "require('node:fs');", "eval('1');", "new Function('return 1');",
                          "fetch('https://example.invalid');", "new WebSocket('ws://example.invalid');"):
                with self.subTest(file=name, added=added):
                    changed = dict(self.sources)
                    changed[name] += '\n' + added
                    self.refused(changed)

    def test_missing_or_duplicate_import(self):
        changed = dict(self.sources)
        changed[boundary.FILES[0]] += "\nimport 'electron';"
        self.refused(changed)
        changed[boundary.FILES[0]] = self.sources[boundary.FILES[0]].replace("from 'electron'", "from 'other'")
        self.refused(changed)

    def test_security_and_unsupervised_execution(self):
        for added in ('--no-sandbox', '--disable-web-security', '--remote-debugging-port=1234',
                      'sandbox: false', 'nodeIntegration: true', 'Start-Process electron.exe',
                      'Invoke-Expression $command', 'Invoke-WebRequest https://example.invalid'):
            with self.subTest(added=added):
                changed = dict(self.sources)
                changed[boundary.FILES[3]] += '\n' + added
                self.refused(changed)

    def test_dependency_admission_precedes_dynamic_import(self):
        changed = dict(self.sources)
        source = changed[boundary.FILES[2]]
        source = source.replace('verify(true, process.argv[2]);', '')
        changed[boundary.FILES[2]] = source + '\nverify(true, process.argv[2]);'
        self.refused(changed)

    def test_exact_source_set_and_bounded_text(self):
        for bad in (None, [], {}, {**self.sources, 'extra.mjs': 'extra'}):
            self.refused(bad)
        for value in (None, b'bytes', '', '\x00', 'x' * 131073):
            changed = dict(self.sources)
            changed[boundary.FILES[0]] = value
            self.refused(changed)

    def test_tree_missing_link_and_oversize(self):
        with tempfile.TemporaryDirectory(prefix='decoder-source-test-') as directory:
            root = Path(directory)
            base = root / 'desktop/verification'
            base.mkdir(parents=True)
            for name, source in self.sources.items():
                (base / name).write_text(source, encoding='utf-8')
            self.assertTrue(boundary.validate_tree(root))
            file = base / boundary.FILES[0]
            file.unlink()
            with self.assertRaises(OSError):
                boundary.validate_tree(root)
            file.symlink_to(base / boundary.FILES[1])
            with self.assertRaises(ValueError):
                boundary.validate_tree(root)
            file.unlink()
            file.write_bytes(b'x' * 131073)
            with self.assertRaises(ValueError):
                boundary.validate_tree(root)


if __name__ == '__main__':
    unittest.main()
