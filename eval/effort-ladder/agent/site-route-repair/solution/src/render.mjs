const escape = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function render(p) { return `<h1>${escape(p.title)}</h1><pre>${escape(p.body)}</pre>`; }
