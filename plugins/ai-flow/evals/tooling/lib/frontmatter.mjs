// Minimal YAML-frontmatter reader for eval case files: scalars, inline [lists], `|` block scalars,
// and `- item` block lists. Enough for prompt.md / grader / mock files written in this repo.

function scalar(raw) {
  const v = raw.trim();
  if (v === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === 'true' || v === 'false') return v === 'true';
  if (v === 'null' || v === '~') return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(',').map((x) => scalar(x)) : [];
  }
  return v;
}

export function parseYamlSubset(text) {
  const lines = text.split('\n');
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    if (rest.trim() === '|' || rest.trim() === '|-') {
      const block = [];
      while (i + 1 < lines.length && (lines[i + 1].startsWith('  ') || lines[i + 1].trim() === '')) block.push(lines[++i]);
      while (block.length && block[block.length - 1].trim() === '') block.pop();
      const text = block.map((l) => l.replace(/^ {2}/, '')).join('\n');
      data[key] = rest.trim() === '|' ? text + '\n' : text;
    } else if (rest.trim() === '' && i + 1 < lines.length && /^\s+- /.test(lines[i + 1])) {
      const items = [];
      while (i + 1 < lines.length && /^\s+- /.test(lines[i + 1])) items.push(scalar(lines[++i].replace(/^\s+- /, '')));
      data[key] = items;
    } else {
      data[key] = scalar(rest);
    }
  }
  return data;
}

/** Split `---\n<yaml>\n---\n<body>` into { data, body }. */
export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  return { data: parseYamlSubset(m[1]), body: m[2] };
}
