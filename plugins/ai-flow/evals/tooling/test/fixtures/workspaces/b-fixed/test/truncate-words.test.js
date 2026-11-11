import { describe, it, expect } from 'vitest';
import { truncateWords } from '../src/index.js';

describe('truncateWords', () => {
  it('keeps the first n words', () => {
    expect(truncateWords('the quick brown fox', 2)).toBe('the quick…');
  });
});
