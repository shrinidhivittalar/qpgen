/**
 * Largest-remainder method — distributes `total` integer units across
 * buckets proportional to `weights`, guaranteeing the output sums to
 * EXACTLY `total`. Naive per-bucket Math.round can over/undershoot by 1-2.
 *
 * Used for:
 *   - chapter question allocation  (weight = chapter weightPercent)
 *   - difficulty slot distribution (weight = difficulty share %)
 */
export function allocateByWeight(total: number, weights: number[]): number[] {
  if (total === 0 || weights.length === 0) return weights.map(() => 0);

  const sum = weights.reduce((a, b) => a + b, 0);

  // When all weights are 0 (teacher skipped the field), distribute evenly.
  const normalized = sum === 0
    ? weights.map(() => 1 / weights.length)
    : weights.map(w => w / sum);
  const raw        = normalized.map(w => total * w);
  const floors     = raw.map(Math.floor);

  let remainder = total - floors.reduce((a, b) => a + b, 0);

  const fractionalParts = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) {
    result[fractionalParts[k].i]++;
  }

  return result;
}
