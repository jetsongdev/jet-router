const [op,a,b,...extra]=process.argv.slice(2); const valid=x=>typeof x==='string' && /^[+-]?[0-9]+$/.test(x) && x.replace(/^[+-]/,'').length<=30;
if(extra.length || !['add','sub','mul'].includes(op) || !valid(a) || !valid(b)){process.stderr.write('invalid input\n');process.exitCode=1} else {const x=BigInt(a),y=BigInt(b); console.log(String(op==='add'?x+y:op==='sub'?x-y:x*y))}
