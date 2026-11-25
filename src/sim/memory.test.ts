import { describe, expect, it } from 'vitest';
import { meadow, worldOn } from '../../tests/scenario.ts';
import { DATA } from '../data/index.ts';
import { TIME, tickAt } from './calendar.ts';
import { setCrops } from './harvest.ts';
import {
  inStore,
  isPileTile,
  lay,
  pileSpot,
  pileTiles,
  roomAt,
  spoilSystem,
  spoilsAt,
} from './items.ts';
import {
  believesFood,
  cellsOf,
  isExplored,
  knownOf,
  look,
  noteFood,
  searchFrontier,
  share,
} from './memory.ts';
import { objectAt, takeFood } from './objects.ts';
import type { Villager } from './villagers.ts';

const { sightTiles, cellTiles } = DATA.balance.ai;

/** A long meadow with a raspberry bush and a hazel near the left end and far to the right. */
const ROWS = [
  '........................................',
  '..B.H...............................B.H.',
  '........................................',
];

function field() {
  const world = worldOn(ROWS, [
    { x: 1, y: 0 },
    { x: 1, y: 2 },
  ]);
  const [man, woman] = world.villagers.list as [Villager, Villager];
  return { world, man, woman };
}

describe('память о земле (шаг 1.11b)', () => {
  it('видит на ai.sightTiles вокруг: запоминает ближние кусты, дальних не знает', () => {
    const { world, man } = field();
    const near = objectAt(world.map, world.objects, 2, 1)!;
    const far = objectAt(world.map, world.objects, 36, 1)!;
    expect(knownOf(man, near.id)).toMatchObject({ full: true });
    expect(knownOf(man, far.id)).toBeUndefined();
    // Explored: the cell it stands in, not the far end.
    expect(isExplored(world, man, 1, 0)).toBe(true);
    expect(isExplored(world, man, 36, 1)).toBe(false);
    expect(man.seen).toHaveLength(cellsOf(world.map).across * cellsOf(world.map).down);
    expect(sightTiles).toBeLessThan(36 - 1);
  });

  it('клетка разведана, только если вся была в виду', () => {
    const world = worldOn(meadow(40, 40), [
      { x: 20, y: 20 },
      { x: 22, y: 20 },
    ]);
    const [man] = world.villagers.list as [Villager];
    for (let cy = 0; cy < 40 / cellTiles; cy++) {
      for (let cx = 0; cx < 40 / cellTiles; cx++) {
        if (!isExplored(world, man, cx * cellTiles, cy * cellTiles)) continue;
        for (const [x, y] of [
          [cx * cellTiles, cy * cellTiles],
          [cx * cellTiles + cellTiles - 1, cy * cellTiles + cellTiles - 1],
          [cx * cellTiles, cy * cellTiles + cellTiles - 1],
          [cx * cellTiles + cellTiles - 1, cy * cellTiles],
        ] as const) {
          expect(Math.hypot(x - man.x, y - man.y)).toBeLessThanOrEqual(sightTiles);
        }
      }
    }
  });

  it('верит, что еда есть, пока не увидит куст пустым; пустой ждёт до следующего созревания', () => {
    const { world, man } = field();
    world.tick = tickAt(4, 60); // summer
    setCrops(world);
    const bush = objectAt(world.map, world.objects, 2, 1)!;
    look(world, man);
    expect(believesFood(world, man, bush)).toBe(true);
    // Picked bare behind his back: he still believes it is full…
    takeFood(bush, 100);
    expect(believesFood(world, man, bush)).toBe(true);
    // …till he sees it.
    noteFood(world, man, bush);
    expect(believesFood(world, man, bush)).toBe(false);
    // Autumn: still bare; winter: raspberries have nothing anyway; next spring — ripe again.
    world.tick = tickAt(7, 60);
    expect(believesFood(world, man, bush)).toBe(false);
    world.tick = tickAt(10, 60);
    expect(believesFood(world, man, bush)).toBe(false);
    world.tick = tickAt(13, 1);
    expect(believesFood(world, man, bush)).toBe(true);
  });

  it('лещину, увиденную весной без орехов, ждёт осенью', () => {
    const { world, man } = field();
    const hazel = objectAt(world.map, world.objects, 4, 1)!;
    expect(knownOf(man, hazel.id)).toMatchObject({ full: false });
    expect(believesFood(world, man, hazel)).toBe(false);
    world.tick = tickAt(4, 60);
    expect(believesFood(world, man, hazel)).toBe(false);
    world.tick = tickAt(7, 1);
    expect(believesFood(world, man, hazel)).toBe(true);
    world.tick = tickAt(13, 1); // spring: out of its seasons
    expect(believesFood(world, man, hazel)).toBe(false);
  });

  it('у костра делятся: каждый узнаёт землю другого и свежие вести о кустах', () => {
    const { world, man, woman } = field();
    const bush = objectAt(world.map, world.objects, 2, 1)!;
    world.tick = tickAt(4, 60);
    takeFood(bush, 100);
    noteFood(world, woman, bush); // she saw it bare later than he saw it full
    woman.seen[woman.seen.length - 1] = 1;
    share(man, woman);
    expect(knownOf(man, bush.id)).toMatchObject({ full: false, at: world.tick });
    expect(man.seen).toEqual(woman.seen);
    expect(man.seen.at(-1)).toBe(1);
    // Copies, not shared objects: what one learns later is its own.
    expect(man.foods[0]).not.toBe(woman.foods[0]);
  });

  it('разведка: ближний голый тайл неразведанной земли', () => {
    const { world, man } = field();
    const found = searchFrontier(world, man, () => false);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(isExplored(world, man, found.tile.x, found.tile.y)).toBe(false);
    expect(objectAt(world.map, world.objects, found.tile.x, found.tile.y)).toBeUndefined();
    // All explored — nowhere to scout.
    man.seen.fill(1);
    expect(searchFrontier(world, man, () => false)).toMatchObject({
      ok: false,
      reason: 'unreachable',
    });
  });
});

describe('запас еды на стоянке (шаг 1.11b)', () => {
  it('у еды своё место — рядом с кучей веток, не у самого огня; ветки туда не кладут', () => {
    const world = worldOn(meadow(30, 20));
    const { camp } = world;
    const wood = pileTiles(world);
    const store = pileTiles(world, 'nuts');
    expect(store.length).toBeGreaterThan(0);
    for (const tile of store) {
      expect(isPileTile(world, tile.x, tile.y)).toBe(true);
      expect(wood.some((w) => w.x === tile.x && w.y === tile.y)).toBe(false);
      // Off the ring around the fire, where one sits to warm up.
      expect(Math.max(Math.abs(tile.x - camp.x), Math.abs(tile.y - camp.y))).toBeGreaterThan(1);
      expect(roomAt(world, tile.x, tile.y, 'branches')).toBe(0);
    }
    for (const tile of wood) expect(roomAt(world, tile.x, tile.y, 'nuts')).toBe(0);
    expect(pileSpot(world, 'nuts')).toEqual(store[0]);
  });

  it('еда портится в срок (spoilDays): в начале суток стопка уходит и считается испорченной', () => {
    const world = worldOn(meadow(30, 20));
    const spot = pileSpot(world, 'nuts')!;
    lay(world, 'nuts', 3, spot.x, spot.y, undefined, spoilsAt('nuts', world.tick));
    world.items.picked += 3;
    lay(world, 'nuts', 1, spot.x, spot.y, undefined, spoilsAt('nuts', world.tick + 400));
    world.items.picked += 1;
    // Merged: spoils with the older.
    expect(inStore(world)).toBe(4);
    const days = DATA.resources.get('nuts').spoilDays!;
    world.tick = (days - 1) * TIME.ticksPerDay;
    spoilSystem.step(world);
    expect(inStore(world)).toBe(4);
    world.tick = days * TIME.ticksPerDay;
    spoilSystem.step(world);
    expect(inStore(world)).toBe(0);
    expect(world.items.spoiled).toBe(4);
  });
});
