import { describe, it, expect } from 'vitest';
import { toCSV, parseCSV } from '../src/index.js';

describe('csv', () => {
  it('round-trips', () => {
    const rows = [{ a: 'x,y', b: 'q' }];
    expect(parseCSV(toCSV(rows))).toEqual(rows);
  });
});
