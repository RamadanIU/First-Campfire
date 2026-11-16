import { describe, expect, it } from 'vitest';
import { clamp, ln } from './math.ts';

describe('ln (детерминированный логарифм)', () => {
  it('совпадает с Math.log с точностью до последних битов', () => {
    const samples = [
      1,
      2,
      0.5,
      Math.E,
      10,
      0.1,
      1e-10,
      1e-300,
      5e-324,
      1e300,
      1.7976931348623157e308,
      Math.SQRT2 * 0.9999999,
      Math.SQRT2 * 1.0000001,
      Math.SQRT1_2,
      123456.789,
      0.999999999,
      1.000000001,
    ];
    for (let i = 1; i <= 2000; i++) samples.push(i / 997, 997 / i, i * i * 1e-7);
    for (const x of samples) {
      const expected = Math.log(x);
      const tolerance = Math.max(Math.abs(expected) * 4e-16, 4e-16);
      expect(Math.abs(ln(x) - expected), `ln(${x})`).toBeLessThanOrEqual(tolerance);
    }
  });

  it('ln(1) = 0 точно, особые значения как у Math.log', () => {
    expect(ln(1)).toBe(0);
    expect(ln(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(ln(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(ln(-1)).toBeNaN();
    expect(ln(Number.NaN)).toBeNaN();
  });
});

describe('clamp', () => {
  it('прижимает значение к границам', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
