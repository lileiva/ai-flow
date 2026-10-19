import { describe, it, expect } from 'vitest';
import { capitalize, camelCase, kebabCase } from '../src/index.js';

describe('case helpers', () => {
  it('capitalizes the first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('converts to camelCase', () => {
    expect(camelCase('hello big world')).toBe('helloBigWorld');
  });

  it('converts to kebab-case', () => {
    expect(kebabCase('HelloBigWorld')).toBe('hello-big-world');
  });
});
