/**
 * How fast the search of a path is (step 1.3): `npm run bench:path`.
 *
 * On the maps of seeds 1…20 (`--seeds 1..50` for others) it asks for paths between random tiles
 * where one can stand (the same pairs every time: a stream of their own), and from the camp site
 * to the farthest tile it can reach — the longest search of the map. Every search is timed;
 * the table gives, by result (found, the target out of reach, the search gave up), how many,
 * the time — average, median, 99 %, worst — and how many tiles were looked at.
 *
 * Only the search itself is timed, the same function the villagers call (src/sim/path.ts).
 */
import { parseArgs } from 'node:util';
import { findCampSite } from '../src/sim/mapgen.ts';
import { objectAt } from '../src/sim/objects.ts';
import { findPath, type PathResult, type Tile, tileSpeed } from '../src/sim/path.ts';
import { createRng, intRange } from '../src/sim/rng.ts';
import { createWorld, type World } from '../src/sim/world.ts';
import { parseSeeds } from './sim/args.ts';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '1..20' },
    pairs: { type: 'string', default: '200' },
  },
});
const seeds = parseSeeds(values.seeds);
const pairs = Number.parseInt(values.pairs, 10);

interface Sample {
  ms: number;
  explored: number;
  length: number;
}
const samples: Record<string, Sample[]> = { found: [], unreachable: [], too_far: [], longest: [] };

function standable(world: World, rng: ReturnType<typeof createRng>): Tile {
  const { map, objects } = world;
  for (;;) {
    const x = intRange(rng, 0, map.width - 1);
    const y = intRange(rng, 0, map.height - 1);
    if (tileSpeed(map, objects, x, y) > 0 && !objectAt(map, objects, x, y)) return { x, y };
  }
}

function timed(world: World, from: Tile, to: Tile): { result: PathResult; ms: number } {
  const started = performance.now();
  const result = findPath(world.map, world.objects, from, to);
  return { result, ms: performance.now() - started };
}

function record(bucket: string, { result, ms }: { result: PathResult; ms: number }): void {
  samples[bucket]!.push({
    ms,
    explored: result.explored,
    length: result.ok ? result.path.length : 0,
  });
}

// Warm the engine up: the first searches are slower while the code is being compiled.
{
  const world = createWorld(seeds[0]!);
  const rng = createRng(0, 'path-bench-warm');
  for (let i = 0; i < 300; i++) timed(world, standable(world, rng), standable(world, rng));
}

for (const seed of seeds) {
  const world = createWorld(seed);
  const rng = createRng(seed, 'path-bench');
  for (let i = 0; i < pairs; i++) {
    const run = timed(world, standable(world, rng), standable(world, rng));
    record(run.result.ok ? 'found' : run.result.reason, run);
  }
  // The longest search: from the camp to the reachable tile farthest from it by path.
  const camp = findCampSite(world.map, world.objects)!;
  let farthest: { tile: Tile; cost: number } | null = null;
  for (let i = 0; i < 400; i++) {
    const tile = standable(world, rng);
    const result = findPath(world.map, world.objects, camp, tile);
    if (result.ok && (!farthest || result.cost > farthest.cost))
      farthest = { tile, cost: result.cost };
  }
  if (farthest) record('longest', timed(world, camp, farthest.tile));
}

const NAMES: Record<string, string> = {
  found: 'путь найден',
  unreachable: 'цель недостижима',
  too_far: 'поиск сдался (предел)',
  longest: 'самый длинный путь карты',
};
const fixed = (value: number, digits = 3) => value.toFixed(digits).replace('.', ',');
console.log(
  `Поиск пути A*: зёрна ${values.seeds} (${seeds.length} карт 64×64), по ${pairs} случайных пар на карту\n`,
);
console.log(
  'Результат                  | поисков | среднее, мс | медиана | 99 %   | худший | тайлов осмотрено (сред. / макс.) | длина пути (сред. / макс.)',
);
for (const [bucket, list] of Object.entries(samples)) {
  if (list.length === 0) continue;
  const ms = list.map((s) => s.ms).sort((a, b) => a - b);
  const at = (p: number) => ms[Math.min(ms.length - 1, Math.floor(ms.length * p))]!;
  const mean = ms.reduce((sum, value) => sum + value, 0) / ms.length;
  const explored = list.map((s) => s.explored);
  const lengths = list.map((s) => s.length);
  const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  console.log(
    `${NAMES[bucket]!.padEnd(26)} | ${String(list.length).padStart(7)} | ${fixed(mean).padStart(11)} | ${fixed(at(0.5)).padStart(7)} | ${fixed(at(0.99)).padStart(6)} | ${fixed(ms.at(-1)!).padStart(6)} | ${`${Math.round(avg(explored))} / ${Math.max(...explored)}`.padStart(32)} | ${`${Math.round(avg(lengths))} / ${Math.max(...lengths)}`.padStart(26)}`,
  );
}
