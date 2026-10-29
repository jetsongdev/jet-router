export function validLine(line) { return typeof line.id === 'string' && line.id.length > 0 && Number.isSafeInteger(line.quantity) && line.quantity >= 0; }
