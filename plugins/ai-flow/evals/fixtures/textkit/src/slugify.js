/**
 * Convert a string into a lowercase, dash-separated URL slug.
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
