import {format} from './format.mjs';
export function report(state) { return state.records.map(format).join('\n'); }
