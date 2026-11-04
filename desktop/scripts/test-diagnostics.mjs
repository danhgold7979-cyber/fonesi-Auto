// Fixed diagnostic vocabulary only. Never forward TAP labels, YAML, paths or errors.
export function testDiagnostics(stdout, outcome) {
  const lines = [];
  const allowed = ['OK', 'EXIT_NONZERO', 'TIMEOUT', 'CAPTURE_LIMIT', 'SIGNAL', 'SPAWN_FAILED'];
  lines.push(`TEST_PROCESS_${allowed.includes(outcome) ? outcome : 'UNKNOWN'}`);
  if (typeof stdout !== 'string' || stdout.length > 65536) {
    lines.push('TEST_DIAGNOSTIC_INPUT_REJECTED');
    return lines;
  }
  for (const field of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const matches = [...stdout.matchAll(new RegExp(`^# ${field} (.*)$`, 'gm'))];
    if (matches.length === 1 && /^(0|[1-9]\d{0,5})$/.test(matches[0][1]))
      lines.push(`TEST_COUNT_${field.toUpperCase()}_${Number(matches[0][1])}`);
    else lines.push(`TEST_COUNT_${field.toUpperCase()}_UNAVAILABLE`);
  }
  const contexts = [
    ...['WITNESS', 'PREPARE', 'ASSERTIONS', 'REPEAT_DENIAL', 'CLEANUP'].map(
      (value) => `TEST_CONTEXT_RESTORE_${value}`,
    ),
    ...[
      'RESTORE_OWNER',
      'RESTORE_PROVENANCE',
      'RESTORE_SOURCE',
      'RESTORE_CHECKPOINT',
      'BUILD_UNVERIFIED',
      'PERSISTENCE_FILES_REJECTED',
      'KEY_PROFILE_ID_REJECTED',
      'KEY_PROFILE_MATERIAL_REJECTED',
      'KEY_PROFILE_CHECKPOINT_FAILED',
      'ENOENT',
      'EACCES',
      'EPERM',
      'EBUSY',
      'ENAMETOOLONG',
      'ERR_ASSERTION',
      'UNKNOWN',
    ].map((value) => `TEST_CONTEXT_CODE_${value}`),
  ];
  const observed = new Set(stdout.split('\n'));
  for (const context of contexts) if (observed.has(`# ${context}`)) lines.push(context);
  const ordinals = new Set();
  for (const match of stdout.matchAll(/^not ok ([1-9]\d{0,3})(?: - |$)/gm)) {
    const ordinal = Number(match[1]);
    if (ordinal <= 4096) ordinals.add(ordinal);
    if (ordinals.size === 16) break;
  }
  for (const ordinal of ordinals) lines.push(`TEST_FAILURE_ORDINAL_${ordinal}`);
  if (!ordinals.size) lines.push('TEST_FAILURE_ORDINAL_UNAVAILABLE');
  return lines;
}
