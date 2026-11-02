"""Synthetic supplied metrics tests: no runtime/model/device execution."""

import copy
import json
import itertools
import pathlib
import subprocess
import sys
import unittest
from unittest.mock import patch

import ocr_evaluation_metrics as metrics


H = "a" * 64


def row(identifier="r1", label="hello", text="hello", **overrides):
    result = {"id": identifier, "imageSha256": H, "language": "EN",
              "split": "SMOKE", "label": label, "status": "TEXT", "text": text,
              "temperature": "COLD", "modelLatencyMs": 2.0,
              "endToEndLatencyMs": 5.0, "peakRssBytes": 1024}
    result.update(overrides)
    return result


def corpus(rows=None):
    return {"version": 1, "scope": "EVALUATION_ONLY", "runtimeSha256": "b" * 64,
            "modelSha256": "c" * 64, "installedBytes": 1234, "modelBytes": 100,
            "rows": rows if rows is not None else [row()]}


class MetricsTests(unittest.TestCase):
    def refuses(self, data, code):
        with self.assertRaisesRegex(metrics.MetricsError, "^" + code + "$"):
            metrics.evaluate(data)

    def test_exact_success_and_no_qualification(self):
        result = metrics.evaluate(corpus())
        self.assertEqual(result["qualification"], "UNQUALIFIED")
        self.assertEqual(result["summary"]["exactLineAccuracy"], 1)
        self.assertEqual(result["summary"]["cer"], 0)
        self.assertEqual(result["summary"]["referenceCodepoints"], 5)
        self.assertEqual(result["bySplit"]["SMOKE"]["attempts"], 1)
        self.assertEqual(result["byLanguage"]["EN"]["attempts"], 1)

    def test_insert_delete_substitute_and_asymmetry(self):
        cases = [("cat", "cats", 1), ("cats", "cat", 1), ("cat", "cut", 1),
                 ("kitten", "sitting", 3), ("abc", "z", 3)]
        for label, text, expected in cases:
            with self.subTest(label=label, text=text):
                result = metrics.evaluate(corpus([row(label=label, text=text)]))
                self.assertEqual(result["rows"][0]["edits"], expected)
                self.assertEqual(result["summary"]["cer"], expected / len(label))

    def test_unicode_codepoints_no_hidden_normalization(self):
        result = metrics.evaluate(corpus([
            row("astral", label="😀a", text="😀b"),
            row("combined", label="ế", text="e\u0302\u0301", language="VI"),
            row("space", label="A ", text="a"),
        ]))
        self.assertEqual([r["edits"] for r in result["rows"]], [1, 3, 2])
        self.assertEqual(result["summary"]["referenceCodepoints"], 5)
        self.assertEqual(result["rows"][1]["text"], "e\u0302\u0301")
        self.assertEqual(result["byLanguage"]["VI"]["edits"], 3)

    def test_empty_reference_insertions_enter_aggregate(self):
        result = metrics.evaluate(corpus([
            row("empty", label="", text="xyz"), row("nonempty", label="ab", text="ab")
        ]))
        self.assertIsNone(result["rows"][0]["cer"])
        self.assertEqual(result["summary"]["cer"], 1.5)
        self.assertEqual(result["summary"]["edits"], 3)
        self.assertEqual(result["summary"]["exactLineAccuracy"], 0.5)

    def test_all_empty_references_report_unavailable_cer(self):
        result = metrics.evaluate(corpus([row(label="", text="x")]))
        self.assertIsNone(result["summary"]["cer"])
        self.assertEqual(result["summary"]["edits"], 1)

    def test_empty_reference_failure_never_exact(self):
        for status in ("UNAVAILABLE", "ERROR"):
            result = metrics.evaluate(corpus([row(label="", text=None, status=status)]))
            self.assertFalse(result["rows"][0]["exactLine"])
            self.assertEqual(result["summary"]["exactLineAccuracy"], 0)
            self.assertEqual(result["summary"]["failures"], 1)
            self.assertEqual(result["summary"]["attempts"], 1)

    def test_failures_retained_in_denominators_and_edit_total(self):
        result = metrics.evaluate(corpus([
            row("good", label="ab", text="ab"),
            row("bad", label="abc", text=None, status="ERROR"),
            row("unavailable", label="de", text=None, status="UNAVAILABLE", language="VI"),
        ]))
        self.assertEqual(result["summary"]["attempts"], 3)
        self.assertEqual(result["summary"]["exactLineAccuracy"], 1 / 3)
        self.assertEqual(result["summary"]["referenceCodepoints"], 7)
        self.assertEqual(result["summary"]["edits"], 5)
        self.assertEqual(result["summary"]["failures"], 2)
        self.assertIsNone(result["rows"][1]["text"])

    def test_successful_no_text_can_match_empty_reference(self):
        result = metrics.evaluate(corpus([row(label="", text="", status="NO_TEXT")]))
        self.assertTrue(result["rows"][0]["exactLine"])
        self.assertEqual(result["summary"]["noText"], 1)
        self.assertEqual(result["summary"]["failures"], 0)

    def test_status_text_consistency(self):
        for status, text in [("TEXT", ""), ("TEXT", None), ("NO_TEXT", "x"),
                             ("UNAVAILABLE", ""), ("ERROR", "failed")]:
            with self.subTest(status=status, text=text):
                with self.assertRaises(metrics.MetricsError):
                    metrics.evaluate(corpus([row(status=status, text=text)]))

    def test_duplicate_id_across_splits_refuses(self):
        self.refuses(corpus([row(split="TUNING"),
                             row(split="HELD_OUT", imageSha256="d" * 64)]), "DUPLICATE_ID")

    def test_image_hash_leakage_refuses(self):
        self.refuses(corpus([row("t", split="TUNING"), row("h", split="HELD_OUT")]),
                     "SPLIT_LEAKAGE")

    def test_independent_splits_and_repeated_same_split_images(self):
        result = metrics.evaluate(corpus([
            row("t1", split="TUNING"), row("t2", split="TUNING"),
            row("h", split="HELD_OUT", imageSha256="d" * 64),
        ]))
        self.assertEqual(result["bySplit"]["TUNING"]["attempts"], 2)
        self.assertEqual(result["bySplit"]["HELD_OUT"]["attempts"], 1)

    def test_measurements_keep_cold_warm_and_missing_separate(self):
        result = metrics.evaluate(corpus([
            row("cold", modelLatencyMs=100, endToEndLatencyMs=200),
            row("warm", temperature="WARM", modelLatencyMs=2, endToEndLatencyMs=3),
            row("unknown", temperature="WARM", modelLatencyMs=None,
                endToEndLatencyMs=None, peakRssBytes=None),
        ]))["summary"]["measurements"]
        self.assertEqual(result["COLD"]["modelLatencyMs"]["mean"], 100)
        self.assertEqual(result["WARM"]["modelLatencyMs"]["mean"], 2)
        self.assertEqual(result["WARM"]["modelLatencyMs"]["missing"], 1)
        self.assertEqual(result["COLD"]["endToEndLatencyMs"]["max"], 200)

    def test_invalid_numbers(self):
        for value in [True, -1, float("nan"), float("inf"), -0.0, 1 << 10000]:
            with self.subTest(value=str(value)[:20] if type(value) is not int else "integer"):
                self.refuses(corpus([row(modelLatencyMs=value)]), "INVALID_MEASUREMENT")
        self.refuses(corpus([row(peakRssBytes=1.5)]), "INVALID_MEASUREMENT")
        self.refuses(corpus([row(modelLatencyMs=6, endToEndLatencyMs=5)]),
                     "INVALID_MEASUREMENT")

    def test_schema_is_closed_and_enums_exact(self):
        data = corpus()
        data["extra"] = "x"
        self.refuses(data, "INVALID_SCHEMA")
        data = corpus()
        del data["rows"][0]["temperature"]
        self.refuses(data, "INVALID_SCHEMA")
        for key, value, code in [("language", "en", "INVALID_LANGUAGE"),
                                 ("split", "TEST", "INVALID_SPLIT"),
                                 ("temperature", "HOT", "INVALID_TEMPERATURE"),
                                 ("status", [], "INVALID_STATUS"),
                                 ("id", "bad/id", "INVALID_ID"),
                                 ("imageSha256", "A" * 64, "INVALID_HASH")]:
            self.refuses(corpus([row(**{key: value})]), code)
        data = corpus()
        data["version"] = True
        self.refuses(data, "INVALID_VERSION")

    def test_row_text_and_unicode_limits(self):
        self.refuses(corpus([]), "ROW_LIMIT")
        self.refuses(corpus([row(str(i)) for i in range(257)]), "ROW_LIMIT")
        self.refuses(corpus([row(label="x" * 1025)]), "TEXT_LIMIT")
        self.refuses(corpus([row(label="\ud800")]), "INVALID_UNICODE")
        self.assertEqual(metrics.evaluate(corpus([row(label="😀" * 1024,
                                                     text="", status="NO_TEXT")]))
                         ["summary"]["edits"], 1024)

    def test_edit_work_is_checked_before_any_distance(self):
        data = corpus([row(str(i), label="a" * 1024, text="b" * 1024)
                       for i in range(2)])
        with patch.object(metrics, "_distance", side_effect=AssertionError("must not run")):
            self.refuses(data, "EDIT_WORK_LIMIT")

    def test_input_bytes_bound_before_parsing(self):
        with patch.object(metrics.json, "loads", side_effect=AssertionError("must not parse")):
            with self.assertRaisesRegex(metrics.MetricsError, "INPUT_LIMIT"):
                metrics.evaluate_json(b" " * (metrics.MAX_INPUT_BYTES + 1))

    def test_json_rejects_duplicates_nonfinite_and_bad_utf8(self):
        for data, code in [(b'{"version":1,"version":1}', "DUPLICATE_KEY"),
                           (b'{"value":NaN}', "INVALID_NUMBER"),
                           (b"\xff", "INVALID_JSON"), (b"{", "INVALID_JSON")]:
            with self.assertRaisesRegex(metrics.MetricsError, code):
                metrics.evaluate_json(data)

    def test_input_and_output_ownership(self):
        data = corpus()
        before = copy.deepcopy(data)
        result = metrics.evaluate(data)
        self.assertEqual(data, before)
        result["rows"][0]["text"] = "changed"
        self.assertEqual(data, before)
        data["rows"][0]["label"] = "later"
        self.assertEqual(result["rows"][0]["label"], "hello")

    def test_distance_matches_independent_short_full_matrix(self):
        words = ["".join(chars) for length in range(4)
                 for chars in itertools.product("ab😀", repeat=length)]
        for left in words:
            for right in words:
                matrix = [[0] * (len(right) + 1) for _ in range(len(left) + 1)]
                for i in range(len(left) + 1):
                    matrix[i][0] = i
                for j in range(len(right) + 1):
                    matrix[0][j] = j
                for i in range(1, len(left) + 1):
                    for j in range(1, len(right) + 1):
                        matrix[i][j] = min(matrix[i - 1][j] + 1,
                                           matrix[i][j - 1] + 1,
                                           matrix[i - 1][j - 1]
                                           + (left[i - 1] != right[j - 1]))
                self.assertEqual(metrics._distance(left, right), matrix[-1][-1])

    def test_exact_work_bound_and_full_row_capacity(self):
        data = corpus([row(str(i), label="a" * 1000, text="a" * 1000)
                       for i in range(2)])
        self.assertEqual(metrics.evaluate(data)["summary"]["exactLines"], 2)
        data = corpus([row(str(i), label="", text="", status="NO_TEXT")
                       for i in range(metrics.MAX_ROWS)])
        self.assertEqual(metrics.evaluate(data)["summary"]["attempts"], 256)

    def test_cli_round_trip_and_refusal(self):
        script = pathlib.Path(metrics.__file__).resolve()
        good = subprocess.run([sys.executable, "-I", "-B", str(script)],
                              input=json.dumps(corpus()).encode(), capture_output=True,
                              timeout=5, check=False)
        self.assertEqual(good.returncode, 0)
        self.assertEqual(json.loads(good.stdout)["summary"]["attempts"], 1)
        self.assertEqual(good.stderr, b"")
        bad = subprocess.run([sys.executable, "-I", "-B", str(script)], input=b"{}",
                             capture_output=True, timeout=5, check=False)
        self.assertEqual(bad.returncode, 2)
        self.assertEqual(json.loads(bad.stdout), {"status": "REFUSED", "code": "INVALID_SCHEMA"})


if __name__ == "__main__":
    unittest.main()
