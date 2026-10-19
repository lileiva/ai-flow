function records(text, delimiter) {
  const out = [];
  let row = [];
  let f = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') quoted = false; else f += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(f); out.push(row); row = []; f = '';
    } else f += ch;
  }
  if (f !== '' || row.length) { row.push(f); out.push(row); }
  return out;
}

/** Parse RFC 4180 CSV with a header row into an array of objects with string values. */
export function parseCSV(text, { delimiter = ',' } = {}) {
  const [header = [], ...rest] = records(String(text), delimiter);
  return rest.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
