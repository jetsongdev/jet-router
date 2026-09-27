import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summary, status } from '../src/report.js';

const record = { original: 'high', forwarded: 'high', recommendation: 'low', reasonCode: 'shadow', latencyMs: 12 };

test('summary separates recommendation from unchanged effort and labels the fixture', () => {
  assert.equal(summary(record, 'answer'), '[jet-router] 관찰 · fake(테스트) · high 유지 · 추천 low · 분류 12ms');
  assert.match(summary({ ...record, recommendation: 'keep' }), /추천 유지/);
  assert.match(summary({ ...record, forwarded: 'medium' }), /시작 high → 마지막 요청 medium/);
});

test('missing recommendations and skipped classification never look like successful recommendations', () => {
  assert.match(summary({ ...record, reasonCode: 'context' }), /추천 보류\(맥락 부족\)/);
  assert.match(summary({ ...record, reasonCode: 'timeout' }), /추천 없음\(시간 초과\)/);
  assert.match(summary({ ...record, reasonCode: 'provider-error' }), /추천 없음\(분류 실패\)/);
  const skipped = summary({ ...record, original: 'max', forwarded: 'max', reasonCode: 'max', latencyMs: null });
  assert.match(skipped, /분류 생략\(max 보호\)/);
  assert.ok(!skipped.includes('ms'));
  const unsupported = summary({ ...record, original: 'unsupported', forwarded: 'unsupported', reasonCode: 'unsupported', latencyMs: null });
  assert.match(unsupported, /effort 확인 불가/);
  assert.ok(!unsupported.includes('unsupported'));
});

test('status explains current mode and keeps the previous result explicitly historical', () => {
  const text = status('off', true, summary(record));
  assert.match(text, /꺼짐\(off\)/);
  assert.match(text, /수동 잠금: 켜짐/);
  assert.match(text, /최근 완료: \[jet-router\] 관찰/);
  assert.match(text, /외부 전송: 없음/);
  assert.match(status('shadow', false), /최근 완료: 없음/);
});
