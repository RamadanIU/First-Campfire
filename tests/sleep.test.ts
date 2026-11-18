/**
 * Day, night and sleep (step 1.5) — the criteria of the step as scenarios:
 *   - at night both sleep at least 80 % of the night, by day they are awake (3 days, seeds 1…20);
 *   - sleep never leads to death from hunger or thirst: a sleeper wakes if it must;
 *   - want of sleep fells a villager — a faint, with its cause in the journal.
 */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/data/index.ts';
import { calendarAt, type DayPhase, tickAt } from '../src/sim/calendar.ts';
import { findEvent, type WorldEvent } from '../src/sim/events.ts';
import { choose } from '../src/sim/minds.ts';
import { FULL } from '../src/sim/needs.ts';
import { orderWalk } from '../src/sim/villagers.ts';
import { createWorld, runTicks, stepWorld, type World } from '../src/sim/world.ts';
import { worldOn } from './scenario.ts';

const DAY = DATA.balance.time.ticksPerDay;

function events<T extends WorldEvent['type']>(world: World, type: T) {
  return world.events.list.filter((e): e is Extract<WorldEvent, { type: T }> => e.type === type);
}

/** Ticks spent asleep and in all, by phase of the day, of every villager over `days`. */
function sleepByPhase(world: World, days: number) {
  const asleep: Record<DayPhase, number> = { dawn: 0, day: 0, dusk: 0, night: 0 };
  const all: Record<DayPhase, number> = { dawn: 0, day: 0, dusk: 0, night: 0 };
  for (let tick = 0; tick < days * DAY; tick++) {
    stepWorld(world);
    const { phase } = calendarAt(world.tick);
    for (const villager of world.villagers.list) {
      all[phase] += 1;
      if (villager.action.kind === 'sleep') asleep[phase] += 1;
    }
  }
  return { asleep, all };
}

describe('критерий: ночью оба спят не меньше 80 % ночи, днём бодрствуют', () => {
  it('зёрна 1…20, по 3 суток: ночью спят ≥ 80 % каждую ночь, днём не спят', () => {
    const shares: string[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld(seed);
      for (let day = 1; day <= 3; day++) {
        const { asleep, all } = sleepByPhase(world, 1);
        const night = asleep.night / all.night;
        expect(night, `зерно ${seed}, ночь ${day}`).toBeGreaterThanOrEqual(0.8);
        expect(asleep.day, `зерно ${seed}, день ${day}: днём не спят`).toBe(0);
        shares.push(`${seed}/${day}: ${(night * 100).toFixed(0)} %`);
      }
      expect(world.villagers.list, `зерно ${seed}: живы оба`).toHaveLength(2);
      expect(events(world, 'villager_fainted'), `зерно ${seed}: без обмороков`).toEqual([]);
    }
    expect(shares).toHaveLength(60);
  }, 60_000);

  it('засыпают с наступлением ночи и встают на рассвете выспавшимися', () => {
    const world = createWorld(1);
    runTicks(world, tickAt(1, 300));
    for (const villager of world.villagers.list) expect(villager.action.kind).toBe('sleep');
    runTicks(world, tickAt(2, 30) - world.tick);
    for (const villager of world.villagers.list) {
      expect(villager.action.kind).not.toBe('sleep');
      expect(villager.needs.sleep).toBeGreaterThan(90);
    }
  });

  it('30 суток: сон не падает до нуля, а к ночи — не ниже половины', () => {
    for (const seed of [3, 7, 11]) {
      const world = createWorld(seed);
      let lowest = FULL;
      for (let tick = 0; tick < 30 * DAY; tick++) {
        stepWorld(world);
        for (const villager of world.villagers.list) {
          lowest = Math.min(lowest, villager.needs.sleep);
        }
      }
      expect(lowest, `зерно ${seed}`).toBeGreaterThan(40);
      expect(events(world, 'need_ran_out'), `зерно ${seed}`).toEqual([]);
    }
  }, 30_000);
});

describe('критерий: сон не приводит к смерти от голода или жажды', () => {
  /** A meadow with a pond to the left and a bush to the right. */
  const MEADOW = ['~~...........B', '~~............', '~~............'];

  it('мучимый жаждой просыпается ночью и идёт пить', () => {
    const world = worldOn(MEADOW, [
      { x: 6, y: 1 },
      { x: 9, y: 2 },
    ]);
    runTicks(world, tickAt(1, 300) - world.tick);
    const villager = world.villagers.list[0]!;
    expect(villager.action.kind).toBe('sleep');
    villager.needs.water = 8;
    let woke = false;
    for (let tick = 0; tick < 40 && !woke; tick++) {
      stepWorld(world);
      woke = villager.action.kind === 'walk' && villager.action.purpose === 'drink';
    }
    expect(woke).toBe(true);
    expect(calendarAt(world.tick).phase).toBe('night');
  });

  it('слегка голодный ночью спит дальше', () => {
    const world = worldOn(MEADOW, [
      { x: 6, y: 1 },
      { x: 9, y: 2 },
    ]);
    runTicks(world, tickAt(1, 300) - world.tick);
    const villager = world.villagers.list[0]!;
    villager.needs.food = 60;
    runTicks(world, 60);
    expect(villager.action.kind).toBe('sleep');
  });

  it('уснувший голодным и без воды рядом не умирает: 40 суток без ошибок ИИ', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const world = createWorld(seed);
      runTicks(world, 40 * DAY);
      const deaths = events(world, 'villager_died');
      for (const death of deaths) {
        expect(death.foodReachable && death.waterReachable, `зерно ${seed}`).toBe(false);
      }
    }
  }, 60_000);
});

describe('нехватка сна — обморок', () => {
  const FIELD = ['~~............', '~~............', '~~............'];

  it('сон на нуле: житель падает, где стоит; в журнале причина — «сон кончился»; встаёт отдохнувшим', () => {
    const world = worldOn(FIELD, [
      { x: 3, y: 0 },
      { x: 12, y: 2 },
    ]);
    // Day: sent far, it walks and does not think of sleep on the way.
    runTicks(world, tickAt(1, 100) - world.tick);
    const villager = world.villagers.list[0]!;
    expect(orderWalk(world, villager, { x: 13, y: 0 }).ok).toBe(true);
    villager.needs.sleep = 0.3;
    let tick = 0;
    while (events(world, 'villager_fainted').length === 0 && tick++ < 50) stepWorld(world);
    const [fainted] = events(world, 'villager_fainted');
    expect(fainted).toMatchObject({ villager: villager.id });
    expect(villager.action).toEqual({ kind: 'sleep', fainted: true });
    const cause = fainted?.cause.kind === 'event' ? findEvent(world, fainted.cause.event) : null;
    expect(cause).toMatchObject({ type: 'need_ran_out', need: 'sleep', villager: villager.id });
    // It lies until half rested, deaf to thirst, then gets up.
    villager.needs.water = 30;
    runTicks(world, 60);
    expect(villager.action.kind).toBe('sleep');
    runTicks(world, 60);
    expect(villager.action.kind).not.toBe('sleep');
    // Got up at `faintWakePoints` (and has been awake a few ticks since).
    expect(villager.needs.sleep).toBeGreaterThan(DATA.balance.sleeping.faintWakePoints - 5);
    expect(world.villagers.list).toHaveLength(2);
  });

  it('днём не выспавшийся прилегает вздремнуть, выспавшийся — нет', () => {
    const world = worldOn(FIELD);
    runTicks(world, tickAt(1, 100) - world.tick);
    const villager = world.villagers.list[0]!;
    villager.needs.sleep = 90;
    expect(choose(world, villager).kind).not.toBe('sleep');
    villager.needs.sleep = 10;
    expect(choose(world, villager).kind).toBe('sleep');
  });
});

describe('одно зерно — одна история', () => {
  it('двое с одним зерном спят и встают одинаково', () => {
    const a = createWorld(5);
    const b = createWorld(5);
    runTicks(a, 3 * DAY);
    runTicks(b, 3 * DAY);
    expect(a.villagers.list).toEqual(b.villagers.list);
    expect(a.fireflies).toEqual(b.fireflies);
  });
});
