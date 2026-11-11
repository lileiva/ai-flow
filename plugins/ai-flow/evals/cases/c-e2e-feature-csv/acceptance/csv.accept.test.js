// Hidden acceptance suite for case (c). Injected only at grading time (REQ-006 S3).
import { describe, it, expect } from 'vitest';
import * as textkit from '../src/index.js';

describe('toCSV (acceptance)', () => {
  it('writes a header row and one line per row, keys of the first row by default', () => {
    expect(textkit.toCSV([{ a: '1', b: '2' }, { a: '3', b: '4' }])).toBe('a,b\n1,2\n3,4');
  });

  it('quotes fields with delimiters, quotes and newlines (RFC 4180)', () => {
    expect(textkit.toCSV([{ v: 'x,y' }, { v: 'say "hi"' }, { v: 'two\nlines' }])).toBe('v\n"x,y"\n"say ""hi"""\n"two\nlines"');
  });

  it('honours columns order/selection, a custom delimiter, and null/undefined as empty', () => {
    expect(textkit.toCSV([{ a: 1, b: null, c: 'z' }], { columns: ['c', 'a', 'b'], delimiter: ';' })).toBe('c;a;b\nz;1;');
    expect(textkit.toCSV([{ a: 'p;q' }], { delimiter: ';' })).toBe('a\n"p;q"');
  });
});

describe('parseCSV (acceptance)', () => {
  it('parses a simple document into objects keyed by the header', () => {
    expect(textkit.parseCSV('a,b\n1,2\n3,4\n')).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });

  it('handles quoted fields with doubled quotes, delimiters, newlines and CRLF', () => {
    expect(textkit.parseCSV('v,w\r\n"x,y","say ""hi"""\r\n"two\nlines",z\r\n')).toEqual([
      { v: 'x,y', w: 'say "hi"' },
      { v: 'two\nlines', w: 'z' },
    ]);
  });

  it('supports a custom delimiter', () => {
    expect(textkit.parseCSV('a;b\n"p;q";r', { delimiter: ';' })).toEqual([{ a: 'p;q', b: 'r' }]);
  });

  it('round-trips string rows', () => {
    const rows = [{ name: 'Ada, "Countess"', note: 'line1\nline2' }, { name: '', note: 'plain' }];
    expect(textkit.parseCSV(textkit.toCSV(rows))).toEqual(rows);
  });
});
