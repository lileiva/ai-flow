// Descriptive statistics (design D8): mean and sample stdev (n-1). n=1 gives stdev 0 with n_lt_2.

const round = (x) => Math.round(x * 1000) / 1000;

export function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sampleStdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** { mean, stdev } rounded to 3 decimals, plus n_lt_2 when fewer than 2 values. null for no values. */
export function describe(xs) {
  if (xs.length === 0) return null;
  const d = { mean: round(mean(xs)), stdev: round(sampleStdev(xs)) };
  if (xs.length < 2) d.n_lt_2 = true;
  return d;
}

/**
 * n/a-aware describe (REQ-007 S5): values that are null or 'n/a' are excluded. 'n/a' when none apply,
 * else describe() of the applicable values plus n_applicable.
 */
export function describeApplicable(values) {
  const xs = values.filter((v) => typeof v === 'number');
  if (xs.length === 0) return 'n/a';
  const { n_lt_2, ...d } = describe(xs);
  return { ...d, n_applicable: xs.length };
}
