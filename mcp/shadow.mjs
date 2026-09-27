import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EFFORTS } from '../src/policy.js';
import { PROCESS_ENV, PROCESS_TIMEOUT_MS, HELPER_OUTPUT_LIMIT, parseHelperResult, validJevKey } from '../src/providers/jev.js';

const helper = fileURLToPath(new URL('../scripts/jev-request.mjs', import.meta.url));

// Reuse the Claude helper and its strict transport; secrets travel over stdin.
export function classifyJev(state, apiKey) {
  return new Promise(resolve => {
    const child = execFile(process.execPath, [helper], {
      env: PROCESS_ENV, timeout: PROCESS_TIMEOUT_MS, maxBuffer: HELPER_OUTPUT_LIMIT,
      killSignal: 'SIGKILL',
    }, (error, stdout) => resolve(parseHelperResult({ exitCode: error ? 1 : 0, stdout })));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ state, apiKey }));
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
const message = detail => result(`[jet-router] shadow · ${detail} · 실제 effort 미확인·변경 없음`);

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
    busy = true;
    try {
      const classified = await classify({ userPrompt: input.prompt, currentEffort: config.referenceEffort }, config.apiKey);
      // Revalidate injected/provider output and whitelist every displayed value.
      const checked = parseHelperResult({ exitCode: 0, stdout: JSON.stringify(classified?.decision
        ? { ok: true, decision: classified.decision } : { ok: false, reason: classified?.reason }) });
      if (!checked.decision) return message(`Jev 생략: ${checked.reason}`);
      return message(`Jev · 참고 ${config.referenceEffort}(사용자 지정) · 추천 ${checked.decision.choice}(미평가)`);
    } catch {
      return message('Jev 생략: provider-error');
    } finally {
      busy = false;
    }
  };
}
