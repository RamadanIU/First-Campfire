import { describe, expect, it } from 'vitest';
import { fallingLeaves, LEAF, SHEDDING } from './leaves.ts';

describe('листопад осенью', () => {
  const times = Array.from({ length: 400 }, (_, i) => i * 100);

  it('один и тот же момент — те же листья (кадр по адресу воспроизводим)', () => {
    for (const t of [0, 1234, 98765]) {
      expect(fallingLeaves(7, 'tree', 100, 200, t)).toEqual(fallingLeaves(7, 'tree', 100, 200, t));
    }
  });

  it('листья летят: у каждого дерева время от времени, не больше двух сразу', () => {
    for (const sprite of Object.keys(SHEDDING)) {
      const counts = times.map((t) => fallingLeaves(3, sprite, 0, 0, t).length);
      expect(Math.max(...counts), sprite).toBeLessThanOrEqual(LEAF.slots);
      expect(counts.some((n) => n > 0), sprite).toBe(true);
      expect(counts.some((n) => n === 0), sprite).toBe(true);
    }
  });

  it('лист падает от кроны к земле у ствола: сверху вниз, ветер сносит вправо', () => {
    for (let id = 1; id <= 30; id++) {
      for (const t of times) {
        for (const leaf of fallingLeaves(id, 'tree', 500, 500, t)) {
          expect(leaf.y).toBeGreaterThanOrEqual(500 + SHEDDING.tree!.top - 1);
          expect(leaf.y).toBeLessThanOrEqual(500);
          expect(leaf.x).toBeGreaterThanOrEqual(500 + SHEDDING.tree!.left - 3);
          expect(leaf.x).toBeLessThanOrEqual(500 + SHEDDING.tree!.right + 17);
        }
      }
    }
  });

  it('с пней, кустов и камней листья не летят', () => {
    for (const sprite of ['stump', 'berry_bush', 'stone', 'hazel']) {
      expect(times.every((t) => fallingLeaves(1, sprite, 0, 0, t).length === 0)).toBe(true);
    }
  });
});
