"""P0-08 disabled-only review artifact validator; NOT a runtime permission gate.

This disposable feasibility helper cannot approve, enable or dispatch anything.
It reads supplied bytes only and returns a fixed code; never echoes input data.
"""
from datetime import date
import json

MAX_BYTES = 65_536
# Snapshot coverage from C-01/C-02 and data/workflow §4, plus read-back/metrics.
EXPECTED = {
    'FB-PAGE-PHOTO': 'NEEDS_REVIEW', 'FB-PAGE-ALBUM': 'NEEDS_REVIEW',
    'FB-PAGE-VIDEO': 'NEEDS_REVIEW', 'FB-PAGE-REELS': 'NEEDS_REVIEW',
    'FB-PAGE-STORY': 'DEFERRED',
    'FB-PROFILE-PHOTO': 'DEFERRED', 'FB-PROFILE-VIDEO': 'DEFERRED',
    'FB-PROFILE-REELS': 'DEFERRED',
    'FB-GROUP-PHOTO': 'DEFERRED', 'FB-GROUP-VIDEO': 'DEFERRED',
    'FB-COMMENT-OWN-CONTENT': 'NEEDS_REVIEW', 'FB-COMMENT-ARBITRARY': 'BLOCKED',
    'FB-REACTION': 'DEFERRED', 'FB-SHARE': 'DEFERRED',
    'FB-READBACK': 'NEEDS_REVIEW', 'FB-METRICS': 'NEEDS_REVIEW',
    'OTHER-NETWORKS': 'DEFERRED', 'BULK-FAKE-ENGAGEMENT': 'BLOCKED',
}
SOURCES = frozenset({'S1', 'S2', 'S3', 'S4', 'S5', 'S6'})
REQUIRED_EVIDENCE = frozenset({
    'current_terms_review', 'per_action_permission', 'exact_authorized_scope',
    'physical_profile_certification', 'identity_and_readback', 'safe_recovery',
})


def _unique_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError('duplicate key')
        obj[key] = value
    return obj


def validate_review(payload: bytes) -> str:
    """Consistent means structurally disabled, never authorized or policy-compliant."""
    if type(payload) is not bytes or not payload or len(payload) > MAX_BYTES:
        return 'INVALID_DOCUMENT'
    try:
        document = json.loads(payload.decode('utf-8'), object_pairs_hook=_unique_object)
    except (UnicodeError, ValueError, RecursionError):
        return 'INVALID_DOCUMENT'
    if type(document) is not dict or set(document) != {'review_date', 'kind', 'capabilities'}:
        return 'INVALID_DOCUMENT'
    if document['kind'] != 'DISABLED_REVIEW_ONLY' or type(document['review_date']) is not str:
        return 'INVALID_DOCUMENT'
    try:
        if date.fromisoformat(document['review_date']).isoformat() != document['review_date']:
            return 'INVALID_DOCUMENT'
    except ValueError:
        return 'INVALID_DOCUMENT'
    rows = document['capabilities']
    if type(rows) is not list or len(rows) != len(EXPECTED):
        return 'INCOMPLETE_COVERAGE'
    seen = set()
    for row in rows:
        if type(row) is not dict or set(row) != {
                'id', 'disposition', 'enabled', 'technical_state', 'reason',
                'source_refs', 'required_evidence'}:
            return 'INVALID_ROW'
        key = row['id']
        if type(key) is not str or key not in EXPECTED or key in seen:
            return 'INVALID_COVERAGE'
        seen.add(key)
        if row['enabled'] is not False or row['technical_state'] != 'UNVERIFIED':
            return 'UNSAFE_CLAIM'
        if row['disposition'] != EXPECTED[key]:
            return 'UNREVIEWED_DISPOSITION'
        if type(row['reason']) is not str or not row['reason'].strip() or len(row['reason']) > 1000:
            return 'INVALID_ROW'
        refs = row['source_refs']
        evidence = row['required_evidence']
        if (type(refs) is not list or not refs or any(type(ref) is not str for ref in refs)
                or len(set(refs)) != len(refs) or not set(refs) <= SOURCES):
            return 'INVALID_SOURCE_REFS'
        if (type(evidence) is not list or any(type(item) is not str for item in evidence)
                or len(evidence) != len(REQUIRED_EVIDENCE) or set(evidence) != REQUIRED_EVIDENCE):
            return 'MISSING_EVIDENCE_GATES'
    return 'CONSISTENT_DISABLED_REVIEW'
