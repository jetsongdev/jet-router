import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareRoutingRequest } from '../src/harness.js';
import { EFFORTS } from '../src/policy.js';
import { PROCESS_ENV, PROCESS_TIMEOUT_MS, HELPER_OUTPUT_LIMIT, parseHelperResult, parseHelperBody, validJevKey } from '../src/providers/jev.js';

const helper = fileURLToPath(new URL('../scripts/jev-request.mjs', import.meta.url));

// Reuse the Claude helper and its strict transport; secrets travel over stdin.
export function classifyJev(routingInput, apiKey) {
  return new Promise(resolve => {
    const child = execFile(process.execPath, [helper], {
      env: PROCESS_ENV, timeout: PROCESS_TIMEOUT_MS, maxBuffer: HELPER_OUTPUT_LIMIT,
      killSignal: 'SIGKILL',
    }, (error, stdout) => resolve(parseHelperResult({ exitCode: error ? 1 : 0, stdout })));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ routingInput, apiKey }));
  });
}

export function readConfig(env) {
  return Object.freeze({
    mode: env.JET_ROUTER_MODE ?? 'off',
    provider: env.JET_ROUTER_PROVIDER ?? 'fake',
    consent: env.JET_ROUTER_CLOUD_CONSENT === 'true',
    referenceEffort: env.JET_ROUTER_REFERENCE_EFFORT,
    apiKey: env.TYPESAFE_API_KEY,
  });
}

const result = systemMessage => ({ continue: true, ...(systemMessage ? { systemMessage } : {}) });
const message = detail => result(`[jet-router] ${detail} · shadow`);

// One MCP process owns a bounded set of event ids, never prompt text or results.
// Ids are supplied by the host; this is duplicate suppression, not authentication.
export function createShadow(config, classify = classifyJev) {
  const seen = new Set();
  let busy = false;
  return async input => {
    if (config.mode === 'off') return result();
    if (config.mode !== 'shadow') return message('생략: mode는 off/shadow만 지원');
    if (!input || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 6000 ||
        ![input.session_id, input.turn_id].every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id))) {
      return message('생략: 입력 또는 이벤트 식별자 오류');
    }
    const key = `${input.session_id}:${input.turn_id}`;
    if (seen.has(key)) return result();
    seen.add(key);
    if (seen.size > 256) seen.delete(seen.values().next().value);
    if (config.provider === 'fake') return message('fake(테스트) · 추천 keep(고정값)');
    if (config.provider !== 'jev') return message('생략: provider 설정 오류');
    if (!config.consent) return message('Jev 생략: 전송 미동의');
    if (!validJevKey(config.apiKey)) return message('Jev 생략: API 키 누락 또는 형식 오류');
    if (!EFFORTS.includes(config.referenceEffort)) return message('Jev 생략: 참고 effort 설정 필요');
    if (config.referenceEffort === 'max') return message('Jev 생략: 참고 effort max 보호');
    if (busy) return message('Jev 생략: 이전 분류 진행 중');
    const routingInput = {
      host: 'codex', prompt: input.prompt, cloudConsent: config.consent,
      target: { model: null, source: 'unknown', supportedEfforts: null },
      effort: { value: config.referenceEffort, source: 'user-reference' },
      event: { sessionId: input.session_id, turnId: input.turn_id, correlated: true },
      context: { source: 'prompt-only', missingRequired: null },
    };
    const prepared = prepareRoutingRequest(routingInput);
    if (prepared.status !== 'ready') return message('Jev 생략: invalid-input');
    busy = true;
    try {
      const classified = await classify(routingInput, config.apiKey);
      // Revalidate injected/provider output and whitelist every displayed value.
      const checked = parseHelperBody(classified?.decision
        ? { ok: true, decision: classified.decision } : { ok: false, reason: classified?.reason, diagnostic: classified?.diagnostic }, prepared.choices);
      if (!checked.decision) return message(`Jev 생략: ${checked.reason}${checked.diagnostic ? `/${checked.diagnostic}` : ''}`);
      return result(`[jet-router] Jev.shadow(): ${config.referenceEffort} → ${checked.decision.choice}`);
    } catch {
      return message('Jev 생략: provider-error');
    } finally {
      busy = false;
    }
  };
}
