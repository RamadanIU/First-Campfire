/**
 * Simulation speed benchmark: how many ticks per second the world runs without graphics.
 *
 *   npm run bench                       # 3 seeds × 1 000 000 ticks
 *   npm run bench -- --ticks 200000 --seeds 1,2,3,4
 *
 * Prints ticks per second, game years per second and the world hash (the same seed must
 * always print the same hash). Step 0.6 builds full headless runs (`npm run sim`) on top.
 */
import { parseArgs } from 'node:util';
import { TICKS_PER_YEAR } from '../src/sim/calendar.ts';
import { hashState } from '../src/sim/hash.ts';
import { createWorld, stepWorld } from '../src/sim/world.ts';

const { values } = parseArgs({
  options: {
    ticks: { type: 'string', default: '1000000' },
    seeds: { type: 'string', default: '1,2,3' },
  },
});

const ticks = Number(values.ticks);
const seeds = values.seeds.split(',').map(Number);
if (!Number.isSafeInteger(ticks) || ticks <= 0) throw new Error(`--ticks: ${values.ticks}`);
if (seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0)) {
  throw new Error(`--seeds: ${values.seeds}`);
}

const format = (value: number) => Math.round(value).toLocaleString('ru-RU');
console.log(
  `Пустой мир: ${format(ticks)} тиков (${(ticks / TICKS_PER_YEAR).toFixed(1)} игровых лет) на зерно`,
);

let total = 0;
for (const seed of seeds) {
  const world = createWorld(seed);
  // Warm-up so the JIT has compiled the hot path before we measure.
  for (let i = 0; i < 20_000; i++) stepWorld(world);
  const started = performance.now();
  for (let i = 0; i < ticks; i++) stepWorld(world);
  const seconds = (performance.now() - started) / 1000;
  const rate = ticks / seconds;
  total += rate;
  console.log(
    `  зерно ${seed}: ${format(rate)} тиков/с · ${format(rate / TICKS_PER_YEAR)} лет/с · ` +
      `${((seconds * 1e6) / ticks).toFixed(2)} мкс/тик · ` +
      `событий ${format(world.events.list.length)} · хэш ${hashState(world)}`,
  );
}
console.log(`Среднее: ${format(total / seeds.length)} тиков/с`);
