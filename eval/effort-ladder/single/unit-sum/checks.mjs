import assert from 'node:assert/strict';
const eq=assert.deepStrictEqual, throws=assert.throws;
export const checks = [
 async mod => { const f=mod.sumLengths; eq(f('1m + 25cm + 5mm','mm'),'1255.00');eq(f('1m + 25cm + 5mm','cm'),'125.50');eq(f('1m + 25cm + 5mm','m'),'1.26'); },
 async mod => { const f=mod.sumLengths; eq(f('0.004mm','mm'),'0.00');eq(f('0.005mm','mm'),'0.01');eq(f('0.006mm','mm'),'0.01'); },
 async mod => { const f=mod.sumLengths; eq(f('0.004mm+0.004mm','mm'),'0.01'); },
 async mod => { const f=mod.sumLengths; eq(f('000.010m','m'),'0.01');eq(f('000mm','mm'),'0.00'); },
 async mod => { const f=mod.sumLengths; eq(f(Array(30).fill('1mm').join('+'),'mm'),'30.00');throws(()=>f(Array(31).fill('1mm').join('+'),'mm'),RangeError); },
 async mod => { const f=mod.sumLengths; eq(f('1000000m','m'),'1000000.00');throws(()=>f('1000000.001m','m'),RangeError); },
 async mod => { const f=mod.sumLengths; for(const s of ['', '1mm+', '1mm++2mm','.mm','1.0000mm'])throws(()=>f(s,'mm'),RangeError); },
 async mod => { const f=mod.sumLengths; for(const s of ['-1mm','+1mm','1e2mm','1 mm','1mm\t','1mm\n'])throws(()=>f(s,'mm'),RangeError); },
 async mod => { const f=mod.sumLengths; throws(()=>f(null,'mm'),RangeError);throws(()=>f('1mm','km'),RangeError); },
 async mod => { const f=mod.sumLengths; eq(f(Array(30).fill('1000000m').join('+')+'','mm'),'30000000000.00');eq(f('999999.999m+0.001mm','mm'),'999999999.00'); }
];
