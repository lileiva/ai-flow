// Well-known locations, resolved from this file (plugins/ai-flow/evals/tooling/lib/).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOLING_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EVALS_DIR = path.resolve(TOOLING_DIR, '..');
export const PLUGIN_DIR = path.resolve(EVALS_DIR, '..');
export const REPO_ROOT = path.resolve(PLUGIN_DIR, '..', '..');
export const CACHE_DIR = path.join(REPO_ROOT, '.eval-cache');
export const NODE26_CACHE = path.join(CACHE_DIR, 'node26');
export const TEXTKIT_CACHE = path.join(CACHE_DIR, 'textkit');
export const TEXTKIT_TEMPLATE = path.join(EVALS_DIR, 'fixtures', 'textkit');
