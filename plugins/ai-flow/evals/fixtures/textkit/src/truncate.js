/**
 * Shorten a string to at most `max` characters, appending an ellipsis when cut.
 * @param {string} str
 * @param {number} max
 * @param {{ ellipsis?: string }} [options]
 * @returns {string}
 */
export function truncate(str, max, { ellipsis = '…' } = {}) {
  const s = String(str);
  if (s.length <= max) return s;
  if (max <= ellipsis.length) return ellipsis.slice(0, max);
  return s.slice(0, max - ellipsis.length) + ellipsis;
}
