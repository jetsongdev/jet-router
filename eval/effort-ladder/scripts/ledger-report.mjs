import { resolve } from 'node:path';
import { openLedger } from '../lib/ledger.mjs';
const ledger=openLedger(resolve(process.argv[2]??'runs/ledger.jsonl'));
try {const {segments,total}=ledger.totals(); console.log('segment\tspent\treserved\tremaining'); for(const [name,row] of [...Object.entries(segments),['total',total]]) console.log(`${name}\t${row.spent.toFixed(4)}\t${row.reserved.toFixed(4)}\t${row.remaining.toFixed(4)}`);} finally {ledger.close();}
