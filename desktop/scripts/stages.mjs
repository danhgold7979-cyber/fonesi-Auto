// Development sequencing primitive: failure or throw stops before any later stage.
export function runStages(stages) {
  for (const [name, run] of stages) {
    try {
      if (!run()) return { ok: false, stage: name };
    } catch {
      return { ok: false, stage: name };
    }
  }
  return { ok: true, stage: 'COMPLETE' };
}
