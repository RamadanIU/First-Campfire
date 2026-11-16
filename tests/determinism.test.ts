/**
 * Determinism: one seed — one history (docs/ARCHITECTURE.md, rule 1).
 *
 * If one of these tests fails, something in src/sim depends on more than the seed: hunt down
 * the source of nondeterminism. Never adjust the test to make it pass.
 */
import { describe, expect, it } from 'vitest';
import { hashState } from '../src/sim/hash.ts';
import { createWorld, runTicks } from '../src/sim/world.ts';

function hashAfter(seed: number, ticks: number): string {
  const world = createWorld(seed);
  runTicks(world, ticks);
  return hashState(world);
}

describe('детерминизм', () => {
  it('одно зерно дважды даёт одинаковый хэш через 10 000 тиков', () => {
    expect(hashAfter(42, 10_000)).toBe(hashAfter(42, 10_000));
  });

  it('другое зерно — другой хэш', () => {
    const hashes = [1, 2, 3, 42, 43, 1_000_000].map((seed) => hashAfter(seed, 10_000));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('хэш меняется с каждым тиком', () => {
    const world = createWorld(42);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      seen.add(hashState(world));
      runTicks(world, 1);
    }
    expect(seen.size).toBe(300);
  });

  it('промотка частями равна промотке целиком', () => {
    const world = createWorld(42);
    for (const chunk of [1, 999, 4000, 5000]) runTicks(world, chunk);
    expect(hashState(world)).toBe(hashAfter(42, 10_000));
  });

  it('состояние мира — простые данные: после JSON хэш тот же', () => {
    const world = createWorld(42);
    runTicks(world, 10_000);
    const copy = JSON.parse(JSON.stringify(world));
    expect(hashState(copy)).toBe(hashState(world));
  });

  it('копия мира, пропущенная через JSON, продолжает ту же историю', () => {
    const world = createWorld(42);
    runTicks(world, 3_333);
    const copy = JSON.parse(JSON.stringify(world));
    runTicks(world, 6_667);
    runTicks(copy, 6_667);
    expect(hashState(copy)).toBe(hashState(world));
  });
});
