// Hidden acceptance suite for case (b). Injected only at grading time (REQ-006 S3).
import { describe, it, expect } from 'vitest';
import * as textkit from '../src/index.js';

describe('truncateWords (acceptance)', () => {
  it('keeps the first n words and appends the default ellipsis', () => {
    expect(textkit.truncateWords('the quick brown fox', 2)).toBe('the quick…');
  });

  it('returns the input unchanged when it has n words or fewer', () => {
    expect(textkit.truncateWords('the quick brown fox', 4)).toBe('the quick brown fox');
    expect(textkit.truncateWords('hello', 3)).toBe('hello');
  });

  it('collapses whitespace between kept words and ignores surrounding whitespace', () => {
    expect(textkit.truncateWords('  one   two\tthree  four ', 3)).toBe('one two three…');
  });

  it('supports a custom ellipsis', () => {
    expect(textkit.truncateWords('a b c d', 1, { ellipsis: '...' })).toBe('a...');
  });

  it('leaves the existing truncate export intact', () => {
    expect(textkit.truncate('abcdef', 4)).toBe('abc…');
  });
});
