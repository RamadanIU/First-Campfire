/**
 * The campfire (step 1.9) — the criteria of the step as scenarios:
 *   - at night the two sit or sleep at the fire;
 *   - without wood the fire goes out; with branches about, it is kept burning;
 *   - lighting is a villager's decision (the journal of decisions and the cause of the event),
 *     the hearth is built on the middle of the camp, burnt wood is counted (conservation).
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import { calendarAt, PHASE_START, tickAt } from '../src/sim/calendar.ts';
import type { Cause } from '../src/sim/events.ts';
import { hearthOf, WOOD } from '../src/sim/fire.ts';
import { inPile, lay, pileTiles, stackOf } from '../src/sim/items.ts';
import { objectAt } from '../src/sim/objects.ts';
import { isSeated } from '../src/sim/social.ts';
import type { Villager } from '../src/sim/villagers.ts';
import { createWorld, stepWorld, type World } from '../src/sim/world.ts';
import { brokenRules, meadow, worldOn } from './scenario.ts';

const DAY = DATA.balance.time.ticksPerDay;
const { nearTiles } = DATA.balance.fire;

/** A row of oaks along the top of a meadow: branches fall under them; the camp is in the middle. */
const EDGE = ['T'.repeat(24), ...meadow(24, 13)];

/** Step the world `ticks` ticks, checking the rules of items every tick. */
function run(world: World, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i++) {
    stepWorld(world);
    const broken = brokenRules(world);
    if (broken.length > 0) throw new Error(broken.join('; '));
    each?.();
  }
}

/** Was it the rain that put the fire out (step 1.10)? */
function isRain(cause: Cause): boolean {
  return cause.kind === 'rule' && cause.rule === 'rain';
}

/** Is the villager at the fire: within `fire.nearTiles` of it? */
function atFire(world: World, villager: Villager): boolean {
  const { camp } = world;
  return Math.max(Math.abs(villager.x - camp.x), Math.abs(villager.y - camp.y)) <= nearTiles;
}

describe('критерий: ночью двое сидят или спят у огня', () => {
  it('сценарий: опушка и луг — костёр разведён в первый день; 2-я и 3-я ночи — оба спят у огня', () => {
    const world = worldOn(EDGE);
    run(world, DAY);
    expect(hearthOf(world)?.state, 'костёр горит к концу первых суток').toBe('burning');
    let night = 0;
    let atFireAsleep = 0;
    let evening = 0;
    let sitting = 0;
    run(world, 2 * DAY, () => {
      const { phase, tickOfDay } = calendarAt(world.tick);
      for (const villager of world.villagers.list) {
        if (phase === 'night') {
          night++;
          if (villager.action.kind === 'sleep' && atFire(world, villager)) atFireAsleep++;
        }
        if (tickOfDay >= PHASE_START.dusk - 40 && tickOfDay < PHASE_START.night) {
          evening++;
          // Talking seated at the fire (step 2.2) is sitting at it too.
          if (isSeated(villager)) {
            sitting++;
            // Sitting beside the fire, facing it sideways.
            const dx = world.camp.x - villager.x;
            expect(dx).not.toBe(0);
            expect(villager.facing).toBe(dx > 0 ? 'e' : 'w');
            expect(atFire(world, villager)).toBe(true);
          }
        }
      }
    });
    expect(atFireAsleep / night, `у огня спали ${atFireAsleep} из ${night}`).toBeGreaterThanOrEqual(
      0.85,
    );
    expect(sitting / evening, `сидели у огня ${sitting} из ${evening}`).toBeGreaterThanOrEqual(0.5);
  });

  it('20 миров × 10 суток: ночью (со 2-й) у огня спят в среднем ≥ 70 % времени, вечером сидят', () => {
    const shares: number[] = [];
    let sat = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld(seed);
      let night = 0;
      let near = 0;
      for (let tick = 0; tick < 10 * DAY; tick++) {
        stepWorld(world);
        const { phase, day } = calendarAt(world.tick);
        for (const villager of world.villagers.list) {
          if (villager.action.kind === 'sit') sat++;
          if (phase !== 'night' || day === 1) continue;
          night++;
          if (villager.action.kind === 'sleep' && atFire(world, villager)) near++;
        }
      }
      shares.push(near / night);
    }
    const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
    const text = shares.map((s) => `${Math.round(s * 100)} %`).join(', ');
    expect(mean, text).toBeGreaterThanOrEqual(0.7);
    expect(Math.min(...shares), text).toBeGreaterThan(0.4);
    expect(sat, 'вечером сидят у огня').toBeGreaterThan(0);
  }, 60_000);
});

describe('критерий: без дров костёр гаснет, при наличии веток его поддерживают', () => {
  it('нет деревьев, в куче 3 ветки: разводят, огонь съедает их за 3 суток (весной охапка в сутки) и гаснет', () => {
    const world = worldOn(meadow(16, 12));
    expect(world.items.made, 'веткам неоткуда падать').toBe(0);
    const tile = pileTiles(world)[0]!;
    world.items.made += lay(world, WOOD, 3, tile.x, tile.y);
    run(world, DAY);
    const lit = world.events.list.find((e) => e.type === 'fire_lit');
    expect(lit, 'костёр разведён').toBeDefined();
    expect(inPile(world, WOOD), 'все три ветки ушли в огонь').toBe(0);
    expect(world.items.burned).toBe(3);
    run(world, 3 * DAY);
    const out = world.events.list.find((e) => e.type === 'fire_out');
    expect(out, 'костёр погас').toMatchObject({ cause: { kind: 'rule', rule: 'fuel' }, burned: 3 });
    // Three armfuls at one a day: it burnt three days (from the tick it was lit).
    expect(out!.tick - lit!.tick).toBe(3 * DAY - 1);
    expect(hearthOf(world)?.state).toBe('out');
    // Nothing to light it with: it stays out.
    run(world, DAY);
    expect(world.events.list.filter((e) => e.type === 'fire_lit')).toHaveLength(1);
    expect(world.fire).toMatchObject({ lit: 0, fuel: 0 });
  });

  it('зимой огонь ест втрое больше: 3 охапки — за сутки', () => {
    const world = worldOn(meadow(16, 12));
    world.tick = tickAt(10) - 1; // the eve of winter (day 10 — the first of winter)
    const tile = pileTiles(world)[0]!;
    world.items.made += lay(world, WOOD, 3, tile.x, tile.y);
    run(world, DAY);
    const lit = world.events.list.find((e) => e.type === 'fire_lit')!;
    expect(calendarAt(lit.tick).season).toBe('winter');
    run(world, DAY);
    const out = world.events.list.find((e) => e.type === 'fire_out')!;
    expect(out.tick - lit.tick).toBe(DAY - 1);
  });

  it('опушка и луг, целый год (с зимой): без дров костёр не гас ни разу, дрова подкладывают', () => {
    const world = worldOn(EDGE);
    run(world, 12 * DAY);
    const outs = world.events.list.filter((e) => e.type === 'fire_out');
    // Only the rain may put it out — never a want of wood; and then it is lit again.
    expect(outs.filter((e) => !isRain(e.cause))).toEqual([]);
    const lit = world.events.list.filter((e) => e.type === 'fire_lit');
    expect(lit).toHaveLength(1 + outs.length);
    // A year of burning: 9 days × 1 + 3 winter days × 3, give or take the first day (the wood in a
    // fire the rain put out stays in it — step 1.10).
    expect(world.items.burned).toBeGreaterThanOrEqual(16);
    expect(world.items.burned).toBeLessThanOrEqual(DATA.balance.fire.maxFuel * lit.length + 18);
  });

  it('20 миров × год: костёр разведён в первые двое суток и без дров не гаснет', () => {
    const days: number[] = [];
    let rainedOut = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld(seed);
      for (let tick = 0; tick < 12 * DAY; tick++) stepWorld(world);
      const lit = world.events.list.filter((e) => e.type === 'fire_lit');
      expect(lit.length, `зерно ${seed}`).toBeGreaterThanOrEqual(1);
      days.push(calendarAt(lit[0]!.tick).day);
      const outs = world.events.list.filter((e) => e.type === 'fire_out');
      expect(
        outs.filter((e) => !isRain(e.cause)),
        `зерно ${seed}`,
      ).toEqual([]);
      rainedOut += outs.length;
      // Rained out — lit again (a fire that went out on the last day may still be out).
      expect(lit.length, `зерно ${seed}`).toBeGreaterThanOrEqual(outs.length);
    }
    expect(Math.max(...days), `первый костёр, день: ${days.join(', ')}`).toBeLessThanOrEqual(2);
    // The rule of the rain does work in the real worlds (step 1.10).
    expect(rainedOut).toBeGreaterThan(0);
  }, 60_000);
});

describe('костёр — постройка у стоянки, решение жителя, учёт дров', () => {
  it('очаг строится на середине стоянки при первом огне; причина события — решение жителя', () => {
    const world = worldOn(EDGE);
    const { camp } = world;
    expect(objectAt(world.map, world.objects, camp.x, camp.y)).toBeUndefined();
    run(world, DAY);
    const hearth = objectAt(world.map, world.objects, camp.x, camp.y);
    expect(hearth).toMatchObject({ def: 'campfire', state: 'burning' });
    const lit = world.events.list.find((e) => e.type === 'fire_lit')!;
    expect(lit).toMatchObject({ first: true, x: camp.x, y: camp.y });
    expect(lit.cause).toMatchObject({ kind: 'decision', activity: 'kindle' });
    // The villager's journal says why: it chose to light the fire.
    const who = world.villagers.list.find((v) => lit.type === 'fire_lit' && v.id === lit.villager)!;
    expect(who.log.some((d) => d.plan === 'kindle' && d.why === 'chose')).toBe(true);
  });

  it('никто не разводит огонь, пока в куче меньше fire.kindleBranches веток', () => {
    const world = worldOn(meadow(16, 12));
    const tile = pileTiles(world)[0]!;
    world.items.made += lay(world, WOOD, DATA.balance.fire.kindleBranches - 1, tile.x, tile.y);
    run(world, DAY);
    expect(world.events.list.filter((e) => e.type === 'fire_lit')).toEqual([]);
    expect(hearthOf(world)).toBeUndefined();
  });

  it('дрова берут с края кучи: середина остаётся полной', () => {
    const world = worldOn(meadow(16, 12));
    const tiles = pileTiles(world);
    for (const tile of tiles.slice(0, 3)) {
      world.items.made += lay(world, WOOD, stackOf(WOOD), tile.x, tile.y);
    }
    run(world, DAY);
    expect(world.items.burned).toBeGreaterThan(0);
    const counts = tiles
      .slice(0, 3)
      .map((t) => world.items.list.find((i) => i.x === t.x && i.y === t.y)?.count ?? 0);
    expect(counts[0]).toBe(stackOf(WOOD));
    expect(counts[2]).toBeLessThan(stackOf(WOOD));
  });
});
