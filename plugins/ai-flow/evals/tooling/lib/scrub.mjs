// Local-path hygiene for committed eval data (fixtures, raw baselines): personal home dirs, macOS per-user temp
// folders and claude-<uid> temp dirs are replaced by neutral placeholders. Idempotent.
import os from 'node:os';

/** Patterns that must not appear in committed eval files (checked by test/scrub.test.mjs). */
export const LOCAL_PATH_PATTERNS = [/\/Users\/[^/\s"'`]+/, /\/private\/var\/folders\//, /tmp[/-]claude-\d+[/-]/, /-Users-[A-Za-z0-9._]+-/];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const localUser = () => { try { return os.userInfo().username; } catch { return null; } };

/**
 * Home dirs (and their CLI project slugs -Users-<name>-...), macOS per-user temp folders, claude-<uid> temp dirs and
 * the local user name as a whole word (e.g. an `ls -l` owner; names shorter than 3 chars are left alone).
 */
export function scrubLocalPaths(text, { home = os.homedir(), user = localUser() } = {}) {
  let out = text;
  if (home && home !== '/') out = out.replace(new RegExp(escape(home), 'g'), '/home/user');
  if (user && user.length >= 3) out = out.replace(new RegExp(`(?<![\\w.-])${escape(user)}(?![\\w])`, 'g'), 'user');
  return out
    .replace(/-Users-[A-Za-z0-9._]+-/g, '-home-user-')
    .replace(/\/Users\/[^/\s"'`\\]+/g, '/home/user')
    .replace(/\/private\/var\/folders\/[^/\s"'`\\]+\/[^/\s"'`\\]+\/T(?=[/"'`\s\\]|$)/g, '/tmp')
    .replace(/(tmp[/-])claude-\d+(?=[/-])/g, '$1claude-uid');
}

/** Email addresses (e.g. the CLI's session_context userEmail) become <email>. Idempotent. */
// The lookbehind anchors the local part at its start, so a long run without '@' is scanned once (linear, not quadratic).
export const scrubEmails = (text) => text.replace(/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, '<email>');
