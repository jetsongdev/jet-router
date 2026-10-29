export function cell(value) {
  let text = String(value);

  if (/[",\r\n]/.test(text)) text = '"' + text.replaceAll('"', '""') + '"';
  return text;
}

export function csv(rows) {
  return rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
