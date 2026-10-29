import { readFile } from 'node:fs/promises';
import { parseArgs, usage } from './args.mjs';
import { Journal } from './journal.mjs';
import { Metrics, summarize } from './metrics.mjs';
import { parseJsonLines, render } from './render.mjs';
import { sortRows, paginate } from './rows.mjs';
import { requireFields, requireFinite, requireString, oneOf } from './validate.mjs';

const definitions = [
  { name: 'format', type: 'string', default: 'table',
    choices: ['table', 'csv', 'json', 'jsonl'], description: 'Output format' },
  { name: 'limit', type: 'integer', default: 100, description: 'Maximum rows' },
  { name: 'kind', type: 'string', description: 'Filter by kind' },
  { name: 'help', type: 'boolean', description: 'Show usage' },
];

export function summarizeRecords(records) {
  let tick = 0;
  const journal = new Journal({ clock: { now: () => tick++ }, capacity: Math.max(1, records.length) });
  const metrics = new Metrics();
  for (const record of records) {
    requireFields(record, ['event', 'level', 'duration']);
    requireString(record.event, 'event');
    oneOf(record.level, ['info', 'error', 'debug'], 'level');
    requireFinite(record.duration, 'duration');
    journal.append(record.level, record);
    metrics.increment(record.level);
    metrics.observe('duration', record.duration);
  }
  return { journal, metrics, durations: summarize(metrics.samples('duration')) };
}

export async function main(argv, output = process.stdout) {
  const { options, positional } = parseArgs(argv, definitions);
  if (options.help) {
    output.write(usage('node src/reporting/report.mjs FILE', definitions) + '\n');
    return;
  }
  if (positional.length !== 1) throw new Error('expected one JSONL input file');
  if (options.limit < 0) throw new RangeError('limit must be nonnegative');
  const records = parseJsonLines(await readFile(positional[0], 'utf8'));
  const { journal } = summarizeRecords(records);
  const entries = journal.list({ kind: options.kind, limit: Math.max(1, records.length) });
  const rows = entries.map(entry => entry.fields);
  const ordered = sortRows(rows, 'event');
  const page = paginate(ordered, { limit: options.limit });
  const columns = ['event', 'level', 'duration'];
  output.write(render(page.rows, { format: options.format, columns }) + '\n');
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  });
}
