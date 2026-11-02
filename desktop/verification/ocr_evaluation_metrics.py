"""Bounded, supplied-row cropped-line OCR evaluation; never qualification.

JSON envelope: version, scope, runtimeSha256, modelSha256, installedBytes,
modelBytes, rows. Each row: id, imageSha256, language, split, label, status,
text, temperature, modelLatencyMs, endToEndLatencyMs, peakRssBytes.
TEXT has nonempty text; NO_TEXT has empty text; ERROR/UNAVAILABLE have null
text. Missing measurements are null, not zero. Durations are milliseconds and
RSS/package/model sizes are bytes. Version 2 Windows envelopes additionally require
memoryKind=WINDOWS_PEAK_WORKING_SET and replace row peakRssBytes with
peakWorkingSetBytes; these measurements are never merged or relabeled as Linux RSS. IDs must be unique across the whole corpus;
image hashes cannot occur in both TUNING and HELD_OUT. All strings remain exact
Unicode (no normalization, trimming, case-folding or ignored characters).
"""

import json
import math
import re
import sys

MAX_INPUT_BYTES = 2 * 1024 * 1024
MAX_ROWS = 256
MAX_TEXT_CODEPOINTS = 1024
MAX_TEXT_BYTES = 4096
MAX_EDIT_CELLS = 2_000_000
MAX_SAFE_INTEGER = (1 << 53) - 1
ENVELOPE_KEYS = frozenset((
    "version", "scope", "runtimeSha256", "modelSha256", "installedBytes",
    "modelBytes", "rows",
))
ROW_KEYS = frozenset((
    "id", "imageSha256", "language", "split", "label", "status", "text",
    "temperature", "modelLatencyMs", "endToEndLatencyMs", "peakRssBytes",
))
HASH = re.compile(r"[0-9a-f]{64}\Z")
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z")
FAILURES = frozenset(("ERROR", "UNAVAILABLE"))


class MetricsError(ValueError):
    """Closed diagnostic code without echoing caller text."""


def _refuse(code):
    raise MetricsError(code)


def _record(value, keys):
    if type(value) is not dict or value.keys() != keys:
        _refuse("INVALID_SCHEMA")


def _text(value):
    if type(value) is not str or len(value) > MAX_TEXT_CODEPOINTS:
        _refuse("TEXT_LIMIT")
    try:
        if len(value.encode("utf-8")) > MAX_TEXT_BYTES:
            _refuse("TEXT_LIMIT")
    except UnicodeEncodeError:
        _refuse("INVALID_UNICODE")


def _hash(value):
    if type(value) is not str or HASH.fullmatch(value) is None:
        _refuse("INVALID_HASH")


def _integer(value, nullable=False):
    if value is None and nullable:
        return
    if type(value) is not int or not 0 <= value <= MAX_SAFE_INTEGER:
        _refuse("INVALID_MEASUREMENT")


def _duration(value):
    if value is None:
        return
    if type(value) not in (int, float) or not 0 <= value <= MAX_SAFE_INTEGER:
        _refuse("INVALID_MEASUREMENT")
    if not math.isfinite(value):
        _refuse("INVALID_MEASUREMENT")
    if value == 0 and math.copysign(1, value) < 0:
        _refuse("INVALID_MEASUREMENT")


def _snapshot(payload):
    if type(payload) is not dict:
        _refuse("INVALID_SCHEMA")
    version = payload.get("version")
    _record(payload, ENVELOPE_KEYS | {"memoryKind"}
            if type(version) is int and version == 2 else ENVELOPE_KEYS)
    if type(version) is not int or version not in (1, 2):
        _refuse("INVALID_VERSION")
    if version == 2 and payload["memoryKind"] != "WINDOWS_PEAK_WORKING_SET":
        _refuse("INVALID_MEMORY_KIND")
    memory_key = "peakWorkingSetBytes" if version == 2 else "peakRssBytes"
    row_keys = (ROW_KEYS - {"peakRssBytes"}) | {memory_key}
    if type(payload["scope"]) is not str or payload["scope"] != "EVALUATION_ONLY":
        _refuse("INVALID_SCOPE")
    for key in ("runtimeSha256", "modelSha256"):
        _hash(payload[key])
    for key in ("installedBytes", "modelBytes"):
        _integer(payload[key])
    rows = payload["rows"]
    if type(rows) is not list or not 1 <= len(rows) <= MAX_ROWS:
        _refuse("ROW_LIMIT")
    ids = set()
    tuning_hashes = set()
    held_out_hashes = set()
    snapshots = []
    cells = 0
    for row in rows:
        _record(row, row_keys)
        identifier = row["id"]
        if type(identifier) is not str or IDENTIFIER.fullmatch(identifier) is None:
            _refuse("INVALID_ID")
        if identifier in ids:
            _refuse("DUPLICATE_ID")
        ids.add(identifier)
        _hash(row["imageSha256"])
        if type(row["language"]) is not str or row["language"] not in ("EN", "VI"):
            _refuse("INVALID_LANGUAGE")
        if type(row["split"]) is not str or row["split"] not in ("SMOKE", "TUNING", "HELD_OUT"):
            _refuse("INVALID_SPLIT")
        if type(row["temperature"]) is not str or row["temperature"] not in ("COLD", "WARM"):
            _refuse("INVALID_TEMPERATURE")
        _text(row["label"])
        status = row["status"]
        if type(status) is not str or status not in ("TEXT", "NO_TEXT", "UNAVAILABLE", "ERROR"):
            _refuse("INVALID_STATUS")
        if status in FAILURES:
            if row["text"] is not None:
                _refuse("INVALID_STATUS_TEXT")
            predicted = ""
        else:
            _text(row["text"])
            predicted = row["text"]
            if (status == "TEXT") != bool(predicted):
                _refuse("INVALID_STATUS_TEXT")
        for key in ("modelLatencyMs", "endToEndLatencyMs"):
            _duration(row[key])
        _integer(row[memory_key], nullable=True)
        if (row["modelLatencyMs"] is not None
                and row["endToEndLatencyMs"] is not None
                and row["modelLatencyMs"] > row["endToEndLatencyMs"]):
            _refuse("INVALID_MEASUREMENT")
        if row["split"] == "TUNING":
            tuning_hashes.add(row["imageSha256"])
        if row["split"] == "HELD_OUT":
            held_out_hashes.add(row["imageSha256"])
        cells += len(row["label"]) * len(predicted)
        if cells > MAX_EDIT_CELLS:
            _refuse("EDIT_WORK_LIMIT")
        snapshots.append(dict(row))
    if tuning_hashes & held_out_hashes:
        _refuse("SPLIT_LEAKAGE")
    result = {**payload, "rows": snapshots}
    # Fields and individual strings have already been bounded before encoding.
    if len(json.dumps(result, ensure_ascii=False, allow_nan=False,
                      separators=(",", ":")).encode("utf-8")) > MAX_INPUT_BYTES:
        _refuse("INPUT_LIMIT")
    return result


def _distance(left, right):
    """Codepoint Levenshtein distance, two rows and O(min(n,m)) memory."""
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        current = [i]
        for j, b in enumerate(right, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1,
                               previous[j - 1] + (a != b)))
        previous = current
    return previous[-1]


def _distribution(values, attempts):
    if not values:
        return {"count": 0, "missing": attempts, "min": None, "max": None,
                "mean": None, "p50": None, "p95": None}
    ordered = sorted(values)
    return {"count": len(values), "missing": attempts - len(values),
            "min": ordered[0], "max": ordered[-1],
            "mean": math.fsum(values) / len(values),
            "p50": ordered[math.ceil(len(values) * 0.50) - 1],
            "p95": ordered[math.ceil(len(values) * 0.95) - 1]}


def _summary(rows, memory_key="peakRssBytes"):
    attempts = len(rows)
    chars = sum(len(row["label"]) for row in rows)
    edits = sum(row["edits"] for row in rows)
    exact = sum(row["exactLine"] for row in rows)
    measurements = {}
    for temperature in ("COLD", "WARM"):
        selected = [row for row in rows if row["temperature"] == temperature]
        measurements[temperature] = {
            key: _distribution([row[key] for row in selected if row[key] is not None],
                               len(selected))
            for key in ("modelLatencyMs", "endToEndLatencyMs", memory_key)
        }
    return {"attempts": attempts,
            "failures": sum(row["status"] in FAILURES for row in rows),
            "unavailable": sum(row["status"] == "UNAVAILABLE" for row in rows),
            "errors": sum(row["status"] == "ERROR" for row in rows),
            "noText": sum(row["status"] == "NO_TEXT" for row in rows),
            "exactLines": exact, "exactLineAccuracy": exact / attempts,
            "referenceCodepoints": chars, "edits": edits,
            "cer": edits / chars if chars else None,
            "measurements": measurements}


def evaluate(payload):
    """Validate fully before edit work; return fresh raw rows plus metrics."""
    snapshot = _snapshot(payload)
    memory_key = "peakWorkingSetBytes" if snapshot["version"] == 2 else "peakRssBytes"
    rows = []
    for row in snapshot["rows"]:
        predicted = row["text"] if row["status"] not in FAILURES else ""
        edits = _distance(row["label"], predicted)
        rows.append({**row, "edits": edits,
                     "exactLine": row["status"] not in FAILURES
                     and row["label"] == predicted,
                     "cer": edits / len(row["label"]) if row["label"] else None})
    return {**snapshot, "qualification": "UNQUALIFIED", "rows": rows,
            "summary": _summary(rows, memory_key),
            "byLanguage": {language: _summary(selected, memory_key)
                           for language in ("EN", "VI")
                           if (selected := [row for row in rows
                                            if row["language"] == language])},
            "bySplit": {split: _summary(selected, memory_key)
                        for split in ("SMOKE", "TUNING", "HELD_OUT")
                        if (selected := [row for row in rows
                                         if row["split"] == split])}}


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            _refuse("DUPLICATE_KEY")
        result[key] = value
    return result


def _constant(_value):
    _refuse("INVALID_NUMBER")


def evaluate_json(data):
    """Strict bounded UTF8 JSON bytes entry; no paths or downloads."""
    if type(data) is not bytes or len(data) > MAX_INPUT_BYTES:
        _refuse("INPUT_LIMIT")
    try:
        payload = json.loads(data.decode("utf-8"), object_pairs_hook=_object,
                             parse_constant=_constant)
    except MetricsError:
        raise
    except (ValueError, UnicodeError, RecursionError):
        _refuse("INVALID_JSON")
    return evaluate(payload)


def main():
    if len(sys.argv) != 1:
        print('{"status":"REFUSED","code":"ARGUMENTS"}')
        return 2
    try:
        result = evaluate_json(sys.stdin.buffer.read(MAX_INPUT_BYTES + 1))
        print(json.dumps(result, ensure_ascii=True, allow_nan=False,
                         separators=(",", ":")))
        return 0
    except MetricsError as error:
        print(json.dumps({"status": "REFUSED", "code": str(error)},
                         separators=(",", ":")))
        return 2


if __name__ == "__main__":
    sys.exit(main())
