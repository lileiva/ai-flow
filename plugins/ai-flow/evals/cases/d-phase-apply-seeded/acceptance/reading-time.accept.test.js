// Hidden acceptance suite for case (d). Injected only at grading time (REQ-006 S3).
import { describe, it, expect } from 'vitest';
import * as textkit from '../src/index.js';

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('wordCount (acceptance)', () => {
  it('counts words separated by runs of whitespace', () => {
    expect(textkit.wordCount('the quick  brown\tfox')).toBe(4);
    expect(textkit.wordCount('  one\ntwo  ')).toBe(2);
  });
  it('returns 0 for blank text', () => {
    expect(textkit.wordCount('   ')).toBe(0);
  });
});

describe('readingTime (acceptance)', () => {
  it('rounds up at the default 200 words per minute', () => {
    expect(textkit.readingTime(words(201))).toBe(2);
    expect(textkit.readingTime(words(200))).toBe(1);
  });
  it('honours wordsPerMinute', () => {
    expect(textkit.readingTime(words(300), { wordsPerMinute: 100 })).toBe(3);
  });
  it('returns 0 for empty text', () => {
    expect(textkit.readingTime('')).toBe(0);
  });
});
