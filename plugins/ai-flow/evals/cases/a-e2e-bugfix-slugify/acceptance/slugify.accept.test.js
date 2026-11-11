// Hidden acceptance suite for case (a). Injected only at grading time (REQ-006 S3).
import { describe, it, expect } from 'vitest';
import { slugify } from '../src/index.js';

describe('slugify (acceptance)', () => {
  it('strips diacritics', () => {
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
  });

  it('strips diacritics in mixed text', () => {
    expect(slugify('Façade déjà vu')).toBe('facade-deja-vu');
  });

  it('handles tildes and umlauts', () => {
    expect(slugify('Ñandú Über Alles')).toBe('nandu-uber-alles');
  });

  it('keeps existing behaviour for plain ASCII', () => {
    expect(slugify('  Rock & Roll!!  ')).toBe('rock-roll');
  });
});
