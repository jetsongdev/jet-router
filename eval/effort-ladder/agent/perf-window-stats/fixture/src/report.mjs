import { summarize } from './summary.mjs';
import { formatSeries } from './format.mjs';
export function report(series) { return { summary: summarize(series), text: formatSeries(series) }; }
