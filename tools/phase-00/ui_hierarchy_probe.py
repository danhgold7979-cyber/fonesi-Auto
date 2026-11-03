"""Disposable P0-04 offline selector experiment. Never dispatches device input.

Inputs stay in memory; results contain only fixed states and aggregate counts.
A unique match is NOT action authorization or a deployment/identity certificate.
"""
from dataclasses import dataclass
import re
from xml.etree import ElementTree

# Offline resource ceilings, not calibrated production/device limits.
MAX_BYTES = 1_048_576
MAX_NODES = 10_000
MAX_DEPTH = 128
FIELDS = frozenset({'resource-id', 'content-desc', 'text', 'class', 'package'})
BOUNDS = re.compile(r'\[([0-9]{1,10}),([0-9]{1,10})\]\[([0-9]{1,10}),([0-9]{1,10})\]')


# XML declaration is checked explicitly before the Unicode parser can ignore it.
# This intentionally accepts a strict XML 1.0 / UTF-8 subset, not arbitrary XML.
DECLARATION = re.compile(
    r"""<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?P<vq>['"])1\.0(?P=vq)
    (?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?P<eq>['"])(?i:UTF-8)(?P=eq))?
    (?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(?P<sq>['"])(?:yes|no)(?P=sq))?
    [ \t\r\n]*\?>""", re.VERBOSE)


@dataclass(frozen=True)
class CaptureContext:
    device_ref: str
    generation: int
    display_revision: int
    captured_ms: int
    width: int
    height: int
    rotation: int


@dataclass(frozen=True)
class ProbeResult:
    state: str
    node_count: int = 0
    match_count: int = 0


def _integer(value: object, minimum: int = 0) -> bool:
    return type(value) is int and value >= minimum


def _context_valid(context: object) -> bool:
    return (
        isinstance(context, CaptureContext)
        and isinstance(context.device_ref, str)
        and bool(context.device_ref.strip())
        and _integer(context.generation)
        and _integer(context.display_revision)
        and _integer(context.captured_ms)
        and _integer(context.width, 1)
        and _integer(context.height, 1)
        and type(context.rotation) is int
        and context.rotation in (0, 1, 2, 3)
    )


def inspect_hierarchy(xml: bytes, selector: dict[str, str],
                      capture: CaptureContext, current: CaptureContext,
                      *, max_age_ms: int) -> ProbeResult:
    """Exact AND selectors, fail closed, no fallback or raw-value diagnostics.

    Caller must supply its approved freshness budget; this spike chooses none.
    current.captured_ms is the evaluation timestamp. Both clocks must share a
    trusted basis; supplied metadata cannot establish its own authenticity.
    """
    if not (_context_valid(capture) and _context_valid(current)
            and _integer(max_age_ms)):
        return ProbeResult('INVALID_CONTEXT')
    if (capture.device_ref, capture.generation, capture.display_revision,
        capture.width, capture.height, capture.rotation) != (
            current.device_ref, current.generation, current.display_revision,
            current.width, current.height, current.rotation):
        return ProbeResult('CONTEXT_MISMATCH')
    age = current.captured_ms - capture.captured_ms
    if age < 0 or age > max_age_ms:
        return ProbeResult('STALE_CAPTURE')
    if (type(selector) is not dict or not selector
            or any(key not in FIELDS or not isinstance(value, str)
                   or not value.strip() for key, value in selector.items())):
        return ProbeResult('INVALID_SELECTOR')
    # A class/package-only query is too broad; no coordinates-only lookup.
    if not ({'resource-id', 'content-desc', 'text'} & selector.keys()):
        return ProbeResult('INVALID_SELECTOR')
    if type(xml) is not bytes or not xml or len(xml) > MAX_BYTES:
        return ProbeResult('INVALID_XML')
    try:
        source = xml.decode('utf-8-sig')
        remainder = source
        if source.startswith('<?xml'):
            declaration = DECLARATION.match(source)
            if declaration is None:
                return ProbeResult('INVALID_XML')
            remainder = source[declaration.end():]
        # Strict UTF-8 input; no DTD/entity declarations, comments, CDATA or PIs.
        if '\x00' in source or '<!' in source or '<?' in remainder:
            return ProbeResult('UNSAFE_XML')
        root = ElementTree.fromstring(source)
    except (UnicodeError, ElementTree.ParseError, ValueError):
        return ProbeResult('INVALID_XML')
    if root.tag != 'hierarchy' or root.attrib.get('rotation') != str(capture.rotation):
        return ProbeResult('INVALID_HIERARCHY')
    pending = [(root, 0)]
    nodes = []
    while pending:
        element, depth = pending.pop()
        if depth > MAX_DEPTH:
            return ProbeResult('LIMIT_EXCEEDED')
        if element is not root:
            if element.tag != 'node':
                return ProbeResult('INVALID_HIERARCHY')
            nodes.append(element)
            if len(nodes) > MAX_NODES:
                return ProbeResult('LIMIT_EXCEEDED')
        if (element.text and element.text.strip()) or (element.tail and element.tail.strip()):
            return ProbeResult('INVALID_HIERARCHY')
        pending.extend((child, depth + 1) for child in element)
    if not nodes:
        return ProbeResult('EMPTY_HIERARCHY')
    matches = [node for node in nodes
               if all(node.attrib.get(key) == value for key, value in selector.items())]
    if not matches:
        return ProbeResult('NO_MATCH', len(nodes))
    if len(matches) != 1:
        return ProbeResult('AMBIGUOUS', len(nodes), len(matches))
    node = matches[0]
    # Unknown/false enabled state and password nodes cannot be candidates.
    if node.attrib.get('enabled') != 'true' or node.attrib.get('password') != 'false':
        return ProbeResult('INELIGIBLE_NODE', len(nodes), 1)
    bounds = BOUNDS.fullmatch(node.attrib.get('bounds', ''))
    if bounds is None:
        return ProbeResult('INVALID_BOUNDS', len(nodes), 1)
    left, top, right, bottom = map(int, bounds.groups())
    if not (0 <= left < right <= capture.width and 0 <= top < bottom <= capture.height):
        return ProbeResult('INVALID_BOUNDS', len(nodes), 1)
    return ProbeResult('UNIQUE_CANDIDATE', len(nodes), 1)
