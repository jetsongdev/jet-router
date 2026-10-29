export function parseArgs(args, definitions) {
  const options = {};
  const positional = [];
  const byName = new Map(definitions.map(definition => [definition.name, definition]));
  for (const definition of definitions) {
    if (definition.default !== undefined) options[definition.name] = definition.default;
  }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--') {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (!argument.startsWith('--')) {
      positional.push(argument);
      continue;
    }
    const equal = argument.indexOf('=');
    const name = argument.slice(2, equal < 0 ? undefined : equal);
    const definition = byName.get(name);
    if (!definition) throw new Error(`unknown option: --${name}`);
    if (definition.type === 'boolean') {
      if (equal >= 0) throw new Error(`--${name} takes no value`);
      options[name] = true;
      continue;
    }
    const value = equal < 0 ? args[++index] : argument.slice(equal + 1);
    if (value === undefined) throw new Error(`missing value: --${name}`);
    options[name] = convert(value, definition);
  }
  return { options, positional };
}

function convert(value, definition) {
  if (definition.type === 'integer') {
    if (!/^-?\d+$/.test(value)) throw new Error(`invalid integer: --${definition.name}`);
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error(`invalid integer: --${definition.name}`);
    return number;
  }
  if (definition.choices && !definition.choices.includes(value)) {
    throw new Error(`invalid value: --${definition.name}`);
  }
  return value;
}

export function usage(command, definitions) {
  const lines = [`Usage: ${command} [options]`, '', 'Options:'];
  for (const definition of definitions) {
    const suffix = definition.type === 'boolean' ? '' : ' VALUE';
    const label = `  --${definition.name}${suffix}`;
    lines.push(`${label.padEnd(24)}${definition.description ?? ''}`);
  }
  return lines.join('\n');
}

export function requirePositionals(values, count) {
  if (values.length !== count) {
    throw new Error(`expected ${count} positional arguments`);
  }
  return values;
}

export function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

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

function display(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function table(rows, columns) {
  const cells = rows.map(row => columns.map(column => display(row[column])));
  const widths = columns.map((column, index) => Math.max(
    column.length,
    ...cells.map(row => row[index].length),
  ));
  function line(values) {
    return values.map((value, index) => value.padEnd(widths[index])).join(' | ').trimEnd();
  }
  const header = line(columns);
  const separator = widths.map(width => '-'.repeat(width)).join('-+-');
  return [header, separator, ...cells.map(line)].join('\n');
}

function csvCell(value) {
  const text = display(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csv(rows, columns) {
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map(column => csvCell(row[column])).join(','));
  }
  return lines.join('\n') + '\n';
}

export function jsonLines(rows) {
  return rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
}

export function parseJsonLines(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (cause) {
      throw new SyntaxError(`invalid JSON on line ${index + 1}`, { cause });
    }
  }
  return rows;
}

export function render(rows, { format = 'table', columns = [] } = {}) {
  if (format === 'table') return table(rows, columns);
  if (format === 'csv') return csv(rows, columns);
  if (format === 'jsonl') return jsonLines(rows);
  if (format === 'json') return JSON.stringify(rows, null, 2);
  throw new RangeError(`unknown format: ${format}`);
}

export function truncate(text, width) {
  if (!Number.isInteger(width) || width < 0) throw new RangeError('invalid width');
  const chars = Array.from(String(text));
  if (chars.length <= width) return chars.join('');
  if (width === 0) return '';
  return chars.slice(0, width - 1).join('') + '…';
}

export function quoteReport(rows, format = 'table') {
  const ordered = sortRows(rows, 'tag');
  return render(ordered, { format, columns: ['tag', 'amount', 'fee'] });
}

export function compareQuotes(left, right) {
  const first = indexRows(left, 'tag');
  const second = indexRows(right, 'tag');
  const tags = new Set([...first.keys(), ...second.keys()]);
  return [...tags].sort().map(tag => {
    const before = first.get(tag);
    const after = second.get(tag);
    return {
      tag,
      oldAmount: before?.amount,
      newAmount: after?.amount,
      oldFee: before?.fee,
      newFee: after?.fee,
    };
  });
}
