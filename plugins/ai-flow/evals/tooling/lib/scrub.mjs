// Local-path hygiene for committed eval data (fixtures, raw baselines): personal home dirs, macOS per-user temp
// folders and claude-<uid> temp dirs are replaced by neutral placeholders. Idempotent.
import os from 'node:os';

/** Patterns that must not appear in committed eval files (checked by test/scrub.test.mjs). */
export const LOCAL_PATH_PATTERNS = [/\/Users\/[^/\s"'`]+/, /\/private\/var\/folders\//, /tmp[/-]claude-\d+[/-]/];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function scrubLocalPaths(text, { home = os.homedir() } = {}) {
  let out = text;
  if (home && home !== '/') out = out.replace(new RegExp(escape(home), 'g'), '/home/user');
  return out
    .replace(/\/Users\/[^/\s"'`\\]+/g, '/home/user')
    .replace(/\/private\/var\/folders\/[^/\s"'`\\]+\/[^/\s"'`\\]+\/T(?=[/"'`\s\\]|$)/g, '/tmp')
    .replace(/(tmp[/-])claude-\d+(?=[/-])/g, '$1claude-uid');
}
