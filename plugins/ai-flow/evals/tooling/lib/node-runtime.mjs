// Node 26 runtime resolution and staging (U2: nvm Node 26 only, never brew/system/other majors).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function codedError(code, message) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return err;
}

function compareSemverDesc(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
  return 0;
}

export function nodeVersionOf(installDir) {
  return execFileSync(path.join(installDir, 'bin', 'node'), ['--version'], { encoding: 'utf8' }).trim();
}

/** Returns the install dir of the highest nvm v26.x, or AIFLOW_EVAL_NODE_DIR when it is a v26 install. */
export function resolveNode26({ nvmDir, env = process.env } = {}) {
  if (env.AIFLOW_EVAL_NODE_DIR) {
    const dir = env.AIFLOW_EVAL_NODE_DIR;
    const version = nodeVersionOf(dir);
    if (!version.startsWith('v26.')) {
      throw codedError('NODE26_REQUIRED', `AIFLOW_EVAL_NODE_DIR=${dir} is ${version}; Node 26 is required`);
    }
    return dir;
  }
  const root = nvmDir ?? env.NVM_DIR ?? path.join(os.homedir(), '.nvm');
  const versionsDir = path.join(root, 'versions', 'node');
  const entries = fs.existsSync(versionsDir) ? fs.readdirSync(versionsDir) : [];
  const v26 = entries
    .filter((v) => /^v26\.\d+\.\d+$/.test(v) && fs.existsSync(path.join(versionsDir, v, 'bin', 'node')))
    .sort(compareSemverDesc);
  if (v26.length === 0) {
    throw codedError('NODE26_NOT_FOUND', `no v26.x under ${versionsDir} (install with: nvm install 26). No fallback is used.`);
  }
  return path.join(versionsDir, v26[0]);
}

/** Copy a directory tree, preferring an APFS clone (cp -c) and falling back to a plain recursive copy. */
export function cloneTree(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    execFileSync('cp', ['-cR', src, dest], { stdio: 'ignore' });
  } catch {
    execFileSync('cp', ['-R', src, dest], { stdio: 'ignore' });
  }
}

/**
 * Stage bin/node and lib/node_modules/npm from an install into dest, recreating bin/npm and bin/npx.
 * Idempotent: a matching .stamp skips the copy.
 */
export function stageNode26(src, dest) {
  const version = nodeVersionOf(src);
  const stampFile = path.join(dest, '.stamp');
  const stamp = { version, source: src };
  if (fs.existsSync(stampFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(stampFile, 'utf8'));
      if (prev.version === stamp.version && prev.source === stamp.source) return { staged: false, dest, version };
    } catch { /* corrupt stamp: restage */ }
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(dest, 'lib', 'node_modules'), { recursive: true });
  cloneTree(path.join(src, 'bin', 'node'), path.join(dest, 'bin', 'node'));
  cloneTree(path.join(src, 'lib', 'node_modules', 'npm'), path.join(dest, 'lib', 'node_modules', 'npm'));
  fs.symlinkSync('../lib/node_modules/npm/bin/npm-cli.js', path.join(dest, 'bin', 'npm'));
  fs.symlinkSync('../lib/node_modules/npm/bin/npx-cli.js', path.join(dest, 'bin', 'npx'));
  fs.writeFileSync(stampFile, JSON.stringify(stamp));
  return { staged: true, dest, version };
}

/**
 * How Node 26 is made usable inside eval runs (P0.5). The eval CLI grants sandbox read access to every
 * PATH entry, so R1 puts the nvm v26 bin dir and its npm package dir on the child PATH.
 * Returns { name, pathPrefix: [dirs] }.
 */
export function sandboxNodeStrategy({ config, nvmDir, env = process.env } = {}) {
  const name = config?.node?.strategy;
  if (!name) throw codedError('NODE_STRATEGY_MISSING', 'Node 26 not usable in eval sandbox: no node.strategy in config.json (run preflight --probe-node)');
  if (name === 'R1') {
    const dir = resolveNode26({ nvmDir, env });
    return { name, pathPrefix: [path.join(dir, 'bin'), path.join(dir, 'lib', 'node_modules', 'npm')] };
  }
  throw codedError('NODE_STRATEGY_UNSUPPORTED', `node.strategy ${name} is not implemented`);
}
