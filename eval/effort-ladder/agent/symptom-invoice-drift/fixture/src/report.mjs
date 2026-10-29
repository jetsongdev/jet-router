import {cents} from './format.mjs';
export function report(invoice) { return invoice.lines.map(x => `${x.id}: ${cents(x.totalCents)}`).join('\n'); }
