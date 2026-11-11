import { describe, it, expect } from 'vitest';
import { slugify } from '../src/index.js';

describe('slugify', () => {
  it('lowercases and dashes words', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('collapses punctuation and whitespace', () => {
    expect(slugify('  Rock & Roll!!  ')).toBe('rock-roll');
  });

  it('keeps digits', () => {
    expect(slugify('Top 10 Tips')).toBe('top-10-tips');
  });
});
