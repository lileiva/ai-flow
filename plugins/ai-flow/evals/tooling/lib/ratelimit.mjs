// Subscription rate-limit utilization from rate_limit_event trace lines (design F12; user decision 2026-10-18:
// informational only. Preflight warns at high utilization; rate-limited runs are harness errors that stop the runner).

/** { <window>: { utilization, status, resets_at } } keeping the highest utilization seen per window. */
export function rateLimitStatus(lines) {
  const out = {};
  for (const o of lines) {
    if (o.type !== 'rate_limit_event' || !o.rate_limit_info) continue;
    const i = o.rate_limit_info;
    const w = i.rateLimitType ?? i.type ?? 'unknown';
    if (typeof i.utilization !== 'number') continue;
    if (!out[w] || i.utilization >= out[w].utilization) out[w] = { utilization: i.utilization, status: i.status ?? null, resets_at: i.resetsAt ?? null };
  }
  return out;
}

/** A human-readable warning when any window is at or above `threshold`, else null. Never throws, never blocks. */
export function utilizationWarning(status, threshold = 0.8) {
  const high = Object.entries(status ?? {}).filter(([, s]) => s.utilization >= threshold);
  if (!high.length) return null;
  return `warning: subscription utilization is high (${high.map(([w, s]) => `${w} ${Math.round(s.utilization * 100)}%`).join(', ')}); a long eval run may hit the rate limit (rate-limited runs stop the runner)`;
}
