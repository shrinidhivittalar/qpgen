import { describe, it, expect } from 'vitest';
import { allocateByWeight } from '../allocation.js';

describe('allocateByWeight', () => {
  it('sums to exactly total and roughly matches weight ratios for [50,30,20]', () => {
    const result = allocateByWeight(10, [50, 30, 20]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(10);
    expect(result).toEqual([5, 3, 2]);
  });

  it('sums to exactly 10 for equal thirds — the case naive rounding gets wrong (3+3+3=9)', () => {
    const result = allocateByWeight(10, [33.3, 33.3, 33.4]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(10);
    // One bucket must receive the extra unit; total is the hard invariant
    expect(result.every(n => n >= 3)).toBe(true);
  });

  it('sums to exactly 1 when total < weight count — edge: cannot give every bucket a unit', () => {
    const result = allocateByWeight(1, [50, 50]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(1);
    expect(result).toHaveLength(2);
  });

  it('returns all zeros for total = 0', () => {
    expect(allocateByWeight(0, [50, 50])).toEqual([0, 0]);
  });

  it('normalises weights that do not sum to 100 and still sums to total', () => {
    // Teacher selected 2 of 3 chapters: [40, 40] → treated as 50/50
    const result = allocateByWeight(10, [40, 40]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(10);
    expect(result).toEqual([5, 5]);
  });

  it('returns empty array for empty weights', () => {
    expect(allocateByWeight(10, [])).toEqual([]);
  });

  it('handles a single weight — entire total goes to the only bucket', () => {
    expect(allocateByWeight(7, [100])).toEqual([7]);
  });

  it('handles all-zero weights without dividing by zero — returns all zeros', () => {
    expect(allocateByWeight(10, [0, 0, 0])).toEqual([0, 0, 0]);
  });
});
