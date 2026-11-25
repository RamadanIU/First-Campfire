/**
 * The yearly crop (step 1.11) — the criteria of the step as scenarios:
 *   - in a year the near bushes are picked bare first: the villagers go for berries farther and
 *     farther (the runs' «how far one goes for food» by seasons);
 *   - the bushes come back by the next year;
 *   - the pair still lives through its first year (step 1.10 — tests/warmth.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import { calendarAt, TICKS_PER_YEAR, tickAt } from '../src/sim/calendar.ts';
import type { WorldEvent } from '../src/sim/events.ts';
import { type Considered, choose, reconsider } from '../src/sim/minds.ts';
import { findObject } from '../src/sim/objects.ts';
import type { Villager } from '../src/sim/villagers.ts';
import { createWorld, runTicks, type World } from '../src/sim/world.ts';
import { knowAll, runWarm, worldOn } from './scenario.ts';

const BERRIES = DATA.objects.get('berry_bush').harvest!;

function foodFound(world: World): Extract<WorldEvent, { type: 'food_found' }>[] {
  return world.events.list.filter(
    (e): e is Extract<WorldEvent, { type: 'food_found' }> => e.type === 'food_found',
  );
}

describe('критерий: ближние кусты пустеют — за ягодами ходят всё дальше', () => {
  it('ряд кустов: голодный обирает ближний и идёт к следующему, каждый раз дальше', () => {
    const world = worldOn(
      ['..B...B...B...B...B...B...', '..........................', '..........................'],
      [
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ],
    );
    world.tick = tickAt(4, 60); // summer: the year's crop is on every bush
    for (const object of world.objects.list) Object.assign(object, { stock: BERRIES.rations });
    const [man, woman] = world.villagers.list as [Villager, Villager];
    woman.action = { kind: 'idle', until: Number.MAX_SAFE_INTEGER };
    man.needs.food = 10;
    runWarm(world, 2000);
    const xs = foodFound(world).map((e) => e.x);
    // A bush is a handful a year: one after another, nearest first, never back to a bare one.
    expect(xs.length).toBeGreaterThanOrEqual(5);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(xs.length);
    expect(man.needs.food).toBeGreaterThan(50);
  });

  it('20 миров × 5 лет: последний поход года за ягодами дальше первого; осенью дальше, чем весной', () => {
    let first = 0;
    let last = 0;
    let years = 0;
    let farther = 0;
    const bySeason: Record<string, number[]> = { spring: [], summer: [], autumn: [] };
    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld(seed);
      runTicks(world, 5 * TICKS_PER_YEAR);
      const perYear = new Map<number, number[]>();
      for (const e of foodFound(world)) {
        if (e.food !== 'berries') continue;
        const { year, season } = calendarAt(e.tick);
        bySeason[season]!.push(e.distance);
        perYear.set(year, [...(perYear.get(year) ?? []), e.distance]);
      }
      for (const trips of perYear.values()) {
        if (trips.length < 2) continue;
        years += 1;
        first += trips[0]!;
        last += trips.at(-1)!;
        if (trips.at(-1)! > trips[0]!) farther += 1;
      }
    }
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    expect(years).toBeGreaterThan(40);
    // On average the last trip of a year is a third longer than the first.
    expect(last / years).toBeGreaterThan(1.3 * (first / years));
    expect(farther / years).toBeGreaterThan(0.5);
    expect(mean(bySeason.autumn!)).toBeGreaterThan(1.2 * mean(bySeason.spring!));
  }, 60_000);
});

describe('критерий: кусты восстанавливаются к следующему году', () => {
  it('мир 1: обобранные за два года кусты к концу весны третьего года снова полны', () => {
    // The two start fed: in world 1 the first meal comes in the second year.
    const world = createWorld(1);
    runTicks(world, 2 * TICKS_PER_YEAR - 1); // the last tick of the second year
    const bare = world.objects.list.filter((o) => o.def === 'berry_bush' && o.stock === 0);
    const picked = new Set(foodFound(world).map((e) => e.object));
    // Winter: every bush is bare — the berries fell; some were picked bare long before.
    expect(picked.size).toBeGreaterThan(0);
    expect(bare.length).toBe(world.objects.list.filter((o) => o.def === 'berry_bush').length);
    const seen = foodFound(world).length;
    // Step 1.11b: the two remember the bushes they picked and come back to them first thing in
    // spring — here they leave the world, so that every bush is left to ripen by itself.
    world.villagers.list.length = 0;
    runTicks(world, tickAt(28, 0) - world.tick); // the first day of the third summer
    const eatenAgain = new Set(
      foodFound(world)
        .slice(seen)
        .map((e) => e.object),
    );
    let checked = 0;
    for (const bush of bare) {
      if (eatenAgain.has(bush.id)) continue;
      expect(findObject(world.objects, bush.id)!.stock).toBeCloseTo(BERRIES.rations, 12);
      expect(bush.state).toBe('ripe');
      if (picked.has(bush.id)) checked += 1;
    }
    // Not an empty check: bushes picked bare before are among them.
    expect(checked).toBeGreaterThan(0);
  });
});

describe('поиск еды по опустевшей округе не повторяется каждый миг', () => {
  it('куст далеко — бросать начатое ради него не стоит: снова ищет не раньше чем через ai.farRetryTicks', () => {
    const rows = ['.'.repeat(60), `${'.'.repeat(59)}B`, '.'.repeat(60)];
    const world = worldOn(rows, [
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]);
    world.tick = tickAt(4, 60); // summer: the crop is on the bush
    for (const object of world.objects.list) Object.assign(object, { stock: BERRIES.rations });
    knowAll(world); // he knows the far bush (step 1.11b)
    const villager = world.villagers.list[0]!;
    villager.needs.food = 20; // hungry, but the bush is 57 tiles away and work under way holds at 0.5
    const searched = () => {
      const considered: Considered[] = [];
      expect(reconsider(world, villager, 'haul', 0.5, considered)).toBeNull();
      return considered.find((c) => c.kind === 'eat')!.searched;
    };
    expect(searched()).toBe(true);
    expect(villager.tooFar.food).toBe(world.tick);
    world.tick += DATA.balance.ai.farRetryTicks - 1;
    expect(searched()).toBe(false);
    world.tick += 1;
    expect(searched()).toBe(true);
    // Resting, very hungry: the bush is worth the way — no memory of «too far».
    villager.needs.food = 5;
    world.tick += DATA.balance.ai.farRetryTicks;
    expect(choose(world, villager).kind).toBe('eat');
    expect(villager.tooFar.food).toBe(0);
  });
});
