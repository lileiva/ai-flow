/**
 * Keep at most the first `n` words of a string, appending an ellipsis when cut.
 * @param {string} str
 * @param {number} n
 * @param {{ ellipsis?: string }} [options]
 * @returns {string}
 */
export function truncateWords(str, n, { ellipsis = '…' } = {}) {
  const s = String(str);
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length <= n) return s;
  return words.slice(0, n).join(' ') + ellipsis;
}
