/**
 * Command line of `npm run sim`: options, their checks and the help text (in Russian — people
 * read it). Pure functions, tested in ./args.test.ts.
 */
import { parseArgs } from 'node:util';

export const USAGE = `Прогоны без графики: много миров подряд, итог — таблица и файлы.

  npm run sim -- --seeds 1..100 --years 10

Параметры:
  --seeds <список>   зёрна миров: 1..100, 1,2,5 или 1..10,50 (по умолчанию 1..100)
  --years <N>        сколько игровых лет прожить каждому миру (по умолчанию 10)
  --threads <N>      сколько миров считать одновременно (по умолчанию — по числу ядер)
  --out <папка>      куда записать итог (по умолчанию out/sim)
  --help             эта справка

Итог: таблица в консоли (среднее, минимум, максимум по мирам) и файлы в папке --out:
  worlds.csv   — строка на мир: зерно, хэш, показатели за весь прогон, время тика;
  years.csv    — строка на мир и год: показатели за этот год;
  summary.json — сводка: параметры, среднее/минимум/максимум, кривые по годам, ошибки.
Подробно — docs/ARCHITECTURE.md, раздел «Прогоны без графики».`;

export interface SimOptions {
  /** Seeds in ascending order, without repeats. */
  seeds: number[];
  /** The seeds as written on the command line (for the report). */
  seedsText: string;
  years: number;
  threads: number;
  out: string;
  help: boolean;
}

/** A mistake on the command line; the message is for people. */
export class ArgsError extends Error {}

const MAX_YEARS = 10_000;

function parseSeed(text: string, whole: string): number {
  if (!/^\d+$/.test(text)) {
    throw new ArgsError(
      `--seeds: «${text}» — не зерно (зёрна — целые числа от 0), список: ${whole}`,
    );
  }
  const seed = Number(text);
  if (!Number.isSafeInteger(seed)) throw new ArgsError(`--seeds: зерно ${text} слишком большое`);
  return seed;
}

/** `1..100`, `1,2,5`, `1..10,50` → sorted list of seeds. Repeats and reversed ranges are errors. */
export function parseSeeds(text: string): number[] {
  const seeds: number[] = [];
  const seen = new Set<number>();
  const add = (seed: number) => {
    if (seen.has(seed)) throw new ArgsError(`--seeds: зерно ${seed} указано дважды`);
    seen.add(seed);
    seeds.push(seed);
  };
  for (const part of text.split(',')) {
    const item = part.trim();
    if (item === '') throw new ArgsError(`--seeds: пустой элемент в списке «${text}»`);
    const range = /^(\d+)\s*\.\.\s*(\d+)$/.exec(item);
    if (range) {
      const from = parseSeed(range[1]!, text);
      const to = parseSeed(range[2]!, text);
      if (to < from)
        throw new ArgsError(`--seeds: диапазон ${item} идёт назад — нужно ${to}..${from}`);
      if (to - from >= 1_000_000)
        throw new ArgsError(`--seeds: в диапазоне ${item} больше миллиона миров`);
      for (let seed = from; seed <= to; seed++) add(seed);
    } else {
      add(parseSeed(item, text));
    }
  }
  return seeds.sort((a, b) => a - b);
}

function parseCount(name: string, text: string, max: number): number {
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ArgsError(`--${name}: нужно целое число от 1 до ${max}, получено «${text}»`);
  }
  return value;
}

/**
 * Parse the command line (without `node tools/sim.ts`). `cpus` — how many worlds the machine can
 * run at once; the default number of threads, never more than the number of worlds.
 */
export function parseSimArgs(argv: string[], cpus: number): SimOptions {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        seeds: { type: 'string', default: '1..100' },
        years: { type: 'string', default: '10' },
        threads: { type: 'string' },
        out: { type: 'string', default: 'out/sim' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (error) {
    const option = /'([^']+)'/.exec(String(error))?.[1];
    throw new ArgsError(
      option ? `неизвестный параметр или нет значения: ${option}` : `не понял параметры: ${error}`,
    );
  }
  const seedsText = String(values.seeds);
  const seeds = parseSeeds(seedsText);
  const years = parseCount('years', String(values.years), MAX_YEARS);
  const threads =
    values.threads === undefined
      ? Math.max(1, Math.min(cpus, seeds.length))
      : Math.min(parseCount('threads', String(values.threads), 256), seeds.length);
  const out = String(values.out);
  if (out.trim() === '') throw new ArgsError('--out: пустое имя папки');
  return { seeds, seedsText, years, threads, out, help: values.help === true };
}
