/**
 * Results of `npm run sim`: CSV files, the JSON summary and the console table.
 * Pure functions over the results of ./run.ts, tested in ./report.test.ts.
 *
 * Everything except the timing columns and fields is deterministic: the same command gives the
 * same bytes. Timing columns are listed in TIMING_COLUMNS (tests drop them before comparing).
 */
import { hashState } from '../../src/sim/hash.ts';
import type { Metric, MetricKind, MetricValue } from '../../src/sim/stats.ts';
import { FORMS, plural } from '../../src/ui/texts.ts';
import type { WorldRun } from './run.ts';

/** Columns that depend on the machine and its load, not on the world. */
export const TIMING_COLUMNS: readonly string[] = [
  'tick_mean_us',
  'tick_p99_us',
  'tick_max_us',
  'sim_seconds',
  'run_seconds',
  'years_per_second',
];

/** Statistics of one value across worlds; seeds of the worlds with the extremes. */
export interface Aggregate {
  mean: number;
  min: number;
  max: number;
  /** First (smallest) seed with the minimum / maximum. */
  minSeed: number;
  maxSeed: number;
  /** How many worlds had the value (a mean of no events is null and does not count). */
  worlds: number;
}

/** The save a run started from (`--load`). */
export interface LoadInfo {
  /** The file as given on the command line. */
  file: string;
  seed: number;
  /** Tick of the saved world. */
  tick: number;
  /** The data tables changed since the save (the world goes on by the current ones). */
  dataChanged: boolean;
}

export interface RunMeta {
  command: string;
  seedsText: string;
  years: number;
  /** The save the run continued, or null for new worlds. */
  load: LoadInfo | null;
  threads: number;
  /** ISO time when the run started. */
  startedAt: string;
  /** Wall time of the whole run, s. */
  seconds: number;
  /** Cost of a timer reading subtracted from every tick, µs (average over threads). */
  timerCostUs: number;
  environment: { node: string; platform: string; cpus: number; cpu: string };
}

export interface Summary {
  format: 1;
  command: string;
  params: {
    seeds: string;
    seedCount: number;
    years: number;
    threads: number;
    load: LoadInfo | null;
  };
  environment: RunMeta['environment'];
  startedAt: string;
  seconds: number;
  worlds: { total: number; ok: number; failed: number };
  /** Ticks and game years simulated by all worlds together, and per second of the run. */
  speed: { ticks: number; years: number; ticksPerSecond: number; yearsPerSecond: number };
  /** One fingerprint of all worlds: changes if any history changed (src/sim/hash.ts). */
  fingerprint: string;
  /** Metrics over the whole run of each world. */
  metrics: { id: string; name: string; kind: MetricKind; total: Aggregate | null }[];
  /** Metrics of each calendar year across worlds — curves like «population by year». */
  years: { year: number; metrics: Record<string, Aggregate | null> }[];
  timing: {
    timerCostUs: number;
    tickMeanUs: Aggregate | null;
    tickP99Us: Aggregate | null;
    tickMaxUs: Aggregate | null;
    yearsPerSecond: Aggregate | null;
  };
  failures: { seed: number; tick: number; message: string; stack: string }[];
}

// --- CSV ------------------------------------------------------------------------------------

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  }
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csv(header: readonly string[], rows: (string | number | null)[][]): string {
  return `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

/** One row per world: seed, outcome, metrics over the whole run, timing. Sorted by seed. */
export function worldsCsv(runs: readonly WorldRun[], metrics: readonly Metric[]): string {
  const header = [
    'seed',
    'status',
    'years',
    'from_tick',
    'ticks',
    'hash',
    ...metrics.map((m) => m.id),
  ];
  const rows = bySeed(runs).map((run) => [
    run.seed,
    run.status,
    run.years,
    run.fromTick,
    run.ticks,
    run.hash,
    ...metrics.map((m) => (run.status === 'ok' ? (run.totals[m.id] ?? null) : null)),
    run.timing.tickMeanUs,
    run.timing.tickP99Us,
    run.timing.tickMaxUs,
    run.timing.simSeconds,
    run.timing.runSeconds,
    run.timing.yearsPerSecond,
  ]);
  return csv([...header, ...TIMING_COLUMNS], rows);
}

/** One row per world and year: the metrics of that year and its tick timing. */
export function yearsCsv(runs: readonly WorldRun[], metrics: readonly Metric[]): string {
  const header = ['seed', 'year', 'from_tick', 'to_tick', ...metrics.map((m) => m.id)];
  const rows = bySeed(runs).flatMap((run) =>
    run.yearRows.map((row) => [
      run.seed,
      row.year,
      row.fromTick,
      row.toTick,
      ...metrics.map((m) => row.values[m.id] ?? null),
      row.tickMeanUs,
      row.tickMaxUs,
    ]),
  );
  return csv([...header, 'tick_mean_us', 'tick_max_us'], rows);
}

/** The same CSV without the given columns (to compare runs without timing). */
export function dropColumns(text: string, columns: readonly string[]): string {
  const lines = text.split('\n');
  const header = lines[0]!.split(',');
  const keep = header.map((name) => !columns.includes(name));
  return lines
    .map((line) =>
      line === ''
        ? line
        : line
            .split(',')
            .filter((_, i) => keep[i])
            .join(','),
    )
    .join('\n');
}

// --- Summary --------------------------------------------------------------------------------

function bySeed(runs: readonly WorldRun[]): WorldRun[] {
  return [...runs].sort((a, b) => a.seed - b.seed);
}

/** Mean, minimum and maximum of the values that are not null; null if there are none. */
export function aggregate(
  values: readonly (readonly [seed: number, value: MetricValue])[],
): Aggregate | null {
  let total = 0;
  let worlds = 0;
  let best: Aggregate | null = null;
  for (const [seed, value] of values) {
    if (value === null || !Number.isFinite(value)) continue;
    total += value;
    worlds += 1;
    if (best === null) {
      best = { mean: 0, min: value, max: value, minSeed: seed, maxSeed: seed, worlds: 0 };
      continue;
    }
    if (value < best.min || (value === best.min && seed < best.minSeed)) {
      best.min = value;
      best.minSeed = seed;
    }
    if (value > best.max || (value === best.max && seed < best.maxSeed)) {
      best.max = value;
      best.maxSeed = seed;
    }
  }
  if (best === null) return null;
  best.mean = total / worlds;
  best.worlds = worlds;
  return best;
}

/** Fingerprint of the whole run: seeds, outcomes and world hashes in seed order. */
export function fingerprint(runs: readonly WorldRun[]): string {
  return hashState(bySeed(runs).map((run) => [run.seed, run.status, run.hash, run.ticks]));
}

export function summarize(
  runs: readonly WorldRun[],
  metrics: readonly Metric[],
  meta: RunMeta,
): Summary {
  const sorted = bySeed(runs);
  const ok = sorted.filter((run) => run.status === 'ok');
  const failed = sorted.filter((run) => run.status === 'error');
  // Ticks simulated in this run (a loaded world already had some).
  const ticks = sorted.reduce((total, run) => total + run.ticks - run.fromTick, 0);
  const years = sorted.reduce((total, run) => total + run.years, 0);
  const across = (pick: (run: WorldRun) => MetricValue) =>
    aggregate(ok.map((run) => [run.seed, pick(run)] as const));
  // Yearly rows by calendar year: worlds loaded from a save do not start with year 1.
  const rowsByYear = new Map(
    ok.map((run) => [run, new Map(run.yearRows.map((row) => [row.year, row]))] as const),
  );
  const calendarYears = [...new Set(ok.flatMap((run) => run.yearRows.map((row) => row.year)))].sort(
    (a, b) => a - b,
  );

  return {
    format: 1,
    command: meta.command,
    params: {
      seeds: meta.seedsText,
      seedCount: sorted.length,
      years: meta.years,
      threads: meta.threads,
      load: meta.load,
    },
    environment: meta.environment,
    startedAt: meta.startedAt,
    seconds: meta.seconds,
    worlds: { total: sorted.length, ok: ok.length, failed: failed.length },
    speed: {
      ticks,
      years,
      ticksPerSecond: meta.seconds > 0 ? ticks / meta.seconds : 0,
      yearsPerSecond: meta.seconds > 0 ? years / meta.seconds : 0,
    },
    fingerprint: fingerprint(sorted),
    metrics: metrics.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      total: across((run) => run.totals[m.id] ?? null),
    })),
    years: calendarYears.map((year) => ({
      year,
      metrics: Object.fromEntries(
        metrics.map((m) => [
          m.id,
          across((run) => rowsByYear.get(run)?.get(year)?.values[m.id] ?? null),
        ]),
      ),
    })),
    timing: {
      timerCostUs: meta.timerCostUs,
      tickMeanUs: across((run) => run.timing.tickMeanUs),
      tickP99Us: across((run) => run.timing.tickP99Us),
      tickMaxUs: across((run) => run.timing.tickMaxUs),
      yearsPerSecond: across((run) => run.timing.yearsPerSecond),
    },
    failures: failed.map((run) => ({
      seed: run.seed,
      tick: run.error?.tick ?? run.ticks,
      message: run.error?.message ?? '',
      stack: run.error?.stack ?? '',
    })),
  };
}

// --- Console --------------------------------------------------------------------------------

/** A number the Russian way: «1 680», «14,1», «0,29». */
export function formatNumber(value: number): string {
  const size = Math.abs(value);
  const digits = Number.isInteger(value) || size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Columns: text left-aligned, numbers right-aligned. */
export function formatTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  align: readonly ('l' | 'r')[],
): string {
  const widths = header.map((title, i) =>
    Math.max(title.length, ...rows.map((row) => row[i]!.length)),
  );
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, i) => (align[i] === 'r' ? cell.padStart(widths[i]!) : cell.padEnd(widths[i]!)))
      .join('   ')
      .trimEnd();
  return [line(header), ...rows.map(line)].join('\n');
}

interface Row {
  name: string;
  value: Aggregate | null;
}

/**
 * «Мин» or «Макс» column: the number, and the seed in brackets when worlds differ. The brackets
 * get a column of their own width, so numbers (and the title) stay right-aligned.
 */
function extremeColumn(rows: readonly Row[], which: 'min' | 'max', title: string) {
  const suffixes = rows.map(({ value }) => {
    if (value === null || value.min === value.max) return '';
    return ` (${which === 'min' ? value.minSeed : value.maxSeed})`;
  });
  const width = Math.max(0, ...suffixes.map((s) => s.length));
  return {
    title: title.padEnd(title.length + width),
    cells: rows.map(
      ({ value }, i) =>
        (value === null ? '—' : formatNumber(value[which])) + suffixes[i]!.padEnd(width),
    ),
  };
}

function aggregateTable(rows: readonly Row[]): string {
  const mins = extremeColumn(rows, 'min', 'Мин');
  const maxes = extremeColumn(rows, 'max', 'Макс');
  return formatTable(
    ['Показатель', 'Среднее', mins.title, maxes.title],
    rows.map((row, i) => [
      row.name,
      row.value === null ? '—' : formatNumber(row.value.mean),
      mins.cells[i]!,
      maxes.cells[i]!,
    ]),
    ['l', 'r', 'r', 'r'],
  );
}

/** Worlds listed one by one when there are at most this many. */
export const DETAIL_LIMIT = 10;

function worldDetails(runs: readonly WorldRun[]): string {
  return formatTable(
    ['Зерно', 'Итог', 'Хэш мира', 'Тик, мкс: среднее', '99 %', 'худший', 'Лет/с'],
    bySeed(runs).map((run) => [
      String(run.seed),
      run.status === 'ok' ? 'ок' : 'ОШИБКА',
      run.hash || '—',
      ...[
        run.timing.tickMeanUs,
        run.timing.tickP99Us,
        run.timing.tickMaxUs,
        run.timing.yearsPerSecond,
      ].map((value) => (run.timing.simSeconds > 0 ? formatNumber(value) : '—')),
    ]),
    ['r', 'l', 'l', 'r', 'r', 'r', 'r'],
  );
}

/** The console report: what was run, how fast, the table of metrics, failures, where the files are. */
export function formatReport(
  summary: Summary,
  runs: readonly WorldRun[],
  files: readonly string[],
): string {
  const { worlds, speed, params } = summary;
  const out: string[] = [];
  const what = params.load
    ? `мир из сохранения + ${params.years} ${plural(params.years, FORMS.year)}`
    : `${worlds.total} ${plural(worlds.total, FORMS.world)} × ` +
      `${params.years} ${plural(params.years, FORMS.year)}`;
  out.push(
    `Готово за ${formatNumber(summary.seconds)} с: ${what} · ${formatNumber(speed.ticks)} тиков · ` +
      `${formatNumber(speed.yearsPerSecond)} игровых лет/с (${formatNumber(speed.ticksPerSecond)} тиков/с, ` +
      `потоков: ${params.threads})`,
  );
  out.push(
    `Отпечаток прогона: ${summary.fingerprint} (меняется, только если изменилась история какого-то мира)`,
  );
  out.push('');
  if (runs.length <= DETAIL_LIMIT) {
    out.push(worldDetails(runs), '');
  }
  const t = summary.timing;
  out.push(
    aggregateTable([
      ...summary.metrics.map((m) => ({ name: m.name, value: m.total })),
      { name: 'Время тика, мкс: среднее', value: t.tickMeanUs },
      { name: 'Время тика, мкс: 99 % тиков не дольше', value: t.tickP99Us },
      { name: 'Время тика, мкс: худший', value: t.tickMaxUs },
      { name: 'Скорость мира, игровых лет/с', value: t.yearsPerSecond },
    ]),
  );
  out.push('');
  out.push('В скобках — зерно мира с этим значением. Показатели — за весь прогон каждого мира;');
  out.push('по годам — в years.csv и в summary.json (поле years).');
  if (summary.failures.length > 0) {
    out.push('');
    out.push(`✗ Упали миры: ${summary.failures.length} из ${worlds.total}`);
    for (const failure of summary.failures) {
      out.push(`  зерно ${failure.seed}, тик ${failure.tick}: ${failure.message}`);
      // Where it happened: the first frame in the game's code, or else the first frame at all.
      const frames = failure.stack.split('\n').filter((line) => line.trim().startsWith('at '));
      const place = frames.find((line) => line.includes('/src/')) ?? frames[0];
      if (place) out.push(`    ${place.trim()}`);
    }
  }
  out.push('');
  out.push(`Итоги: ${files.join(', ')}`);
  return out.join('\n');
}
