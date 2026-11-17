/**
 * One headless world from start to finish: create it, run it for N years recording the
 * metrics (src/sim/metrics.ts) and timing every tick, return everything as plain data.
 *
 * Used by the worker threads of `npm run sim` (./worker.ts) and by tests. A world that throws
 * does not stop the run: the result says where it failed (`status: 'error'`).
 */
import { TICKS_PER_YEAR } from '../../src/sim/calendar.ts';
import { hashState } from '../../src/sim/hash.ts';
import { METRICS } from '../../src/sim/metrics.ts';
import {
  createStats,
  finishStats,
  type Metric,
  type MetricValue,
  type PeriodStats,
  recordTick,
} from '../../src/sim/stats.ts';
import { createWorld, stepWorld, type World } from '../../src/sim/world.ts';
import { addTick, createTickTimer, meanUs, percentileUs } from './timing.ts';

/** A year of a world: its metrics and how long its ticks took. */
export interface YearRun extends PeriodStats {
  tickMeanUs: number;
  tickMaxUs: number;
}

export interface WorldTiming {
  /** Average tick, µs. */
  tickMeanUs: number;
  /** 99 % of ticks took no longer than this, µs. */
  tickP99Us: number;
  /** The worst tick, µs. */
  tickMaxUs: number;
  /** Time spent inside the ticks, s. */
  simSeconds: number;
  /** Whole time of the world, with recording and timing, s. */
  runSeconds: number;
  /** Game years per second of simulation (years / simSeconds). */
  yearsPerSecond: number;
}

export interface WorldRun {
  seed: number;
  status: 'ok' | 'error';
  /** Ticks simulated. */
  ticks: number;
  /** Whole years simulated. */
  years: number;
  /** Fingerprint of the final world state (src/sim/hash.ts); empty if the world failed. */
  hash: string;
  /** Metrics over the whole run by id; empty if the world failed. */
  totals: Record<string, MetricValue>;
  /** One row per finished year. */
  yearRows: YearRun[];
  timing: WorldTiming;
  /** Why the world failed, or null. */
  error: { message: string; stack: string; tick: number } | null;
}

export interface RunOptions {
  seed: number;
  years: number;
  metrics?: readonly Metric[];
  /** Cost of one timer reading, µs, subtracted from every tick (see ./timing.ts). */
  timerCostUs?: number;
  /** Called after every finished year (progress). */
  onYear?: (year: number) => void;
  /** The tick itself; tests replace it to check how failures are reported. */
  step?: (world: World) => void;
}

export function runWorld(options: RunOptions): WorldRun {
  const { seed, years, metrics = METRICS, timerCostUs = 0, onYear, step = stepWorld } = options;
  const started = performance.now();
  const world = createWorld(seed);
  const stats = createStats(world, metrics);
  const timer = createTickTimer();
  const yearRows: YearRun[] = [];
  let yearTotal = 0;
  let yearMax = 0;
  let yearTicks = 0;
  const totalTicks = years * TICKS_PER_YEAR;

  const timing = (): WorldTiming => ({
    tickMeanUs: meanUs(timer),
    tickP99Us: percentileUs(timer, 0.99),
    tickMaxUs: timer.maxUs,
    simSeconds: timer.totalUs / 1e6,
    runSeconds: (performance.now() - started) / 1000,
    yearsPerSecond: timer.totalUs > 0 ? yearRows.length / (timer.totalUs / 1e6) : 0,
  });

  try {
    for (let i = 0; i < totalTicks; i++) {
      const before = performance.now();
      step(world);
      const us = Math.max(0, (performance.now() - before) * 1000 - timerCostUs);
      addTick(timer, us);
      yearTotal += us;
      yearTicks += 1;
      if (us > yearMax) yearMax = us;
      recordTick(stats, world);
      if (stats.years.length > yearRows.length) {
        const period = stats.years[stats.years.length - 1]!;
        yearRows.push({ ...period, tickMeanUs: yearTotal / yearTicks, tickMaxUs: yearMax });
        yearTotal = 0;
        yearMax = 0;
        yearTicks = 0;
        onYear?.(yearRows.length);
      }
    }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    return {
      seed,
      status: 'error',
      ticks: world.tick,
      years: yearRows.length,
      hash: '',
      totals: {},
      yearRows,
      timing: timing(),
      error: { message: failure.message, stack: failure.stack ?? '', tick: world.tick },
    };
  }

  const report = finishStats(stats, world);
  return {
    seed,
    status: 'ok',
    ticks: world.tick,
    years: yearRows.length,
    hash: hashState(world),
    totals: report.totals,
    yearRows,
    timing: timing(),
    error: null,
  };
}

/**
 * Let the JavaScript engine compile the hot code before measuring: run throwaway one-year
 * worlds (seed 0) through the same code until `ticks` ticks or `budgetMs` milliseconds have
 * passed — at least one year. Worlds are independent, so this changes no history.
 */
export function warmUp(ticks = 50_000, budgetMs = 500): void {
  const started = performance.now();
  let done = 0;
  do {
    runWorld({ seed: 0, years: 1 });
    done += TICKS_PER_YEAR;
  } while (done < ticks && performance.now() - started < budgetMs);
}
