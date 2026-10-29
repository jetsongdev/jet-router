import test from 'node:test';
import assert from 'node:assert/strict';

const slugs = ['heading-index','grid-neighbors','front-matter-fields','line-winner','monthly-occurrences','unit-sum','patch-components'];
for (const slug of slugs) {
 test(slug, async () => {
  const {checks} = await import(`../single/${slug}/checks.mjs`);
  const reference = await import(`../single/${slug}/reference.mjs`);
  const mutants = await Promise.all([1,2,3].map(i => import(`../single/${slug}/mutants/m${i}.mjs`)));
  assert.equal(checks.length, 10);
  const rejections = [];
  const onRejection = reason => rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  try {
   const run = async mod => {
    const results = [];
    for (const check of checks) {
     try { await check(mod); results.push(true); } catch { results.push(false); }
    }
    return results;
   };
   assert.deepEqual(await run(reference), Array(10).fill(true), 'reference');
   for (const [i, mutant] of mutants.entries()) assert.ok((await run(mutant)).includes(false), `mutant ${i+1}`);
   assert.ok((await run({})).includes(false), 'empty module');
   await new Promise(resolve => setImmediate(resolve));
   assert.deepEqual(rejections, [], 'unhandled rejections');
  } finally { process.off('unhandledRejection', onRejection); }
 });
}
