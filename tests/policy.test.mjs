import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, parseDecision } from '../src/policy.js';

const verdict = { choice: 'low', contextSufficient: true, risky: false };
const input = { original: 'high', supported: ['low', 'medium', 'high', 'xhigh', 'max'], decision: verdict };

test('valid recommendations pass; keep remains a decision, not an effort', () => {
  assert.equal(decide(input).candidate, 'low');
  assert.equal(decide({ ...input, decision: { ...verdict, choice: 'keep' } }).candidate, null);
});

test('max, manual lock, subagents, ambiguous correlation and missing effort stay unchanged', () => {
  for (const change of [{ original: 'max' }, { locked: true }, { subagent: true },
    { ambiguous: true }, { original: undefined }, { original: 10000 }]) {
    assert.equal(decide({ ...input, ...change }).candidate, null);
  }
});

test('risk forbids downgrade, insufficient context forbids all changes', () => {
  assert.equal(decide({ ...input, decision: { ...verdict, risky: true } }).reasonCode, 'risk');
  assert.equal(decide({ ...input, decision: { ...verdict, contextSufficient: false } }).reasonCode, 'context');
  assert.equal(decide({ ...input, original: 'low', decision: { ...verdict, choice: 'high', risky: true } }).candidate, 'high');
});

test('unknown enum, missing or non-boolean evidence and invalid numbers fail closed', () => {
  for (const bad of [null, {}, { ...verdict, choice: 'max' }, { ...verdict, choice: 'run shell' },
    { ...verdict, risky: 'false' }, { ...verdict, contextSufficient: undefined },
    ...[NaN, Infinity, -1, 1.01, '0.9'].map(confidence => ({ ...verdict, confidence }))]) {
    assert.equal(parseDecision(bad), null);
    assert.equal(decide({ ...input, decision: bad }).candidate, null);
  }
});

test('unsupported recommendation is never applied; provider strings do not enter reports', () => {
  assert.equal(decide({ ...input, supported: ['high'] }).reasonCode, 'unsupported');
  assert.deepEqual(parseDecision({ ...verdict, reason: 'SECRET', confidence: 0.8 }), { ...verdict, confidence: 0.8 });
});
