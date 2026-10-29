export function taxable(lines) { return lines.filter(line => line.taxCents > 0); }
export function byId(lines,id) { return lines.find(line => line.id === id); }
