/**
 * Random numbers for the simulation: one seed — one history.
 *
 * Generator: sfc32 (Chris Doty-Humphrey's "small fast counting" generator, 128-bit state),
 * seeded through splitmix32. It is fast in JavaScript (32-bit integer ops only), passes
 * PractRand/BigCrush and has no bad seeds thanks to its counter.
 *
 * The state is plain data — four uint32 numbers — so it lives inside the world, is hashed and
 * saved together with it. Every system draws from its own named stream (`createRng(seed, name)`):
 * a new system adds a new stream instead of shifting the numbers other systems receive.
 *
 * All helpers consume a fixed number of draws where possible (e.g. `chance` always draws, even
 * for p = 0), so tuning a probability does not shift the rest of a stream.
 */
import { ln } from './math.ts';

/** Serializable generator state. Mutated in place by every draw. */
export interface Rng {
  a: number;
  b: number;
  c: number;
  d: number;
}

const TWO_POW_32 = 4294967296;

/** FNV-1a hash of a string to uint32. Used to turn stream names into seeds. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** splitmix32 finalizer: a strong 32-bit mix. */
function mix32(value: number): number {
  let z = value | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * Create a generator for `seed` (a non-negative safe integer) and a stream name.
 * Different names give independent sequences for the same seed.
 */
export function createRng(seed: number, stream = ''): Rng {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error(`Зерно должно быть целым неотрицательным числом, получено: ${seed}`);
  }
  const low = seed >>> 0;
  const high = Math.floor(seed / TWO_POW_32);
  let s = mix32(low ^ mix32(high ^ 0x5bd1e995)) ^ hashString(stream);
  const next = () => {
    s = (s + 0x9e3779b9) | 0;
    return mix32(s);
  };
  const rng: Rng = { a: next(), b: next(), c: next(), d: next() };
  // Let the first outputs stir the freshly seeded state.
  for (let i = 0; i < 12; i++) nextUint32(rng);
  return rng;
}

/** Copy of a generator state (for previews that must not disturb the original stream). */
export function cloneRng(rng: Rng): Rng {
  return { a: rng.a, b: rng.b, c: rng.c, d: rng.d };
}

/** Next uniformly distributed uint32 in [0, 2^32). */
export function nextUint32(rng: Rng): number {
  const t = (((rng.a + rng.b) | 0) + rng.d) | 0;
  rng.d = (rng.d + 1) >>> 0;
  rng.a = (rng.b ^ (rng.b >>> 9)) >>> 0;
  rng.b = (rng.c + (rng.c << 3)) >>> 0;
  const c = (rng.c << 21) | (rng.c >>> 11);
  rng.c = (c + t) >>> 0;
  return t >>> 0;
}

/** Uniform float in [0, 1) with 32 bits of resolution. */
export function nextFloat(rng: Rng): number {
  return nextUint32(rng) / TWO_POW_32;
}

/** Uniform float in [min, max). */
export function floatRange(rng: Rng, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

/** Uniform integer in [min, max], both ends included. No modulo bias. */
export function intRange(rng: Rng, min: number, max: number): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
    throw new Error(`intRange: неверный диапазон [${min}, ${max}]`);
  }
  const span = max - min + 1;
  if (span > TWO_POW_32) throw new Error(`intRange: диапазон шире 2^32: [${min}, ${max}]`);
  // Reject the top sliver of [0, 2^32) that would make some results more likely.
  const limit = TWO_POW_32 - (TWO_POW_32 % span);
  let value = nextUint32(rng);
  while (value >= limit) value = nextUint32(rng);
  return min + (value % span);
}

/** True with probability `p` (p ≤ 0 — never, p ≥ 1 — always). Always consumes one draw. */
export function chance(rng: Rng, p: number): boolean {
  return nextFloat(rng) < p;
}

/** Uniformly chosen element. Throws on an empty list. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: пустой список');
  return items[intRange(rng, 0, items.length - 1)]!;
}

/**
 * Index chosen with probability proportional to its weight. Weights must be finite and
 * non-negative with a positive sum. Always consumes one draw.
 */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const weight of weights) {
    if (!(weight >= 0) || !Number.isFinite(weight)) {
      throw new Error(`weightedIndex: недопустимый вес ${weight}`);
    }
    total += weight;
  }
  if (!(total > 0)) throw new Error('weightedIndex: сумма весов должна быть больше нуля');
  let target = nextFloat(rng) * total;
  let last = 0;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i]! <= 0) continue;
    last = i;
    if (target < weights[i]!) return i;
    target -= weights[i]!;
  }
  return last; // floating-point leftovers land on the last positive weight
}

/** Shuffle `items` in place (Fisher–Yates) and return it. */
export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = intRange(rng, 0, i);
    const swap = items[i]!;
    items[i] = items[j]!;
    items[j] = swap;
  }
  return items;
}

/**
 * Normally distributed number (Marsaglia polar method). Uses the deterministic `ln` from
 * ./math.ts instead of Math.log so the result is identical in every engine.
 */
export function normal(rng: Rng, mean = 0, deviation = 1): number {
  let u = 0;
  let v = 0;
  let s = 0;
  do {
    u = 2 * nextFloat(rng) - 1;
    v = 2 * nextFloat(rng) - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return mean + deviation * u * Math.sqrt((-2 * ln(s)) / s);
}
