// OS containment for running untrusted agent output at grading time (design D5, U5).
// macOS: sandbox-exec with a profile that denies network and denies writes outside the grading dir.
// Linux: bwrap with the root read-only, the grading dir writable and no network namespace.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const CANDIDATES = { 'sandbox-exec': '/usr/bin/sandbox-exec', bwrap: '/usr/bin/bwrap' };

export function detectContainment({ exists = fs.existsSync } = {}) {
  for (const [name, bin] of Object.entries(CANDIDATES)) if (exists(bin)) return { name, bin };
  return null;
}

function sbString(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function macProfile(writableDir) {
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(allow network* (local unix-socket))',
    '(deny file-write*)',
    `(allow file-write* (subpath ${sbString(writableDir)}) (literal "/dev/null") (literal "/dev/zero") (regex #"^/dev/tty") (subpath "/dev/fd"))`,
  ].join('\n');
}

/**
 * Run argv under containment. Returns spawnSync's { status, stdout, stderr, signal } plus `containment`.
 * Throws NO_CONTAINMENT when neither sandbox-exec nor bwrap exists, unless unsafeHostGrading.
 */
export function runSandboxed(argv, { cwd, writableDir, env = {}, timeoutMs = 120_000, unsafeHostGrading = false, containment = detectContainment() } = {}) {
  const realDir = fs.realpathSync(writableDir);
  const baseEnv = { PATH: '/usr/bin:/bin', HOME: realDir, TMPDIR: realDir, ...env };
  let cmd;
  let args;
  if (containment?.name === 'sandbox-exec') {
    cmd = containment.bin;
    args = ['-p', macProfile(realDir), ...argv];
  } else if (containment?.name === 'bwrap') {
    cmd = containment.bin;
    args = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--bind', realDir, realDir, '--unshare-net', '--die-with-parent', '--chdir', cwd, ...argv];
  } else if (unsafeHostGrading) {
    [cmd, ...args] = argv;
  } else {
    const err = new Error('NO_CONTAINMENT: neither sandbox-exec nor bwrap is available; refusing to run agent code on the host (pass --unsafe-host-grading to override)');
    err.code = 'NO_CONTAINMENT';
    throw err;
  }
  const r = spawnSync(cmd, args, { cwd, env: baseEnv, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: r.error?.code === 'ETIMEDOUT', containment: containment?.name ?? 'none' };
}
