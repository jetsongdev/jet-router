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
