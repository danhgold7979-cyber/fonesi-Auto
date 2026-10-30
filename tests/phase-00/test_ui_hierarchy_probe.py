"""Synthetic offline behavior only; no device, network, private files or apps."""
from dataclasses import asdict, replace
import importlib.util
from pathlib import Path
import sys
import unittest

MODULE = Path(__file__).resolve().parents[2] / 'tools/phase-00/ui_hierarchy_probe.py'
spec = importlib.util.spec_from_file_location('ui_hierarchy_probe', MODULE)
probe = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = probe
spec.loader.exec_module(probe)
CONTEXT = probe.CaptureContext('synthetic-device', 1, 1, 1000, 720, 1280, 0)
NODE = ('<node resource-id="fixture:id/toggle" text="Độ sáng 🌞" '
        'content-desc="Brightness" class="android.widget.Switch" '
        'package="fixture.settings" enabled="true" password="false" '
        'bounds="[10,20][300,100]"/>')


def hierarchy(content=NODE):
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<hierarchy rotation="0">' + content + '</hierarchy>').encode()


class HierarchyTests(unittest.TestCase):
    def inspect(self, xml=None, selector=None, capture=CONTEXT, current=CONTEXT, age=100):
        return probe.inspect_hierarchy(
            hierarchy() if xml is None else xml,
            {'resource-id': 'fixture:id/toggle'} if selector is None else selector,
            capture, current, max_age_ms=age)

    def test_unique_id(self):
        self.assertEqual(self.inspect(), probe.ProbeResult('UNIQUE_CANDIDATE', 1, 1))

    def test_unicode_exact_text(self):
        self.assertEqual(self.inspect(selector={'text': 'Độ sáng 🌞'}).state, 'UNIQUE_CANDIDATE')

    def test_description_and_class(self):
        self.assertEqual(self.inspect(selector={'content-desc': 'Brightness', 'class':
            'android.widget.Switch'}).state, 'UNIQUE_CANDIDATE')

    def test_no_fallback_when_conjunction_fails(self):
        self.assertEqual(self.inspect(selector={'resource-id': 'fixture:id/toggle',
            'text': 'Different'}).state, 'NO_MATCH')

    def test_duplicate_not_first_match(self):
        self.assertEqual(self.inspect(hierarchy(NODE * 2)), probe.ProbeResult('AMBIGUOUS', 2, 2))

    def test_package_disambiguates(self):
        xml = hierarchy(NODE + NODE.replace('fixture.settings', 'fixture.other'))
        self.assertEqual(self.inspect(xml, {'resource-id': 'fixture:id/toggle',
            'package': 'fixture.settings'}).state, 'UNIQUE_CANDIDATE')

    def test_no_substring_or_casefold(self):
        for text in ('Độ sáng', 'độ sáng 🌞', 'Độ sáng 🌞 '):
            with self.subTest(text=text):
                self.assertEqual(self.inspect(selector={'text': text}).state, 'NO_MATCH')

    def test_invalid_selector(self):
        for selector in ({}, {'bounds': '[0,0][1,1]'}, {'class': 'Button'},
                         {'text': ''}, {'text': ' '}, {'text': 1}, [], {'shell': 'x'}):
            with self.subTest(selector=selector):
                self.assertEqual(self.inspect(selector=selector).state, 'INVALID_SELECTOR')

    def test_wrong_device_generation_display_or_rotation(self):
        for field, value in [('device_ref', 'other'), ('generation', 2),
                             ('display_revision', 2), ('width', 800),
                             ('height', 1400), ('rotation', 1)]:
            with self.subTest(field=field):
                self.assertEqual(self.inspect(current=replace(CONTEXT, **{field: value})).state,
                                 'CONTEXT_MISMATCH')

    def test_stale_and_future_capture(self):
        for now in (999, 1101):
            self.assertEqual(self.inspect(current=replace(CONTEXT, captured_ms=now)).state,
                             'STALE_CAPTURE')

    def test_age_boundary(self):
        self.assertEqual(self.inspect(current=replace(CONTEXT, captured_ms=1100)).state,
                         'UNIQUE_CANDIDATE')

    def test_invalid_context(self):
        for field, value in [('device_ref', ''), ('generation', True), ('generation', -1),
                             ('width', 0), ('rotation', 4), ('captured_ms', float('nan'))]:
            self.assertEqual(self.inspect(capture=replace(CONTEXT, **{field: value})).state,
                             'INVALID_CONTEXT')
        for age in (-1, True, None):
            self.assertEqual(self.inspect(age=age).state, 'INVALID_CONTEXT')

    def test_malformed_empty_encoding_or_size(self):
        for xml in (b'', b'<hierarchy', b'\xff', 'not-bytes', b' ' * (probe.MAX_BYTES + 1)):
            self.assertEqual(self.inspect(xml).state, 'INVALID_XML')

    def test_dtd_entity_and_cdata_forbidden(self):
        for xml in (b'<!DOCTYPE hierarchy [<!ENTITY x SYSTEM "file:///synthetic-secret">]>'
                    b'<hierarchy rotation="0">&x;</hierarchy>',
                    b'<hierarchy rotation="0"><![CDATA[secret]]></hierarchy>',
                    b'<!-- comment --><hierarchy rotation="0"/>'):
            self.assertEqual(self.inspect(xml).state, 'UNSAFE_XML')

    def test_utf16_bypass_rejected(self):
        self.assertIn(self.inspect('<!DOCTYPE hierarchy><hierarchy/>'.encode('utf-16')).state,
                      ('INVALID_XML', 'UNSAFE_XML'))

    def test_invalid_hierarchy_shape_or_rotation(self):
        for xml in (b'<other/>', hierarchy('<other/>'), hierarchy().replace(b'rotation="0"',
                    b'rotation="1"'), hierarchy('unexpected text' + NODE)):
            self.assertEqual(self.inspect(xml).state, 'INVALID_HIERARCHY')

    def test_empty_tree(self):
        self.assertEqual(self.inspect(hierarchy('')).state, 'EMPTY_HIERARCHY')

    def test_node_and_depth_limits(self):
        self.assertEqual(self.inspect(hierarchy('<node/>' * (probe.MAX_NODES + 1))).state,
                         'LIMIT_EXCEEDED')
        self.assertEqual(self.inspect(hierarchy('<node>' * (probe.MAX_DEPTH + 1) +
                         '</node>' * (probe.MAX_DEPTH + 1))).state, 'LIMIT_EXCEEDED')

    def test_disabled_password_unknown_fail_closed(self):
        for node in (NODE.replace('enabled="true"', 'enabled="false"'),
                     NODE.replace('password="false"', 'password="true"'),
                     NODE.replace('password="false"', ''), NODE.replace('enabled="true"', '')):
            self.assertEqual(self.inspect(hierarchy(node)).state, 'INELIGIBLE_NODE')

    def test_invalid_offscreen_or_zero_bounds(self):
        for bounds in ('[0,0][0,10]', '[-1,0][10,10]', '[0,0][721,10]', '[0,0][10,1281]',
                       '[20,20][10,10]', '0,0,10,10', ''):
            self.assertEqual(self.inspect(hierarchy(NODE.replace('[10,20][300,100]', bounds))).state,
                             'INVALID_BOUNDS')

    def test_huge_bounds_integer_is_rejected_without_exception(self):
        xml = hierarchy(NODE.replace('[10,20][300,100]', '[' + '9' * 5000 + ',0][10,10]'))
        self.assertEqual(self.inspect(xml).state, 'INVALID_BOUNDS')

    def test_non_ascii_bounds_digits_rejected(self):
        self.assertEqual(self.inspect(hierarchy(NODE.replace('[10,20][300,100]',
                         '[١,٢][٣,٤]'))).state, 'INVALID_BOUNDS')

    def test_processing_instructions_rejected(self):
        self.assertEqual(self.inspect(hierarchy('<?unknown private?>' + NODE)).state,
                         'UNSAFE_XML')

    def test_bom_and_escaped_text(self):
        self.assertEqual(self.inspect(b'\xef\xbb\xbf' + hierarchy()).state, 'UNIQUE_CANDIDATE')
        xml = hierarchy(NODE.replace('Độ sáng 🌞', 'A &amp; B'))
        self.assertEqual(self.inspect(xml, {'text': 'A & B'}).state, 'UNIQUE_CANDIDATE')

    def test_mismatched_or_unknown_encoding_declarations_rejected(self):
        for encoding in ('UTF-16', 'ISO-8859-1', 'madeup', 'UTF-8-private', 'UTF8'):
            with self.subTest(encoding=encoding):
                xml = hierarchy().replace(b'UTF-8', encoding.encode('ascii'))
                self.assertEqual(self.inspect(xml).state, 'INVALID_XML')

    def test_only_xml10_declaration_allowed(self):
        for declaration in ('<?xml version="1.1" encoding="UTF-8"?>',
                            '<?xml version="2.0"?>', '<?xml encoding="UTF-8"?>',
                            '<?xml version="1.0" encoding="UTF-8" encoding="UTF-16"?>',
                            '<?xml version="1.0" unknown="private"?>'):
            with self.subTest(declaration=declaration):
                xml = declaration.encode() + hierarchy().split(b'?>', 1)[1]
                self.assertEqual(self.inspect(xml).state, 'INVALID_XML')

    def test_valid_declaration_variants_and_absent_declaration(self):
        for declaration in ('', '<?xml version="1.0"?>',
                            "<?xml version='1.0' encoding='utf-8' standalone='yes'?>",
                            '<?xml\nversion = "1.0" encoding = "UTF-8" standalone="no" ?>'):
            with self.subTest(declaration=declaration):
                xml = declaration.encode() + hierarchy().split(b'?>', 1)[1]
                self.assertEqual(self.inspect(xml).state, 'UNIQUE_CANDIDATE')

    def test_results_never_echo_private_attributes_or_xml(self):
        canary = 'PRIVATE-CANARY'
        result = self.inspect(hierarchy(NODE.replace('Độ sáng 🌞', canary)))
        self.assertNotIn(canary, repr(result))
        self.assertEqual(set(asdict(result)), {'state', 'node_count', 'match_count'})


if __name__ == '__main__':
    unittest.main()
