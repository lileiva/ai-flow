/**
 * Convert a string into a lowercase, dash-separated URL slug (diacritics transliterated to ASCII).
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
  return String(str)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
