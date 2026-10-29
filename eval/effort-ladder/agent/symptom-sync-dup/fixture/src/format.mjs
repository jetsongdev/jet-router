export function format(record) { return record.deleted ? `${record.id}: deleted` : `${record.id}: ${record.value}`; }
