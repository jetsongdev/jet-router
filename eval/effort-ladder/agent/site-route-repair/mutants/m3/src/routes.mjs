export function validateRoutes(posts) { const seen=new Set(); for(const p of posts){if(seen.has(p.slug)) throw Error('duplicate slug'); seen.add(p.slug)} }
