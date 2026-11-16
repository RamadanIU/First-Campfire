/**
 * Deterministic math for the simulation.
 *
 * ECMAScript leaves Math.log, Math.exp, Math.sin, Math.pow (and `**`) "implementation-approximated":
 * different browsers may return results that differ in the last bit, and one bit is enough for
 * two histories of the same seed to drift apart. The simulation therefore uses only operations
 * that IEEE 754 defines exactly (+ − × ÷, Math.sqrt, rounding, comparisons) and the functions
 * below, built from them. tests/architecture.test.ts forbids the inexact built-ins in src/sim.
 */

const TWO_POW_64 = 4294967296 * 4294967296;
const TWO_POW_MINUS_64 = 1 / TWO_POW_64;

/**
 * Natural logarithm computed with basic arithmetic only, so it is bit-for-bit identical in every
 * JavaScript engine. Accurate to about 1e-16 relative error.
 */
export function ln(x: number): number {
  if (Number.isNaN(x) || x < 0) return Number.NaN;
  if (x === 0) return Number.NEGATIVE_INFINITY;
  if (x === Number.POSITIVE_INFINITY) return x;

  // x = m · 2^e with m in [1, 2). Multiplying and dividing by powers of two is exact.
  let m = x;
  let e = 0;
  while (m >= TWO_POW_64) {
    m *= TWO_POW_MINUS_64;
    e += 64;
  }
  while (m < TWO_POW_MINUS_64) {
    m *= TWO_POW_64;
    e -= 64;
  }
  while (m >= 2) {
    m /= 2;
    e += 1;
  }
  while (m < 1) {
    m *= 2;
    e -= 1;
  }
  // Centre m around 1 (m in [√½, √2)) so the series converges fast.
  if (m > Math.SQRT2) {
    m /= 2;
    e += 1;
  }

  // ln(m) = 2·atanh(s) = 2·(s + s³/3 + s⁵/5 + …), s = (m − 1)/(m + 1), |s| ≤ 0.1716.
  // Twelve terms reach full double precision; a fixed count keeps the cost predictable.
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let series = 0;
  for (let k = 23; k >= 1; k -= 2) series = 1 / k + s2 * series;
  return e * Math.LN2 + 2 * s * series;
}

/** Clamp `value` into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
