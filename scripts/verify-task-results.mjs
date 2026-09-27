// Offline audit: never invokes Codex or Jev and does not read credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tasks} from '../eval/task-quality/tasks.mjs';
import {gradeCode,taskPrompt} from './run-task-quality.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
try {
 const root=process.argv[2];if(!root)throw new Error('path');
 const names=['medium','current','01','02','03','holdout-medium','holdout-current'];
 const sessions=new Set();let checked=0;
 const graderHash=hash(readFileSync(new URL('../eval/task-quality/grade.mjs',import.meta.url)));
 for(const name of names){
  const report=JSON.parse(readFileSync(join(root,`${name}-run/report.json`),'utf8'));
  assert.equal(report.complete,true);assert.equal(report.graderSha256,graderHash);
  const selected=tasks.filter(t=>t.split===report.config.split);
  assert.equal(report.taskSha256,hash(JSON.stringify(selected)));
  assert.equal(report.results.length,selected.length*report.config.rounds);
  const ids=new Set();
  for(const row of report.results){
   assert.ok(Number.isInteger(row.round)&&row.round>=0&&row.round<report.config.rounds);
   assert.ok(!ids.has(`${row.round}:${row.task}`));ids.add(`${row.round}:${row.task}`);
   assert.ok(row.threadId&&!sessions.has(row.threadId));sessions.add(row.threadId);
   assert.equal(row.usedTools,false);assert.equal(row.model,'gpt-6-astra');
   assert.equal(row.requestedEffort,report.config.efforts[row.task]);
   const task=selected.find(t=>t.id===row.task);assert.ok(task);
   assert.equal(row.promptSha256,hash(taskPrompt(task)));assert.equal(row.codeSha256,hash(row.code));
   assert.deepEqual(gradeCode(row.task,row.code),row.grade);assert.equal(row.passed,row.grade.passed);checked++;
  }
  assert.equal(report.successes,report.results.filter(r=>r.passed).length);
 }
 console.log(JSON.stringify({verified:true,taskRuns:checked,uniqueSessions:sessions.size,liveCalls:0}));
}catch{console.error('task-result-verification-failed');process.exitCode=1;}
