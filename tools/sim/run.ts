/**
 * One headless world from start to finish: create it (or take one loaded from a save), run it
 * for N years recording the metrics (src/sim/metrics.ts) and timing every tick, return
 * everything as plain data.
 *
 * Used by the worker threads of `npm run sim` (./worker.ts) and by tests. A world that throws
 * does not stop the run: the result says where it failed (`status: 'error'`).
 *
 * A world where nobody is left alive (step 1.10) stops there: `status: 'extinct'`, its metrics are
 * read at the moment of the last death (its last yearly row is partial) — nothing more can happen
 * in it that matters.
 *
 * A loaded world may stand in the middle of a year: it runs N × 4 800 ticks all the same, so
 * its first and last yearly rows are partial (from_tick / to_tick show it).
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
  /** `ok` — ran its years; `extinct` — stopped when nobody was left alive (step 1.10); `error` — threw. */
  status: 'ok' | 'extinct' | 'error';
  /** Tick the run started from: 0 for a new world, the save's tick for a loaded one. */
  fromTick: number;
  /** Tick the world reached (simulated in this run: ticks − fromTick). */
  ticks: number;
  /** Whole game years simulated in this run. */
  years: number;
  /** Fingerprint of the final world state (src/sim/hash.ts); empty if the world failed. */
  hash: string;
  /** Metrics over the whole run by id; empty if the world failed. */
  totals: Record<string, MetricValue>;
  /** One row per calendar year the run went through (the first and last may be partial). */
  yearRows: YearRun[];
  timing: WorldTiming;
  /** Why the world failed, or null. */
  error: { message: string; stack: string; tick: number } | null;
}

export interface RunOptions {
  seed: number;
  /** Game years to run (× 4 800 ticks), counted from the start tick. */
  years: number;
  /** A world to continue (loaded from a save; its seed must be `seed`). Default: a new world. */
  start?: World;
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
  if (options.start && options.start.seed !== seed) {
    throw new Error(`runWorld: мир из сохранения с зерном ${options.start.seed}, а не ${seed}`);
  }
  const world = options.start ?? createWorld(seed);
  const fromTick = world.tick;
  const yearsDone = () => Math.floor((world.tick - fromTick) / TICKS_PER_YEAR);
  const stats = createStats(world, metrics);
  const timer = createTickTimer();
  const yearRows: YearRun[] = [];
  let yearTotal = 0;
  let yearMax = 0;
  let yearTicks = 0;
  const totalTicks = years * TICKS_PER_YEAR;
  // A world with people in it ends when the last of them dies (step 1.10).
  const peopled = world.villagers.list.length > 0;
  let extinct = false;

  const timing = (): WorldTiming => ({
    tickMeanUs: meanUs(timer),
    tickP99Us: percentileUs(timer, 0.99),
    tickMaxUs: timer.maxUs,
    simSeconds: timer.totalUs / 1e6,
    runSeconds: (performance.now() - started) / 1000,
    yearsPerSecond:
      timer.totalUs > 0 ? (world.tick - fromTick) / TICKS_PER_YEAR / (timer.totalUs / 1e6) : 0,
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
      if (peopled && world.villagers.list.length === 0) {
        extinct = true;
        break;
      }
    }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    return {
      seed,
      status: 'error',
      fromTick,
      ticks: world.tick,
      years: yearsDone(),
      hash: '',
      totals: {},
      yearRows,
      timing: timing(),
      error: { message: failure.message, stack: failure.stack ?? '', tick: world.tick },
    };
  }

  const report = finishStats(stats, world);
  // A world that started mid-year ends mid-year too: its last, partial year closes here.
  for (const period of report.years.slice(yearRows.length)) {
    yearRows.push({
      ...period,
      tickMeanUs: yearTicks > 0 ? yearTotal / yearTicks : 0,
      tickMaxUs: yearMax,
    });
  }
  return {
    seed,
    status: extinct ? 'extinct' : 'ok',
    fromTick,
    ticks: world.tick,
    years: yearsDone(),
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
