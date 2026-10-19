// Spawns the claude CLI (or the offline stub named by AIFLOW_EVAL_CLAUDE_BIN).
import { spawn } from 'node:child_process';

export function claudeBin(env = process.env) {
  return env.AIFLOW_EVAL_CLAUDE_BIN || 'claude';
}

/** Run claude with args; resolves { status, stdout, stderr }. Never rejects on a non-zero exit. */
export function spawnClaude(args, { env = process.env, cwd, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(claudeBin(env), args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; if (onStderr) onStderr(String(d)); });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}
