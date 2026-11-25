/**
 * Step 1.11b: the villagers know their land, not the whole map — they go to food they saw, scout when
 * all they know is bare, store nuts for the winter and eat them by the fire.
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import { calendarAt, TICKS_PER_YEAR, tickAt } from '../src/sim/calendar.ts';
import type { WorldEvent } from '../src/sim/events.ts';
import { setCrops } from '../src/sim/harvest.ts';
import { inStore } from '../src/sim/items.ts';
import { knownOf, look } from '../src/sim/memory.ts';
import { choose } from '../src/sim/minds.ts';
import { objectAt, takeFood } from '../src/sim/objects.ts';
import type { Villager } from '../src/sim/villagers.ts';
import { createWorld, stepWorld, type World } from '../src/sim/world.ts';
import { brokenRules, knowAll, stepWarm, worldOn } from './scenario.ts';

/** Water at the left, a bush near the two (6, 2) and one far beyond sight (34, 2). */
const FIELD = [
  '~~......................................',
  '~~......................................',
  '~~....B...........................B.....',
  '~~......................................',
  '~~......................................',
];
const NEAR = { x: 6, y: 2 };
const FAR = { x: 34, y: 2 };

/** The field on a summer morning, the crop on the bushes; the man hungry, the woman fed. */
function field(): { world: World; man: Villager; far: number } {
  const world = worldOn(FIELD, [
    { x: 3, y: 1 },
    { x: 3, y: 3 },
  ]);
  world.tick = tickAt(4, 60);
  setCrops(world);
  const [man] = world.villagers.list as [Villager];
  for (const villager of world.villagers.list) look(world, villager);
  man.needs.food = 20;
  const far = objectAt(world.map, world.objects, FAR.x, FAR.y)!.id;
  return { world, man, far };
}

function events<T extends WorldEvent['type']>(world: World, type: T) {
  return world.events.list.filter((e): e is Extract<WorldEvent, { type: T }> => e.type === type);
}

/** Run a mild climate until `done` (or `ticks` pass); the woman stays fed. */
function runUntil(world: World, done: () => boolean, ticks: number): boolean {
  for (let i = 0; i < ticks; i++) {
    stepWarm(world);
    world.villagers.list[1]!.needs.food = 100;
    if (done()) return true;
  }
  return false;
}

describe('критерий: житель идёт к источнику, который видел', () => {
  it('куст за пределом видимости, о котором он не знает, не выбирается; после разведки — выбирается', () => {
    const { world, man, far } = field();
    // The near bush is in sight from the start, the far one is not.
    expect(knownOf(man, objectAt(world.map, world.objects, NEAR.x, NEAR.y)!.id)).toBeDefined();
    expect(knownOf(man, far)).toBeUndefined();
    // The near one picked bare before his eyes: he knows of nothing to eat — he scouts.
    takeFood(objectAt(world.map, world.objects, NEAR.x, NEAR.y)!, 100);
    look(world, man);
    const choice = choose(world, man);
    expect(choice.kind).toBe('scout');
    // He walks into the unknown land, sees the far bush and goes to eat there.
    expect(
      runUntil(world, () => man.action.kind === 'eat', 2 * DATA.balance.time.ticksPerDay),
    ).toBe(true);
    expect(man.action).toMatchObject({ kind: 'eat', bush: far });
    expect(man.log.some((decision) => decision.plan === 'scout')).toBe(true);
    expect(brokenRules(world)).toEqual([]);
  });

  it('знает карту — идёт к дальнему кусту сразу, без разведки', () => {
    const { world, man, far } = field();
    takeFood(objectAt(world.map, world.objects, NEAR.x, NEAR.y)!, 100);
    knowAll(world);
    const choice = choose(world, man);
    expect(choice.kind).toBe('eat');
    expect(choice).toMatchObject({ source: { kind: 'bush', object: far } });
  });

  it('видел куст полным — идёт к нему; по дороге видит, что его обобрали, и передумывает', () => {
    const { world, man } = field();
    const near = objectAt(world.map, world.objects, NEAR.x, NEAR.y)!;
    expect(choose(world, man)).toMatchObject({ kind: 'eat', source: { object: near.id } });
    // Before he sets off, another empties the bush: he still believes it is full…
    takeFood(near, 100);
    expect(choose(world, man)).toMatchObject({ kind: 'eat', source: { object: near.id } });
    // …goes, finds it bare, remembers that and looks elsewhere.
    expect(
      runUntil(world, () => knownOf(man, near.id)?.full === false, DATA.balance.time.ticksPerDay),
    ).toBe(true);
    expect(choose(world, man).kind).toBe('scout');
  });
});

describe('критерий: известные кусты пусты — разведывает и находит новые', () => {
  it('сыт — не разведывает; голоден, а всё известное пусто, — уходит в неизведанное и запоминает новое', () => {
    const { world, man, far } = field();
    takeFood(objectAt(world.map, world.objects, NEAR.x, NEAR.y)!, 100);
    look(world, man);
    man.needs.food = 95;
    expect(choose(world, man).kind).not.toBe('scout');
    man.needs.food = 20;
    const explored = man.seen.reduce((n, cell) => n + cell, 0);
    expect(
      runUntil(world, () => knownOf(man, far) !== undefined, DATA.balance.time.ticksPerDay),
    ).toBe(true);
    // He saw more of the land on the way, and the new bush has food.
    expect(man.seen.reduce((n, cell) => n + cell, 0)).toBeGreaterThan(explored);
    expect(knownOf(man, far)!.full).toBe(true);
  });

  it('вечером у костра двое рассказывают друг другу, что видели', () => {
    const world = createWorld(1);
    let shared = false;
    for (let tick = 0; tick < TICKS_PER_YEAR && !shared; tick++) {
      stepWorld(world);
      const [man, woman] = world.villagers.list as [Villager, Villager];
      shared =
        man.action.kind === 'sit' &&
        woman.action.kind === 'sit' &&
        JSON.stringify(man.foods) === JSON.stringify(woman.foods) &&
        JSON.stringify(man.seen) === JSON.stringify(woman.seen);
    }
    expect(shared).toBe(true);
  });
});

describe('критерий: запас еды на стоянке появляется осенью и съедается зимой', () => {
  it('20 миров × 3 года: орехи носят в запас только осенью и зимой, из запаса едят зимой; смертей нет', () => {
    let storing = 0;
    let eating = 0;
    const seasons = { stored: new Set<string>(), eaten: new Map<string, number>() };
    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld(seed);
      for (let tick = 0; tick < 3 * TICKS_PER_YEAR; tick++) stepWorld(world);
      expect(events(world, 'villager_died'), `мир ${seed}`).toEqual([]);
      expect(brokenRules(world), `мир ${seed}`).toEqual([]);
      const stored = events(world, 'food_stored');
      const fromStore = events(world, 'food_found').filter((e) => e.stored);
      for (const e of stored) seasons.stored.add(calendarAt(e.tick).season);
      for (const e of fromStore) {
        const { season } = calendarAt(e.tick);
        seasons.eaten.set(season, (seasons.eaten.get(season) ?? 0) + 1);
      }
      if (stored.length > 0) storing += 1;
      if (fromStore.some((e) => calendarAt(e.tick).season === 'winter')) eating += 1;
      expect(
        stored.every((e) => e.food === 'nuts'),
        `мир ${seed}: в запас — только то, что хранится`,
      ).toBe(true);
    }
    // Nuts ripen in autumn and stay on the hazel through the winter: stored then only (mostly in
    // autumn: by the winter the near hazel is picked bare).
    expect([...seasons.stored].every((season) => season === 'autumn' || season === 'winter')).toBe(
      true,
    );
    expect(seasons.stored.has('autumn')).toBe(true);
    // Most worlds store (some have no hazel near enough), and eat from the store in winter.
    expect(storing).toBeGreaterThanOrEqual(8);
    expect(eating).toBeGreaterThanOrEqual(6);
    // The store is for the winter: eaten from mostly then.
    const total = [...seasons.eaten.values()].reduce((a, b) => a + b, 0);
    expect(seasons.eaten.get('winter')! / total).toBeGreaterThan(0.8);
  }, 120_000);

  it('сценарий: осенью сытый собирает орехи лещины в руки и складывает в запас; зимой голодный ест из запаса', () => {
    const rows = [
      '~~..............',
      '~~..............',
      '~~..........H...',
      '~~..............',
      '~~..............',
      '~~..............',
    ];
    const world = worldOn(rows, [
      { x: 5, y: 1 },
      { x: 5, y: 4 },
    ]);
    world.tick = tickAt(7, 60); // autumn: the nuts are ripe
    setCrops(world);
    knowAll(world);
    const hazel = objectAt(world.map, world.objects, 12, 2)!;
    expect(hazel.stock).toBeGreaterThan(0);
    expect(
      runUntil(world, () => inStore(world) > 0, DATA.balance.time.ticksPerDay),
      'орехи в запасе',
    ).toBe(true);
    expect(events(world, 'food_stored')[0]).toMatchObject({ food: 'nuts' });
    expect(brokenRules(world)).toEqual([]);
    // Winter: the store is by the fire, the hazel farther — a hungry one eats from the store.
    world.tick = tickAt(10, 60);
    const [man] = world.villagers.list as [Villager];
    man.needs.food = 20;
    const before = inStore(world);
    expect(
      runUntil(world, () => man.action.kind === 'eat_stored', DATA.balance.time.ticksPerDay),
    ).toBe(true);
    expect(
      runUntil(world, () => man.action.kind !== 'eat_stored', DATA.balance.time.ticksPerDay),
    ).toBe(true);
    expect(inStore(world)).toBeLessThan(before);
    expect(world.items.eaten).toBeGreaterThan(0);
    expect(brokenRules(world)).toEqual([]);
  });
});
