import { describe, it, expect } from 'vitest';
import { truncate } from '../src/index.js';

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('abc', 5)).toBe('abc');
  });

  it('cuts long strings and appends an ellipsis', () => {
    expect(truncate('abcdefgh', 5)).toBe('abcd…');
  });

  it('supports a custom ellipsis', () => {
    expect(truncate('abcdefgh', 6, { ellipsis: '...' })).toBe('abc...');
  });
});
