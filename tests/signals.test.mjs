import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reworkSignal, effortDirection } from '../src/signals.js';

test('rework recognizes short requests while ignoring quotes and code', () => {
  for (const text of ['다시 해줘', '안 돼', '안됨', '틀린 결과', '아직 그대로야', '오류가 나', '왜 안 되지',
    'still broken', "doesn't work", 'does not work', 'not working', 'wrong', 'try again', 'redo', "that's not right"]) {
    assert.equal(reworkSignal(text), 'yes', text);
  }
  for (const text of ['새 기능을 만들어줘', '다시는 안 쓴다는 문구를 넣어줘', '> 다시 해줘\n새 기능', '```\nwrong\n```\n새 기능', '다시 ' + 'a'.repeat(300)]) {
    assert.equal(reworkSignal(text), 'no', text);
  }
  assert.equal(reworkSignal('  '), 'unknown');
  assert.equal(reworkSignal('```\nwrong\n``` 다시'), 'yes');
});

test('effort direction requires two supported values', () => {
  for (const [a, b, expected] of [['low', 'high', 'up'], ['high', 'medium', 'down'], ['max', 'max', 'same'],
    ['unsupported', 'high', 'unknown'], ['high', 'other', 'unknown']]) assert.equal(effortDirection(a, b), expected);
});
