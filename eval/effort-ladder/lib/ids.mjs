import { createHash } from 'node:crypto';
export const EFFORTS = ['low','medium','high','xhigh','max'];
export const SUITES = ['tq','ss','ag'];
export const sha256 = text => createHash('sha256').update(text).digest('hex');
export function taskId(suite, slug) {
 if (!SUITES.includes(suite) || !/^[A-Za-z0-9_-]+$/.test(slug)) throw Error('invalid task');
 return `${suite}/${slug}`;
}
export function runId({wave,suite,slug,effort,rep,turn,arm}) {
 taskId(suite,slug);
 if (!/^[A-Za-z0-9_-]+$/.test(wave) || !EFFORTS.includes(effort) || !Number.isSafeInteger(rep) || rep < 1 || (turn !== undefined && turn !== 2) || (turn === 2 ? !['S','U'].includes(arm) : arm !== undefined)) throw Error('invalid run');
 const id = `${wave}-${suite}-${slug}-${effort}-r${String(rep).padStart(2,'0')}${turn === 2 ? `-t2${arm}` : ''}`;
 if (id.length > 64) throw Error('run ID exceeds 64 characters');
 return id;
}
