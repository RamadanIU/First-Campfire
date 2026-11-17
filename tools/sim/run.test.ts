import { describe, expect, it } from 'vitest';
import { TICKS_PER_YEAR } from '../../src/sim/calendar.ts';
import { hashState } from '../../src/sim/hash.ts';
import { loadWorld, saveWorld } from '../../src/sim/save.ts';
import { createWorld, runTicks, stepWorld, type World } from '../../src/sim/world.ts';
import { runWorld, type WorldRun } from './run.ts';

/** A run without the numbers that depend on the machine. */
function withoutTiming(run: WorldRun) {
  return {
    ...run,
    timing: null,
    yearRows: run.yearRows.map(({ tickMeanUs: _mean, tickMaxUs: _max, ...row }) => row),
  };
}

describe('один мир без графики', () => {
  it('проживает N лет: тики, годы, хэш как у мира без записи, показатели, время тиков', () => {
    const years: number[] = [];
    const run = runWorld({ seed: 1, years: 2, onYear: (year) => years.push(year) });

    const plain = createWorld(1);
    runTicks(plain, 2 * TICKS_PER_YEAR);
    expect(run).toMatchObject({
      seed: 1,
      status: 'ok',
      fromTick: 0,
      ticks: 2 * TICKS_PER_YEAR,
      years: 2,
      hash: hashState(plain),
      error: null,
    });
    expect(years).toEqual([1, 2]);
    expect(run.totals).toMatchObject({ nights: 24, swarms: 24 });
    expect(run.yearRows.map((row) => [row.year, row.values.nights])).toEqual([
      [1, 12],
      [2, 12],
    ]);
    for (const row of run.yearRows) {
      expect(row.tickMeanUs).toBeGreaterThan(0);
      expect(row.tickMaxUs).toBeGreaterThanOrEqual(row.tickMeanUs);
    }
    const { timing } = run;
    expect(timing.tickMeanUs).toBeGreaterThan(0);
    expect(timing.tickP99Us).toBeGreaterThanOrEqual(timing.tickMeanUs * 0.5);
    expect(timing.tickMaxUs).toBeGreaterThanOrEqual(timing.tickP99Us);
    expect(timing.runSeconds).toBeGreaterThanOrEqual(timing.simSeconds);
    expect(timing.yearsPerSecond).toBeCloseTo(2 / timing.simSeconds, 6);
  });

  it('повторный прогон — те же числа (кроме времени), другое зерно — другой мир', () => {
    const a = runWorld({ seed: 7, years: 1 });
    expect(withoutTiming(runWorld({ seed: 7, years: 1 }))).toEqual(withoutTiming(a));
    expect(runWorld({ seed: 8, years: 1 }).hash).not.toBe(a.hash);
  });

  it('мир, упавший с ошибкой, не роняет прогон: известны тик, сообщение и прожитые годы', () => {
    const run = runWorld({
      seed: 3,
      years: 2,
      step: (world) => {
        stepWorld(world);
        if (world.tick === 5000) throw new Error('житель застрял в стене');
      },
    });
    expect(run).toMatchObject({
      seed: 3,
      status: 'error',
      ticks: 5000,
      years: 1,
      hash: '',
      totals: {},
      error: { message: 'житель застрял в стене', tick: 5000 },
    });
    expect(run.yearRows).toHaveLength(1);
    expect(run.error?.stack).toContain('run.test.ts');
  });
});

describe('мир из сохранения', () => {
  /** A world of `seed` after `ticks` ticks, saved and opened again. */
  function saved(seed: number, ticks: number): World {
    const world = createWorld(seed);
    runTicks(world, ticks);
    const result = loadWorld(saveWorld(world));
    if (!result.ok) throw new Error(result.error.message);
    return result.world;
  }

  it('продолжается так же, как непрерывный: 1 год + сохранение + 1 год = 2 года подряд', () => {
    const whole = runWorld({ seed: 4, years: 2 });
    const resumed = runWorld({ seed: 4, years: 1, start: saved(4, TICKS_PER_YEAR) });
    expect(resumed).toMatchObject({
      status: 'ok',
      fromTick: TICKS_PER_YEAR,
      ticks: 2 * TICKS_PER_YEAR,
      years: 1,
      hash: whole.hash,
    });
    expect(resumed.yearRows.map((row) => [row.year, row.values.nights])).toEqual([[2, 12]]);
    expect(resumed.yearRows[0]?.values).toEqual(whole.yearRows[1]?.values);
  });

  it('посреди года: N × 4 800 тиков, первый и последний срезы неполные', () => {
    const years: number[] = [];
    const run = runWorld({
      seed: 6,
      years: 1,
      start: saved(6, 7_000),
      onYear: (year) => years.push(year),
    });
    const plain = createWorld(6);
    runTicks(plain, 7_000 + TICKS_PER_YEAR);
    expect(run).toMatchObject({ fromTick: 7_000, ticks: 11_800, years: 1, hash: hashState(plain) });
    expect(run.yearRows.map((row) => [row.year, row.fromTick, row.toTick])).toEqual([
      [2, 7_000, 9_600],
      [3, 9_600, 11_800],
    ]);
    expect(years).toEqual([1]); // one new year crossed
    for (const row of run.yearRows) expect(row.tickMeanUs).toBeGreaterThan(0);
    // Nights of the run: the 12 days it covers each have one nightfall.
    expect(run.totals.nights).toBe(12);
  });

  it('зерно мира из сохранения должно совпадать с зерном прогона', () => {
    expect(() => runWorld({ seed: 1, years: 1, start: saved(2, 10) })).toThrow('зерном 2');
  });
});
