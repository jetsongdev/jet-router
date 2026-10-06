import { cases as smoke } from './jev-smoke.mjs';

// Freeze before live evaluation. Labels are review hypotheses, not task-quality proof.
export const cases = smoke.filter(item => ['format-en', 'implementation', 'known-fix',
  'production-risk', 'risk-explanation', 'missing-context', 'classifier-injection', 'long-context'].includes(item.id));
cases.unshift({ id: 'literal-typo', currentEffort: 'medium', expected: ['low'],
  userPrompt: '아래 함수의 문자열 Helllo만 Hello로 고쳐줘. 다른 것은 변경하지 말고 코드만 출력해줘. 파일과 도구는 사용하지 마.\nfunction greeting(name) { return `Helllo, ${name}!`; }' });
cases.push({ id: 'limiter', currentEffort: 'medium', expected: ['high', 'xhigh'],
  userPrompt: '아래 limiter는 작업 실패 시 다음 작업이 멈춘다. 동기 throw와 Promise reject 모두 원래 오류를 전달하고, 동시 실행 수 1과 실패 후 큐 진행을 검증하는 node:test를 작성해줘. sleep 대신 제어 가능한 Promise를 사용하고 외부 라이브러리는 쓰지 마.\nexport function createLimiter() { let active = false; const queue = []; async function drain() { if (active || queue.length === 0) return; active = true; const { task, resolve, reject } = queue.shift(); try { resolve(await task()); } catch (error) { reject(error); return; } active = false; drain(); } return task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); void drain(); }); }' });

export const supported = ['low', 'medium', 'high', 'xhigh'];
export function routingInput(item) {
  return { host: 'codex', prompt: item.userPrompt, cloudConsent: true,
    target: { model: 'gpt-6-astra', source: 'host', supportedEfforts: supported },
    effort: { value: item.currentEffort, source: 'host' },
    event: { sessionId: 'policy-evaluation', turnId: item.id, correlated: true },
    context: { source: 'prompt-only', missingRequired: null } };
}
