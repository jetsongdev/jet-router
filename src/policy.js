export const EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
export const CHOICES = Object.freeze(['low', 'medium', 'high', 'xhigh', 'keep']);

export function unit(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function parseDecision(value) {
  if (!value || !CHOICES.includes(value.choice) || typeof value.contextSufficient !== 'boolean' ||
      typeof value.risky !== 'boolean' || (value.confidence !== undefined && !unit(value.confidence))) return null;
  return { choice: value.choice, contextSufficient: value.contextSufficient, risky: value.risky,
    ...(value.confidence === undefined ? {} : { confidence: value.confidence }) };
}

// A candidate is NOT an authorized application. Provider-specific thresholds and
// enforce remain gated on evaluation; this function supplies structural guards.
export function decide({ original, supported, decision, locked, subagent, ambiguous }) {
  const keep = reasonCode => ({ candidate: null, reasonCode });
  if (subagent) return keep('subagent');
  if (locked) return keep('locked');
  if (original === 'max') return keep('max');
  if (!EFFORTS.includes(original) || !supported.includes(original)) return keep('unsupported');
  if (ambiguous) return keep('correlation');
  const parsed = parseDecision(decision);
  if (!parsed) return keep('invalid-response');
  if (!parsed.contextSufficient) return keep('context');
  if (parsed.choice === 'keep') return keep('keep');
  if (!supported.includes(parsed.choice)) return keep('unsupported');
  if (parsed.risky && EFFORTS.indexOf(parsed.choice) < EFFORTS.indexOf(original)) return keep('risk');
  return { candidate: parsed.choice, reasonCode: 'candidate-only' };
}
