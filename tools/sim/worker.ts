/**
 * Worker thread of `npm run sim`: runs the worlds the main thread hands it, one at a time.
 *
 * On start it warms the engine up and measures the cost of a timer reading (./timing.ts), then
 * answers every `{ type: 'run', seed }` with `year` messages (progress) and one `done` message
 * carrying the whole result. Each thread loads the game data itself (≈ 50 µs).
 */
import { parentPort, workerData } from 'node:worker_threads';
import { runWorld, type WorldRun, warmUp } from './run.ts';
import { measureTimerCost } from './timing.ts';

export interface WorkerSetup {
  years: number;
}

export type ToWorker = { type: 'run'; seed: number };

export type FromWorker =
  | { type: 'ready'; timerCostUs: number }
  | { type: 'year'; seed: number; year: number }
  | { type: 'done'; run: WorldRun };

const port = parentPort;
if (port === null) {
  throw new Error('tools/sim/worker.ts запускается только как поток из tools/sim.ts');
}

const { years } = workerData as WorkerSetup;
const send = (message: FromWorker) => port.postMessage(message);

warmUp();
const timerCostUs = measureTimerCost();
send({ type: 'ready', timerCostUs });

port.on('message', (message: ToWorker) => {
  const { seed } = message;
  const run = runWorld({
    seed,
    years,
    timerCostUs,
    onYear: (year) => send({ type: 'year', seed, year }),
  });
  send({ type: 'done', run });
});
