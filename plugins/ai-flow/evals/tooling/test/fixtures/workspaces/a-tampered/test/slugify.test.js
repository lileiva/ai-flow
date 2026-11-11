import { describe, it, expect } from 'vitest';
import { slugify } from '../src/index.js';

describe('slugify', () => {
  it.skip('strips diacritics', () => {
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
  });

  it('lowercases and dashes words', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
});
