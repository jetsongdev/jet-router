import { prepareRoutingRequest } from '../src/harness.js';
import { decide } from '../src/policy.js';
import { parseHelperBody, validJevKey, PROCESS_TIMEOUT_MS } from '../src/providers/jev.js';
import { classifyJev } from '../mcp/shadow.mjs';

const MODELS = new Set(['gpt-6-astra', 'gpt-6-sol']);

export function createRouter(config, classify = classifyJev) {
  return async ({ params, model, effort, supported, requestId, signal }) => {
    if (config.mode !== 'enforce' || !config.consent || !validJevKey(config.apiKey) ||
        !MODELS.has(model) || !supported?.includes(effort) || effort === 'max' ||
        !params.input?.length || params.input.some(item => item.type !== 'text') || signal.aborted) return null;
    const input = {
      host: 'codex', prompt: params.input.map(item => item.text).join('\n'), cloudConsent: true,
      target: { model, source: 'host', supportedEfforts: supported },
      effort: { value: effort, source: 'host' },
      // Before turn/start the host has no turn ID. Use the correlated request ID,
      // never claim this locally generated identifier is a host turn ID.
      event: { sessionId: params.threadId, turnId: `request-${requestId}`, correlated: true },
      context: { source: 'prompt-only', missingRequired: null },
    };
    const prepared = prepareRoutingRequest(input);
    if (prepared.status !== 'ready') return null;
    const deadline = new AbortController();
    const combined = AbortSignal.any([signal, deadline.signal]);
    let timer, onAbort;
    const aborted = new Promise(resolve => { onAbort = () => resolve(null); combined.addEventListener('abort', onAbort, { once: true }); });
    try {
      timer = setTimeout(() => deadline.abort(), config.timeoutMs ?? PROCESS_TIMEOUT_MS);
      const result = await Promise.race([classify(input, config.apiKey, combined), aborted]);
      if (combined.aborted) return null;
      const decision = parseHelperBody({ ok: true, decision: result?.decision }, prepared.choices).decision;
      if (!decision) return null;
      // Experimental structural guards, not a calibrated quality guarantee.
      const outcome = decide({ original: effort, supported,
        decision: { choice: decision.choice, contextSufficient: decision.contextScore >= .5,
          risky: decision.riskScore >= .5, confidence: decision.confidence } });
      return outcome.candidate && outcome.candidate !== effort ? outcome.candidate : null;
    } catch { return null; }
    finally { clearTimeout(timer); combined.removeEventListener('abort', onAbort); }
  };
}
