export function select(rows, columns) {
  return rows.map(row => Object.fromEntries(
    columns.map(column => [column, row[column]]),
  ));
}

export function sortRows(rows, column, direction = 'asc') {
  const sign = direction === 'desc' ? -1 : 1;
  return rows.map((row, index) => ({ row, index })).sort((left, right) => {
    const a = left.row[column];
    const b = right.row[column];
    if (a === b) return left.index - right.index;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return (a < b ? -1 : 1) * sign;
  }).map(item => item.row);
}

export function filterRows(rows, criteria) {
  const tests = Object.entries(criteria);
  return rows.filter(row => tests.every(([key, value]) => row[key] === value));
}

export function uniqueValues(rows, column) {
  return [...new Set(rows.map(row => row[column]))];
}

export function groupRows(rows, column) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[column];
    const group = groups.get(value) ?? [];
    group.push(row);
    groups.set(value, group);
  }
  return groups;
}

export function countRows(rows, column) {
  const result = new Map();
  for (const row of rows) {
    const key = row[column];
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

export function sumColumn(rows, column) {
  let total = 0;
  for (const row of rows) {
    const value = row[column];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`invalid numeric column: ${column}`);
    }
    total += value;
  }
  return total;
}

export function paginate(rows, { offset = 0, limit = rows.length } = {}) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 0) {
    throw new RangeError('invalid pagination');
  }
  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    offset,
    hasMore: offset + limit < rows.length,
  };
}

export function indexRows(rows, column) {
  const index = new Map();
  for (const row of rows) {
    const value = row[column];
    if (index.has(value)) throw new Error(`duplicate ${column}`);
    index.set(value, row);
  }
  return index;
}
