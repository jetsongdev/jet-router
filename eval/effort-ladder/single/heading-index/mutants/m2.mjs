export function headingIndex(lines){
 if(!Array.isArray(lines)||!lines.every(x=>typeof x==='string'))throw new TypeError();
 const used=new Set(),out=[];for(const line of lines){const m=/^(#{1,3}) ([A-Za-z0-9]+(?: [A-Za-z0-9]+)*) *$/.exec(line);if(!m)continue;const title=m[2],base=title.replaceAll(' ','-');let slug=base,n=2;while(used.has(slug))slug=base+'-'+n++;used.add(slug);out.push({level:m[1].length,title,slug});}return out;
}
