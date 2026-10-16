/** The p-th percentile (0-100) by the nearest-rank method. Throws on an empty list rather than inventing a number. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0)
    throw new Error("No measurements were taken, so there is no percentile to report.");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  const value = sorted[rank - 1];
  if (value === undefined) throw new Error("percentile: rank out of range");
  return value;
}

export function summarize(latenciesMs: number[]): {
  n: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
} {
  return {
    n: latenciesMs.length,
    minMs: Math.min(...latenciesMs),
    p50Ms: percentile(latenciesMs, 50),
    p95Ms: percentile(latenciesMs, 95),
    maxMs: Math.max(...latenciesMs),
  };
}

export const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
