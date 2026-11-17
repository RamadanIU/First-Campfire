/**
 * How long a tick takes: average, the time 99 % of ticks fit into, and the worst tick.
 *
 * Every tick is timed with `performance.now()`. One reading costs ≈ 50 ns — as much as a
 * fifth of a tick of the empty world — so the cost of the reading itself (`timerCost`,
 * measured once per thread) is subtracted from every tick. Durations go into a histogram with
 * 16 buckets per doubling (≈ 4 % wide), so the 99th percentile costs no memory however long
 * the run is.
 *
 * The worst tick of a run is often a pause of the JavaScript engine (garbage collection),
 * not the game: look at «99 % тиков» to judge the simulation, at the worst tick for hitches.
 */

/** Buckets per doubling of duration. */
const STEPS = 16;
/** Bucket 0 starts at 2^-8 µs ≈ 4 ns; the last one ends at 2^24 µs ≈ 17 s. */
const LOWEST_POWER = -8;
const BUCKETS = (24 - LOWEST_POWER) * STEPS;

export interface TickTimer {
  ticks: number;
  /** Sum of tick durations, µs. */
  totalUs: number;
  maxUs: number;
  histogram: Uint32Array;
}

export function createTickTimer(): TickTimer {
  return { ticks: 0, totalUs: 0, maxUs: 0, histogram: new Uint32Array(BUCKETS) };
}

function bucketOf(us: number): number {
  if (us <= 0) return 0;
  const index = Math.floor((Math.log2(us) - LOWEST_POWER) * STEPS);
  return Math.min(BUCKETS - 1, Math.max(0, index));
}

/** Upper edge of a bucket, µs. */
function bucketTop(index: number): number {
  return 2 ** ((index + 1) / STEPS + LOWEST_POWER);
}

export function addTick(timer: TickTimer, us: number): void {
  timer.ticks += 1;
  timer.totalUs += us;
  if (us > timer.maxUs) timer.maxUs = us;
  timer.histogram[bucketOf(us)]! += 1;
}

export function meanUs(timer: TickTimer): number {
  return timer.ticks > 0 ? timer.totalUs / timer.ticks : 0;
}

/**
 * Duration that a share `p` (0…1) of ticks did not exceed, µs — the upper edge of the bucket
 * where that share is reached, so it overestimates by at most ≈ 4 %; never above the worst tick.
 */
export function percentileUs(timer: TickTimer, p: number): number {
  if (timer.ticks === 0) return 0;
  const target = Math.max(1, Math.ceil(timer.ticks * p));
  let seen = 0;
  for (let i = 0; i < BUCKETS; i++) {
    seen += timer.histogram[i]!;
    if (seen < target) continue;
    // The last bucket also holds everything longer: there only the worst tick is exact.
    return i === BUCKETS - 1 ? timer.maxUs : Math.min(bucketTop(i), timer.maxUs);
  }
  return timer.maxUs;
}

/** Cost of one `performance.now()` reading inside a timed interval, µs (median of many). */
export function measureTimerCost(samples = 20_001): number {
  const deltas = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    deltas[i] = performance.now() - start;
  }
  deltas.sort();
  return deltas[samples >> 1]! * 1000;
}
