import {applyBatch} from './batch.mjs';
export function createStore(initial){const balances=new Map();for(const [name,value] of Object.entries(initial)){if(!Number.isSafeInteger(value)||value<0)throw new RangeError();balances.set(name,value)} return {apply(batch){applyBatch(balances,batch)},snapshot(){return Object.fromEntries(balances)}}}
