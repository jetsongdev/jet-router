import { CHOICES, unit } from '../policy.js';

const ERRORS = ['missing-key', 'invalid-input', 'redirect', 'http-error', 'timeout', 'response-too-large', 'invalid-response', 'provider-error'];

// No raw stdout, stderr, exception, key or prompt is returned to the router.
export function parseHelperResult(result) {
  if (result?.exitCode !== 0 || typeof result.stdout !== 'string' || result.stdout.length > 2048) return { reason: 'provider-error' };
  let body;
  try { body = JSON.parse(result.stdout); } catch { return { reason: 'invalid-response' }; }
  if (body?.ok === false && ERRORS.includes(body.reason)) return { reason: body.reason };
  const d = body?.decision;
  if (body?.ok !== true || d?.provider !== 'jev' || !CHOICES.includes(d.choice) ||
      !unit(d.confidence) || !unit(d.contextScore) || !unit(d.riskScore)) return { reason: 'invalid-response' };
  return { decision: { provider: 'jev', choice: d.choice, confidence: d.confidence,
    contextScore: d.contextScore, riskScore: d.riskScore } };
}

