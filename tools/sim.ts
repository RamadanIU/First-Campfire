/**
 * Headless runs — the main balance tool (GDD §14.1, principle 5): many worlds play without
 * graphics, the result is a table.
 *
 *   npm run sim                                   # seeds 1..100, 10 years each
 *   npm run sim -- --seeds 1..20 --years 50 --threads 2 --out out/sim-50
 *   npm run bench                                 # speed: 3 worlds × 200 years on one thread
 *
 * Worlds run in parallel worker threads (./sim/worker.ts), one world at a time per thread;
 * progress goes to the console. At the end: the console table (mean, minimum, maximum across
 * worlds) and files in --out: worlds.csv, years.csv, summary.json (./sim/report.ts).
 * Exit code: 0 — all worlds finished, 1 — some world failed, 2 — wrong command line.
 *
 * What is counted: src/sim/metrics.ts. How to add a metric and read the results:
 * docs/ARCHITECTURE.md, «Прогоны без графики».
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { TICKS_PER_YEAR } from '../src/sim/calendar.ts';
import { METRICS } from '../src/sim/metrics.ts';
import { ArgsError, parseSimArgs, type SimOptions, USAGE } from './sim/args.ts';
import {
  formatNumber,
  formatReport,
  plural,
  summarize,
  worldsCsv,
  yearsCsv,
} from './sim/report.ts';
import type { WorldRun } from './sim/run.ts';
import type { FromWorker, ToWorker, WorkerSetup } from './sim/worker.ts';

const WORKER = new URL('./sim/worker.ts', import.meta.url);

let options: SimOptions;
try {
  options = parseSimArgs(process.argv.slice(2), availableParallelism());
} catch (error) {
  if (!(error instanceof ArgsError)) throw error;
  console.error(`✗ ${error.message}\n\n${USAGE}`);
  process.exit(2);
}
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}

const { seeds, years, threads } = options;
const totalYears = seeds.length * years;
console.log(
  `Прогон без графики: ${seeds.length} ${plural(seeds.length, 'мир', 'мира', 'миров')} ` +
    `(зёрна ${options.seedsText}) × ${years} ${plural(years, 'год', 'года', 'лет')} ` +
    `= ${formatNumber(years * TICKS_PER_YEAR)} тиков на мир · потоков: ${threads}`,
);

/** Progress line: redrawn in place in a terminal, every 10 % otherwise (logs, CI). */
function createProgress() {
  const started = performance.now();
  const tty = process.stdout.isTTY === true;
  let lastDraw = 0;
  let lastTenth = 0;
  return {
    update(doneYears: number, doneWorlds: number, force = false) {
      const now = performance.now();
      const share = totalYears > 0 ? doneYears / totalYears : 1;
      const elapsed = (now - started) / 1000;
      const left = share > 0 ? (elapsed / share) * (1 - share) : 0;
      const bar = '█'.repeat(Math.round(share * 20)).padEnd(20, '░');
      const text =
        `  ${bar} ${Math.floor(share * 100)} % · миров ${doneWorlds}/${seeds.length} · ` +
        `${formatNumber(elapsed)} с${share < 1 ? `, осталось ≈ ${formatNumber(Math.ceil(left))} с` : ''}`;
      if (tty) {
        if (force || now - lastDraw > 100) {
          process.stdout.write(`\r${text}\x1b[K`);
          lastDraw = now;
        }
      } else {
        // The 100 % line is printed once, by finish(), with the final count of worlds.
        const tenth = Math.floor(share * 10);
        if ((tenth > lastTenth && share < 1) || force) {
          console.log(text);
          lastTenth = tenth;
        }
      }
    },
    finish() {
      if (tty) process.stdout.write('\n');
    },
  };
}

interface PoolResult {
  runs: WorldRun[];
  timerCostUs: number;
}

/** Hand the seeds to `threads` workers one at a time; resolve when every world is done. */
function runPool(): Promise<PoolResult> {
  return new Promise((resolve) => {
    const queue = [...seeds];
    const runs: WorldRun[] = [];
    const timerCosts: number[] = [];
    const progress = createProgress();
    let doneYears = 0;

    const finishIfDone = () => {
      if (runs.length < seeds.length) return;
      progress.update(totalYears, runs.length, true);
      progress.finish();
      const timerCostUs = timerCosts.length
        ? timerCosts.reduce((a, b) => a + b, 0) / timerCosts.length
        : 0;
      resolve({ runs, timerCostUs });
    };

    const start = () => {
      const setup: WorkerSetup = { years };
      const worker = new Worker(WORKER, { workerData: setup });
      let current: number | undefined;
      let yearsOfCurrent = 0;
      const next = () => {
        current = queue.shift();
        yearsOfCurrent = 0;
        if (current === undefined) {
          void worker.terminate();
          return;
        }
        worker.postMessage({ type: 'run', seed: current } satisfies ToWorker);
      };
      worker.on('message', (message: FromWorker) => {
        if (message.type === 'ready') {
          timerCosts.push(message.timerCostUs);
          next();
        } else if (message.type === 'year') {
          doneYears += 1;
          yearsOfCurrent += 1;
          progress.update(doneYears, runs.length);
        } else {
          runs.push(message.run);
          progress.update(doneYears, runs.length);
          next();
          finishIfDone();
        }
      });
      // A thread that dies (out of memory, a bug in the runner) fails its world; a new thread
      // takes over the rest of the queue.
      worker.on('error', (error) => {
        if (current === undefined) {
          console.error(`\n✗ Поток прогона не запустился: ${error.stack ?? error.message}`);
          process.exit(1);
        }
        runs.push(crashed(current, error, yearsOfCurrent));
        doneYears += years - yearsOfCurrent;
        current = undefined;
        if (queue.length > 0) start();
        finishIfDone();
      });
    };

    for (let i = 0; i < threads; i++) start();
  });
}

function crashed(seed: number, error: Error, yearsDone: number): WorldRun {
  return {
    seed,
    status: 'error',
    ticks: yearsDone * TICKS_PER_YEAR,
    years: yearsDone,
    hash: '',
    totals: {},
    yearRows: [],
    timing: {
      tickMeanUs: 0,
      tickP99Us: 0,
      tickMaxUs: 0,
      simSeconds: 0,
      runSeconds: 0,
      yearsPerSecond: 0,
    },
    error: {
      message: `поток прогона упал: ${error.message}`,
      stack: error.stack ?? '',
      tick: yearsDone * TICKS_PER_YEAR,
    },
  };
}

const startedAt = new Date();
const started = performance.now();
const { runs, timerCostUs } = await runPool();
const seconds = (performance.now() - started) / 1000;

const summary = summarize(runs, METRICS, {
  command: ['npm run sim --', ...process.argv.slice(2)].join(' '),
  seedsText: options.seedsText,
  years,
  threads,
  startedAt: startedAt.toISOString(),
  seconds,
  timerCostUs,
  environment: {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpus: availableParallelism(),
    cpu: cpus()[0]?.model ?? '',
  },
});

mkdirSync(options.out, { recursive: true });
const files = {
  'worlds.csv': worldsCsv(runs, METRICS),
  'years.csv': yearsCsv(runs, METRICS),
  'summary.json': `${JSON.stringify(summary, null, 2)}\n`,
};
for (const [name, text] of Object.entries(files)) writeFileSync(join(options.out, name), text);

console.log();
console.log(
  formatReport(
    summary,
    runs,
    Object.keys(files).map((name) => {
      const path = join(options.out, name);
      const near = relative(process.cwd(), path);
      return near.startsWith('..') ? resolve(path) : near;
    }),
  ),
);
process.exitCode = summary.failures.length > 0 ? 1 : 0;
