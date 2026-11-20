const scoreFormatter = new Intl.NumberFormat('en-NG', { style: 'percent', maximumFractionDigits: 2 });

/** Display precision only; maturity levels are calculated from the original score. */
export function formatScore(score: number): string {
  return scoreFormatter.format(score / 100);
}
