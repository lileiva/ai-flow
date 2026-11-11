#!/usr/bin/env node
// Builds the gitignored .eval-cache/: staged Node 26 runtime and the textkit node_modules cache.
// Usage: node prepare.mjs [--only node|textkit]
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NODE26_CACHE, TEXTKIT_CACHE, TEXTKIT_TEMPLATE } from './lib/paths.mjs';
import { resolveNode26, stageNode26 } from './lib/node-runtime.mjs';

export function stageNode({ dest = NODE26_CACHE, env = process.env } = {}) {
  return stageNode26(resolveNode26({ env }), dest);
}

function npmCiPlan(cacheDir, env) {
  return {
    cmd: 'npm',
    args: ['ci'],
    cwd: cacheDir,
    env: { ...env, PATH: path.join(NODE26_CACHE, 'bin') + path.delimiter + (env.PATH ?? '') },
  };
}

function runNpm(plan) {
  execFileSync(plan.cmd, plan.args, { cwd: plan.cwd, env: plan.env, stdio: 'inherit' });
}

export function lockHash(template) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(template, 'package-lock.json'))).digest('hex');
}

/**
 * Install the textkit devDependencies once into .eval-cache/textkit (network needed only here).
 * The stamp is sha256(package-lock.json); an unchanged lockfile skips the install.
 */
export function cacheTextkit({ dryRun = false, env = process.env, template = TEXTKIT_TEMPLATE, cacheDir = TEXTKIT_CACHE, run = runNpm } = {}) {
  const plan = npmCiPlan(cacheDir, env);
  if (dryRun) return plan;
  const hash = lockHash(template);
  const stampFile = path.join(cacheDir, '.stamp');
  const current = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, 'utf8').trim() : null;
  if (current === hash && fs.existsSync(path.join(cacheDir, 'node_modules'))) return { skipped: true, cacheDir, hash };
  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(template, f), path.join(cacheDir, f));
  run(plan);
  fs.writeFileSync(stampFile, hash + '\n');
  return { skipped: false, cacheDir, hash };
}

function parseArgs(argv) {
  const i = argv.indexOf('--only');
  return { only: i >= 0 ? argv[i + 1] : null };
}

async function main() {
  const { only } = parseArgs(process.argv.slice(2));
  if (!only || only === 'node') {
    const r = stageNode();
    console.log(`node26: ${r.staged ? 'staged' : 'up to date'} ${r.version} -> ${r.dest}`);
  }
  if (!only || only === 'textkit') {
    const r = cacheTextkit();
    console.log(`textkit: ${r.skipped ? 'up to date' : 'installed'} -> ${r.cacheDir}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
