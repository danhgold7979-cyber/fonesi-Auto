# ADR-0002 — Manual emergency preview protection

Status: ACCEPTED for default/consent behavior only. Date: 2026-10-30. Authority: user accepted the stated recommendation (DEC-019). Resource thresholds, supported ranges and recovery profile still require measured approval.

## Decision
Manual emergency protection defaults OFF. A high-load warning does not silently change requested stream settings. Only explicit opt-in authorizes automatic preview reduction/pause. Keep requested/effective/recommended values separate; never change ADB input ownership or cancel workflows merely to preserve preview quality.

Auto mode adapts within capability-derived limits. Reject unsupported requests explicitly. Hardware failure can stop a stream, but it is reported as failure/unavailable, not a policy change or a successful setting application.

## Alternatives and reason
Default-on protection risks unexpected manual overrides. Unconditional preview quality guarantees are impossible without host/device evidence. Opt-in protection plus visible warnings preserves user control while offering bounded degradation.

## Required verification
Manual/OFF under critical simulated pressure retains requested policy; Manual/ON only reduces eligible previews and records cause/time/effective values. Focus priority, stale/unknown sensors, opt-out during throttle, unsupported profile, hysteresis and recovery are tested. No test may infer absent GPU telemetry equals zero. Numeric pass budgets come from the signed benchmark profile, not this decision.

## Scope and rollback
Persists an explicit preference with auditable revision. Restoration follows the separately configured recovery preference; do not silently enable it. Revert a policy implementation through migration-tested config changes without discarding user preferences.

Trace: G0-18; Phase 3; [DEC-019](../08_DECISIONS_AND_OPEN_ITEMS.md#dec-019--manual-emergency-throttle-default); [resource specification](../12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md).
