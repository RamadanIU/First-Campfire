import { describe, expect, it } from 'vitest';
import { TICKS_PER_YEAR } from './calendar.ts';
import type { WorldEvent } from './events.ts';
import { hashState } from './hash.ts';
import { METRICS } from './metrics.ts';
import {
  checkMetrics,
  count,
  createStats,
  finishStats,
  gauge,
  type Metric,
  max,
  mean,
  min,
  recordTick,
  type StatsReport,
  sum,
} from './stats.ts';
import { createWorld, runTicks, stepWorld, type World } from './world.ts';

const TEST_METRICS: readonly Metric[] = [
  count('events', 'Событий', 'any'),
  count('phases', 'Фаз суток', 'phase_started'),
  count('nights', 'Ночей', 'phase_started', (e) => e.phase === 'night'),
  count('seasons', 'Сезонов', 'season_started'),
  sum('fireflies', 'Светлячков', 'fireflies_rose', (e) => e.count),
  mean('swarm_mean', 'Рой: среднее', 'fireflies_rose', (e) => e.count),
  max('swarm_max', 'Рой: больше всего', 'fireflies_rose', (e) => e.count),
  min('swarm_min', 'Рой: меньше всего', 'fireflies_rose', (e) => e.count),
  sum('big_swarms', 'Светлячков в больших роях', 'fireflies_rose', (e) =>
    e.count >= 15 ? e.count : null,
  ),
  gauge('journal', 'Записей в журнале', (world) => world.events.list.length),
];

function record(world: World, ticks: number, metrics = TEST_METRICS): StatsReport {
  const stats = createStats(world, metrics);
  for (let i = 0; i < ticks; i++) {
    stepWorld(world);
    recordTick(stats, world);
  }
  return finishStats(stats, world);
}

/** Events of a closed period (fromTick, toTick]; the first period also has the creation. */
function eventsIn(world: World, fromTick: number, toTick: number): WorldEvent[] {
  return world.events.list.filter(
    (e) => (e.tick > fromTick || (fromTick === 0 && e.tick === 0)) && e.tick <= toTick,
  );
}

const swarmSizes = (events: WorldEvent[]) =>
  events.flatMap((e) => (e.type === 'fireflies_rose' ? [e.count] : []));

describe('статистика мира', () => {
  it('итог и срез за каждый год совпадают с журналом событий', () => {
    const world = createWorld(5);
    const report = record(world, 2 * TICKS_PER_YEAR);

    expect(report).toMatchObject({ fromTick: 0, toTick: 2 * TICKS_PER_YEAR });
    expect(report.years.map(({ year, fromTick, toTick }) => [year, fromTick, toTick])).toEqual([
      [1, 0, TICKS_PER_YEAR],
      [2, TICKS_PER_YEAR, 2 * TICKS_PER_YEAR],
    ]);

    for (const period of report.years) {
      const events = eventsIn(world, period.fromTick, period.toTick);
      const sizes = swarmSizes(events);
      expect(period.values).toEqual({
        events: events.length,
        phases: events.filter((e) => e.type === 'phase_started').length,
        nights: 12,
        seasons: 4,
        fireflies: sizes.reduce((a, b) => a + b, 0),
        swarm_mean: sizes.reduce((a, b) => a + b, 0) / sizes.length,
        swarm_max: Math.max(...sizes),
        swarm_min: Math.min(...sizes),
        big_swarms: sizes.filter((n) => n >= 15).reduce((a, b) => a + b, 0),
        journal: world.events.list.filter((e) => e.tick <= period.toTick).length,
      });
    }

    const all = swarmSizes(world.events.list);
    expect(report.totals).toEqual({
      events: world.events.list.length,
      phases: 2 * 12 * 4,
      nights: 24,
      seasons: 8,
      fireflies: all.reduce((a, b) => a + b, 0),
      swarm_mean: all.reduce((a, b) => a + b, 0) / all.length,
      swarm_max: Math.max(...all),
      swarm_min: Math.min(...all),
      big_swarms: all.filter((n) => n >= 15).reduce((a, b) => a + b, 0),
      journal: world.events.list.length,
    });
  });

  it('счётчики и суммы за год складываются в итог', () => {
    const report = record(createWorld(8), 3 * TICKS_PER_YEAR);
    for (const id of ['events', 'phases', 'nights', 'seasons', 'fireflies', 'big_swarms']) {
      const byYear = report.years.reduce((total, year) => total + (year.values[id] ?? 0), 0);
      expect(byYear, id).toBe(report.totals[id]);
    }
  });

  it('событие на рубеже года относится к году, который закончился (шаги 1…4800 — первый год)', () => {
    const report = record(createWorld(1), TICKS_PER_YEAR + 1);
    // Seasons start at ticks 1200, 2400, 3600 and 4800 (spring of year 2) — all four in year 1.
    expect(report.years[0]?.values.seasons).toBe(4);
    expect(report.years[1]).toMatchObject({ year: 2, fromTick: 4800, toTick: 4801 });
  });

  it('нет событий — среднее, максимум и минимум пусты (null), счётчики и суммы — ноль', () => {
    const report = record(createWorld(3), 100); // night (and the first swarm) is at tick 280
    expect(report.totals).toMatchObject({
      fireflies: 0,
      swarm_mean: null,
      swarm_max: null,
      swarm_min: null,
      big_swarms: 0,
    });
    expect(report.years).toHaveLength(1);
    expect(report.years[0]).toMatchObject({ year: 1, fromTick: 0, toTick: 100 });
  });

  it('незаконченный год закрывается в конце прогона', () => {
    const report = record(createWorld(3), TICKS_PER_YEAR + 1234);
    expect(report.years.map((y) => y.toTick - y.fromTick)).toEqual([TICKS_PER_YEAR, 1234]);
  });

  it('запись, начатая посреди истории, считает только новые события', () => {
    const world = createWorld(4);
    runTicks(world, 1000);
    const before = world.events.list.length;
    const report = record(world, TICKS_PER_YEAR - 1000);
    expect(report.totals.events).toBe(world.events.list.length - before);
    expect(report.years).toEqual([
      expect.objectContaining({ year: 1, fromTick: 1000, toTick: 4800 }),
    ]);
  });

  it('запись не меняет мир: хэш тот же, что без неё', () => {
    const watched = createWorld(9);
    record(watched, TICKS_PER_YEAR);
    const plain = createWorld(9);
    runTicks(plain, TICKS_PER_YEAR);
    expect(hashState(watched)).toBe(hashState(plain));
  });

  it('одно зерно — одна статистика, разные зёрна — разная', () => {
    const a = record(createWorld(12), TICKS_PER_YEAR);
    expect(record(createWorld(12), TICKS_PER_YEAR)).toEqual(a);
    expect(record(createWorld(13), TICKS_PER_YEAR).totals.fireflies).not.toBe(a.totals.fireflies);
  });

  it('ошибки в списке показателей названы по-русски', () => {
    const broken: Metric[] = [
      count('nights', 'Ночей', 'phase_started'),
      count('nights', 'Ещё ночи', 'phase_started'),
      gauge('Journal-Size', 'Журнал', () => 0),
      count('empty', ' ', 'any'),
    ];
    expect(checkMetrics(broken)).toEqual([
      'показатель «nights» объявлен дважды',
      'показатель «Journal-Size»: id — латиница snake_case (например, food_trips)',
      'показатель «empty»: нет названия',
    ]);
    expect(() => createStats(createWorld(1), broken)).toThrow(/Ошибки в списке показателей/);
  });
});

describe('показатели прогонов (src/sim/metrics.ts)', () => {
  it('список без ошибок: id уникальны и в snake_case, у каждого есть название', () => {
    expect(checkMetrics(METRICS)).toEqual([]);
  });

  it('за год пустого мира: 12 ночей и 12 роёв, событий столько же, сколько в журнале', () => {
    const world = createWorld(1);
    const { totals } = record(world, TICKS_PER_YEAR, METRICS);
    expect(totals).toMatchObject({ nights: 12, swarms: 12, events: world.events.list.length });
    expect(totals.journal).toBe(world.events.list.length);
    expect(totals.swarm_min).toBeLessThanOrEqual(totals.swarm_mean ?? 0);
    expect(totals.swarm_max).toBeGreaterThanOrEqual(totals.swarm_mean ?? 0);
  });
});
