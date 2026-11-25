/**
 * The look of the seasons (step 1.10, GDD §3.2, §10.1): the world is recoloured by swapping whole
 * ramps of the palette for their seasonal shifts (./palette.ts, ramps with `season`). Summer is the
 * world as drawn; spring is fresher and lighter; in autumn the grass dries yellow and the leaves turn
 * red and orange; in winter snow lies on the grass and the sand and on the crowns of the trees.
 *
 * Two tables: the ground (`terrainSwap` — grass and sand of the tiles) and the things standing on it
 * (`objectSwap` — leaves of trees and bushes, tufts of grass). Nuts, berries, bark and people keep
 * their colours. Pure data: src/render applies them.
 */
import type { PaletteSwap } from './palette.ts';

/** Seasons by id, the same as src/sim/calendar.ts (art does not import the simulation). */
export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASON_IDS: readonly SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

/** How the ground of each season is recoloured. */
export const TERRAIN_SWAPS: Readonly<Record<SeasonId, PaletteSwap>> = {
  spring: { grass: 'grass_spring' },
  summer: {},
  autumn: { grass: 'grass_autumn' },
  winter: { grass: 'snow', sand: 'snow_sand' },
};

/** How the objects of the map (trees, bushes, tufts of grass) are recoloured in each season. */
export const OBJECT_SWAPS: Readonly<Record<SeasonId, PaletteSwap>> = {
  spring: { leaf: 'leaf_spring', grass: 'grass_spring' },
  summer: {},
  autumn: { leaf: 'leaf_autumn', grass: 'grass_autumn' },
  winter: { leaf: 'leaf_winter', grass: 'snow' },
};

export function terrainSwap(season: SeasonId): PaletteSwap {
  return TERRAIN_SWAPS[season];
}

export function objectSwap(season: SeasonId): PaletteSwap {
  return OBJECT_SWAPS[season];
}
