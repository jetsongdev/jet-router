import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShadowRaise } from '../lib/shadow-raise.mjs';
const assistant = (id, content = []) => ({ type: 'assistant', parent_tool_use_id: null, message: { id, content } });
const tool = (id, name, input) => ({ type: 'tool_use', id, name, input });
const result = (id, is_error) => ({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error }] } });
test('step boundaries and duplicate IDs', () => {
  for (const n of [7, 8, 9]) { const s = createShadowRaise(); for (let i = 0; i < n; i++) s.observe(assistant(String(i))); s.observe(assistant('0')); const r = s.result(); assert.equal(r.observedSteps, n); assert.equal(r.status, n >= 8 ? 'triggered' : 'not_triggered'); assert.equal(r.atStep, n >= 8 ? 8 : null); }
});
test('failure streak boundaries, reset and test-only matching', () => {
  for (const n of [1, 2, 3, 4]) {
    const s = createShadowRaise();
    for (let i = 0; i < n; i++) { s.observe(assistant(String(i), [tool(String(i), 'Bash', { command: 'npm test' })])); s.observe(result(String(i), true)); }
    const r = s.result(); assert.equal(r.maxConsecutiveToolFailures, n); assert.equal(r.maxConsecutiveTestFailures, n); assert.equal(r.status, n >= 2 ? 'triggered' : 'not_triggered');
  }
  const s = createShadowRaise();
  for (const [i, err] of [true, false, true].entries()) { s.observe(assistant(String(i), [tool(String(i), 'Bash', { command: 'pytest' })])); s.observe(result(String(i), err)); }
  assert.equal(s.result().maxConsecutiveToolFailures, 1); assert.equal(s.result().maxConsecutiveTestFailures, 1);
});
test('edit boundaries and no raw paths or commands', () => {
  for (const n of [3, 4, 5]) { const s = createShadowRaise(); for (let i = 0; i < n; i++) s.observe(assistant(String(i), [tool(String(i), 'Edit', { file_path: '/private/canary' })])); const r = s.result(); assert.equal(r.maxSameFileEdits, n); assert.equal(r.status, n >= 4 ? 'triggered' : 'not_triggered'); assert.ok(!JSON.stringify(r).includes('canary')); }
  const s = createShadowRaise(); assert.equal(s.result().observedSteps, null); assert.equal(s.result().maxConsecutiveToolFailures, null);
});
test('tool-only threshold and successful non-test reset', () => {
 for (const n of [2, 3, 4]) { const s = createShadowRaise(); for (let i = 0; i < n; i++) { s.observe(assistant(String(i), [tool(String(i), 'Read', {file_path:'x'})])); s.observe(result(String(i), true)); } const r=s.result(); assert.equal(r.maxConsecutiveToolFailures,n); assert.equal(r.maxConsecutiveTestFailures,null); assert.equal(r.status,n >= 3 ? 'triggered' : 'not_triggered'); }
 const s=createShadowRaise(); for (const [i, err] of [true,true,false,true].entries()) {s.observe(assistant(String(i),[tool(String(i),'Read',{file_path:'x'})]));s.observe(result(String(i),err));} assert.equal(s.result().maxConsecutiveToolFailures,2);
});

test('v0b counts nonzero hints for test failures while v0 stays unchanged', () => {
 const v0=createShadowRaise(), v0b=createShadowRaise({rule:'v0b'});
 for (let i=0;i<2;i++) { const events=[assistant(String(i),[tool(String(i),'Bash',{command:'npm test'})]),{type:'user',message:{content:[{type:'tool_result',tool_use_id:String(i),is_error:false,content:'Process exited with code 2'}]}}]; for (const event of events) {v0.observe(event);v0b.observe(event);} }
 assert.equal(v0.result().maxConsecutiveTestFailures,0); assert.equal(v0b.result().maxConsecutiveTestFailures,2); assert.equal(v0b.result().maxConsecutiveToolFailures,0); assert.deepEqual(v0b.result().reasons,['test_failures']); assert.equal(v0b.result().rule,'v0b');
});
