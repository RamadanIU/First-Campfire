/**
 * The map generator of stage 1 (step 1.1): a small piece of deciduous forest (GDD §3.3) made from
 * the seed — glades and forest masses, a river across the map or a lake with a stream, sandy
 * banks, berry bushes at the edges of the forest, boulders, flowers on the meadows. The real world
 * generation (heights, climate, biomes — GDD §3.1) is stage 5; this one only has to be pretty,
 * fast (every test and headless run makes a world) and keep its promises:
 *
 *   - there is water, and it is connected by the sides of tiles (never only by a corner: the
 *     shallows would cut such a neck visually — docs/ART.md, «Земля»); deep water never touches
 *     land, a strip of shallows always lies between;
 *   - there is forest — `forestPercent` of the land;
 *   - there are at least `bushes.min` berry bushes;
 *   - there is a dry place for a camp: a square of land without obstacles near water and forest
 *     (`findCampSite`).
 *
 * Randomness comes from one stream (`world.rng.map`). Only exact arithmetic (ADR-009): value noise
 * with a smoothstep, distances with Math.sqrt.
 *
 * The algorithm, in order: water (river or lake) → its banks → the forest field (noise, thinner
 * near water) → a reserved glade for the camp → trees (and a few lone ones on the meadows) →
 * berry bushes in clusters at the forest edge → boulders → flowers and tall grass. Numbers that shape the world
 * live in data/balance.json (`map`), kinds of objects — in data/objects.json (`place`, `weight`).
 */
import { DATA } from '../data/index.ts';
import type { MapObjectDef, ObjectPlace } from '../data/tables.ts';
import { createMap, groundCode, tileIndex, type WorldMap } from './map.ts';
import { clamp } from './math.ts';
import { createObjects, defOf, findObject, type MapObjects, placeObject } from './objects.ts';
import { chance, floatRange, intRange, nextFloat, type Rng, weightedIndex } from './rng.ts';

export type MapParams = typeof DATA.balance.map;

export interface GeneratedMap {
  map: WorldMap;
  objects: MapObjects;
}

// Working layers of the generator: the same order as the layers of the ground's looks
// (src/art/terrain.ts) — the lower one is wetter.
const DEEP = 0;
const SHALLOW = 1;
const SAND = 2;
const DIRT = 3;
const GRASS = 4;
const GROUND_IDS = ['deep_water', 'shallow_water', 'sand', 'dirt', 'grass'] as const;

/** Shallows between deep water and the shore, tiles. */
const RIVER_RIM = 1.05;
const LAKE_RIM = 1.9;
/** How far outside the map a river starts and ends, tiles: its mouth is never visible. */
const OUTSIDE = 4;
/** Chance of a lone tree on a meadow tile: the open land is not a lawn. */
const LONE_TREES = 0.012;

// --- Value noise ------------------------------------------------------------------------------

/** A lattice of random values; sampled with smooth interpolation. Generator-local, not saved. */
interface Noise {
  cell: number;
  cols: number;
  rows: number;
  values: Float64Array;
}

function makeNoise(rng: Rng, width: number, height: number, cell: number): Noise {
  const cols = Math.ceil(width / cell) + 3;
  const rows = Math.ceil(height / cell) + 3;
  const values = new Float64Array(cols * rows);
  for (let i = 0; i < values.length; i++) values[i] = nextFloat(rng);
  return { cell, cols, rows, values };
}

/** Smooth noise in [0, 1) at a point (tile units); one lattice cell is outside on each side. */
function noiseAt(noise: Noise, x: number, y: number): number {
  const gx = clamp(x / noise.cell + 1, 0, noise.cols - 1.000001);
  const gy = clamp(y / noise.cell + 1, 0, noise.rows - 1.000001);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v = noise.values;
  const at = y0 * noise.cols + x0;
  const top = v[at]! * (1 - sx) + v[at + 1]! * sx;
  const bottom = v[at + noise.cols]! * (1 - sx) + v[at + noise.cols + 1]! * sx;
  return top * (1 - sy) + bottom * sy;
}

// --- Water ------------------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

/** A stretch of water along a line: its half-width changes along the way. */
interface Channel {
  points: Point[];
  halfWidths: number[];
  /** Deep water in the middle where the channel is wider than the rim on both sides. */
  rim: number | null;
}

interface Water {
  layer: Uint8Array;
  width: number;
  height: number;
  /** Width of the sandy bank (tiles) along the shore; ≤ 0 — the grass reaches the water. */
  sandNoise: Noise;
}

function sandWidth(water: Water, x: number, y: number): number {
  return Math.min(1.7, noiseAt(water.sandNoise, x, y) * 2.4 - 0.4);
}

/** Lower the layer of a tile (water wins over sand, sand over grass). */
function lower(water: Water, x: number, y: number, value: number): void {
  const at = y * water.width + x;
  if (value < water.layer[at]!) water.layer[at] = value;
}

/** Ground layer at `excess` tiles from the edge of water (negative — inside). */
function classify(water: Water, x: number, y: number, excess: number, rim: number | null): number {
  if (rim !== null && excess < -rim) return DEEP;
  if (excess < 0) return SHALLOW;
  if (excess < sandWidth(water, x, y)) return SAND;
  return GRASS;
}

/** Catmull-Rom interpolation between b and c (a and d — their neighbours), t in [0, 1]. */
function spline(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  return (
    0.5 *
    (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t2 * t)
  );
}

/**
 * A meandering line from `from` to `to`: the straight line bent to alternate sides every half
 * `wavelength` by up to `amplitude` tiles, smoothly (a spline through the bends). `taper` keeps
 * the start straight (a stream leaving a lake).
 */
function meander(
  rng: Rng,
  from: Point,
  to: Point,
  amplitude: number,
  wavelength: number,
  taper: boolean,
): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const bends = Math.max(2, Math.round((2 * length) / wavelength));
  const side = chance(rng, 0.5) ? 1 : -1;
  const offsets = [0];
  for (let k = 1; k < bends; k++) {
    offsets.push((k % 2 === 0 ? side : -side) * amplitude * floatRange(rng, 0.35, 1));
  }
  offsets.push(floatRange(rng, -0.3, 0.3) * amplitude);
  const steps = Math.ceil(length / 0.5);
  const nx = -dy / length;
  const ny = dx / length;
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const at = t * bends;
    const k = Math.min(bends - 1, Math.floor(at));
    const offset = spline(
      offsets[Math.max(0, k - 1)]!,
      offsets[k]!,
      offsets[k + 1]!,
      offsets[Math.min(bends, k + 2)]!,
      at - k,
    );
    const ease = taper ? clamp(t / 0.2, 0, 1) : 1;
    points.push({
      x: from.x + dx * t + nx * offset * ease,
      y: from.y + dy * t + ny * offset * ease,
    });
  }
  return points;
}

function halfWidthsAlong(rng: Rng, count: number, base: number, spread: number): number[] {
  const noise = makeNoise(rng, count, 1, 24);
  return Array.from({ length: count }, (_, i) => base + (noiseAt(noise, i, 0) - 0.5) * 2 * spread);
}

/** Paint a channel: every tile near a segment gets the layer for its distance to the line. */
function paintChannel(water: Water, channel: Channel): void {
  const { points, halfWidths, rim } = channel;
  const reach = Math.max(...halfWidths) + 2.5;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const halfWidth = (halfWidths[i]! + halfWidths[i + 1]!) / 2;
    const left = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach));
    const right = Math.min(water.width - 1, Math.ceil(Math.max(a.x, b.x) + reach));
    const top = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach));
    const bottom = Math.min(water.height - 1, Math.ceil(Math.max(a.y, b.y) + reach));
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const lengthSquared = sx * sx + sy * sy;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const px = x + 0.5 - a.x;
        const py = y + 0.5 - a.y;
        const t = lengthSquared === 0 ? 0 : clamp((px * sx + py * sy) / lengthSquared, 0, 1);
        const ex = px - sx * t;
        const ey = py - sy * t;
        const distance = Math.sqrt(ex * ex + ey * ey);
        lower(water, x, y, classify(water, x, y, distance - halfWidth, rim));
      }
    }
  }
}

/** A point just outside one side of the map, somewhere along its middle part. */
function edgePoint(rng: Rng, side: number, width: number, height: number): Point {
  const along = (size: number) => floatRange(rng, size * 0.3, size * 0.7);
  if (side === 0) return { x: along(width), y: -OUTSIDE };
  if (side === 1) return { x: width + OUTSIDE, y: along(height) };
  if (side === 2) return { x: along(width), y: height + OUTSIDE };
  return { x: -OUTSIDE, y: along(height) };
}

/** A river from one side of the map to the opposite one. */
function paintRiver(rng: Rng, water: Water): void {
  const side = intRange(rng, 0, 1); // 0 — from the north to the south, 1 — from the east to the west
  const from = edgePoint(rng, side, water.width, water.height);
  const to = edgePoint(rng, side + 2, water.width, water.height);
  const points = meander(rng, from, to, floatRange(rng, 3.5, 7), floatRange(rng, 22, 34), false);
  const halfWidths = halfWidthsAlong(rng, points.length, floatRange(rng, 2.1, 2.7), 0.4);
  paintChannel(water, { points, halfWidths, rim: RIVER_RIM });
}

/** A lake with a ragged shore; often a stream runs from it off the map. */
function paintLake(rng: Rng, water: Water): void {
  const { width, height } = water;
  const centre = {
    x: floatRange(rng, width * 0.34, width * 0.66),
    y: floatRange(rng, height * 0.34, height * 0.66),
  };
  // The lake is a few overlapping round lobes with a noisy shore: never a plain disc.
  const radius = floatRange(rng, 5.5, 8);
  const lobes = [{ x: centre.x, y: centre.y, r: radius }];
  for (let k = intRange(rng, 2, 3); k > 0; ) {
    const ux = floatRange(rng, -1, 1);
    const uy = floatRange(rng, -1, 1);
    const length = Math.sqrt(ux * ux + uy * uy);
    if (length < 0.3 || length > 1) continue;
    const away = floatRange(rng, 0.5, 0.95) * radius;
    lobes.push({
      x: centre.x + (ux / length) * away,
      y: centre.y + (uy / length) * away,
      r: floatRange(rng, 0.45, 0.8) * radius,
    });
    k--;
  }
  const shape = makeNoise(rng, width, height, 6);
  const reach = Math.ceil(radius * 2 + 3);
  const top = Math.max(0, Math.floor(centre.y) - reach);
  const bottom = Math.min(height - 1, Math.floor(centre.y) + reach);
  const left = Math.max(0, Math.floor(centre.x) - reach);
  const right = Math.min(width - 1, Math.floor(centre.x) + reach);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const wobble = 0.85 + 0.3 * noiseAt(shape, x, y);
      let excess = Number.POSITIVE_INFINITY;
      for (const lobe of lobes) {
        const dx = x + 0.5 - lobe.x;
        const dy = y + 0.5 - lobe.y;
        excess = Math.min(excess, Math.sqrt(dx * dx + dy * dy) - lobe.r * wobble);
      }
      lower(water, x, y, classify(water, x, y, excess, LAKE_RIM));
    }
  }
  if (chance(rng, 0.65)) {
    const to = edgePoint(rng, intRange(rng, 0, 3), width, height);
    const points = meander(rng, centre, to, floatRange(rng, 2, 3.5), floatRange(rng, 18, 26), true);
    const halfWidths = halfWidthsAlong(rng, points.length, floatRange(rng, 1.25, 1.55), 0.15);
    paintChannel(water, { points, halfWidths, rim: null });
  }
}

const isWet = (value: number) => value <= SHALLOW;

/**
 * Smooth the shore outline: no one-tile teeth of water, sand or deep water sticking out, no
 * one-tile notches. A tile's four side neighbours vote; outside the map counts as more of the same.
 */
function smoothShore(water: Water): void {
  const { width, height } = water;
  for (let pass = 0; pass < 2; pass++) {
    const before = water.layer.slice();
    const at = (x: number, y: number, own: number) =>
      x < 0 || y < 0 || x >= width || y >= height ? own : before[y * width + x]!;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const own = before[y * width + x]!;
        const around = [at(x - 1, y, own), at(x + 1, y, own), at(x, y - 1, own), at(x, y + 1, own)];
        const count = (test: (value: number) => boolean) => around.filter(test).length;
        let next = own;
        if (own === DEEP && count((v) => v === DEEP) <= 1) next = SHALLOW;
        else if (own === SHALLOW && count(isWet) <= 1) next = SAND;
        else if (own === SAND && count((v) => v <= SAND) <= 1) next = GRASS;
        else if (own === GRASS && count((v) => v <= SAND) >= 3) next = SAND;
        water.layer[y * width + x] = next;
      }
    }
  }
}

/**
 * Tidy the water: water is connected by the sides of tiles — where two water tiles meet only by a
 * corner, one of the other two corners of the square becomes shallow water; deep water never
 * touches land (a rim of shallows) and lies in pools at least two tiles wide.
 */
function tidyWater(water: Water): void {
  const { layer, width, height } = water;
  const at = (x: number, y: number) => layer[y * width + x]!;
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y + 1 < height; y++) {
      for (let x = 0; x + 1 < width; x++) {
        const a = isWet(at(x, y));
        const b = isWet(at(x + 1, y));
        const c = isWet(at(x, y + 1));
        const d = isWet(at(x + 1, y + 1));
        if (a && d && !b && !c) {
          layer[y * width + x + 1] = SHALLOW;
          changed = true;
        } else if (b && c && !a && !d) {
          layer[y * width + x] = SHALLOW;
          changed = true;
        }
      }
    }
  }
  const shallows: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (at(x, y) !== DEEP) continue;
      let shore = false;
      for (let dy = -1; dy <= 1 && !shore; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = clamp(x + dx, 0, width - 1);
          const ny = clamp(y + dy, 0, height - 1);
          if (!isWet(at(nx, ny))) {
            shore = true;
            break;
          }
        }
      }
      if (shore) shallows.push(y * width + x);
    }
  }
  for (const index of shallows) layer[index] = SHALLOW;

  // Deep water only in pools at least two tiles wide: a thin line or a dot of it on a diagonal
  // stretch looks like a mistake. Every deep tile must be part of a 2×2 square of deep water.
  const deep = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && at(x, y) === DEEP;
  changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!deep(x, y)) continue;
        let pooled = false;
        for (const [dx, dy] of [
          [0, 0],
          [-1, 0],
          [0, -1],
          [-1, -1],
        ] as const) {
          if (
            deep(x + dx, y + dy) &&
            deep(x + dx + 1, y + dy) &&
            deep(x + dx, y + dy + 1) &&
            deep(x + dx + 1, y + dy + 1)
          ) {
            pooled = true;
            break;
          }
        }
        if (!pooled) {
          layer[y * width + x] = SHALLOW;
          changed = true;
        }
      }
    }
  }
}

// --- Distances --------------------------------------------------------------------------------

/**
 * Distance in tiles (king moves: diagonal steps count as one) from every tile to the nearest
 * tile where `source` is true; tiles farther than `limit` get `limit`.
 */
export function distanceField(
  width: number,
  height: number,
  source: (index: number) => boolean,
  limit = 255,
): Uint8Array {
  const distance = new Uint8Array(width * height).fill(limit);
  let frontier: number[] = [];
  for (let i = 0; i < width * height; i++) {
    if (source(i)) {
      distance[i] = 0;
      frontier.push(i);
    }
  }
  for (let step = 1; step < limit && frontier.length > 0; step++) {
    const next: number[] = [];
    for (const index of frontier) {
      const x = index % width;
      const y = (index - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbour = ny * width + nx;
          if (distance[neighbour]! > step) {
            distance[neighbour] = step;
            next.push(neighbour);
          }
        }
      }
    }
    frontier = next;
  }
  return distance;
}

// --- The camp ---------------------------------------------------------------------------------

export interface CampSite {
  /** Centre tile of the square. */
  x: number;
  y: number;
  /** Tiles to the nearest water and the nearest tree, from the centre. */
  waterDistance: number;
  forestDistance: number;
}

/** How good a camp at these distances is: near water but not on the shore, at the forest edge. */
function campScore(waterDistance: number, forestDistance: number, fromCentre: number): number {
  return Math.abs(waterDistance - 5) + Math.abs(forestDistance - 4) * 0.8 + fromCentre * 0.15;
}

/**
 * The best dry place for a camp (GDD §3.1, item 9): a `camp.size` square of walkable ground
 * without objects that block the way, its centre no farther than `camp.waterDistance` tiles from
 * water and `camp.forestDistance` from a tree. Null — the map has none (the generator promises
 * one). Step 1.3 may start its people here.
 */
export function findCampSite(
  map: WorldMap,
  objects: MapObjects,
  camp = DATA.balance.map.camp,
): CampSite | null {
  const { width, height } = map;
  const walkable = map.groundTypes.map((id) => DATA.terrain.get(id).walkable);
  const blocked = new Uint8Array(width * height);
  const forest = new Uint8Array(width * height);
  for (const object of objects.list) {
    const def = defOf(object);
    const at = tileIndex(map, object.x, object.y);
    if (!def.walkable) blocked[at] = 1;
    if (def.place === 'forest') forest[at] = 1;
  }
  const water = distanceField(width, height, (i) => !walkable[map.ground[i]!]);
  const trees = distanceField(width, height, (i) => forest[i] === 1);
  // A tile is good for the camp if it is dry and free; then squares of good tiles are counted
  // with a summed-area table.
  const sums = new Int32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const good = walkable[map.ground[i]!] && blocked[i] === 0 ? 1 : 0;
      sums[(y + 1) * (width + 1) + x + 1] =
        good +
        sums[y * (width + 1) + x + 1]! +
        sums[(y + 1) * (width + 1) + x]! -
        sums[y * (width + 1) + x]!;
    }
  }
  const half = Math.floor(camp.size / 2);
  const area = camp.size * camp.size;
  let best: CampSite | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let y = half; y + camp.size - half <= height; y++) {
    for (let x = half; x + camp.size - half <= width; x++) {
      const i = y * width + x;
      const toWater = water[i]!;
      const toForest = trees[i]!;
      if (toWater > camp.waterDistance || toForest > camp.forestDistance) continue;
      const x0 = x - half;
      const y0 = y - half;
      const x1 = x0 + camp.size;
      const y1 = y0 + camp.size;
      const W = width + 1;
      const good =
        sums[y1 * W + x1]! - sums[y0 * W + x1]! - sums[y1 * W + x0]! + sums[y0 * W + x0]!;
      if (good !== area) continue;
      const cx = x + 0.5 - width / 2;
      const cy = y + 0.5 - height / 2;
      const score = campScore(toWater, toForest, Math.sqrt(cx * cx + cy * cy));
      if (score < bestScore) {
        bestScore = score;
        best = { x, y, waterDistance: toWater, forestDistance: toForest };
      }
    }
  }
  return best;
}

// --- Objects ----------------------------------------------------------------------------------

/** Kinds of objects for a place of the generator, with their weights. */
function kindsFor(place: ObjectPlace): { defs: MapObjectDef[]; weights: number[] } {
  const defs = DATA.objects.records.filter((def) => def.place === place);
  return { defs, weights: defs.map((def) => def.weight) };
}

function pickKind(rng: Rng, kinds: { defs: MapObjectDef[]; weights: number[] }): string {
  return kinds.defs[weightedIndex(rng, kinds.weights)]!.id;
}

// --- The generator ----------------------------------------------------------------------------

/** Make the map of a new world from its random stream. */
export function generateMap(rng: Rng, params: MapParams = DATA.balance.map): GeneratedMap {
  const { width, height } = params;
  const size = width * height;
  const map = createMap(width, height, params.chunkSize);
  const objects = createObjects();

  // 1. Water and its banks.
  const water: Water = {
    layer: new Uint8Array(size).fill(GRASS),
    width,
    height,
    sandNoise: makeNoise(rng, width, height, 9),
  };
  if (chance(rng, params.lakePercent / 100)) paintLake(rng, water);
  else paintRiver(rng, water);
  smoothShore(water);
  tidyWater(water);
  const layer = water.layer;
  const toWater = distanceField(width, height, (i) => isWet(layer[i]!));

  // 2. The forest field: big masses, smaller groves, ragged edges; thinner near the water —
  // the banks are meadows. The threshold makes exactly `forestPercent` of the grass a forest.
  const masses = makeNoise(rng, width, height, 14);
  const groves = makeNoise(rng, width, height, 7);
  const edges = makeNoise(rng, width, height, 3.5);
  const field = new Float64Array(size);
  const grassValues: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const value =
        0.55 * noiseAt(masses, x, y) +
        0.3 * noiseAt(groves, x, y) +
        0.15 * noiseAt(edges, x, y) -
        Math.max(0, 4 - toWater[i]!) * 0.07;
      field[i] = value;
      if (layer[i] === GRASS) grassValues.push(value);
    }
  }
  grassValues.sort((a, b) => a - b);
  const threshold =
    grassValues[Math.floor(grassValues.length * (1 - params.forestPercent / 100))] ?? 1;
  const inForest = (i: number) => layer[i] === GRASS && field[i]! >= threshold;
  const toForest = distanceField(width, height, inForest);

  // 3. A glade for the camp: dry ground near the water, at the forest edge, near the middle.
  const reserved = new Uint8Array(size);
  const camp = params.camp;
  const half = Math.floor(camp.size / 2);
  let glade: Point | null = null;
  let gladeScore = Number.POSITIVE_INFINITY;
  for (let y = half + 1; y + half + 1 < height; y++) {
    for (let x = half + 1; x + half + 1 < width; x++) {
      const i = y * width + x;
      if (toWater[i]! < half + 2 || toWater[i]! > camp.waterDistance - 2) continue;
      if (toForest[i]! < half + 1 || toForest[i]! > camp.forestDistance - 3) continue;
      let dry = true;
      for (let dy = -half; dy <= half && dry; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          if (layer[(y + dy) * width + x + dx]! < DIRT) {
            dry = false;
            break;
          }
        }
      }
      if (!dry) continue;
      const cx = x + 0.5 - width / 2;
      const cy = y + 0.5 - height / 2;
      const score = campScore(toWater[i]!, toForest[i]!, Math.sqrt(cx * cx + cy * cy));
      if (score < gladeScore) {
        gladeScore = score;
        glade = { x, y };
      }
    }
  }
  if (glade) {
    for (let dy = -half - 1; dy <= half + 1; dy++) {
      for (let dx = -half - 1; dx <= half + 1; dx++) {
        reserved[(glade.y + dy) * width + glade.x + dx] = 1;
      }
    }
  }

  // The ground is final: write it into the map.
  const codes = GROUND_IDS.map((id) => groundCode(map, id));
  for (let i = 0; i < size; i++) map.ground[i] = codes[layer[i]!]!;

  const free = (i: number) => map.object[i] === 0 && reserved[i] === 0;
  const place = (def: string, i: number) => {
    const x = i % width;
    placeObject(map, objects, def, x, (i - x) / width);
  };

  // 4. Trees: denser deep in the forest, sparse at its edge; now and then a lone tree on a meadow.
  const forestKinds = kindsFor('forest');
  for (let i = 0; i < size; i++) {
    if (!inForest(i) || !free(i)) continue;
    const depth = clamp((field[i]! - threshold) / 0.1, 0, 1);
    if (chance(rng, 0.3 + 0.27 * depth)) place(pickKind(rng, forestKinds), i);
  }
  for (let i = 0; i < size; i++) {
    if (layer[i] !== GRASS || inForest(i) || !free(i) || toWater[i]! < 2) continue;
    if (chance(rng, LONE_TREES)) place(pickKind(rng, forestKinds), i);
  }
  // The camp must see the forest: if no tree grew close enough, plant one.
  if (glade) plantNear(rng, map, objects, glade, half + 2, camp.forestDistance, forestKinds, free);

  // 5. Berry bushes in clusters on the forest edge (not in the forest, close to it).
  const edgeKinds = kindsFor('edge');
  const meadow = (i: number) => (layer[i] === GRASS || layer[i] === DIRT) && !inForest(i);
  const edgeTiles: number[] = [];
  for (let i = 0; i < size; i++) {
    if (meadow(i) && free(i) && toForest[i]! <= 2 && toWater[i]! >= 2) edgeTiles.push(i);
  }
  const bushes = intRange(rng, params.bushes.min, params.bushes.max);
  let planted = 0;
  for (let tries = 0; planted < bushes && edgeTiles.length > 0 && tries < 400; tries++) {
    const centre = edgeTiles[intRange(rng, 0, edgeTiles.length - 1)]!;
    const cluster = intRange(rng, 2, 4);
    for (let k = 0, attempts = 0; k < cluster && planted < bushes && attempts < 12; attempts++) {
      const x = (centre % width) + intRange(rng, -2, 2);
      const y = Math.floor(centre / width) + intRange(rng, -2, 2);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = y * width + x;
      if (!meadow(i) || !free(i) || toWater[i]! < 1) continue;
      place(pickKind(rng, edgeKinds), i);
      planted++;
      k++;
    }
  }
  // Not enough edge? Anywhere on the land, so the promise of `bushes.min` holds.
  for (let i = intRange(rng, 0, size - 1), n = 0; planted < params.bushes.min && n < size; n++) {
    const j = (i + n * 7919) % size;
    if ((layer[j] === GRASS || layer[j] === DIRT) && free(j)) {
      place(pickKind(rng, edgeKinds), j);
      planted++;
    }
  }

  // 6. Boulders: half on the banks, half anywhere on the land.
  const stoneKinds = kindsFor('scatter');
  const boulders = intRange(rng, params.boulders.min, params.boulders.max);
  for (let b = 0, tries = 0; b < boulders && tries < 500; tries++) {
    const i = intRange(rng, 0, size - 1);
    const bank = b % 2 === 0;
    if (layer[i]! < SAND || !free(i) || (bank ? toWater[i]! > 2 : toWater[i]! < 2)) continue;
    if (inForest(i) && chance(rng, 0.7)) continue;
    place(pickKind(rng, stoneKinds), i);
    b++;
  }

  // 7. Flowers and tall grass on the meadows, in clumps; the camp glade keeps its flowers.
  const meadowKinds = kindsFor('meadow');
  const clumps = makeNoise(rng, width, height, 4);
  const decor = params.meadowDecorPercent / 100;
  for (let i = 0; i < size; i++) {
    if (layer[i] !== GRASS || inForest(i) || map.object[i] !== 0 || toWater[i]! < 1) continue;
    const x = i % width;
    const clump = noiseAt(clumps, x, (i - x) / width);
    if (chance(rng, decor * (0.2 + 1.8 * clump * clump))) place(pickKind(rng, meadowKinds), i);
  }

  return { map, objects };
}

/**
 * Make sure a tree stands within `reach` tiles of `centre` (but not closer than `near`): plant
 * one on a free grass tile if there is none.
 */
function plantNear(
  rng: Rng,
  map: WorldMap,
  objects: MapObjects,
  centre: Point,
  near: number,
  reach: number,
  kinds: { defs: MapObjectDef[]; weights: number[] },
  free: (i: number) => boolean,
): void {
  const grass = groundCode(map, 'grass');
  let spot = -1;
  for (let y = centre.y - reach; y <= centre.y + reach; y++) {
    for (let x = centre.x - reach; x <= centre.x + reach; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const i = y * map.width + x;
      const object = map.object[i]!;
      if (object !== 0) {
        const found = findObject(objects, object);
        if (found && defOf(found).place === 'forest') return;
      }
      const far = Math.max(Math.abs(x - centre.x), Math.abs(y - centre.y));
      if (spot < 0 && far >= near && map.ground[i] === grass && free(i)) spot = i;
    }
  }
  if (spot >= 0) {
    const x = spot % map.width;
    placeObject(map, objects, pickKind(rng, kinds), x, (spot - x) / map.width);
  }
}
