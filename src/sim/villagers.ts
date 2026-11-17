/**
 * Villagers (step 1.3): the people of the world. So far they only walk — there are no needs yet
 * (step 1.4), so they wander calmly around the place where they came to the world.
 *
 *   - A villager is an entity with an id, a sex, looks (skin tone and hair colour — indices the
 *     renderer turns into palette swaps), a position — the tile it stands on plus progress
 *     towards the next one — the way it faces and what it is doing (`action`).
 *   - Walking: one tile per `movement.walkTicksPerTile` ticks on grass (GDD §13.1), slower on sand
 *     (data/terrain.json, `speed`), a diagonal step is √2 longer. Paths come from ./path.ts.
 *     Time left over after a step goes into the next one, so the pace is even.
 *   - Two people never stand on one tile: a villager occupies its tile and, while stepping, the
 *     next one too. One whose next tile is taken waits `villagers.giveWayTicks`, then looks for a
 *     way around; if there is none, it gives up and stands.
 *   - Without needs a villager rests `villagers.restTicks`, then walks to a free tile within
 *     `villagers.wanderRadius` of home.
 *   - The observer's debug order (`orderWalk`, the scene `world` with `debug=1`) sends a villager
 *     to a tile; an unreachable one is refused at once and the villager goes on as before.
 *
 * Plain data (docs/ARCHITECTURE.md, rule 7); randomness — the stream `villagers`. The position of
 * the previous tick (`prevX`, `prevY`) is kept for the renderer's smooth motion (loop.alpha), and
 * the distance walked (`walked`) picks the frame of the walking animation — legs move with the way
 * covered, not with the clock, so they keep pace at ×20.
 */
import { DATA } from '../data/index.ts';
import { type Cause, emit } from './events.ts';
import { inside } from './map.ts';
import { findCampSite } from './mapgen.ts';
import { objectAt } from './objects.ts';
import { canStep, DIAGONAL, findPath, type PathResult, type Tile, tileSpeed } from './path.ts';
import { intRange } from './rng.ts';
import type { System, World } from './world.ts';

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];

/** Which way a villager faces: north (back to the viewer), east, south (face), west. */
export type Facing = 'n' | 'e' | 's' | 'w';

/**
 * How many skin tones and hair colours there are (GDD §10.2). A villager keeps indices; the
 * renderer has the palette ramps for them (src/render/villagers.ts — a test keeps them in step).
 */
export const LOOKS = { skinTones: 6, hairColors: 5 } as const;

/** Why a villager walks: to wander (no needs yet) or because the observer sent it (debug). */
export type WalkPurpose = 'wander' | 'order';

export type VillagerAction =
  /** Stands (breathes) until tick `until`, then decides what to do. */
  | { kind: 'idle'; until: number }
  /** Walks to `goal` along `path` (the tiles still ahead); `waited` — ticks spent giving way. */
  | { kind: 'walk'; purpose: WalkPurpose; goal: Tile; path: Tile[]; waited: number };

export interface Villager {
  id: number;
  sex: Sex;
  /** Skin tone and hair colour: indices below LOOKS.skinTones / LOOKS.hairColors. */
  skin: number;
  hair: number;
  /** Where it came to the world: it wanders around this tile while there are no needs. */
  home: Tile;
  /** The tile it stands on, or leaves while stepping. */
  x: number;
  y: number;
  /** The tile of the current step; equals (x, y) when standing. */
  toX: number;
  toY: number;
  /** Share of the current step already done, 0…1. */
  progress: number;
  /** Position at the previous tick, tiles (fractional): the renderer interpolates. */
  prevX: number;
  prevY: number;
  facing: Facing;
  /** Tiles walked in a lifetime: the walking animation goes by distance (docs/ART.md). */
  walked: number;
  action: VillagerAction;
}

export interface Villagers {
  /** Every villager, in the order of ids. */
  list: Villager[];
  nextId: number;
}

/** Tries to find a tile to wander to before resting again. */
const WANDER_TRIES = 8;
/** Rounding slack of a step's progress (floating sums of 1/5, √2…). */
const EPSILON = 1e-9;

export function createVillagers(): Villagers {
  return { list: [], nextId: 1 };
}

export function findVillager(world: World, id: number): Villager | undefined {
  return world.villagers.list.find((villager) => villager.id === id);
}

/** Where a villager is now, tiles (fractional while stepping). */
export function positionOf(villager: Villager): { x: number; y: number } {
  return {
    x: villager.x + (villager.toX - villager.x) * villager.progress,
    y: villager.y + (villager.toY - villager.y) * villager.progress,
  };
}

/** Is the villager in the middle of a step? */
export function isStepping(villager: Villager): boolean {
  return villager.toX !== villager.x || villager.toY !== villager.y;
}

/** The way one faces stepping by (dx, dy): sideways wins on a diagonal (it reads better). */
export function facingOf(dx: number, dy: number): Facing {
  if (dx > 0) return 'e';
  if (dx < 0) return 'w';
  return dy < 0 ? 'n' : 's';
}

/** Does another villager than `self` stand on tile (x, y) or step onto it? */
export function isTaken(world: World, x: number, y: number, self?: Villager): boolean {
  for (const other of world.villagers.list) {
    if (other === self) continue;
    if ((other.x === x && other.y === y) || (other.toX === x && other.toY === y)) return true;
  }
  return false;
}

/** A tile to stand on: passable, bare (no flowers or bushes underfoot), nobody there. */
function canStandOn(world: World, x: number, y: number, self?: Villager): boolean {
  return (
    tileSpeed(world.map, world.objects, x, y) > 0 &&
    objectAt(world.map, world.objects, x, y) === undefined &&
    !isTaken(world, x, y, self)
  );
}

/**
 * The tile nearest to (x, y) to stand on (rings of growing radius, each in a fixed order), or
 * null if the map has none.
 */
export function freeTileNear(world: World, x: number, y: number, self?: Villager): Tile | null {
  const { map } = world;
  const most = Math.max(map.width, map.height);
  for (let r = 0; r < most; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (inside(map, tx, ty) && canStandOn(world, tx, ty, self)) return { x: tx, y: ty };
      }
    }
  }
  return null;
}

function restTicks(world: World): number {
  const { min, max } = DATA.balance.villagers.restTicks;
  return intRange(world.rng.villagers, min, max);
}

/** A new villager standing on `tile`, resting a moment before its first walk. */
function addVillager(world: World, sex: Sex, tile: Tile, home: Tile): Villager {
  const rng = world.rng.villagers;
  const skin = intRange(rng, 0, LOOKS.skinTones - 1);
  const hair = intRange(rng, 0, LOOKS.hairColors - 1);
  const until = world.tick + restTicks(world);
  const villager: Villager = {
    id: world.villagers.nextId,
    sex,
    skin,
    hair,
    home: { ...home },
    x: tile.x,
    y: tile.y,
    toX: tile.x,
    toY: tile.y,
    progress: 0,
    prevX: tile.x,
    prevY: tile.y,
    // Facing home: the first two stand on either side of it and look at each other.
    facing: facingOf(home.x - tile.x, home.y - tile.y),
    walked: 0,
    action: { kind: 'idle', until },
  };
  world.villagers.nextId += 1;
  world.villagers.list.push(villager);
  return villager;
}

/**
 * The first two people — a man and a woman — come to the camp site (`findCampSite`: dry, by water
 * and forest; GDD §3.1, item 9, simplified) and stand on either side of it. A map without one (a
 * test's) — around the free tile nearest to its middle. Each arrival is an event caused by `cause`.
 */
export function settleFirstPair(world: World, cause: Cause): void {
  const camp = findCampSite(world.map, world.objects);
  const middle = { x: world.map.width >> 1, y: world.map.height >> 1 };
  const home = camp ? { x: camp.x, y: camp.y } : freeTileNear(world, middle.x, middle.y);
  if (!home) throw new Error('На карте нет ни одного тайла, где можно стоять');
  for (const [sex, side] of [
    ['male', -1],
    ['female', 1],
  ] as const) {
    const tile = freeTileNear(world, home.x + side, home.y);
    if (!tile) throw new Error('Жителю негде встать');
    const villager = addVillager(world, sex, tile, home);
    emit(
      world,
      { type: 'villager_arrived', villager: villager.id, sex, x: tile.x, y: tile.y },
      cause,
    );
  }
}

/** Put a villager on tile (x, y), standing and resting (tests, later — newcomers). */
export function placeVillager(world: World, villager: Villager, x: number, y: number): void {
  villager.x = x;
  villager.y = y;
  villager.toX = x;
  villager.toY = y;
  villager.progress = 0;
  villager.prevX = x;
  villager.prevY = y;
  villager.action = { kind: 'idle', until: world.tick };
}

/** A path for `villager` from tile `from` to `goal` around the other villagers. */
function planPath(
  world: World,
  villager: Villager,
  from: Tile,
  goal: Tile,
  limit?: number,
): PathResult {
  return findPath(world.map, world.objects, from, goal, {
    ...(limit === undefined ? {} : { limit }),
    avoid: (x, y) => isTaken(world, x, y, villager),
  });
}

/**
 * The observer sends `villager` to tile `goal` (the debug click). The path starts where the
 * villager will stand next (the end of its current step). An unreachable goal changes nothing:
 * the result says why.
 */
export function orderWalk(world: World, villager: Villager, goal: Tile): PathResult {
  const result = planPath(world, villager, { x: villager.toX, y: villager.toY }, goal);
  if (result.ok) {
    // The villager's own copy: walking uses it up, the caller keeps the whole path.
    const path = [...result.path];
    villager.action = { kind: 'walk', purpose: 'order', goal: { ...goal }, path, waited: 0 };
  }
  return result;
}

/** Rest: stand for a while (or `ticks`) before deciding again. */
function rest(world: World, villager: Villager, ticks = restTicks(world)): void {
  villager.action = { kind: 'idle', until: world.tick + ticks };
}

/** Pick a free tile near home and set off; none found — rest a little and try again later. */
function wander(world: World, villager: Villager): void {
  const radius = DATA.balance.villagers.wanderRadius;
  const rng = world.rng.villagers;
  // A goal near home is near by path too: a long way round (across a river) is not a stroll.
  const side = 2 * radius + 1;
  const limit = Math.min(DATA.balance.movement.pathSearchTiles, side * side * 4);
  for (let attempt = 0; attempt < WANDER_TRIES; attempt++) {
    const dx = intRange(rng, -radius, radius);
    const dy = intRange(rng, -radius, radius);
    if (dx * dx + dy * dy > radius * radius) continue;
    const goal = { x: villager.home.x + dx, y: villager.home.y + dy };
    if (goal.x === villager.x && goal.y === villager.y) continue;
    if (!inside(world.map, goal.x, goal.y) || !canStandOn(world, goal.x, goal.y, villager))
      continue;
    if (isGoalOfAnother(world, goal, villager)) continue;
    const result = planPath(world, villager, villager, goal, limit);
    if (!result.ok) continue;
    villager.action = { kind: 'walk', purpose: 'wander', goal, path: result.path, waited: 0 };
    return;
  }
  rest(world, villager, DATA.balance.villagers.giveWayTicks);
}

function isGoalOfAnother(world: World, goal: Tile, self: Villager): boolean {
  return world.villagers.list.some(
    (other) =>
      other !== self &&
      other.action.kind === 'walk' &&
      other.action.goal.x === goal.x &&
      other.action.goal.y === goal.y,
  );
}

/** Ticks a step onto (toX, toY) takes: its length over the speed of the ground entered. */
function stepTicks(world: World, villager: Villager): number {
  const diagonal = villager.toX !== villager.x && villager.toY !== villager.y;
  const speed = tileSpeed(world.map, world.objects, villager.toX, villager.toY) || 1;
  return (DATA.balance.movement.walkTicksPerTile * (diagonal ? DIAGONAL : 1)) / speed;
}

/**
 * Go on with the current step for `time` ticks. Returns the time left after reaching the next
 * tile (then the villager stands on it), or 0 if the step is still under way.
 */
function advance(world: World, villager: Villager, time: number): number {
  const ticks = stepTicks(world, villager);
  const length = villager.toX !== villager.x && villager.toY !== villager.y ? DIAGONAL : 1;
  const left = (1 - villager.progress) * ticks;
  if (time < left - EPSILON) {
    villager.progress += time / ticks;
    villager.walked += (time / ticks) * length;
    return 0;
  }
  villager.walked += (1 - villager.progress) * length;
  villager.x = villager.toX;
  villager.y = villager.toY;
  villager.progress = 0;
  return Math.max(0, time - left);
}

/**
 * A standing villager decides what to do now: rest on, set off, take the next step of its path,
 * wait for the way to clear. Returns true if a new step started.
 */
function decide(world: World, villager: Villager): boolean {
  const action = villager.action;
  if (action.kind === 'idle') {
    if (world.tick < action.until) return false;
    wander(world, villager);
    if (villager.action.kind !== 'walk') return false;
  }
  const walk = villager.action;
  if (walk.kind !== 'walk') return false;
  const next = walk.path[0];
  if (!next) {
    rest(world, villager);
    return false;
  }
  const dx = next.x - villager.x;
  const dy = next.y - villager.y;
  const adjacent = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0);
  if (!adjacent || !canStep(world.map, world.objects, villager.x, villager.y, dx, dy)) {
    // The world changed under the path: look for another one.
    return replan(world, villager, walk.goal, walk.purpose);
  }
  if (isTaken(world, next.x, next.y, villager)) {
    walk.waited += 1;
    if (walk.waited > DATA.balance.villagers.giveWayTicks)
      replan(world, villager, walk.goal, walk.purpose);
    return false;
  }
  walk.path.shift();
  walk.waited = 0;
  villager.toX = next.x;
  villager.toY = next.y;
  villager.progress = 0;
  villager.facing = facingOf(dx, dy);
  return true;
}

/** A new path to the same goal around the others; none — give up and stand. */
function replan(world: World, villager: Villager, goal: Tile, purpose: WalkPurpose): boolean {
  const result = planPath(world, villager, villager, goal);
  if (result.ok && result.path.length > 0) {
    villager.action = { kind: 'walk', purpose, goal, path: result.path, waited: 0 };
  } else {
    rest(world, villager, DATA.balance.villagers.giveWayTicks);
  }
  return false;
}

/** One tick of one villager: finish or go on with its step, decide and step further. */
function act(world: World, villager: Villager): void {
  let time = 1;
  // A tick holds at most a couple of steps (a step takes ≥ 1 tick on the fastest ground); the
  // bound only guards against a mistake in the data.
  for (let steps = 0; steps < 4; steps++) {
    if (isStepping(villager)) {
      time = advance(world, villager, time);
      if (isStepping(villager)) return; // the step is still under way
    }
    if (!decide(world, villager)) return;
  }
}

export const villagersSystem: System = {
  id: 'villagers',
  step(world) {
    for (const villager of world.villagers.list) {
      const at = positionOf(villager);
      villager.prevX = at.x;
      villager.prevY = at.y;
      act(world, villager);
    }
  },
};
