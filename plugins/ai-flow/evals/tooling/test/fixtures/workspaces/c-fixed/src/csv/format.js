function field(value, delimiter) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Format an array of objects as RFC 4180 CSV with a header row. */
export function toCSV(rows, { columns, delimiter = ',' } = {}) {
  const cols = columns ?? Object.keys(rows[0] ?? {});
  const lines = [cols.map((c) => field(c, delimiter)).join(delimiter)];
  for (const row of rows) lines.push(cols.map((c) => field(row[c], delimiter)).join(delimiter));
  return lines.join('\n');
}
