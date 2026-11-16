import { describe, expect, it } from 'vitest';
import {
  chance,
  cloneRng,
  createRng,
  floatRange,
  hashString,
  intRange,
  nextFloat,
  nextUint32,
  normal,
  pick,
  shuffle,
  weightedIndex,
} from './rng.ts';

const draw = (seed: number, stream: string, count: number) => {
  const rng = createRng(seed, stream);
  return Array.from({ length: count }, () => nextUint32(rng));
};

describe('генератор случайных чисел', () => {
  it('одно зерно и поток — одна последовательность', () => {
    expect(draw(42, 'a', 100)).toEqual(draw(42, 'a', 100));
  });

  it('разные зёрна и разные потоки дают разные последовательности', () => {
    const base = draw(42, 'a', 8);
    expect(draw(43, 'a', 8)).not.toEqual(base);
    expect(draw(42, 'b', 8)).not.toEqual(base);
    expect(draw(42 + 2 ** 32, 'a', 8)).not.toEqual(base); // high bits of the seed matter
  });

  it('алгоритм не меняется незаметно (эталонные значения)', () => {
    // Changing the generator changes every history. If this fails on purpose, record it in
    // docs/DECISIONS.md and expect old saves to diverge.
    expect(draw(1, '', 4)).toEqual(GOLDEN_SEED_1);
    expect(draw(2026, 'fireflies', 4)).toEqual(GOLDEN_SEED_2026_FIREFLIES);
  });

  it('состояние — простые данные: после JSON последовательность продолжается так же', () => {
    const rng = createRng(7, 'x');
    for (let i = 0; i < 10; i++) nextUint32(rng);
    const copy = JSON.parse(JSON.stringify(rng));
    const clone = cloneRng(rng);
    const next = Array.from({ length: 20 }, () => nextUint32(rng));
    expect(Array.from({ length: 20 }, () => nextUint32(copy))).toEqual(next);
    expect(Array.from({ length: 20 }, () => nextUint32(clone))).toEqual(next);
  });

  it('потоки независимы: выборка из одного не сдвигает другой', () => {
    const a1 = createRng(5, 'a');
    const b1 = createRng(5, 'b');
    const a2 = createRng(5, 'a');
    const b2 = createRng(5, 'b');
    for (let i = 0; i < 50; i++) nextUint32(a1);
    expect(nextUint32(b1)).toBe(nextUint32(b2));
    expect(nextUint32(a2)).not.toBe(nextUint32(a1));
  });

  it('отвергает недопустимое зерно', () => {
    expect(() => createRng(-1)).toThrow();
    expect(() => createRng(1.5)).toThrow();
    expect(() => createRng(Number.NaN)).toThrow();
  });

  it('числа с плавающей точкой лежат в [0, 1) и равномерны', () => {
    const rng = createRng(1);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const x = nextFloat(rng);
      expect(x >= 0 && x < 1).toBe(true);
      buckets[Math.floor(x * 10)]++;
    }
    for (const count of buckets) expect(Math.abs(count - 10_000)).toBeLessThan(500);
    for (let i = 0; i < 1000; i++) {
      const y = floatRange(rng, -2, 3);
      expect(y >= -2 && y < 3).toBe(true);
    }
  });

  it('intRange включает обе границы и равномерен', () => {
    const rng = createRng(2);
    const counts = new Map<number, number>();
    for (let i = 0; i < 60_000; i++) {
      const value = intRange(rng, -2, 3);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3]);
    for (const count of counts.values()) expect(Math.abs(count - 10_000)).toBeLessThan(500);
    expect(intRange(rng, 7, 7)).toBe(7);
    expect(() => intRange(rng, 3, 2)).toThrow();
    expect(() => intRange(rng, 0, 1.5)).toThrow();
  });

  it('chance: 0 — никогда, 1 — всегда, 0,3 — примерно в 30 % случаев; всегда тратит одно число', () => {
    const rng = createRng(3);
    let hits = 0;
    for (let i = 0; i < 100_000; i++) {
      expect(chance(rng, 0)).toBe(false);
      expect(chance(rng, 1)).toBe(true);
      if (chance(rng, 0.3)) hits++;
    }
    expect(Math.abs(hits - 30_000)).toBeLessThan(800);

    const a = createRng(4);
    const b = createRng(4);
    chance(a, 0);
    chance(b, 0.9);
    expect(nextUint32(a)).toBe(nextUint32(b));
  });

  it('pick выбирает каждый элемент; пустой список — ошибка', () => {
    const rng = createRng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pick(rng, ['a', 'b', 'c']));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
    expect(() => pick(rng, [])).toThrow();
  });

  it('weightedIndex выбирает пропорционально весам и никогда — нулевой вес', () => {
    const rng = createRng(6);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) counts[weightedIndex(rng, [1, 0, 2, 3])]!++;
    expect(counts[1]).toBe(0);
    expect(Math.abs(counts[0]! - 10_000)).toBeLessThan(600);
    expect(Math.abs(counts[2]! - 20_000)).toBeLessThan(800);
    expect(Math.abs(counts[3]! - 30_000)).toBeLessThan(900);
    expect(() => weightedIndex(rng, [0, 0])).toThrow();
    expect(() => weightedIndex(rng, [1, -1])).toThrow();
  });

  it('shuffle переставляет, не теряя элементов', () => {
    const rng = createRng(7);
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = shuffle(rng, [...items]);
    expect(shuffled).not.toEqual(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it('normal: среднее и разброс как заказаны', () => {
    const rng = createRng(8);
    const n = 100_000;
    let sum = 0;
    let sumSq = 0;
    let within1 = 0;
    for (let i = 0; i < n; i++) {
      const x = normal(rng, 10, 2);
      sum += x;
      sumSq += x * x;
      if (Math.abs(x - 10) < 2) within1++;
    }
    const mean = sum / n;
    const deviation = Math.sqrt(sumSq / n - mean * mean);
    expect(Math.abs(mean - 10)).toBeLessThan(0.03);
    expect(Math.abs(deviation - 2)).toBeLessThan(0.03);
    expect(Math.abs(within1 / n - 0.6827)).toBeLessThan(0.01); // 68 % within one deviation
  });

  it('hashString стабилен', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('fireflies')).toBe(hashString('fireflies'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

// Pinned outputs of the generator (see the test "алгоритм не меняется незаметно").
const GOLDEN_SEED_1 = [2431374748, 975962115, 25686830, 621131508];
const GOLDEN_SEED_2026_FIREFLIES = [3012965455, 1331103610, 1014449848, 2908366252];
