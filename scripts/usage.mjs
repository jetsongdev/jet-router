import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLine, report, GROUPS } from '../src/usage.js';

// record: the hook pipes one record on stdin; report: aggregates the monthly files.
export const usageDir = () => process.env.JET_ROUTER_USAGE_DIR || join(homedir(), '.claude/jet-router/usage');

export function recordLine(input, dir = usageDir(), now = new Date()) {
  const parsed = parseLine(JSON.stringify({ ...JSON.parse(input), ts: now.toISOString() }));
  if (!parsed) return false;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `${parsed.ts.slice(0, 7)}.jsonl`);
  appendFileSync(file, JSON.stringify({ v: 1, ...parsed }) + '\n', { mode: 0o600 });
  return true;
}

export function readRecords(dir = usageDir()) {
  let files;
  try { files = readdirSync(dir).filter(name => /^\d{4}-\d{2}\.jsonl$/.test(name)).sort(); } catch { return []; }
  return files.flatMap(name => readFileSync(join(dir, name), 'utf8').split('\n').filter(Boolean).map(parseLine).filter(Boolean));
}

const n = value => value.toLocaleString('en-US');
// Hangul and other wide characters take two terminal columns.
const width = cell => [...cell].reduce((w, c) => w + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60]/.test(c) ? 2 : 1), 0);
const padTo = (cell, size, left) => (left ? cell + ' '.repeat(size - width(cell)) : ' '.repeat(size - width(cell)) + cell);
const home = homedir();

export function formatReport(result) {
  const head = ['구분', '턴', '적용', '상향', '양보', '생략', '출력 토큰', '추정 절감', '미추정 적용', 'shadow 잠재 절감'];
  const line = (key, t) => [key.replaceAll(home, '~'), n(t.turns), n(t.applied), n(t.upshifts), n(t.yielded), n(t.skipped),
    n(t.output), `${n(t.estimatedSaved)} (${n(t.estimatedTurns)}턴)`, `${n(t.unestimatedAppliedTurns)}턴`,
    `${n(t.shadowPotentialSaved)} (${n(t.shadowEstimatedTurns)}턴)`];
  const rows = [head, ...result.rows.map(r => line(r.key, r)), line('합계', result.total)];
  const widths = head.map((_, i) => Math.max(...rows.map(r => width(r[i]))));
  const pad = (cell, i) => padTo(cell, widths[i], i === 0);
  const t = result.total;
  const rate = t.estimatedBaselineOutput ? ` · 추정 대상 턴 출력 절감률 ${(100 * t.estimatedSaved / t.estimatedBaselineOutput).toFixed(1)}%` : '';
  return [
    `기간: ${result.from ?? '처음'} ~ ${result.to ?? '끝'} · 기준: ${result.by.join(', ')}${rate}`,
    ...rows.map(r => r.map(pad).join('  ')),
    '추정 절감은 평가에서 측정한 모델·effort 조합(xhigh→medium, xhigh→high)만 계산합니다. 미추정 적용 턴과 상향 턴은 절감에 넣지 않습니다.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { by: ['day'] };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--by') { args.by = value.split(','); i++; }
    else if (flag === '--from') { args.from = value; i++; }
    else if (flag === '--to') { args.to = value; i++; }
    else if (flag === '--dir') { args.dir = value; i++; }
    else if (flag === '--json') args.json = true;
    else throw new Error(`unknown option: ${flag}`);
  }
  for (const date of [args.from, args.to]) if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('dates are YYYY-MM-DD');
  for (const group of args.by) if (!GROUPS[group]) throw new Error(`--by: ${Object.keys(GROUPS).join('|')}`);
  return args;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'record') {
    // Logging must never disturb the session: failures are silent.
    try { recordLine(readFileSync(0, 'utf8')); } catch { /* ignore */ }
  } else if (command === 'report') {
    try {
      const args = parseArgs(rest);
      const result = report(readRecords(args.dir), args);
      console.log(args.json ? JSON.stringify(result, null, 2) : formatReport(result));
    } catch (error) {
      console.error(`사용법: node scripts/usage.mjs report [--by day|week|month|project|model|mode|pair|all[,...]] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dir 경로] [--json]\n${error.message}`);
      process.exitCode = 1;
    }
  } else {
    console.error('사용법: node scripts/usage.mjs record|report');
    process.exitCode = 1;
  }
}
