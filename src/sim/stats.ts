/**
 * Statistics of a world: metrics counted while the world runs — the raw material of balance
 * (headless runs, `npm run sim`) and later of the in-game statistics.
 *
 * A metric is defined in one line (the list lives in ./metrics.ts) and is one of:
 *
 * - `gauge` — a number read from the world state at the end of each year and of the run
 *   (population, size of the journal…);
 * - `count` / `sum` / `mean` / `max` / `min` — an aggregate over events of the journal:
 *   how many, their total, their average, the largest, the smallest. A filter (or a value
 *   function returning `null`) picks which events take part;
 * - `share` — a share of time: after every tick it looks at each living villager and counts
 *   those the test picks (what part of the villagers' time went to work, to sleep…).
 *
 * The recorder observes the world from outside, like the renderer: `createStats(world, metrics)`,
 * then `recordTick(stats, world)` after every `stepWorld`. It never changes the world, so adding
 * a metric changes neither the history nor the world hash (ADR-015). It reads only the events
 * added since the previous call, so it keeps working once the journal is trimmed.
 *
 * Everything here is deterministic: the same seed gives the same statistics, byte for byte.
 * Time measurements (how long a tick takes) are not statistics of the world — the runner
 * (tools/sim) makes them.
 */
import { calendarAt, TICKS_PER_YEAR } from './calendar.ts';
import type { EventType, WorldEvent } from './events.ts';
import type { Villager } from './villagers.ts';
import type { World } from './world.ts';

export type MetricKind = 'gauge' | 'count' | 'sum' | 'mean' | 'max' | 'min' | 'share';

/** An event of a given type, or any event for `'any'`. */
export type EventOf<T extends EventType | 'any'> = T extends EventType
  ? Extract<WorldEvent, { type: T }>
  : WorldEvent;

interface MetricInfo {
  /** snake_case id: CSV column, JSON key. Never reuse an id for a different meaning. */
  id: string;
  /** Russian name for people (console table, reports). */
  name: string;
}

export interface GaugeMetric extends MetricInfo {
  kind: 'gauge';
  /** Value read from the world at the end of each year and of the run. */
  read(world: World): number;
}

export interface ShareMetric extends MetricInfo {
  kind: 'share';
  /** Whether a living villager's tick counts: the share is picked ticks / all villager-ticks. */
  test(villager: Villager): boolean;
}

export interface EventMetric extends MetricInfo {
  kind: Exclude<MetricKind, 'gauge' | 'share'>;
  /** Event type it watches; `'any'` — every event. */
  event: EventType | 'any';
  /** The event's contribution; `null` — the event does not take part. */
  value(event: WorldEvent): number | null;
}

export type Metric = GaugeMetric | EventMetric | ShareMetric;

/** Value of a metric; `null` — nothing to report (no events for a mean, maximum, minimum). */
export type MetricValue = number | null;

// --- Definitions: one line per metric -------------------------------------------------------

/** Number read from the world state at the end of each year and of the run. */
export function gauge(id: string, name: string, read: (world: World) => number): GaugeMetric {
  return { id, name, kind: 'gauge', read };
}

/**
 * Share of the villagers' time (0…1) the test picks: sampled after every tick over the living
 * villagers (`null` if nobody lived through the period).
 */
export function share(
  id: string,
  name: string,
  test: (villager: Villager) => boolean,
): ShareMetric {
  return { id, name, kind: 'share', test };
}

/** How many events of a type (that pass the filter) happened. */
export function count<T extends EventType | 'any'>(
  id: string,
  name: string,
  event: T,
  filter?: (event: EventOf<T>) => boolean,
): EventMetric {
  const value = filter ? (e: WorldEvent) => (filter(e as EventOf<T>) ? 1 : null) : () => 1;
  return { id, name, kind: 'count', event, value };
}

function aggregate(kind: 'sum' | 'mean' | 'max' | 'min') {
  return <T extends EventType | 'any'>(
    id: string,
    name: string,
    event: T,
    value: (event: EventOf<T>) => number | null,
  ): EventMetric => ({ id, name, kind, event, value: (e) => value(e as EventOf<T>) });
}

/** Total of a number carried by events of a type (0 if there were none). */
export const sum = aggregate('sum');
/** Average of a number carried by events of a type (`null` if there were none). */
export const mean = aggregate('mean');
/** Largest number carried by events of a type (`null` if there were none). */
export const max = aggregate('max');
/** Smallest number carried by events of a type (`null` if there were none). */
export const min = aggregate('min');

/** Problems of a metric list (duplicate or malformed ids, empty names); empty when fine. */
export function checkMetrics(metrics: readonly Metric[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const metric of metrics) {
    if (!/^[a-z][a-z0-9_]*$/.test(metric.id)) {
      problems.push(`показатель «${metric.id}»: id — латиница snake_case (например, food_trips)`);
    }
    if (seen.has(metric.id)) problems.push(`показатель «${metric.id}» объявлен дважды`);
    seen.add(metric.id);
    if (metric.name.trim() === '') problems.push(`показатель «${metric.id}»: нет названия`);
  }
  return problems;
}

// --- Recording -------------------------------------------------------------------------------

/** Running aggregates of every metric over some period, by metric index. */
interface Accumulator {
  /** count/sum: running total; max/min: best so far; mean: running total; share: picked
   *  villager-ticks; gauge: unused. */
  value: number[];
  /** How many events took part; share: all villager-ticks. */
  events: number[];
}

/**
 * Statistics of one closed period: a year, or the part of it the run covered.
 *
 * A period covers the ticks fromTick + 1 … toTick — the steps the world made during it — and
 * the state after them: a year's row holds the events of its 4 800 steps and its gauges are
 * read after the last one. (The very first period also counts the events that were in the
 * journal at the start tick: the world's creation.)
 */
export interface PeriodStats {
  /** Calendar year of the period, from 1. */
  year: number;
  /** Tick at which the period started. */
  fromTick: number;
  /** Tick at which it ended. A whole year has toTick − fromTick = TICKS_PER_YEAR. */
  toTick: number;
  /** Value of each metric by id, in the order of the metric list. */
  values: Record<string, MetricValue>;
}

/** Final statistics of a run: totals and one row per year. Plain data (JSON-friendly). */
export interface StatsReport {
  fromTick: number;
  toTick: number;
  /** Over the whole run: event metrics aggregate everything, gauges are read at the end. */
  totals: Record<string, MetricValue>;
  years: PeriodStats[];
}

export interface Stats {
  readonly metrics: readonly Metric[];
  /** Indices of the event metrics watching each event type ('any' included). */
  readonly watchers: ReadonlyMap<EventType | 'any', readonly number[]>;
  /** Indices of the share metrics (sampled every tick). */
  readonly sharers: readonly number[];
  /** Id of the last event already taken into account. */
  lastEventId: number;
  /** Tick at which recording started. */
  readonly fromTick: number;
  /** Tick at which the current period started. */
  periodFrom: number;
  total: Accumulator;
  period: Accumulator;
  years: PeriodStats[];
}

function initialValue(metric: Metric): number {
  if (metric.kind === 'max') return Number.NEGATIVE_INFINITY;
  if (metric.kind === 'min') return Number.POSITIVE_INFINITY;
  return 0;
}

function createAccumulator(metrics: readonly Metric[]): Accumulator {
  return { value: metrics.map(initialValue), events: metrics.map(() => 0) };
}

/**
 * Start recording `metrics` of `world` from its current tick. For a new world (tick 0) its
 * creation is counted too. A world that has run before — loaded from a save, say — counts only
 * what happens from now on: the events of its current tick were made by the step before, which
 * belongs to the previous recording. So statistics split at any tick add up to the statistics
 * of the whole run (a year's row is the same whether or not the world was saved and loaded).
 */
export function createStats(world: World, metrics: readonly Metric[]): Stats {
  const problems = checkMetrics(metrics);
  if (problems.length > 0) {
    throw new Error(`Ошибки в списке показателей:\n  ${problems.join('\n  ')}`);
  }
  const watchers = new Map<EventType | 'any', number[]>();
  const sharers: number[] = [];
  metrics.forEach((metric, index) => {
    if (metric.kind === 'share') sharers.push(index);
    if (metric.kind === 'gauge' || metric.kind === 'share') return;
    const list = watchers.get(metric.event) ?? [];
    list.push(index);
    watchers.set(metric.event, list);
  });
  const stats: Stats = {
    metrics,
    watchers,
    sharers,
    lastEventId: 0,
    fromTick: world.tick,
    periodFrom: world.tick,
    total: createAccumulator(metrics),
    period: createAccumulator(metrics),
    years: [],
  };
  // A new world: its creation (the events of tick 0) belongs to this recording. A world that
  // has run before: everything already in the journal belongs to earlier steps.
  const list = world.events.list;
  stats.lastEventId = world.tick === 0 ? 0 : (list.at(-1)?.id ?? 0);
  takeNewEvents(stats, world);
  return stats;
}

function addTo(acc: Accumulator, index: number, kind: MetricKind, value: number): void {
  acc.events[index]! += 1;
  if (kind === 'max') {
    if (value > acc.value[index]!) acc.value[index] = value;
  } else if (kind === 'min') {
    if (value < acc.value[index]!) acc.value[index] = value;
  } else {
    acc.value[index]! += value;
  }
}

function observe(stats: Stats, indices: readonly number[] | undefined, event: WorldEvent): void {
  if (indices === undefined) return;
  for (const index of indices) {
    const metric = stats.metrics[index] as EventMetric;
    const value = metric.value(event);
    if (value === null) continue;
    addTo(stats.total, index, metric.kind, value);
    addTo(stats.period, index, metric.kind, value);
  }
}

function takeNewEvents(stats: Stats, world: World): void {
  const list = world.events.list;
  let start = list.length;
  while (start > 0 && list[start - 1]!.id > stats.lastEventId) start--;
  const any = stats.watchers.get('any');
  for (let i = start; i < list.length; i++) {
    const event = list[i]!;
    observe(stats, stats.watchers.get(event.type), event);
    observe(stats, any, event);
  }
  if (list.length > 0) stats.lastEventId = list[list.length - 1]!.id;
}

/** One tick of every share metric: each villager (the dead leave the list) counts once. */
function sample(stats: Stats, world: World): void {
  const villagers = world.villagers.list;
  const all = villagers.length;
  for (const index of stats.sharers) {
    const metric = stats.metrics[index] as ShareMetric;
    let picked = 0;
    for (const villager of villagers) if (metric.test(villager)) picked++;
    stats.total.value[index]! += picked;
    stats.total.events[index]! += all;
    stats.period.value[index]! += picked;
    stats.period.events[index]! += all;
  }
}

function results(stats: Stats, acc: Accumulator, world: World): Record<string, MetricValue> {
  const values: Record<string, MetricValue> = {};
  stats.metrics.forEach((metric, index) => {
    const events = acc.events[index]!;
    const value = acc.value[index]!;
    switch (metric.kind) {
      case 'gauge':
        values[metric.id] = metric.read(world);
        break;
      case 'count':
      case 'sum':
        values[metric.id] = value;
        break;
      case 'mean':
      case 'share':
        values[metric.id] = events > 0 ? value / events : null;
        break;
      case 'max':
      case 'min':
        values[metric.id] = events > 0 ? value : null;
        break;
    }
  });
  return values;
}

function closePeriod(stats: Stats, world: World): void {
  stats.years.push({
    year: calendarAt(stats.periodFrom).year,
    fromTick: stats.periodFrom,
    toTick: world.tick,
    values: results(stats, stats.period, world),
  });
  stats.period = createAccumulator(stats.metrics);
  stats.periodFrom = world.tick;
}

/** Take into account everything the last tick did. Call after every `stepWorld`. */
export function recordTick(stats: Stats, world: World): void {
  takeNewEvents(stats, world);
  if (stats.sharers.length > 0) sample(stats, world);
  if (world.tick % TICKS_PER_YEAR === 0 && world.tick > stats.periodFrom) closePeriod(stats, world);
}

/** Finish recording: close the unfinished year (if any) and return totals and yearly rows. */
export function finishStats(stats: Stats, world: World): StatsReport {
  takeNewEvents(stats, world);
  if (world.tick > stats.periodFrom) closePeriod(stats, world);
  return {
    fromTick: stats.fromTick,
    toTick: world.tick,
    totals: results(stats, stats.total, world),
    years: stats.years,
  };
}
