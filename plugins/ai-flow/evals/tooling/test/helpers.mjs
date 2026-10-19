// Shared test helpers: temp dirs that are removed when the test file finishes.
import { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const created = [];
after(() => { for (const d of created) fs.rmSync(d, { recursive: true, force: true }); });

export function tmpDir(prefix = 'aiflow-test-') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(d);
  return d;
}
