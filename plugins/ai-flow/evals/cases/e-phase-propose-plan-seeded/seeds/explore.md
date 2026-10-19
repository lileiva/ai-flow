# Exploration: capitalize-options

## Problem
textkit's `capitalize(str)` (in `src/case.js`) uppercases the first character with `toUpperCase()` and leaves the rest untouched. Users asked for two options:
- `locale`: uppercase with `toLocaleUpperCase(locale)`, so Turkish `'istanbul'` with locale `'tr'` becomes `'İstanbul'`.
- `preserveRest`: when `false`, lowercase the rest of the string (`'hELLO'` -> `'Hello'`). Default `true`, which keeps today's behaviour.

## Codebase findings
- `capitalize` is exported from `src/index.js` and used internally by `camelCase`.
- `test/case.test.js` covers `capitalize`, `camelCase` and `kebabCase`; vitest, `npm test`.
- No other callers. No dependencies.

## Approaches
1. **Options object on `capitalize(str, { locale, preserveRest })`** (recommended). Backwards compatible, since both options are optional and the defaults keep current behaviour. `camelCase` stays unchanged.
2. **A new `capitalizeLocale(str, locale)` function.** No signature change, but it splits one concept across two APIs and does not cover `preserveRest`.
3. **Global configuration.** Rejected: hidden state, awkward to test.

## Recommendation
Approach 1. Small change confined to `src/case.js` and its tests: one implementation task plus tests, with a tracer bullet on the `preserveRest` option.

## Open questions
- Should `locale` also apply to `preserveRest: false` lowercasing? Recommended: yes, use `toLocaleLowerCase(locale)`.
