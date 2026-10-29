export function parseFields(text){
 if(typeof text!=='string')throw new TypeError();const parts=text.split('\n').map((s,i,a)=>i<a.length-1&&s.endsWith('\r')?s.slice(0,-1):s);if(parts[0]!=='---')return {fields:[],body:text};const end=parts.indexOf('---',1);if(end<0)return {fields:[],body:text};const fields=[],seen=new Set();for(const line of parts.slice(1,end)){const m=/^([a-z][a-z0-9-]*): (.*)$/.exec(line);if(!m||seen.has(m[1]))throw new RangeError();seen.add(m[1]);fields.push([m[1],m[2]]);}return {fields,body:parts.slice(end+1).join('\n')};
}
