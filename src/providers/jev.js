import { RESPONSE_ERRORS } from './jev-contract.js';
import { CHOICES, unit } from '../policy.js';

// Shared process contract for the hook, helper and development evaluator.
export const PROCESS_TIMEOUT_MS = 4000;
export const HELPER_OUTPUT_LIMIT = 2048;
export const PROCESS_ENV = Object.freeze({
  NODE_OPTIONS: '', NODE_DEBUG: '', NODE_DEBUG_NATIVE: '', SSLKEYLOGFILE: '',
  NODE_TLS_REJECT_UNAUTHORIZED: '1', NODE_USE_ENV_PROXY: '0',
});

export function validJevKey(value) {
  return typeof value === 'string' && /^[\x21-\x7e]{1,4096}$/.test(value);
}

const ERRORS = ['missing-key', 'invalid-input', 'redirect', 'http-error', 'timeout', 'response-too-large', 'invalid-response', 'provider-error'];

// No raw stdout, stderr, exception, key or prompt is returned to the router.
export function parseHelperResult(result, choices = CHOICES) {
  if (result?.exitCode !== 0 || typeof result.stdout !== 'string' || result.stdout.length > HELPER_OUTPUT_LIMIT) return { reason: 'provider-error' };
  let body;
  try { body = JSON.parse(result.stdout); } catch { return { reason: 'invalid-response' }; }
  return parseHelperBody(body, choices);
}

// Object validation is shared with MCP; process status/size/JSON checks stay above.
export function parseHelperBody(body, choices = CHOICES) {
  if (body?.ok === false && ERRORS.includes(body.reason)) return {
    reason: body.reason,
    ...(body.reason === 'invalid-response' && RESPONSE_ERRORS.includes(body.diagnostic) ? { diagnostic: body.diagnostic } : {}),
  };
  const d = body?.decision;
  if (body?.ok !== true || d?.provider !== 'jev' || !CHOICES.includes(d.choice) || !choices.includes(d.choice) ||
      !unit(d.confidence) || !unit(d.contextScore) || !unit(d.riskScore)) return { reason: 'invalid-response' };
  return { decision: { provider: 'jev', choice: d.choice, confidence: d.confidence,
    contextScore: d.contextScore, riskScore: d.riskScore },
    ...(body.warning === 'probability-sum-tolerance' ? { warning: body.warning } : {}) };
}

