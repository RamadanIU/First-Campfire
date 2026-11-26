import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../art/sprite.ts';
import type { MapObject } from '../sim/objects.ts';
import { placementOf, WIND } from './mapRenderer.ts';

const at = (id: number, def = 'oak'): MapObject => ({
  id,
  def,
  x: 10,
  y: 20,
  state: 'grown',
  stock: 0,
});

describe('объект на карте', () => {
  it('спрайт — из таблицы объектов; стоит на своём тайле, сдвинут на несколько пикселей', () => {
    const shifts = new Set<string>();
    for (let id = 1; id <= 200; id++) {
      const placement = placementOf(at(id));
      expect(placement.sprite).toBe('tree');
      const dx = placement.x - (10 * TILE_SIZE + TILE_SIZE / 2);
      const dy = placement.y - (20 * TILE_SIZE + TILE_SIZE - 3);
      expect(Math.abs(dx)).toBeLessThanOrEqual(3);
      expect(Math.abs(dy)).toBeLessThanOrEqual(2);
      expect(Number.isInteger(placement.x) && Number.isInteger(placement.y)).toBe(true);
      shifts.add(`${dx},${dy}`);
    }
    // Not planted in rows: many different shifts.
    expect(shifts.size).toBeGreaterThan(20);
    expect(placementOf(at(5, 'berry_bush')).sprite).toBe('berry_bush');
  });

  it('один и тот же объект — всегда на том же месте и с той же фазой качания', () => {
    expect(placementOf(at(77))).toEqual(placementOf(at(77)));
    const phases = new Set(Array.from({ length: 50 }, (_, i) => placementOf(at(i + 1)).phase));
    expect(phases.size).toBeGreaterThan(40);
  });

  it('ветер идёт волной: правее и ниже на карте — качается позже, разброс своей фазы меньше шага волны', () => {
    const phase = (x: number, y: number, id = 1) => placementOf({ ...at(id), x, y }).phase!;
    for (let id = 1; id <= 20; id++) {
      // Ten tiles to the right — the gust comes ~0.9 s later, whatever the jitter.
      expect(phase(10, 20, id) - phase(20, 20, id + 100)).toBeGreaterThan(
        10 * WIND.perTileX - WIND.jitter,
      );
      expect(phase(10, 20, id) - phase(10, 30, id + 100)).toBeGreaterThan(
        10 * WIND.perTileY - WIND.jitter,
      );
    }
  });
});
