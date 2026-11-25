import { describe, expect, it } from 'vitest';
import { PALETTE, RAMPS, validateSwap } from './palette.ts';
import { OBJECT_SWAPS, SEASON_IDS, TERRAIN_SWAPS } from './seasons.ts';

describe('сезоны: подмена рядов палитры (шаг 1.10)', () => {
  const swaps = [...Object.values(TERRAIN_SWAPS), ...Object.values(OBJECT_SWAPS)];

  it('каждая подмена — ряд той же длины; лето — мир как нарисован', () => {
    for (const swap of swaps) expect(validateSwap(PALETTE, swap)).toEqual([]);
    expect(TERRAIN_SWAPS.summer).toEqual({});
    expect(OBJECT_SWAPS.summer).toEqual({});
    expect(SEASON_IDS).toEqual(['spring', 'summer', 'autumn', 'winter']);
  });

  it('сезонные ряды — только цели подмен, и каждый где-то используется', () => {
    const seasonal = new Set<string>(
      RAMPS.filter((ramp) => 'season' in ramp).map((ramp) => ramp.name),
    );
    const targets = new Set(swaps.flatMap((swap) => Object.values(swap) as string[]));
    expect([...targets].sort()).toEqual([...seasonal].sort());
    // Sources are rows of the master palette, never seasonal shifts.
    for (const swap of swaps) {
      for (const from of Object.keys(swap)) expect(seasonal.has(from), from).toBe(false);
    }
  });

  it('зимой снег ложится на траву, песок и кроны; осенью листва рыжая', () => {
    expect(TERRAIN_SWAPS.winter).toMatchObject({ grass: 'snow', sand: 'snow_sand' });
    expect(OBJECT_SWAPS.winter).toMatchObject({ leaf: 'leaf_winter' });
    expect(OBJECT_SWAPS.autumn).toMatchObject({ leaf: 'leaf_autumn' });
  });
});
