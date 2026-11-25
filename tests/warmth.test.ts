/**
 * Warmth, seasons, weather (step 1.10) — the criteria of the step as scenarios:
 *   - without a fire in winter both die, and the cause «cold» is written;
 *   - with a fire and wood the two live through the winter; 20 worlds × a year — the pair lives;
 *   - the rain puts the fire out (its own rule), it cannot be lit in the rain;
 *   - in winter there are no berries; nuts and roots feed the hungry.
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import { calendarAt, tickAt } from '../src/sim/calendar.ts';
import { findEvent, type WorldEvent } from '../src/sim/events.ts';
import { isBurning, WOOD } from '../src/sim/fire.ts';
import { setCrops } from '../src/sim/harvest.ts';
import { lay, pileTiles } from '../src/sim/items.ts';
import { choose, coldReach } from '../src/sim/minds.ts';
import { FULL } from '../src/sim/needs.ts';
import { objectAt } from '../src/sim/objects.ts';
import { createWorld, stepWorld, type World } from '../src/sim/world.ts';
import { brokenRules, meadow, worldOn } from './scenario.ts';

const DAY = DATA.balance.time.ticksPerDay;

function events<T extends WorldEvent['type']>(world: World, type: T) {
  return world.events.list.filter((e): e is Extract<WorldEvent, { type: T }> => e.type === type);
}

/** Step the world `ticks` ticks, checking the rules of items every tick. */
function run(world: World, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks && world.villagers.list.length > 0; i++) {
    stepWorld(world);
    const broken = brokenRules(world);
    if (broken.length > 0) throw new Error(broken.join('; '));
    each?.();
  }
}

/** A meadow with a pond on the left and raspberries on the right — food and water, no wood. */
const NO_WOOD = [
  '~~..........B...',
  '~~..............',
  '~~..............',
  '~~..........B...',
  '~~..............',
  '~~..............',
];

/** Oaks along the top (branches fall under them), a pond on the left, raspberries on the right. */
const FOREST = ['T'.repeat(24), ...meadow(24, 3), ...NO_WOOD.map((row) => `${row}........`)];

describe('критерий: без костра зимой оба умирают, причина «холод» записана', () => {
  it('луг без деревьев (нет дров — нет огня): зима убивает обоих — холод, цепочка «почему» в журнале', () => {
    const world = worldOn(NO_WOOD, [
      { x: 4, y: 2 },
      { x: 8, y: 3 },
    ]);
    world.tick = tickAt(10) - 1; // the eve of winter (day 10 — the first of winter)
    run(world, 3 * DAY);
    expect(world.villagers.list, 'к концу зимы никого').toEqual([]);
    const deaths = events(world, 'villager_died');
    expect(deaths).toHaveLength(2);
    for (const death of deaths) {
      expect(calendarAt(death.tick).season).toBe('winter');
      expect(death).toMatchObject({ reason: 'cold', waterReachable: true, warmReachable: false });
      // The chain «why?»: death ← warmth ran out (frostbite) ← the need itself.
      const cause = death.cause.kind === 'event' ? findEvent(world, death.cause.event) : undefined;
      expect(cause).toMatchObject({
        type: 'need_ran_out',
        villager: death.villager,
        need: 'warmth',
      });
      expect(cause!.cause).toEqual({ kind: 'need', villager: death.villager, need: 'warmth' });
      // A day at zero: death of cold comes `needs.warmth.deathDays` after frostbite.
      expect(death.tick - cause!.tick).toBeGreaterThanOrEqual(
        DATA.balance.needs.warmth.deathDays * DAY - 2,
      );
    }
  });

  it('весной и летом без огня не замерзают: тепло не падает до нуля', () => {
    const world = worldOn(NO_WOOD, [
      { x: 4, y: 2 },
      { x: 8, y: 3 },
    ]);
    run(world, 6 * DAY);
    expect(world.villagers.list).toHaveLength(2);
    expect(events(world, 'need_ran_out').filter((e) => e.need === 'warmth')).toEqual([]);
  });
});

describe('критерий: с костром и запасом пара переживает зиму', () => {
  it('лес и луг, зима с кучей дров: оба живы, тепло ни разу не на нуле, ночью спят у огня', () => {
    const world = worldOn(FOREST);
    world.tick = tickAt(10) - 1;
    for (const tile of pileTiles(world).slice(0, 4)) {
      world.items.made += lay(world, WOOD, 10, tile.x, tile.y);
    }
    let night = 0;
    let byFire = 0;
    let lowest = FULL;
    run(world, 3 * DAY, () => {
      for (const villager of world.villagers.list) {
        lowest = Math.min(lowest, villager.needs.warmth);
        if (calendarAt(world.tick).phase !== 'night') continue;
        night++;
        const { camp } = world;
        const near = Math.max(Math.abs(villager.x - camp.x), Math.abs(villager.y - camp.y));
        if (villager.action.kind === 'sleep' && near <= DATA.balance.fire.nearTiles) byFire++;
      }
    });
    expect(world.villagers.list).toHaveLength(2);
    expect(events(world, 'need_ran_out').filter((e) => e.need === 'warmth')).toEqual([]);
    expect(lowest, 'тепло не ниже запаса').toBeGreaterThan(DATA.balance.ai.reservePoints);
    expect(byFire / night, 'ночью спят у огня').toBeGreaterThanOrEqual(0.8);
  });

  it('20 миров × год: пара жива к концу года не меньше чем в 70 % (на деле — во всех)', () => {
    let alive = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld(seed);
      for (let tick = 0; tick < 12 * DAY; tick++) stepWorld(world);
      if (world.villagers.list.length === 2) alive++;
      expect(
        events(world, 'villager_died').filter((e) => e.reason === 'cold'),
        `зерно ${seed}`,
      ).toEqual([]);
    }
    expect(alive / 20).toBeGreaterThanOrEqual(0.7);
    expect(alive).toBe(20);
  }, 60_000);
});

describe('дождь гасит костёр без укрытия', () => {
  /** A forest world with a burning fire on a summer day and a pile of wood. */
  function burning(): World {
    const world = worldOn(FOREST);
    world.tick = tickAt(5, 60);
    for (const tile of pileTiles(world).slice(0, 2)) {
      world.items.made += lay(world, WOOD, 10, tile.x, tile.y);
    }
    run(world, DAY / 2);
    expect(isBurning(world)).toBe(true);
    return world;
  }

  it(`дождь ${DATA.balance.fire.rainOutTicks} тиков подряд — костёр гаснет («залило дождём»), дрова в нём остаются; в дождь не развести, после — разводят`, () => {
    const world = burning();
    const before = world.fire.fuel;
    world.weather = { kind: 'rain', since: world.tick, until: world.tick + 2 * DAY };
    let out: WorldEvent | undefined;
    run(world, DATA.balance.fire.rainOutTicks + 1, () => {
      out ??= events(world, 'fire_out').find((e) => e.cause.kind === 'rule');
    });
    expect(out).toMatchObject({ type: 'fire_out', cause: { kind: 'rule', rule: 'rain' } });
    expect(isBurning(world)).toBe(false);
    // The wet wood stays in the hearth (more was put in meanwhile — never less than burnt away).
    expect(world.fire.fuel).toBeGreaterThan(0);
    expect(world.fire.fuel).toBeLessThanOrEqual(DATA.balance.fire.maxFuel);
    expect(before).toBeGreaterThan(0);
    // In the rain nobody lights it.
    const lit = events(world, 'fire_lit').length;
    run(world, DAY / 4);
    expect(events(world, 'fire_lit')).toHaveLength(lit);
    for (const villager of world.villagers.list) {
      const choice = choose(world, villager);
      expect(choice.kind).not.toBe('kindle');
    }
    // The rain is over — lit again.
    world.weather = { kind: 'clear', since: world.tick, until: world.tick + 2 * DAY };
    run(world, DAY / 2);
    expect(events(world, 'fire_lit').length).toBeGreaterThan(lit);
  });

  it('короткий дождь костёр не гасит: под ясным небом он сохнет', () => {
    const world = burning();
    const short = DATA.balance.fire.rainOutTicks - 10;
    world.weather = { kind: 'rain', since: world.tick, until: world.tick + short };
    run(world, short);
    world.weather = { kind: 'clear', since: world.tick, until: world.tick + DAY };
    run(world, short);
    expect(events(world, 'fire_out')).toEqual([]);
    expect(world.fire.wet).toBe(0);
  });
});

describe('разум и холод', () => {
  it('замёрзший идёт греться к горящему огню, согревшись — уходит; работать в холод далеко не ходят', () => {
    const world = worldOn(FOREST);
    world.tick = tickAt(10, 60);
    for (const tile of pileTiles(world).slice(0, 2)) {
      world.items.made += lay(world, WOOD, 10, tile.x, tile.y);
    }
    run(world, DAY / 4);
    expect(isBurning(world)).toBe(true);
    const villager = world.villagers.list[0]!;
    villager.needs.warmth = 15;
    expect(choose(world, villager).kind).toBe('warm');
    // Warm and well: going far for work in the frost is out of reach while warmth is low.
    villager.needs.warmth = DATA.balance.ai.reservePoints;
    expect(coldReach(world, villager)).toBe(0);
    villager.needs.warmth = FULL;
    expect(coldReach(world, villager)).toBeGreaterThan(0);
    expect(coldReach(world, villager)).toBeLessThan(Number.POSITIVE_INFINITY);
    world.tick = tickAt(5, 140); // a summer day: no limit
    expect(coldReach(world, villager)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('еда по сезонам: зимой ягод нет — орехи и коренья', () => {
  it('зимой голодный не идёт к малине, даже если на ней ягоды; весной ягоды наливаются снова', () => {
    const world = worldOn(NO_WOOD, [
      { x: 10, y: 1 },
      { x: 10, y: 4 },
    ]);
    world.tick = tickAt(10, 60);
    // Step 1.11: winter takes the berries (./harvest.ts) — here they are left on to check the season.
    for (const object of world.objects.list) Object.assign(object, { stock: 1, state: 'ripe' });
    const [villager] = world.villagers.list;
    villager!.needs.food = 10;
    expect(choose(world, villager!).kind).not.toBe('eat');
    world.tick = tickAt(13, 60);
    setCrops(world);
    expect(choose(world, villager!).kind).toBe('eat');
  });

  it('зимой голодный ест орехи лещины и коренья; запас на них убывает', () => {
    const rows = ['~~...........H..', '~~..............', '~~.......R......', '~~..............'];
    const world = worldOn(rows, [
      { x: 6, y: 1 },
      { x: 6, y: 3 },
    ]);
    world.tick = tickAt(10, 60);
    setCrops(world); // winter: the autumn's nuts and roots (step 1.11)
    for (const villager of world.villagers.list) villager.needs.food = 20;
    let nuts = 0;
    let roots = 0;
    run(world, DAY / 2, () => {
      for (const villager of world.villagers.list) {
        villager.needs.warmth = FULL; // no fire on this meadow: cold has its own scenarios
        if (villager.action.kind !== 'eat') continue;
        if (villager.action.food === 'nuts') nuts++;
        if (villager.action.food === 'roots') roots++;
      }
    });
    expect(nuts, 'ели орехи').toBeGreaterThan(0);
    expect(roots, 'ели коренья').toBeGreaterThan(0);
    const hazel = objectAt(world.map, world.objects, 13, 0)!;
    const patch = objectAt(world.map, world.objects, 9, 2)!;
    expect(hazel.stock).toBeLessThan(DATA.objects.get('hazel').harvest!.rations);
    expect(patch.stock).toBeLessThan(DATA.objects.get('roots').harvest!.rations);
    for (const villager of world.villagers.list) expect(villager.needs.food).toBeGreaterThan(20);
  });
});
