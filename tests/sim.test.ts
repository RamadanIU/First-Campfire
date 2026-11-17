/**
 * Headless runs end to end: the real `npm run sim` command (worker threads included) is run
 * several times and its files are compared. Same parameters — the same bytes, except the
 * columns with time measurements; the number of threads changes nothing either.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TICKS_PER_YEAR } from '../src/sim/calendar.ts';
import { METRICS } from '../src/sim/metrics.ts';
import { saveWorld } from '../src/sim/save.ts';
import { createWorld, runTicks } from '../src/sim/world.ts';
import { dropColumns, type Summary, TIMING_COLUMNS } from '../tools/sim/report.ts';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const TEMP = mkdtempSync(join(tmpdir(), 'fc-sim-'));
afterAll(() => rmSync(TEMP, { recursive: true, force: true }));

interface Output {
  console: string;
  worlds: string;
  years: string;
  summary: Summary;
}

function sim(name: string, ...args: string[]): Output {
  const out = join(TEMP, name);
  const console = execFileSync(process.execPath, ['tools/sim.ts', ...args, '--out', out], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const read = (file: string) => readFileSync(join(out, file), 'utf8');
  return {
    console,
    worlds: read('worlds.csv'),
    years: read('years.csv'),
    summary: JSON.parse(read('summary.json')),
  };
}

const PARAMS = ['--seeds', '1..6', '--years', '3'];

describe('npm run sim', () => {
  let first: Output;
  let again: Output;
  let oneThread: Output;
  beforeAll(() => {
    first = sim('first', ...PARAMS, '--threads', '3');
    again = sim('again', ...PARAMS, '--threads', '3');
    oneThread = sim('one-thread', ...PARAMS, '--threads', '1');
  }, 60_000);

  it('повторный запуск с теми же параметрами даёт побайтно тот же CSV (кроме столбцов времени)', () => {
    expect(dropColumns(again.worlds, TIMING_COLUMNS)).toBe(
      dropColumns(first.worlds, TIMING_COLUMNS),
    );
    expect(dropColumns(again.years, TIMING_COLUMNS)).toBe(dropColumns(first.years, TIMING_COLUMNS));
    expect(again.summary.fingerprint).toBe(first.summary.fingerprint);
    // The time columns really are there — and only they are dropped.
    expect(first.worlds.split('\n')[0]).toContain('tick_mean_us');
    expect(dropColumns(first.worlds, TIMING_COLUMNS).split('\n')[0]).toBe(
      ['seed,status,years,from_tick,ticks,hash', ...METRICS.map((m) => m.id)].join(','),
    );
  });

  it('число потоков не меняет итог', () => {
    expect(dropColumns(oneThread.worlds, TIMING_COLUMNS)).toBe(
      dropColumns(first.worlds, TIMING_COLUMNS),
    );
    expect(dropColumns(oneThread.years, TIMING_COLUMNS)).toBe(
      dropColumns(first.years, TIMING_COLUMNS),
    );
    expect(oneThread.summary.metrics).toEqual(first.summary.metrics);
    expect(oneThread.summary.years).toEqual(first.summary.years);
  });

  it('строка на мир, строка на мир и год; сводка сходится с CSV', () => {
    const rows = first.worlds.trim().split('\n').slice(1);
    expect(rows.map((row) => row.split(',').slice(0, 5).join(','))).toEqual(
      [1, 2, 3, 4, 5, 6].map((seed) => `${seed},ok,3,0,14400`),
    );
    expect(first.years.trim().split('\n')).toHaveLength(1 + 6 * 3);
    expect(first.summary).toMatchObject({
      params: { seeds: '1..6', seedCount: 6, years: 3, threads: 3, load: null },
      worlds: { total: 6, ok: 6, failed: 0 },
      speed: { ticks: 6 * 14400, years: 18 },
      failures: [],
    });
    expect(first.summary.years).toHaveLength(3);
    const nights = first.summary.metrics.find((m) => m.id === 'nights');
    expect(nights?.total).toMatchObject({ mean: 36, min: 36, max: 36, worlds: 6 });
    expect(first.summary.timing.tickMeanUs?.mean).toBeGreaterThan(0);
  });

  it('в консоли — прогресс, список миров и таблица итогов', () => {
    expect(first.console).toContain('Прогон без графики: 6 миров (зёрна 1..6) × 3 года');
    expect(first.console).toContain('100 % · миров 6/6');
    expect(first.console).toMatch(/Зерно\s+Итог\s+Хэш мира/);
    expect(first.console).toMatch(/Показатель\s+Среднее\s+Мин\s+Макс/);
    for (const metric of METRICS) expect(first.console).toContain(metric.name);
    expect(first.console).toContain('Время тика, мкс: худший');
    expect(first.console).toContain(`Отпечаток прогона: ${first.summary.fingerprint}`);
  });

  it('неверные параметры: понятное сообщение, справка и код 2, файлы не пишутся', () => {
    const result = spawnSync(process.execPath, ['tools/sim.ts', '--seeds', '5..1'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('✗ --seeds: диапазон 5..1 идёт назад — нужно 1..5');
    expect(result.stderr).toContain('npm run sim -- --seeds 1..100 --years 10');
  });
});

describe('npm run sim -- --load', () => {
  /** Save of world `seed` after `ticks` ticks, written to a file in TEMP. */
  function saveFile(name: string, seed: number, ticks: number): string {
    const world = createWorld(seed);
    runTicks(world, ticks);
    const file = join(TEMP, name);
    writeFileSync(file, saveWorld(world));
    return file;
  }

  const csvRows = (text: string) => dropColumns(text, TIMING_COLUMNS).trim().split('\n').slice(1);

  it('мир из сохранения продолжается так же, как непрерывный, и годы те же', () => {
    const file = saveFile('year-1.json', 3, TICKS_PER_YEAR);
    const resumed = sim('resumed', '--load', file, '--years', '2');
    const whole = sim('whole', '--seeds', '3', '--years', '3', '--threads', '1');
    const [resumedRow] = csvRows(resumed.worlds);
    const [wholeRow] = csvRows(whole.worlds);
    // seed, status, years, from_tick, ticks, hash: the same final world.
    expect(resumedRow?.split(',').slice(0, 6)).toEqual([
      '3',
      'ok',
      '2',
      '4800',
      '14400',
      wholeRow?.split(',')[5],
    ]);
    // The years after the save are exactly the years 2 and 3 of the uninterrupted run.
    expect(csvRows(resumed.years)).toEqual(csvRows(whole.years).slice(1));
    expect(resumed.summary.params.load).toEqual({ file, seed: 3, tick: 4800, dataChanged: false });
    expect(resumed.summary.years.map((y) => y.year)).toEqual([2, 3]);
    expect(resumed.summary.speed.ticks).toBe(2 * TICKS_PER_YEAR);
    expect(resumed.console).toContain(
      `мир из сохранения ${file} (зерно 3, тик 4 800 — год 2, день года 1) + 2 года`.replaceAll(
        ' 800',
        ' 800',
      ),
    );
    expect(resumed.console).toContain('Готово за');
  }, 30_000);

  it('сохранение посреди года: первый и последний срезы неполные', () => {
    const file = saveFile('mid-year.json', 8, 7_000);
    const run = sim('mid-year', '--load', file, '--years', '1');
    expect(csvRows(run.years).map((row) => row.split(',').slice(0, 4).join(','))).toEqual([
      '8,2,7000,9600',
      '8,3,9600,11800',
    ]);
  }, 30_000);

  it('плохой файл или --load вместе с --seeds: понятное сообщение и код 2', () => {
    const broken = join(TEMP, 'broken.json');
    writeFileSync(broken, readFileSync(saveFile('good.json', 1, 100), 'utf8').slice(0, 300));
    const alien = join(TEMP, 'alien.json');
    writeFileSync(alien, '{"name": "другая игра"}');
    const cases: [string[], string][] = [
      [['--load', join(TEMP, 'нет-такого.json')], 'нет такого файла'],
      [['--load', broken], 'Сохранение повреждено: файл обрезан или испорчен.'],
      [['--load', alien], 'Это не сохранение «Первого костра».'],
      [['--load', broken, '--seeds', '1..3'], '--load и --seeds вместе нельзя'],
    ];
    for (const [args, message] of cases) {
      const result = spawnSync(
        process.execPath,
        ['tools/sim.ts', ...args, '--out', join(TEMP, 'bad')],
        {
          cwd: ROOT,
          encoding: 'utf8',
        },
      );
      expect(result.status, args.join(' ')).toBe(2);
      expect(result.stderr, args.join(' ')).toContain(message);
    }
  }, 30_000);
});
