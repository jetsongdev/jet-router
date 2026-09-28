import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summary, status } from '../src/report.js';

const record = { original: 'high', forwarded: 'high', recommendation: 'low', reasonCode: 'shadow', latencyMs: 12 };

test('summary separates recommendation from unchanged effort and labels the fixture', () => {
  assert.equal(summary(record, 'answer'), '[jet-router] fake.shadow(): high → low(고정값) · 12ms');
  assert.equal(summary({ ...record, recommendation: 'keep' }), '[jet-router] fake.shadow(): high 유지(고정값) · 12ms');
  assert.equal(summary({ ...record, forwarded: 'medium' }), '[jet-router] fake.shadow(): high → low(고정값) · 12ms · 마지막 요청 medium');
});

test('missing recommendations and skipped classification never look like successful recommendations', () => {
  assert.match(summary({ ...record, recommendation: 'keep', reasonCode: 'context' }), /fake\.shadow\(\): high 유지\(고정값\)/);
  assert.equal(summary({ ...record, reasonCode: 'timeout' }), '[jet-router] fake 생략: 시간 초과 · shadow');
  assert.match(summary({ ...record, reasonCode: 'provider-error' }), /fake 생략: 분류 실패 · shadow/);
  const skipped = summary({ ...record, original: 'max', forwarded: 'max', reasonCode: 'max', latencyMs: null });
  assert.equal(skipped, '[jet-router] fake 생략: max 보호 · shadow');
  assert.ok(!skipped.includes('ms'));
  const unsupported = summary({ ...record, original: 'unsupported', forwarded: 'unsupported', reasonCode: 'unsupported', latencyMs: null });
  assert.equal(unsupported, '[jet-router] fake 생략: effort 미지원 · shadow');
  assert.ok(!unsupported.includes('unsupported'));
});

test('status explains current mode and keeps the previous result explicitly historical', () => {
  const text = status('off', true, summary(record));
  assert.match(text, /꺼짐\(off\)/);
  assert.match(text, /수동 잠금: 켜짐/);
  assert.match(text, /최근 완료: \[jet-router\] fake\.shadow\(\)/);
  assert.match(text, /외부 전송: 없음/);
  assert.match(status('shadow', false), /최근 완료: 없음/);
});

test('Jev status distinguishes consent from activity and marks recommendations unevaluated', () => {
  assert.match(status('shadow', false, undefined, 'jev', false), /차단\(미동의\)/);
  assert.match(status('off', false, undefined, 'jev', true), /중지\(동의됨\)/);
  assert.match(status('shadow', true, undefined, 'jev', true), /중지\(동의됨\)/);
  assert.match(status('shadow', false, undefined, 'jev', true), /허용\(분류 대상 입력\)/);
  assert.equal(summary({ ...record, provider: 'jev', reasonCode: 'unevaluated' }), '[jet-router] Jev.shadow(): high → low · 12ms');
  assert.equal(summary({ ...record, provider: 'jev', reasonCode: 'unevaluated', probability: 0.704 }), '[jet-router] Jev.shadow(): high → low (70%) · 12ms');
  assert.equal(summary({ ...record, provider: 'jev', recommendation: 'keep', reasonCode: 'unevaluated', probability: 0.66 }), '[jet-router] Jev.shadow(): high 유지 (66%) · 12ms');
  assert.equal(summary({ ...record, mode: 'enforce', provider: 'jev', reasonCode: 'unevaluated', applied: 'low', probability: 0.71 }), '[jet-router] Jev.enforce(): high → low 적용 (71%) · 12ms');
  assert.equal(summary({ ...record, mode: 'enforce', provider: 'jev', reasonCode: 'timeout', latencyMs: null }), '[jet-router] Jev 생략: 시간 초과 · enforce');
  assert.equal(summary({ ...record, provider: 'jev', reasonCode: 'no-consent', latencyMs: null }), '[jet-router] Jev 생략: 전송 미동의 · shadow');
  assert.equal(summary({ ...record, provider: 'jev', reasonCode: 'correlation', latencyMs: null }, 'aborted'), '[jet-router] Jev 생략: 요청 연결 불확실 · shadow · 중단');
  assert.equal(summary({ ...record, provider: 'jev', reasonCode: 'command', latencyMs: null }), '[jet-router] Jev 생략: 스킬·명령 입력 · shadow');
});
