/**
 * Paths over the tiles of the map (step 1.3): A* on the grid of tiles, eight directions.
 *
 *   - Water and objects that block the way (trees, stumps, bushes, boulders) cannot be entered
 *     (`isPassable`, ./objects.ts); flowers and tall grass can.
 *   - No cutting corners: a diagonal step needs both tiles beside it passable too — nobody walks
 *     through the corner of a tree or of the water.
 *   - A step costs its length (1 or √2) divided by the speed of the ground it enters
 *     (data/terrain.json, `speed`): sand is slower than grass. This is the hook for paths and
 *     roads (GDD §6.1): a trodden tile will simply be faster.
 *   - The search looks at no more than `limit` tiles (data/balance.json, `movement.pathSearchTiles`):
 *     a target too far or out of reach is given up instead of hanging the game (GDD §2.4).
 *
 * The result depends only on the map, the objects and the arguments: the order of neighbours
 * and every tie in the open list are fixed, so one seed gives one path. Scratch arrays are kept
 * between searches (they are not part of the world) and reset by stamps, not by clearing.
 */
import { DATA } from '../data/index.ts';
import { inside, tileIndex, type WorldMap } from './map.ts';
import { defOf, findObject, type MapObjects } from './objects.ts';

export interface Tile {
  x: number;
  y: number;
}

/** Why there is no path: the target itself is blocked, it cannot be reached, or the search gave up. */
export type PathFailure = 'blocked' | 'unreachable' | 'too_far';

export type PathResult =
  | {
      ok: true;
      /** Tiles to step on, from the first step to the target; empty if already there. */
      path: Tile[];
      /** Cost of the path: tiles of grass it is worth (a diagonal is √2, sand 1/0.8). */
      cost: number;
      /** How many tiles the search looked at. */
      explored: number;
    }
  | { ok: false; reason: PathFailure; explored: number };

export interface PathOptions {
  /** Most tiles the search may look at; default — `movement.pathSearchTiles`. */
  limit?: number;
  /** Tiles that must not be stepped on besides the map's own obstacles (other villagers). */
  avoid?: (x: number, y: number) => boolean;
}

/** Length of a diagonal step, tiles. */
export const DIAGONAL = Math.sqrt(2);

/** Neighbours in a fixed order: the sides first, then the corners. */
const STEPS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

/** Speed of each type of ground of the map (index — as in `map.ground`), 0 — cannot walk. */
function groundSpeeds(map: WorldMap): number[] {
  return map.groundTypes.map((id) => {
    const terrain = DATA.terrain.get(id);
    return terrain.walkable && terrain.speed !== null ? terrain.speed : 0;
  });
}

/** The fastest ground of all: the heuristic must never overestimate the cost. */
function fastestGround(): number {
  let best = 0;
  for (const terrain of DATA.terrain.records) {
    if (terrain.walkable && terrain.speed !== null && terrain.speed > best) best = terrain.speed;
  }
  return best;
}

/**
 * Speed of walking onto tile (x, y) relative to grass: 0 — one cannot (water, a tree, outside
 * the map), otherwise the ground's speed (data/terrain.json).
 */
export function tileSpeed(map: WorldMap, objects: MapObjects, x: number, y: number): number {
  if (!inside(map, x, y)) return 0;
  const index = tileIndex(map, x, y);
  const terrain = DATA.terrain.get(map.groundTypes[map.ground[index]!]!);
  if (!terrain.walkable || terrain.speed === null) return 0;
  const id = map.object[index]!;
  if (id !== 0) {
    const object = findObject(objects, id);
    if (object && !defOf(object).walkable) return 0;
  }
  return terrain.speed;
}

/**
 * Can one step from (x, y) by (dx, dy) — one tile in one of eight directions: the target is
 * passable and, for a diagonal, both tiles beside the step too (no cutting corners).
 */
export function canStep(
  map: WorldMap,
  objects: MapObjects,
  x: number,
  y: number,
  dx: number,
  dy: number,
): boolean {
  if (tileSpeed(map, objects, x + dx, y + dy) === 0) return false;
  if (dx === 0 || dy === 0) return true;
  return tileSpeed(map, objects, x + dx, y) > 0 && tileSpeed(map, objects, x, y + dy) > 0;
}

// --- Scratch memory -------------------------------------------------------------------------

/** Arrays of one size of map, reused by every search; a stamp marks what the current search set. */
interface Scratch {
  size: number;
  search: number;
  /** Stamp of the search that last touched the tile; g and parent are valid only with it. */
  seen: Uint32Array;
  closed: Uint32Array;
  g: Float64Array;
  parent: Int32Array;
  /** Speed of the tile for the search of `speedStamp` (computed once per search). */
  speedStamp: Uint32Array;
  speed: Float64Array;
}

let scratch: Scratch | null = null;

function scratchFor(size: number): Scratch {
  if (scratch === null || scratch.size !== size || scratch.search >= 0xfffffff0) {
    scratch = {
      size,
      search: 0,
      seen: new Uint32Array(size),
      closed: new Uint32Array(size),
      g: new Float64Array(size),
      parent: new Int32Array(size),
      speedStamp: new Uint32Array(size),
      speed: new Float64Array(size),
    };
  }
  scratch.search += 1;
  return scratch;
}

/**
 * The open list: a binary heap of entries ordered by f, then h (closer to the target first),
 * then age — a total order, so ties never depend on the heap's inner workings.
 */
class OpenList {
  /** Entry ids in heap order. An entry id is its age: entries are numbered as they come. */
  private heap: number[] = [];
  private node: number[] = [];
  private f: number[] = [];
  private h: number[] = [];

  get size(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap.length = 0;
    this.node.length = 0;
    this.f.length = 0;
    this.h.length = 0;
  }

  private before(a: number, b: number): boolean {
    const f = this.f;
    if (f[a] !== f[b]) return f[a]! < f[b]!;
    const h = this.h;
    if (h[a] !== h[b]) return h[a]! < h[b]!;
    return a < b;
  }

  push(node: number, f: number, h: number): void {
    const entry = this.node.length;
    this.node.push(node);
    this.f.push(f);
    this.h.push(h);
    const heap = this.heap;
    let i = heap.length;
    heap.push(entry);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!this.before(entry, heap[up]!)) break;
      heap[i] = heap[up]!;
      i = up;
    }
    heap[i] = entry;
  }

  pop(): number {
    const heap = this.heap;
    const top = heap[0]!;
    const last = heap.pop()!;
    const size = heap.length;
    if (size > 0) {
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        if (left >= size) break;
        const right = left + 1;
        const child = right < size && this.before(heap[right]!, heap[left]!) ? right : left;
        if (!this.before(heap[child]!, last)) break;
        heap[i] = heap[child]!;
        i = child;
      }
      heap[i] = last;
    }
    return this.node[top]!;
  }
}

const open = new OpenList();

/**
 * The cheapest path from tile `from` to tile `to` (A*, eight directions, no cutting corners).
 * The starting tile itself is never checked: one may always leave the tile one stands on.
 */
export function findPath(
  map: WorldMap,
  objects: MapObjects,
  from: Tile,
  to: Tile,
  options: PathOptions = {},
): PathResult {
  const limit = options.limit ?? DATA.balance.movement.pathSearchTiles;
  const avoid = options.avoid;
  if (from.x === to.x && from.y === to.y) return { ok: true, path: [], cost: 0, explored: 0 };
  if (tileSpeed(map, objects, to.x, to.y) === 0 || avoid?.(to.x, to.y)) {
    return { ok: false, reason: 'blocked', explored: 0 };
  }

  const { width } = map;
  const s = scratchFor(map.width * map.height);
  const stamp = s.search;
  const speeds = groundSpeeds(map);
  const fastest = fastestGround();

  /** Speed of entering a tile (0 — blocked), computed once per search. */
  const speedAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= map.height) return 0;
    const index = y * width + x;
    if (s.speedStamp[index] === stamp) return s.speed[index]!;
    let speed = speeds[map.ground[index]!]!;
    if (speed > 0) {
      const id = map.object[index]!;
      if (id !== 0) {
        const object = findObject(objects, id);
        if (object && !defOf(object).walkable) speed = 0;
      }
    }
    s.speedStamp[index] = stamp;
    s.speed[index] = speed;
    return speed;
  };
  const heuristic = (x: number, y: number): number => {
    const dx = Math.abs(x - to.x);
    const dy = Math.abs(y - to.y);
    const straight = Math.abs(dx - dy);
    return (straight + DIAGONAL * Math.min(dx, dy)) / fastest;
  };

  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  open.clear();
  s.seen[start] = stamp;
  s.g[start] = 0;
  s.parent[start] = -1;
  const startH = heuristic(from.x, from.y);
  open.push(start, startH, startH);
  let explored = 0;

  while (open.size > 0) {
    const node = open.pop();
    if (s.closed[node] === stamp) continue; // a stale entry: the tile was reached cheaper
    s.closed[node] = stamp;
    if (node === goal) {
      const path: Tile[] = [];
      for (let at = goal; at !== start; at = s.parent[at]!) {
        const x = at % width;
        path.push({ x, y: (at - x) / width });
      }
      path.reverse();
      return { ok: true, path, cost: s.g[goal]!, explored };
    }
    explored += 1;
    if (explored >= limit) return { ok: false, reason: 'too_far', explored };

    const x = node % width;
    const y = (node - x) / width;
    const g = s.g[node]!;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      const speed = speedAt(nx, ny);
      if (speed === 0) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (speedAt(nx, y) === 0 || speedAt(x, ny) === 0)) continue;
      const next = ny * width + nx;
      if (s.closed[next] === stamp) continue;
      if (avoid !== undefined && next !== goal && avoid(nx, ny)) continue;
      const cost = g + (diagonal ? DIAGONAL : 1) / speed;
      if (s.seen[next] === stamp && s.g[next]! <= cost) continue;
      s.seen[next] = stamp;
      s.g[next] = cost;
      s.parent[next] = node;
      const h = heuristic(nx, ny);
      open.push(next, cost + h, h);
    }
  }
  return { ok: false, reason: 'unreachable', explored };
}
