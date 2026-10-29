import { readFile } from 'node:fs/promises';
export async function readPost(path) {
 const text = await readFile(path, 'utf8');
 const lines = text.split(/\n/); if (lines[0] !== '---') throw Error('front matter');
 let i=1, fields={}; for (; i<lines.length && lines[i] !== '---'; i++) { const m=/^(title|slug):\s*(.*)$/.exec(lines[i]); if (!m || Object.hasOwn(fields,m[1])) throw Error('field'); fields[m[1]]=m[2].split(':')[0].trim(); }
 if (i===lines.length || !fields.title || !fields.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug)) throw Error('field');
 const match = /^(?:[^\n]*\n){1}/.exec(text); let pos=match[0].length; for(let n=1;n<=i;n++){const end=text.indexOf('\n',pos); if(end<0){pos=text.length;break} pos=end+1}
 return {...fields,body:text.slice(pos)};
}
