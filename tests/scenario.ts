/**
 * Small hand-drawn worlds for scenario tests (docs/ARCHITECTURE.md, «Тестирование»): a map is a
 * list of rows, one character per tile.
 *
 *   .  grass        ,  sand        :  dirt
 *   ~  shallow water               =  deep water
 *   T  oak (blocks the way)        B  berry bush (blocks)        o  boulder (blocks)
 *   *  flowers (walkable)          "  tall grass (walkable)
 *
 * The world is a real one — `createWorld(seed, { map })` — so its villagers, systems and streams
 * are the game's own; only the map is given.
 */

import { createMap, setGround } from '../src/sim/map.ts';
import type { GeneratedMap } from '../src/sim/mapgen.ts';
import { createObjects, placeObject } from '../src/sim/objects.ts';
import { placeVillager } from '../src/sim/villagers.ts';
import { createWorld, type World } from '../src/sim/world.ts';

const GROUND: Record<string, string> = {
  '.': 'grass',
  ',': 'sand',
  ':': 'dirt',
  '~': 'shallow_water',
  '=': 'deep_water',
};
const OBJECTS: Record<string, string> = {
  T: 'oak',
  B: 'berry_bush',
  o: 'boulder',
  '*': 'flowers',
  '"': 'tall_grass',
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A map from rows of characters (see the legend above); objects stand on grass. */
export function mapFromRows(rows: readonly string[]): GeneratedMap {
  const height = rows.length;
  const width = rows[0]!.length;
  if (rows.some((row) => row.length !== width)) throw new Error('Ряды карты разной длины');
  const map = createMap(width, height, gcd(width, height));
  const objects = createObjects();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const char = rows[y]![x]!;
      const ground = GROUND[char] ?? (OBJECTS[char] ? 'grass' : undefined);
      if (!ground) throw new Error(`Неизвестный знак карты «${char}» в (${x}, ${y})`);
      setGround(map, x, y, ground);
      const object = OBJECTS[char];
      if (object) placeObject(map, objects, object, x, y);
    }
  }
  return { map, objects };
}

/**
 * A world on a hand-drawn map. Its two villagers stand where the game puts them, or — if `places`
 * are given (one per villager) — on those tiles, which become their homes; they rest until the
 * first tick.
 */
export function worldOn(
  rows: readonly string[],
  places: readonly { x: number; y: number }[] = [],
  seed = 1,
): World {
  const world = createWorld(seed, { map: mapFromRows(rows) });
  if (places.length === 0) return world;
  if (places.length !== world.villagers.list.length) {
    throw new Error(`Нужно ${world.villagers.list.length} места — по одному на жителя`);
  }
  places.forEach((place, i) => {
    const villager = world.villagers.list[i]!;
    placeVillager(world, villager, place.x, place.y);
    villager.home = { x: place.x, y: place.y };
  });
  return world;
}

/** An open meadow `width`×`height` of grass. */
export function meadow(width: number, height: number): string[] {
  return Array.from({ length: height }, () => '.'.repeat(width));
}
