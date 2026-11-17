/**
 * Determinism: one seed — one history (docs/ARCHITECTURE.md, rule 1).
 *
 * If one of these tests fails, something in src/sim depends on more than the seed: hunt down
 * the source of nondeterminism. Never adjust the test to make it pass.
 */
import { describe, expect, it } from 'vitest';
import { hashState } from '../src/sim/hash.ts';
import { fromSaveJson, loadWorld, saveWorld, toSaveJson } from '../src/sim/save.ts';
import { createWorld, runTicks, type World } from '../src/sim/world.ts';

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

  // JSON as saves write it: the map's typed arrays go as tagged base64 (ADR-016); plain
  // JSON.stringify would turn them into objects of numbered keys.
  it('состояние мира — простые данные: после JSON (как в сохранении) хэш тот же', () => {
    const world = createWorld(42);
    runTicks(world, 10_000);
    const copy = fromSaveJson(toSaveJson(world));
    expect(hashState(copy)).toBe(hashState(world));
  });

  it('копия мира, пропущенная через JSON (как в сохранении), продолжает ту же историю', () => {
    const world = createWorld(42);
    runTicks(world, 3_333);
    const copy = fromSaveJson(toSaveJson(world)) as World;
    runTicks(world, 6_667);
    runTicks(copy, 6_667);
    expect(hashState(copy)).toBe(hashState(world));
  });

  it('загруженный мир продолжается так же, как непрерывный: 5 000 → сохранить → загрузить → ещё 5 000', () => {
    for (const seed of [1, 42, 1_000_000]) {
      const world = createWorld(seed);
      runTicks(world, 5_000);
      const result = loadWorld(saveWorld(world));
      if (!result.ok) throw new Error(result.error.message);
      const resumed: World = result.world;
      runTicks(resumed, 5_000);
      expect(resumed.tick).toBe(10_000);
      expect(hashState(resumed), `зерно ${seed}`).toBe(hashAfter(seed, 10_000));
    }
  });

  it('сохранение и загрузка много раз подряд не меняют историю', () => {
    let world = createWorld(7);
    for (const chunk of [1, 399, 1_200, 3_000, 5_400]) {
      runTicks(world, chunk);
      const result = loadWorld(saveWorld(world));
      if (!result.ok) throw new Error(result.error.message);
      world = result.world;
    }
    expect(hashState(world)).toBe(hashAfter(7, 10_000));
  });
});
