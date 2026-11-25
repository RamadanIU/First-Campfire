import { describe, expect, it } from 'vitest';
import { count, gauge, type Metric, mean } from '../../src/sim/stats.ts';
import { FORMS, plural } from '../../src/ui/texts.ts';
import {
  aggregate,
  dropColumns,
  fingerprint,
  formatNumber,
  formatReport,
  type RunMeta,
  summarize,
  TIMING_COLUMNS,
  worldsCsv,
  yearsCsv,
} from './report.ts';
import type { WorldRun } from './run.ts';

/** Russian numbers group thousands with a no-break space. */
const NBSP = String.fromCharCode(0xa0);

const METRICS: readonly Metric[] = [
  count('nights', 'Ночей', 'phase_started'),
  mean('swarm_mean', 'Рой: среднее', 'fireflies_rose', (e) => e.count),
  gauge('journal', 'Записей в журнале', (world) => world.events.list.length),
];

const TIMING = {
  tickMeanUs: 0.3,
  tickP99Us: 1.25,
  tickMaxUs: 812.5,
  simSeconds: 0.0144,
  runSeconds: 0.03,
  yearsPerSecond: 138.88888,
};

function world(seed: number, nights: number, swarm: number | null, hash: string): WorldRun {
  return {
    seed,
    status: 'ok',
    fromTick: 0,
    ticks: 9600,
    years: 2,
    hash,
    totals: { nights, swarm_mean: swarm, journal: 160 },
    yearRows: [1, 2].map((year) => ({
      year,
      fromTick: (year - 1) * 4800,
      toTick: year * 4800,
      values: { nights: nights / 2, swarm_mean: swarm, journal: 80 * year },
      tickMeanUs: 0.25 * year,
      tickMaxUs: 100 * year,
    })),
    timing: TIMING,
    error: null,
  };
}

const FAILED: WorldRun = {
  seed: 4,
  status: 'error',
  fromTick: 0,
  ticks: 5000,
  years: 1,
  hash: '',
  totals: {},
  yearRows: [],
  timing: { ...TIMING, tickMaxUs: 9000 },
  error: {
    message: 'житель, застрял',
    stack: 'Error\n    at walk (/repo/src/sim/move.ts:10:5)',
    tick: 5000,
  },
};

// Out of order on purpose: results come from threads in the order they finish.
const RUNS = [
  world(3, 24, 14.123456, 'cccc'),
  world(1, 24, null, 'aaaa'),
  world(2, 20, 13, 'bbbb'),
  FAILED,
];

const META: RunMeta = {
  command: 'npm run sim -- --seeds 1..4 --years 2',
  seedsText: '1..4',
  years: 2,
  load: null,
  threads: 2,
  startedAt: '2026-11-17T00:00:00.000Z',
  seconds: 0.5,
  timerCostUs: 0.05,
  environment: { node: 'v22', platform: 'linux x64', cpus: 4, cpu: 'test' },
};

describe('итоги прогона: CSV', () => {
  it('строка на мир по возрастанию зерна; время — в последних столбцах; у упавшего мира показатели пусты', () => {
    expect(worldsCsv(RUNS, METRICS)).toBe(
      [
        'seed,status,years,from_tick,ticks,hash,nights,swarm_mean,journal,tick_mean_us,tick_p99_us,tick_max_us,sim_seconds,run_seconds,years_per_second',
        '1,ok,2,0,9600,aaaa,24,,160,0.3,1.25,812.5,0.0144,0.03,138.8889',
        '2,ok,2,0,9600,bbbb,20,13,160,0.3,1.25,812.5,0.0144,0.03,138.8889',
        '3,ok,2,0,9600,cccc,24,14.1235,160,0.3,1.25,812.5,0.0144,0.03,138.8889',
        '4,error,1,0,5000,,,,,0.3,1.25,9000,0.0144,0.03,138.8889',
        '',
      ].join('\n'),
    );
  });

  it('строка на мир и год', () => {
    const lines = yearsCsv(RUNS, METRICS).split('\n');
    expect(lines[0]).toBe(
      'seed,year,from_tick,to_tick,nights,swarm_mean,journal,tick_mean_us,tick_max_us',
    );
    expect(lines.slice(1, 4)).toEqual([
      '1,1,0,4800,12,,80,0.25,100',
      '1,2,4800,9600,12,,160,0.5,200',
      '2,1,0,4800,10,13,80,0.25,100',
    ]);
    expect(lines).toHaveLength(1 + 3 * 2 + 1); // header, 3 worlds × 2 years, final newline
  });

  it('без столбцов времени CSV не зависит от машины', () => {
    const fast = worldsCsv(RUNS, METRICS);
    const slow = worldsCsv(
      RUNS.map((run) => ({ ...run, timing: { ...run.timing, tickMeanUs: 99, runSeconds: 7 } })),
      METRICS,
    );
    expect(slow).not.toBe(fast);
    expect(dropColumns(slow, TIMING_COLUMNS)).toBe(dropColumns(fast, TIMING_COLUMNS));
    expect(dropColumns(fast, TIMING_COLUMNS).split('\n')[0]).toBe(
      'seed,status,years,from_tick,ticks,hash,nights,swarm_mean,journal',
    );
  });

  it('текст с запятой или кавычкой берётся в кавычки', () => {
    const odd = { ...world(9, 1, 1, 'with,comma "q"'), years: 0, yearRows: [] };
    expect(worldsCsv([odd], METRICS).split('\n')[1]).toMatch(/^9,ok,0,0,9600,"with,comma ""q""",/);
  });
});

describe('итоги прогона: сводка', () => {
  it('среднее, минимум и максимум с зёрнами; пустые значения пропускаются', () => {
    expect(
      aggregate([
        [5, 3],
        [1, 7],
        [2, null],
        [3, 3],
        [4, 7],
      ]),
    ).toEqual({ mean: 5, min: 3, max: 7, minSeed: 3, maxSeed: 1, worlds: 4 });
    expect(aggregate([[1, null]])).toBeNull();
    expect(aggregate([])).toBeNull();
  });

  it('сводка: миры, скорость, показатели, кривые по годам, упавшие миры', () => {
    const summary = summarize(RUNS, METRICS, META);
    expect(summary.worlds).toEqual({ total: 4, ok: 3, extinct: 0, failed: 1 });
    expect(summary.speed).toEqual({
      ticks: 3 * 9600 + 5000,
      years: 7,
      ticksPerSecond: 67600,
      yearsPerSecond: 14,
    });
    expect(summary.params).toEqual({
      seeds: '1..4',
      seedCount: 4,
      years: 2,
      threads: 2,
      load: null,
    });
    expect(summary.metrics[0]).toEqual({
      id: 'nights',
      name: 'Ночей',
      kind: 'count',
      total: { mean: 68 / 3, min: 20, max: 24, minSeed: 2, maxSeed: 1, worlds: 3 },
    });
    expect(summary.metrics[1]?.total).toMatchObject({ worlds: 2, min: 13, minSeed: 2, maxSeed: 3 });
    expect(summary.years.map((y) => [y.year, y.metrics.journal?.mean])).toEqual([
      [1, 80],
      [2, 160],
    ]);
    expect(summary.timing.tickMaxUs?.max).toBe(812.5); // the failed world does not count
    expect(summary.failures).toEqual([
      { seed: 4, tick: 5000, message: 'житель, застрял', stack: FAILED.error?.stack },
    ]);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });

  it('мир из сохранения: тики — только прожитые в прогоне, годы — календарные', () => {
    // Loaded at tick 7 000 (year 2), run for one year: a partial year 2 and a partial year 3.
    const loaded: WorldRun = {
      ...world(5, 12, 14, 'eeee'),
      fromTick: 7000,
      ticks: 11_800,
      years: 1,
      yearRows: [
        {
          year: 2,
          fromTick: 7000,
          toTick: 9600,
          values: { nights: 6 },
          tickMeanUs: 1,
          tickMaxUs: 2,
        },
        {
          year: 3,
          fromTick: 9600,
          toTick: 11_800,
          values: { nights: 6 },
          tickMeanUs: 1,
          tickMaxUs: 2,
        },
      ],
    };
    const load = { file: 'мир.json', seed: 5, tick: 7000, dataChanged: false };
    const summary = summarize([loaded], METRICS, { ...META, seedsText: '5', years: 1, load });
    expect(summary.speed.ticks).toBe(4800);
    expect(summary.params.load).toEqual(load);
    expect(summary.years.map((y) => [y.year, y.metrics.nights?.mean])).toEqual([
      [2, 6],
      [3, 6],
    ]);
    expect(worldsCsv([loaded], METRICS).split('\n')[1]).toMatch(/^5,ok,1,7000,11800,eeee,/);
    const first = formatReport(summary, [loaded], []).split('\n')[0];
    expect(first).toBe(
      `Готово за 0,50 с: мир из сохранения + 1 год · 4${NBSP}800 тиков · 2 игровых лет/с (9${NBSP}600 тиков/с, потоков: 2)`,
    );
  });

  it('отпечаток прогона: не зависит от порядка результатов, меняется с историей любого мира', () => {
    const base = fingerprint(RUNS);
    expect(fingerprint([...RUNS].reverse())).toBe(base);
    expect(
      fingerprint(RUNS.map((run) => (run.seed === 2 ? { ...run, hash: 'bbbc' } : run))),
    ).not.toBe(base);
  });
});

describe('итоги прогона: консоль', () => {
  it('числа по-русски', () => {
    expect(formatNumber(1680)).toBe(`1${NBSP}680`);
    expect(formatNumber(1680.4)).toBe(`1${NBSP}680`);
    expect(formatNumber(14.083)).toBe('14,1');
    expect(formatNumber(0.2934)).toBe('0,29');
    expect(formatNumber(6)).toBe('6');
  });

  it('окончания', () => {
    expect([1, 2, 5, 11, 21, 22, 100, 112].map((n) => `${n} ${plural(n, FORMS.world)}`)).toEqual([
      '1 мир',
      '2 мира',
      '5 миров',
      '11 миров',
      '21 мир',
      '22 мира',
      '100 миров',
      '112 миров',
    ]);
  });

  it('таблица: строки показателей и времени, зерно в скобках у разных значений, упавшие миры, файлы', () => {
    const text = formatReport(summarize(RUNS, METRICS, META), RUNS, ['out/sim/worlds.csv']);
    const lines = text.split('\n');
    expect(lines[0]).toBe(
      `Готово за 0,50 с: 4 мира × 2 года · 33${NBSP}800 тиков · 14 игровых лет/с (67${NBSP}600 тиков/с, потоков: 2)`,
    );
    // Few worlds: each one is listed with its hash.
    expect(text).toMatch(/Зерно\s+Итог\s+Хэш мира/);
    expect(text).toMatch(/\n\s+4\s+ОШИБКА\s+—/);
    const nights = lines.find((line) => line.startsWith('Ночей'));
    expect(nights).toMatch(/^Ночей\s+22,7\s+20 \(2\)\s+24 \(1\)$/);
    const journal = lines.find((line) => line.startsWith('Записей в журнале'));
    expect(journal).toMatch(/^Записей в журнале\s+160\s+160\s+160\s*$/);
    expect(text).toContain('Время тика, мкс: 99 % тиков не дольше');
    expect(text).toContain('✗ Упали миры: 1 из 4');
    expect(text).toContain('  зерно 4, тик 5000: житель, застрял');
    expect(text).toContain('    at walk (/repo/src/sim/move.ts:10:5)');
    expect(lines.at(-1)).toBe('Итоги: out/sim/worlds.csv');
  });

  it('много миров — без построчного списка', () => {
    const many = Array.from({ length: 11 }, (_, i) => world(i + 1, 24, 14, `h${i}`));
    const text = formatReport(summarize(many, METRICS, META), many, []);
    expect(text).not.toContain('Хэш мира');
    expect(text).not.toContain('Упали миры');
  });
});
