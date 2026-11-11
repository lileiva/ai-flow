// Zero-dependency validator for the JSON-Schema subset used by evals/tooling/schema/*.json:
// type (string or list), required, properties, additionalProperties, items, enum, oneOf, allOf, if/then,
// local $ref (#/definitions/x) and sibling-file $ref ("summary.schema.json", resolved in schema/).
import fs from 'node:fs';
import path from 'node:path';
import { TOOLING_DIR } from './paths.mjs';

const SCHEMA_DIR = path.join(TOOLING_DIR, 'schema');
const fileCache = new Map();

/** Load schema/<name>.schema.json (name may also be a file name). */
export function loadSchema(name) {
  const file = name.endsWith('.json') ? name : `${name}.schema.json`;
  if (!fileCache.has(file)) fileCache.set(file, JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8')));
  return fileCache.get(file);
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'non-finite number';
    return Number.isInteger(v) ? 'integer' : 'number';
  }
  return typeof v;
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}

/** Returns a list of { path, message } errors (empty when valid). */
export function validate(schema, value, at = '$', root = schema) {
  const errors = [];
  if (schema.$ref && !schema.$ref.startsWith('#')) {
    const other = loadSchema(schema.$ref);
    return validate(other, value, at, other);
  }
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], root);
    if (!target) return [{ path: at, message: `unresolved $ref ${schema.$ref}` }];
    return validate(target, value, at, root);
  }
  if (schema.allOf) {
    for (const s of schema.allOf) errors.push(...validate(s, value, at, root));
  }
  if (schema.if && validate(schema.if, value, at, root).length === 0 && schema.then) {
    errors.push(...validate(schema.then, value, at, root));
  }
  if (schema.oneOf) {
    const ok = schema.oneOf.filter((s) => validate(s, value, at, root).length === 0).length;
    if (ok !== 1) errors.push({ path: at, message: `must match exactly one schema in oneOf (matched ${ok})` });
    return errors;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push({ path: at, message: `must be ${types.join('|')}, got ${typeOf(value)}` });
      return errors;
    }
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push({ path: at, message: `must be one of ${JSON.stringify(schema.enum)}` });
  }
  if (typeOf(value) === 'object') {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push({ path: `${at}.${k}`, message: 'is required' });
    for (const [k, s] of Object.entries(schema.properties ?? {})) if (k in value) errors.push(...validate(s, value[k], `${at}.${k}`, root));
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const [k, v] of Object.entries(value)) if (!(k in (schema.properties ?? {}))) errors.push(...validate(schema.additionalProperties, v, `${at}.${k}`, root));
    }
  }
  if (typeOf(value) === 'array' && schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, `${at}[${i}]`, root)));
  return errors;
}

export function assertValid(schema, value, label = 'value') {
  const errors = validate(schema, value);
  if (errors.length) {
    const err = new Error(`${label} failed schema validation: ` + errors.map((e) => `${e.path} ${e.message}`).join('; '));
    err.code = 'SCHEMA_INVALID';
    err.errors = errors;
    throw err;
  }
  return value;
}
