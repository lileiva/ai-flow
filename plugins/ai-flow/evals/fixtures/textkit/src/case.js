function words(str) {
  return String(str)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/** Uppercase the first character of a string. */
export function capitalize(str) {
  const s = String(str);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "hello world" -> "helloWorld" */
export function camelCase(str) {
  return words(str)
    .map((w, i) => (i === 0 ? w.toLowerCase() : capitalize(w.toLowerCase())))
    .join('');
}

/** "Hello World" -> "hello-world" */
export function kebabCase(str) {
  return words(str).map((w) => w.toLowerCase()).join('-');
}
