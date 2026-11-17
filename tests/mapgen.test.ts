/**
 * Promises of the map generator (step 1.1), checked on seeds 1…100: there is water, connected by
 * the sides of tiles and with a rim of shallows around deep water; there is forest; there are at
 * least `bushes.min` berry bushes; there is a dry place for the camp near water and forest. And
 * the map is consistent: objects stand on land, one per tile, the object layer matches the list.
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import { groundAt, groundCounts, inside, isWater, tileIndex } from '../src/sim/map.ts';
import { findCampSite } from '../src/sim/mapgen.ts';
import { defOf, objectAt } from '../src/sim/objects.ts';
import { createWorld, type World } from '../src/sim/world.ts';

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
const WORLDS: World[] = SEEDS.map((seed) => createWorld(seed));
const PARAMS = DATA.balance.map;

const isDeep = (world: World, x: number, y: number) => groundAt(world.map, x, y) === 'deep_water';

/** Groups of water tiles connected by the sides. */
function waterGroups(world: World): number {
  const { map } = world;
  const seen = new Uint8Array(map.width * map.height);
  let groups = 0;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (seen[tileIndex(map, x, y)] || !isWater(map, x, y)) continue;
      groups++;
      const stack = [[x, y] as const];
      seen[tileIndex(map, x, y)] = 1;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inside(map, nx, ny) || seen[tileIndex(map, nx, ny)] || !isWater(map, nx, ny))
            continue;
          seen[tileIndex(map, nx, ny)] = 1;
          stack.push([nx, ny]);
        }
      }
    }
  }
  return groups;
}

// Checks that look at every tile or object of a hundred maps collect what is wrong and compare
// the list once: a separate expect per tile is the same check, but ten times slower (seconds).

describe('гарантии генератора карты на зёрнах 1…100', () => {
  it('есть вода, она связна по сторонам тайлов (без стыков только углами)', () => {
    for (const world of WORLDS) {
      const { map } = world;
      const counts = groundCounts(map);
      const water = counts.shallow_water! + counts.deep_water!;
      expect(water, `зерно ${world.seed}`).toBeGreaterThanOrEqual(60);
      expect(waterGroups(world), `зерно ${world.seed}: вода одним водоёмом`).toBe(1);
      const corners: string[] = [];
      for (let y = 0; y + 1 < map.height; y++) {
        for (let x = 0; x + 1 < map.width; x++) {
          const a = isWater(map, x, y);
          const b = isWater(map, x + 1, y);
          const c = isWater(map, x, y + 1);
          const d = isWater(map, x + 1, y + 1);
          const cornerOnly = (a && d && !b && !c) || (b && c && !a && !d);
          if (cornerOnly) corners.push(`(${x}, ${y})`);
        }
      }
      expect(corners, `зерно ${world.seed}: вода касается только углом`).toEqual([]);
    }
  });

  it('глубокая вода не касается суши и лежит заводями не уже двух тайлов', () => {
    for (const world of WORLDS) {
      const { map } = world;
      const ashore: string[] = [];
      const lonely: string[] = [];
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (!isDeep(world, x, y)) continue;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!isWater(map, x + dx, y + dy)) ashore.push(`(${x}, ${y})`);
            }
          }
          const pooled = [
            [0, 0],
            [-1, 0],
            [0, -1],
            [-1, -1],
          ].some(([dx, dy]) =>
            [
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
            ].every(([ex, ey]) => {
              const px = x + dx! + ex!;
              const py = y + dy! + ey!;
              return inside(map, px, py) && isDeep(world, px, py);
            }),
          );
          if (!pooled) lonely.push(`(${x}, ${y})`);
        }
      }
      expect(ashore, `зерно ${world.seed}: глубина касается суши`).toEqual([]);
      expect(lonely, `зерно ${world.seed}: одиночная глубина`).toEqual([]);
    }
  });

  it('есть лес: деревья занимают заметную долю суши', () => {
    for (const world of WORLDS) {
      const counts = groundCounts(world.map);
      const land = counts.grass! + counts.dirt! + counts.sand!;
      const trees = world.objects.list.filter((o) => defOf(o).place === 'forest').length;
      expect(trees, `зерно ${world.seed}`).toBeGreaterThanOrEqual(
        Math.floor(land * (PARAMS.forestPercent / 100) * 0.25),
      );
    }
  });

  it(`ягодных кустов не меньше ${PARAMS.bushes.min}`, () => {
    for (const world of WORLDS) {
      const bushes = world.objects.list.filter((o) => o.def === 'berry_bush').length;
      expect(bushes, `зерно ${world.seed}`).toBeGreaterThanOrEqual(PARAMS.bushes.min);
      expect(bushes, `зерно ${world.seed}`).toBeLessThanOrEqual(PARAMS.bushes.max);
    }
  });

  it('есть сухое место под стоянку у воды и леса', () => {
    const { size, waterDistance, forestDistance } = PARAMS.camp;
    const half = Math.floor(size / 2);
    for (const world of WORLDS) {
      const camp = findCampSite(world.map, world.objects);
      expect(camp, `зерно ${world.seed}`).not.toBeNull();
      expect(camp!.waterDistance).toBeLessThanOrEqual(waterDistance);
      expect(camp!.forestDistance).toBeLessThanOrEqual(forestDistance);
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const x = camp!.x + dx;
          const y = camp!.y + dy;
          expect(isWater(world.map, x, y)).toBe(false);
          const object = objectAt(world.map, world.objects, x, y);
          expect(object === undefined || defOf(object).walkable, `зерно ${world.seed}`).toBe(true);
        }
      }
    }
  });

  it('объекты стоят на суше по одному на тайл; слой объектов совпадает со списком', () => {
    for (const world of WORLDS) {
      const { map, objects } = world;
      const wrong: string[] = [];
      let previous = 0;
      for (const object of objects.list) {
        const at = `#${object.id} ${object.def} (${object.x}, ${object.y})`;
        if (object.id <= previous) wrong.push(`${at}: номер не растёт`);
        previous = object.id;
        if (!inside(map, object.x, object.y)) wrong.push(`${at}: за краем карты`);
        else if (isWater(map, object.x, object.y)) wrong.push(`${at}: в воде`);
        else if (map.object[tileIndex(map, object.x, object.y)] !== object.id)
          wrong.push(`${at}: в слое объектов другой номер`);
        if (!defOf(object).states.includes(object.state))
          wrong.push(`${at}: неизвестное состояние «${object.state}»`);
      }
      expect(wrong, `зерно ${world.seed}`).toEqual([]);
      expect(objects.nextId).toBe(previous + 1);
      expect(map.object.filter((id) => id !== 0).length).toBe(objects.list.length);
    }
  });

  it('встречаются и река, и озеро; есть все виды объектов', () => {
    // A river crosses the map: its water touches two opposite edges.
    const crossing = (world: World) => {
      const { map } = world;
      const edge = (test: (i: number) => boolean) =>
        Array.from({ length: map.width }, (_, i) => i).some(test);
      const north = edge((i) => isWater(map, i, 0));
      const south = edge((i) => isWater(map, i, map.height - 1));
      const west = edge((i) => isWater(map, 0, i));
      const east = edge((i) => isWater(map, map.width - 1, i));
      return (north && south) || (west && east);
    };
    const rivers = WORLDS.filter(crossing).length;
    expect(rivers).toBeGreaterThan(40);
    expect(rivers).toBeLessThan(90);
    const kinds = new Set(WORLDS.flatMap((w) => w.objects.list.map((o) => o.def)));
    expect([...kinds].sort()).toEqual(DATA.objects.records.map((d) => d.id).sort());
  });
});
