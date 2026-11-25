/**
 * Villagers (step 1.3; needs — step 1.4; sleep — step 1.5): the people of the world. They walk,
 * rest and stroll near home, go to eat and to drink when hunger or thirst presses, and sleep on
 * the ground at night.
 *
 *   - A villager is an entity with an id, a sex, looks (skin tone and hair colour — indices the
 *     renderer turns into palette swaps), a position — the tile it stands on plus progress
 *     towards the next one — the way it faces, what it is doing (`action`), its needs (satiety
 *     and thirst, 0…100, ./needs.ts) and health. ./life.ts makes the needs fall and the health
 *     suffer, and writes deaths to the journal.
 *   - Walking: one tile per `movement.walkTicksPerTile` ticks on grass (GDD §13.1), slower on sand
 *     (data/terrain.json, `speed`), a diagonal step is √2 longer. Paths come from ./path.ts.
 *     Time left over after a step goes into the next one, so the pace is even.
 *   - Two people never stand on one tile: a villager occupies its tile and, while stepping, the
 *     next one too. One whose next tile is taken waits `villagers.giveWayTicks`, then looks for a
 *     way around; if there is none, it gives up and stands.
 *   - What to do is the mind's choice (./minds.ts, GDD §2.3), made into a plan (step 1.8): the
 *     villager carries out `plan` — the activity, the utility it was chosen with and the steps still
 *     ahead — step by step (`action` is the step under way, `nextStep` begins the next one). Every
 *     `ai.thinkTicks`, whatever it does (walking — at the first step after that moment), it thinks
 *     the plan over (./minds.ts `reconsider`) and changes it only for something better than the
 *     plan's hold (hysteresis); each change goes to its journal of decisions (`log`).
 *   - When hunger or thirst wins, it walks to the nearest bush with berries or to the water's edge,
 *     stands beside it facing it and eats (`eating.biteRations` every `eating.biteTicks`, straight
 *     from the bush — ./objects.ts `takeFood`) or drinks (`eating.sipPoints` every
 *     `eating.sipTicks`) until full; the bush picked clean turns empty.
 *   - At night (and when sleepless) it lies down where it stands and sleeps (step 1.5) — on the way
 *     too, if sleep outweighs the plan: sleep comes back, and it gets up at dawn, rested, or earlier
 *     if hunger or thirst press harder. Sleep at zero fells it where it stands — a faint, an event
 *     of the journal.
 *   - Free time is for work (step 1.7, ./items.ts): when the mind prefers it to rest, the villager
 *     walks to branches lying loose, picks them up (`items.pickUpTicks`), gathers an armful while
 *     more lie within `items.gatherTiles`, carries the load to the pile at the camp and puts it
 *     down (`items.putDownTicks`). A load is held only while the plan is to haul: one who does
 *     anything else (goes to eat, lies down to sleep, dies) lets it go where it stands — nothing is
 *     lost.
 *   - The fire (step 1.9, ./fire.ts): to light or feed it, the villager walks to a stack of wood in
 *     the pile, takes as much as the fire takes (`items.pickUpTicks`), carries it to a side of the
 *     fire and lights it (`fire.kindleTicks`) or puts it in (`fire.stokeTicks`). In the evening it
 *     walks to a place by the burning fire and sits facing it; at night it goes to sleep by the fire
 *     (if the hearth is within `fire.sleepWalkTiles`; on a freezing night — step 1.10 — within
 *     `fire.coldSleepWalkTiles`), else where it stands. A cold villager (step 1.10) warms itself
 *     sitting at the fire the same way (the plan `warm`).
 *   - Otherwise it rests (the default plan): stands `villagers.restTicks`, then walks to a free tile
 *     within `villagers.wanderRadius` of home, and again.
 *   - The observer's debug order (`orderWalk`, the scene `world` with `debug=1`) sends a villager
 *     to a tile; an unreachable one is refused at once and the villager goes on as before.
 *
 * Plain data (docs/ARCHITECTURE.md, rule 7); randomness — the streams `villagers` (looks, rest,
 * strolls) and `minds` (the choice). The position of the previous tick (`prevX`, `prevY`) is kept
 * for the renderer's smooth motion (loop.alpha), and the distance walked (`walked`) picks the
 * frame of the walking animation — legs move with the way covered, not with the clock, so they
 * keep pace at ×20.
 */
import { DATA } from '../data/index.ts';
import { calendarAt } from './calendar.ts';
import { type Cause, emit } from './events.ts';
import {
  feedFire,
  fireRoom,
  hearthOf,
  isBurning,
  isEveningOrNight,
  lightFire,
  WOOD,
} from './fire.ts';
import {
  dropLoad,
  findItem,
  isFood,
  isPileTile,
  lay,
  pileSpot,
  type Stack,
  spoilsAt,
  stackOf,
  takeItem,
} from './items.ts';
import { inside } from './map.ts';
import { emptyMemory, type Known, look, noteFood, share } from './memory.ts';
import {
  ACTIVITY,
  type Activity,
  type Choice,
  type Considered,
  canUse,
  coldReach,
  type Decision,
  type Found,
  holdOf,
  type Option,
  type PlanStep,
  reconsider,
  remember,
  searchFireSide,
  searchLoose,
  searchPick,
  searchSeat,
  type Why,
} from './minds.ts';
import {
  FULL,
  fullNeeds,
  isSated,
  type Meal,
  type PerNeed,
  perNeed,
  satietyPerRation,
} from './needs.ts';
import { findObject, hasFood, objectAt, takeFood } from './objects.ts';
import { canStep, DIAGONAL, findPath, type PathResult, type Tile, tileSpeed } from './path.ts';
import { intRange } from './rng.ts';
import { isFreezing } from './weather.ts';
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

/**
 * Why a villager walks: to stroll near home, because the observer sent it (debug), to eat or to
 * drink (step 1.4), to fetch something lying loose or to carry the load to the pile (step 1.7); to
 * take wood from the pile, to carry it to the fire, to sit by the fire, to lie down by it (step 1.9);
 * to scout — to the edge of the known land, to pick food to store (step 1.11b).
 */
export type WalkPurpose =
  | 'wander'
  | 'order'
  | 'eat'
  | 'drink'
  | 'fetch'
  | 'carry'
  | 'wood'
  | 'fire'
  | 'sit'
  | 'bed'
  | 'scout'
  | 'pick';

/**
 * What a walk leads to. A need is met (step 1.4) beside a bush with food — object `object` on
 * its tile — or beside water; work (step 1.7) is done on the tile itself: picking up item `item`
 * lying there, putting the load down in the pile. The fire (step 1.9): taking wood from stack
 * `item` of the pile (`store`, on its tile), lighting or feeding the fire at (x, y) (`fire`, beside
 * it), sitting or sleeping on a place by it (`spot`, on the tile).
 */
export type Source =
  | { kind: 'bush'; object: number; x: number; y: number }
  | { kind: 'water'; x: number; y: number }
  | { kind: 'item'; item: number; resource: string; x: number; y: number }
  | { kind: 'pile'; resource: string; x: number; y: number }
  | { kind: 'store'; item: number; resource: string; x: number; y: number }
  | { kind: 'fire'; x: number; y: number }
  | { kind: 'spot'; x: number; y: number };

export type VillagerAction =
  /** Stands (breathes) until tick `until`, thinking now and then (./minds.ts); then strolls. */
  | { kind: 'idle'; until: number }
  /**
   * Walks to `goal` along `path` (the tiles still ahead); `waited` — ticks spent giving way;
   * `source` — what it will eat or drink from there (null for a stroll or an order).
   */
  | {
      kind: 'walk';
      purpose: WalkPurpose;
      goal: Tile;
      path: Tile[];
      waited: number;
      source: Source | null;
    }
  /**
   * Picks food from the bush (object id) beside it and eats it (`food` — what it gives: berries,
   * nuts, roots — step 1.10); the next bite at `next`.
   */
  | { kind: 'eat'; bush: number; food: string; next: number }
  /** Eats from stack `item` of the store it stands on (step 1.11b); the next handful at `next`. */
  | { kind: 'eat_stored'; item: number; food: string; next: number }
  /** Picks food from the bush beside it into the hands, to store (step 1.11b); a handful at `next`. */
  | { kind: 'pick'; bush: number; food: string; next: number }
  /** Drinks from the water tile beside it; the next sip at `next`. */
  | { kind: 'drink'; water: Tile; next: number }
  /**
   * Sleeps on the ground where it stands (step 1.5); `fainted` — fell from want of sleep and
   * lies until `sleeping.faintWakePoints`, deaf to everything; otherwise wakes when the mind
   * prefers anything to sleep (rested by day, or hunger or thirst press harder).
   */
  | { kind: 'sleep'; fainted: boolean }
  /** Picks up item `item` (of `resource`) lying on its tile; done at tick `until` (step 1.7). */
  | { kind: 'pick_up'; item: number; resource: string; until: number }
  /** Puts its load of `resource` down on its tile of the pile; done at tick `until` (step 1.7). */
  | { kind: 'put_down'; resource: string; until: number }
  /** Takes wood from stack `item` of the pile on its tile; done at tick `until` (step 1.9). */
  | { kind: 'take'; item: number; resource: string; until: number }
  /** Lights the fire beside it with the wood it holds; done at tick `until` (step 1.9). */
  | { kind: 'kindle'; until: number }
  /** Puts the wood it holds into the burning fire beside it; done at tick `until` (step 1.9). */
  | { kind: 'stoke'; until: number }
  /** Sits by the fire, facing it, until the mind prefers anything else (step 1.9). */
  | { kind: 'sit' };

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
  /** Satiety and thirst, 0…100: 100 — fed, not thirsty (./needs.ts, GDD §4.2). */
  needs: PerNeed<number>;
  /** 0…100; at 0 the villager dies (./life.ts). */
  health: number;
  /**
   * While a need is at zero — the id of the journal event of it running out (the cause of a
   * death it leads to); 0 — the need is not at zero.
   */
  ranOut: PerNeed<number>;
  /**
   * The mind's memory (./minds.ts): the tick of the last search in vain for the need — no
   * source anywhere in reach, or none near enough to be worth the way; 0 — none. Not searched
   * again for `ai.retryTicks`.
   */
  nowhere: PerNeed<number>;
  /**
   * The tick of the last search that found no source near enough to beat the plan under way (step
   * 1.11: with the near bushes picked bare such a search goes far); 0 — none. Not searched again
   * for `ai.farRetryTicks` — the need grows slowly, the plan does not change every moment.
   */
  tooFar: PerNeed<number>;
  /** What it carries in its hands (step 1.7, ./items.ts): one stack at most, or nothing. */
  load: Stack | null;
  /** The tick of the last search in vain for something to carry to the pile; 0 — none. */
  noWork: number;
  /** The tick of the last search in vain for food to store (step 1.11b); 0 — none. */
  noStore: number;
  /**
   * The land it explored (step 1.11b, ./memory.ts): a cell of `ai.cellTiles` per entry, row by row —
   * 1 once it was in sight whole, else 0.
   */
  seen: number[];
  /** The food objects it saw (step 1.11b, ./memory.ts), in the order of ids. */
  foods: Known[];
  /** What it set itself to do (step 1.8): `action` is the step of it under way. */
  plan: Plan;
  /** The tick it last thought its plan over (step 1.8): it thinks at its next moment after it. */
  thought: number;
  /** Its journal of decisions, the last `ai.logSize` (./minds.ts `Decision`). */
  log: Decision[];
}

/**
 * A plan under way (step 1.8, ./minds.ts `ACTIVITY`): the activity, the utility it was chosen with
 * (with its jitter: what a firm plan holds on with), when, and the steps still ahead after the one
 * under way (`action`).
 */
export interface Plan {
  activity: Activity;
  utility: number;
  since: number;
  steps: PlanStep[];
}

export interface Villagers {
  /** Every villager, in the order of ids. */
  list: Villager[];
  nextId: number;
}

/** Tries to find a tile to wander to before resting again. */
const WANDER_TRIES = 8;
/** The same, far from home: each try may search the whole map. */
const HOMEWARD_TRIES = 2;
/** One who walks will clear the way: it is waited for this many times longer than one who stands. */
const WALKER_PATIENCE = 4;
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

/** Take a villager out of the world (it died); its load stays on the ground. */
export function removeVillager(world: World, id: number): void {
  const list = world.villagers.list;
  const index = list.findIndex((villager) => villager.id === id);
  if (index < 0) return;
  dropLoad(world, list[index]!);
  list.splice(index, 1);
}

/**
 * Does the plan carry things (a load is held only while it does): work (step 1.7), lighting and
 * feeding the fire (step 1.9).
 */
export function carries(plan: Plan): boolean {
  return (
    plan.activity === 'haul' ||
    plan.activity === 'kindle' ||
    plan.activity === 'stoke' ||
    plan.activity === 'store'
  );
}

/** Does another villager than `self` stand on tile (x, y) or step onto it? */
export function isTaken(world: World, x: number, y: number, self?: Villager): boolean {
  for (const other of world.villagers.list) {
    if (other === self) continue;
    if ((other.x === x && other.y === y) || (other.toX === x && other.toY === y)) return true;
  }
  return false;
}

/**
 * A tile to stand on: passable, bare (no flowers or bushes underfoot), nobody there, not the middle
 * of the camp (the place of the fire, step 1.9).
 */
function canStandOn(world: World, x: number, y: number, self?: Villager): boolean {
  return (
    (x !== world.camp.x || y !== world.camp.y) &&
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
    needs: fullNeeds(),
    health: FULL,
    ranOut: perNeed(0),
    nowhere: perNeed(0),
    tooFar: perNeed(0),
    load: null,
    noWork: 0,
    noStore: 0,
    ...emptyMemory(world.map),
    plan: restPlan(world),
    thought: world.tick,
    log: [],
  };
  world.villagers.nextId += 1;
  world.villagers.list.push(villager);
  look(world, villager);
  return villager;
}

/**
 * The first two people — a man and a woman — come to the camp (`world.camp`: the camp site — dry,
 * by water and forest, GDD §3.1, item 9, simplified; on a test's map without one — the free tile
 * nearest to its middle) and stand on either side of it. Each arrival is an event caused by `cause`.
 */
export function settleFirstPair(world: World, cause: Cause): void {
  const home = { x: world.camp.x, y: world.camp.y };
  for (const [sex, side] of [
    ['male', -1],
    ['female', 1],
  ] as const) {
    const tile = freeTileNear(world, home.x + side, home.y);
    if (!tile) throw new Error('Жителю негде встать');
    const villager = addVillager(world, sex, tile, home);
    emit(
      world,
      {
        type: 'villager_arrived',
        villager: villager.id,
        sex,
        x: tile.x,
        y: tile.y,
      },
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
  villager.plan = restPlan(world);
  look(world, villager);
}

/** The default plan: rest — stand a while, stroll near home, and again. */
function restPlan(world: World): Plan {
  return {
    activity: 'rest',
    utility: DATA.balance.ai.restUtility,
    since: world.tick,
    steps: ['stroll'],
  };
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
    adopt(
      world,
      villager,
      { activity: 'order', utility: 0, since: world.tick, steps: [] },
      'order',
    );
    villager.action = {
      kind: 'walk',
      purpose: 'order',
      goal: { ...goal },
      path,
      waited: 0,
      source: null,
    };
  }
  return result;
}

/** Rest: stand for a while (or `ticks`) before the next step. */
function rest(world: World, villager: Villager, ticks = restTicks(world)): void {
  villager.action = { kind: 'idle', until: world.tick + ticks };
}

/**
 * The stroll of the rest plan: pick a free tile near home and set off; none found — stand a
 * little and try again later.
 */
function wander(world: World, villager: Villager): void {
  const radius = DATA.balance.villagers.wanderRadius;
  const rng = world.rng.villagers;
  const { home } = villager;
  // Far from home (back from a far bush) — the stroll is the way home: a search of any length,
  // but few tries. Near home, a goal near home is near by path too: a long way round (across a
  // river) is not a stroll, so the search is short.
  const away = Math.max(Math.abs(villager.x - home.x), Math.abs(villager.y - home.y)) > radius;
  const side = 2 * radius + 1;
  const all = DATA.balance.movement.pathSearchTiles;
  const limit = away ? all : Math.min(all, side * side * 4);
  const tries = away ? HOMEWARD_TRIES : WANDER_TRIES;
  for (let attempt = 0; attempt < tries; attempt++) {
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
    villager.action = {
      kind: 'walk',
      purpose: 'wander',
      goal,
      path: result.path,
      waited: 0,
      source: null,
    };
    return;
  }
  fail(world, villager, DATA.balance.villagers.giveWayTicks);
}

/** Is `goal` the tile another villager than `self` is walking to? */
export function isGoalOfAnother(world: World, goal: Tile, self: Villager): boolean {
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
 * Is it time to think? Every `ai.thinkTicks`, each villager at its own moment (shifted by its id).
 * One who walks decides only between steps, which seldom fall on its moment (a step takes 4 ticks,
 * a diagonal or sand — 5–7), so it thinks at the first step after the moment: a moment came since
 * it last thought (`thought`).
 */
function thinkingDue(world: World, villager: Villager): boolean {
  const every = DATA.balance.ai.thinkTicks;
  return (
    Math.floor((world.tick + villager.id) / every) !==
    Math.floor((villager.thought + villager.id) / every)
  );
}

// ── Plans (step 1.8) ─────────────────────────────────────────────────────────────────────────

/** Take up `plan` and write the decision to the journal. */
function adopt(
  world: World,
  villager: Villager,
  plan: Plan,
  why: Why,
  options: Considered[] = [],
  bar: number | null = null,
  ahead: Option | null = null,
): void {
  const from = villager.plan.activity;
  villager.plan = plan;
  remember(villager, {
    tick: world.tick,
    why,
    from,
    bar,
    plan: plan.activity,
    utility: plan.utility,
    ahead,
    options,
  });
}

/**
 * A plan the mind chose: taken up and its first step begun — rest stands, sleep lies down where it
 * stands, a trip or work walks to its source (or starts at once if there).
 */
function startPlan(
  world: World,
  villager: Villager,
  choice: Choice,
  options: Considered[],
  bar: number | null,
): void {
  const steps = [...ACTIVITY[choice.kind].steps];
  steps.shift();
  adopt(
    world,
    villager,
    {
      activity: choice.kind,
      utility: choice.utility,
      since: world.tick,
      steps,
    },
    'chose',
    options,
    bar,
    'ahead' in choice ? (choice.ahead ?? null) : null,
  );
  switch (choice.kind) {
    case 'rest':
      rest(world, villager);
      return;
    case 'sleep':
      bed(world, villager);
      return;
    case 'haul':
      walkFor(world, villager, 'fetch', choice);
      return;
    case 'kindle':
    case 'stoke':
      if (villager.load?.resource === WOOD) {
        // Wood in the hands already (it was carrying branches to the pile): straight to the fire.
        villager.plan.steps = [choice.kind];
        toFire(world, villager);
      } else {
        walkFor(world, villager, 'wood', choice);
      }
      return;
    case 'sit':
    case 'warm':
      walkFor(world, villager, 'sit', choice);
      return;
    case 'store':
      walkFor(world, villager, 'pick', choice);
      return;
    default:
      walkFor(world, villager, choice.kind, choice);
  }
}

/**
 * The step `bed` of the plan of sleep (step 1.9): walk to a place by the fire if the hearth is
 * within `fire.sleepWalkTiles`; there already, or none near — lie down here.
 */
function bed(world: World, villager: Villager): void {
  // A freezing night (step 1.10): to the fire from afar, or one may freeze in one's sleep.
  const { sleepWalkTiles, coldSleepWalkTiles } = DATA.balance.fire;
  const found = hearthOf(world)
    ? searchSeat(world, villager, isFreezing(world) ? coldSleepWalkTiles : sleepWalkTiles)
    : null;
  if (found && found.path.length > 0) walkFor(world, villager, 'bed', found);
  else nextStep(world, villager);
}

/** Walk to a found source; standing there already — the next step of the plan at once. */
function walkFor(world: World, villager: Villager, purpose: WalkPurpose, found: Found): void {
  if (found.path.length === 0) {
    nextStep(world, villager, found.source);
    return;
  }
  villager.action = {
    kind: 'walk',
    purpose,
    goal: found.goal,
    path: found.path,
    waited: 0,
    source: found.source,
  };
}

/**
 * The step under way is done: begin the next one of the plan (at `source` — what the last walk
 * led to). No steps left — the plan is carried out.
 */
function nextStep(world: World, villager: Villager, source: Source | null = null): void {
  const step = villager.plan.steps.shift();
  switch (step) {
    case undefined:
      settle(world, villager, 'done');
      return;
    case 'stand':
      rest(world, villager);
      return;
    case 'stroll':
      wander(world, villager);
      return;
    case 'sleep':
      villager.action = { kind: 'sleep', fainted: false };
      return;
    case 'bed':
      bed(world, villager);
      return;
    case 'eat':
    case 'drink':
    case 'pick_up':
    case 'put_down':
    case 'take':
    case 'sit':
    case 'pick':
      if (source) begin(world, villager, source);
      else fail(world, villager, 0);
      return;
    case 'kindle':
    case 'stoke':
      if (source) tend(world, villager, source);
      else fail(world, villager, 0);
      return;
    case 'to_fire':
      toFire(world, villager);
      return;
    case 'gather':
      gather(world, villager);
      return;
    case 'carry':
      carry(world, villager);
      return;
    case 'go':
    case 'fetch':
    case 'fetch_wood':
      // A walk is begun with its source (`startPlan`, `gather`); met here — the plan is broken.
      fail(world, villager, 0);
      return;
  }
}

/**
 * The plan is over (`done`, or `failed` — it could not go on): rest follows, standing `ticks`
 * (0 — think again at once). Rest itself never ends: it stands and strolls again.
 */
function settle(world: World, villager: Villager, why: 'done' | 'failed', ticks?: number): void {
  if (villager.plan.activity !== 'rest') adopt(world, villager, restPlan(world), why);
  else villager.plan.steps = ['stroll'];
  rest(world, villager, ticks);
}

/** The plan cannot go on: rest, standing `ticks` (0 — think again at once). */
function fail(world: World, villager: Villager, ticks?: number): void {
  settle(world, villager, 'failed', ticks);
}

/**
 * A moment of thought: is anything better than the plan under way (./minds.ts `reconsider`, over
 * the plan's hold)? Then that becomes the plan. Returns true if the plan changed.
 */
function think(world: World, villager: Villager): boolean {
  villager.thought = world.tick;
  const { hold } = ACTIVITY[villager.plan.activity];
  if (hold === 'fixed') return false;
  const bar = holdOf(world, villager, villager.plan);
  const options: Considered[] = [];
  const choice = reconsider(world, villager, villager.plan.activity, bar, options);
  if (!choice) return false;
  startPlan(world, villager, choice, options, bar > 0 ? bar : null);
  return true;
}

/**
 * At the end of the way: face the source and start eating or drinking (beside it), or start
 * picking up or putting down (on the tile). The bush emptied, the item is gone or the spot is
 * not right after all — the plan fails, think again on the next tick.
 */
function begin(world: World, villager: Villager, source: Source): void {
  if (!canUse(world, source, villager.x, villager.y)) {
    // A bush found bare (another picked it): remembered so (step 1.11b).
    if (source.kind === 'bush') seeBush(world, villager, source.object);
    fail(world, villager, 0);
    return;
  }
  const { pickUpTicks, putDownTicks } = DATA.balance.items;
  if (source.kind === 'item') {
    villager.action = {
      kind: 'pick_up',
      item: source.item,
      resource: source.resource,
      until: world.tick + pickUpTicks,
    };
    return;
  }
  if (source.kind === 'pile') {
    villager.action = {
      kind: 'put_down',
      resource: source.resource,
      until: world.tick + putDownTicks,
    };
    return;
  }
  if (source.kind === 'store' && villager.plan.activity === 'eat') {
    // The store at the camp (step 1.11b): eat from the stack one stands on.
    foundFood(world, villager, source, 0, source.resource);
    villager.action = {
      kind: 'eat_stored',
      item: source.item,
      food: source.resource,
      next: world.tick + DATA.balance.eating.biteTicks,
    };
    return;
  }
  if (source.kind === 'store') {
    villager.action = {
      kind: 'take',
      item: source.item,
      resource: source.resource,
      until: world.tick + pickUpTicks,
    };
    return;
  }
  if (source.kind === 'spot') {
    const { camp } = world;
    villager.facing = facingOf(camp.x - villager.x, camp.y - villager.y);
    villager.action = { kind: 'sit' };
    // By the fire they tell each other what they saw (step 1.11b).
    for (const other of world.villagers.list) {
      if (other !== villager && other.action.kind === 'sit') share(villager, other);
    }
    return;
  }
  if (source.kind === 'fire') {
    fail(world, villager, 0);
    return;
  }
  villager.facing = facingOf(source.x - villager.x, source.y - villager.y);
  const { biteTicks, sipTicks } = DATA.balance.eating;
  if (source.kind === 'bush' && villager.plan.activity === 'store') {
    // Picking food into the hands to store it (step 1.11b).
    villager.action = {
      kind: 'pick',
      bush: source.object,
      food: foodOf(world, source.object),
      next: world.tick + DATA.balance.stores.pickTicks,
    };
    return;
  }
  if (source.kind === 'bush') {
    foundFood(world, villager, source, source.object, foodOf(world, source.object));
  }
  villager.action =
    source.kind === 'bush'
      ? {
          kind: 'eat',
          bush: source.object,
          food: foodOf(world, source.object),
          next: world.tick + biteTicks,
        }
      : {
          kind: 'drink',
          water: { x: source.x, y: source.y },
          next: world.tick + sipTicks,
        };
}

/**
 * A villager came to food and begins to eat (step 1.11): an event with how far from the camp the
 * source is (straight, tiles, to a tenth) — the runs' «how far one goes for food» by seasons; from
 * the store (step 1.11b) — `object` 0. The cause is its decision to eat (its plan — the activity
 * `eat`).
 */
function foundFood(world: World, villager: Villager, at: Tile, object: number, food: string) {
  const dx = at.x - world.camp.x;
  const dy = at.y - world.camp.y;
  emit(
    world,
    {
      type: 'food_found',
      villager: villager.id,
      object,
      food,
      x: at.x,
      y: at.y,
      distance: Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10,
      stored: object === 0,
    },
    {
      kind: 'decision',
      villager: villager.id,
      activity: villager.plan.activity,
    },
  );
}

/** The villager sees food object `id` as it is now (step 1.11b, ./memory.ts). */
function seeBush(world: World, villager: Villager, id: number): void {
  const object = findObject(world.objects, id);
  if (object) noteFood(world, villager, object);
}

/** What the object `id` gives to eat (its harvest's resource; berries if it has none). */
function foodOf(world: World, id: number): string {
  const object = findObject(world.objects, id);
  return (object && DATA.objects.get(object.def).harvest?.food) ?? 'berries';
}

/** Tiles another villager than `self` stands on or walks to. */
function busyFor(world: World, self: Villager): (x: number, y: number) => boolean {
  return (x, y) => isTaken(world, x, y, self) || isGoalOfAnother(world, { x, y }, self);
}

/**
 * Picking up (step 1.7): when done, the item (if still there) goes into the hands as far as they
 * hold, and the plan goes on (`gather`). Nothing in the hands — the plan fails.
 */
function pickUp(
  world: World,
  villager: Villager,
  action: Extract<VillagerAction, { kind: 'pick_up' }>,
) {
  if (world.tick < action.until) return;
  const item = findItem(world, action.item);
  if (item && item.place === 'ground' && item.x === villager.x && item.y === villager.y) {
    takeItem(world, villager, item, item.count);
  }
  if (!villager.load) fail(world, villager, 0);
  else nextStep(world, villager);
}

/**
 * Gathering an armful: while the hands are not full and more of it lies near (`items.gatherTiles`
 * of the way; in the cold — step 1.10 — no farther than `coldReach`; in the evening — not at all),
 * go for that too — fetch and pick up again; otherwise on to the pile.
 */
function gather(world: World, villager: Villager): void {
  const load = villager.load;
  if (!load) {
    fail(world, villager, 0);
    return;
  }
  if (isFood(load.resource)) {
    gatherFood(world, villager, load);
    return;
  }
  // In the evening (step 1.10) one takes what one holds home, to the fire, gathering no more.
  if (load.count < DATA.resources.get(load.resource).stack && !isEveningOrNight(world.tick)) {
    // In the cold (step 1.10) no farther than one's warmth lasts on the way home.
    const more = searchLoose(world, villager, {
      resource: load.resource,
      maxCost: Math.min(DATA.balance.items.gatherTiles, coldReach(world, villager)),
    });
    if (more) {
      villager.plan.steps.unshift('pick_up', 'gather');
      walkFor(world, villager, 'fetch', more);
      return;
    }
  }
  nextStep(world, villager);
}

/**
 * Gathering food to store (step 1.11b): while the hands are not full and the villager knows of
 * more of it within `items.gatherTiles` (in the cold — `coldReach`; not in the evening), go and pick
 * there too; otherwise on to the store.
 */
function gatherFood(world: World, villager: Villager, load: Stack): void {
  if (load.count < stackOf(load.resource) && !isEveningOrNight(world.tick)) {
    const more = searchPick(
      world,
      villager,
      Math.min(DATA.balance.items.gatherTiles, coldReach(world, villager)),
    );
    if (
      more?.source.kind === 'bush' &&
      foodOf(world, more.source.object) === load.resource &&
      more.path.length > 0
    ) {
      villager.plan.steps.unshift('pick', 'gather');
      walkFor(world, villager, 'pick', more);
      return;
    }
  }
  nextStep(world, villager);
}

/**
 * Picking food into the hands (step 1.11b): a handful (`eating.biteRations`) every
 * `stores.pickTicks` while the hands hold more and the bush has a whole handful; a crumb left on it
 * (less than a handful) the villager eats there. Then the plan goes on (`gather`); nothing in the
 * hands — it fails.
 */
function pick(world: World, villager: Villager, action: Extract<VillagerAction, { kind: 'pick' }>) {
  if (world.tick < action.next) return;
  const unit = DATA.balance.eating.biteRations;
  const bush = findObject(world.objects, action.bush);
  const ripe = bush !== undefined && hasFood(bush, calendarAt(world.tick).season);
  const load = villager.load;
  const room = load === null || load.resource === action.food;
  const full = load !== null && load.count >= stackOf(action.food);
  if (bush && ripe && room && !full) {
    const taken = takeFood(bush, unit);
    if (taken >= unit - 1e-9) {
      world.items.picked += 1;
      if (load) {
        load.count += 1;
      } else {
        villager.load = {
          id: world.items.nextId++,
          resource: action.food,
          count: 1,
          spoils: spoilsAt(action.food, world.tick),
        };
      }
    } else {
      // A crumb, less than a handful: eaten on the spot.
      gain(villager, 'food', taken * satietyPerRation());
    }
    const more =
      bush.stock > 0 && villager.load !== null && villager.load.count < stackOf(action.food);
    if (more) {
      action.next = world.tick + DATA.balance.stores.pickTicks;
      return;
    }
  }
  if (bush) noteFood(world, villager, bush);
  if (!villager.load) fail(world, villager, 0);
  else nextStep(world, villager);
}

/**
 * Take the load to the pile: walk to the tile of the pile where it fits (./items.ts `pileSpot`),
 * or put it down at once if standing there. No room in the pile or no way there — let it go
 * where it stands and rest.
 */
function carry(world: World, villager: Villager): void {
  const load = villager.load;
  const spot = load ? pileSpot(world, load.resource, busyFor(world, villager)) : null;
  const result = spot ? planPath(world, villager, villager, spot) : null;
  if (!load || !spot || !result?.ok) {
    dropLoad(world, villager);
    fail(world, villager);
    return;
  }
  const source: Source = {
    kind: 'pile',
    resource: load.resource,
    x: spot.x,
    y: spot.y,
  };
  walkFor(world, villager, 'carry', {
    source,
    goal: spot,
    path: result.path,
    cost: 0,
  });
}

/**
 * Putting down (step 1.7): when done, the load goes onto the stack of the pile on this tile as
 * far as it has room; what is left is carried on to another tile of the pile.
 */
function putDown(
  world: World,
  villager: Villager,
  action: Extract<VillagerAction, { kind: 'put_down' }>,
) {
  if (world.tick < action.until) return;
  const load = villager.load;
  if (load && isPileTile(world, villager.x, villager.y)) {
    const laid = lay(
      world,
      load.resource,
      load.count,
      villager.x,
      villager.y,
      load.id,
      load.spoils,
    );
    load.count -= laid;
    if (laid > 0 && isFood(load.resource)) {
      emit(
        world,
        {
          type: 'food_stored',
          villager: villager.id,
          food: load.resource,
          count: laid,
          x: villager.x,
          y: villager.y,
        },
        {
          kind: 'decision',
          villager: villager.id,
          activity: villager.plan.activity,
        },
      );
    }
    if (load.count === 0) villager.load = null;
  }
  if (villager.load) villager.plan.steps.unshift('carry', 'put_down');
  nextStep(world, villager);
}

/**
 * Taking wood from the pile (step 1.9): when done, as much as the fire takes (at least one armful,
 * as far as the stack and the hands allow) goes into the hands, and the plan goes on (`to_fire`).
 * Nothing in the hands — the plan fails.
 */
function take(world: World, villager: Villager, action: Extract<VillagerAction, { kind: 'take' }>) {
  if (world.tick < action.until) return;
  const item = findItem(world, action.item);
  if (item && item.place === 'pile' && item.x === villager.x && item.y === villager.y) {
    takeItem(world, villager, item, Math.max(1, Math.floor(fireRoom(world))));
  }
  if (!villager.load) fail(world, villager, 0);
  else nextStep(world, villager);
}

/** Carry the wood to the fire: walk to a free side of it. No way there — the plan fails. */
function toFire(world: World, villager: Villager): void {
  const found = villager.load ? searchFireSide(world, villager) : null;
  if (!found) {
    fail(world, villager);
    return;
  }
  walkFor(world, villager, 'fire', found);
}

/** Beside the fire with wood: face it and light it, or put the wood in (step 1.9). */
function tend(world: World, villager: Villager, source: Source): void {
  if (!canUse(world, source, villager.x, villager.y) || !villager.load) {
    fail(world, villager, 0);
    return;
  }
  villager.facing = facingOf(source.x - villager.x, source.y - villager.y);
  // Whatever the plan said: a fire that went out meanwhile is lit again, one lit meanwhile is fed.
  const { kindleTicks, stokeTicks } = DATA.balance.fire;
  villager.action = !isBurning(world)
    ? { kind: 'kindle', until: world.tick + kindleTicks }
    : { kind: 'stoke', until: world.tick + stokeTicks };
}

/**
 * Lighting or feeding the fire, when done: the wood goes in (./fire.ts) and the plan is carried
 * out. Lighting has to wait while someone stands on the place of the hearth to be built.
 */
function fireWork(
  world: World,
  villager: Villager,
  action: Extract<VillagerAction, { kind: 'kindle' | 'stoke' }>,
) {
  if (world.tick < action.until) return;
  if (action.kind === 'kindle' || !isBurning(world)) {
    if (!lightFire(world, villager)) {
      action.until = world.tick + DATA.balance.villagers.giveWayTicks;
      return;
    }
  } else {
    feedFire(world, villager);
  }
  nextStep(world, villager);
}

/**
 * Eating at a bush: a bite every `eating.biteTicks` until full (the plan is done) or the bush is
 * bare (it fails: think again at once).
 */
function eat(world: World, villager: Villager, action: Extract<VillagerAction, { kind: 'eat' }>) {
  if (world.tick < action.next) return;
  const { biteRations, biteTicks } = DATA.balance.eating;
  const bush = findObject(world.objects, action.bush);
  // Out of season now (step 1.10: autumn turned to winter mid-meal) — nothing more to pick.
  const ripe = bush !== undefined && hasFood(bush, calendarAt(world.tick).season);
  const taken = bush && ripe ? takeFood(bush, biteRations) : 0;
  gain(villager, 'food', taken * satietyPerRation());
  if (isSated(villager.needs.food, 'food')) {
    nextStep(world, villager);
    return;
  }
  if (taken === 0 || !bush || bush.stock <= 0) {
    // Picked bare (step 1.11b): remembered so.
    if (bush) noteFood(world, villager, bush);
    fail(world, villager, 0);
    return;
  }
  action.next = world.tick + biteTicks;
}

/**
 * Eating from the store (step 1.11b): a handful (a unit of the stack, `eating.biteRations`) every
 * `eating.biteTicks` until full (the plan is done) or the stack is gone (it fails: think again).
 */
function eatStored(
  world: World,
  villager: Villager,
  action: Extract<VillagerAction, { kind: 'eat_stored' }>,
) {
  if (world.tick < action.next) return;
  const { biteRations, biteTicks } = DATA.balance.eating;
  const item = findItem(world, action.item);
  const there = item?.place === 'pile' && item.x === villager.x && item.y === villager.y;
  if (!item || !there) {
    fail(world, villager, 0);
    return;
  }
  item.count -= 1;
  world.items.eaten += 1;
  if (item.count === 0) world.items.list.splice(world.items.list.indexOf(item), 1);
  gain(villager, 'food', biteRations * satietyPerRation());
  if (isSated(villager.needs.food, 'food')) {
    nextStep(world, villager);
    return;
  }
  if (item.count === 0) {
    fail(world, villager, 0);
    return;
  }
  action.next = world.tick + biteTicks;
}

/**
 * Sleep ran out: the villager falls where it stands (a faint, GDD §4.2) — an event caused by its
 * sleep running out. It lies until `sleeping.faintWakePoints`, deaf to everything.
 */
function faint(world: World, villager: Villager): void {
  adopt(world, villager, { activity: 'sleep', utility: 0, since: world.tick, steps: [] }, 'faint');
  villager.action = { kind: 'sleep', fainted: true };
  emit(
    world,
    {
      type: 'villager_fainted',
      villager: villager.id,
      sex: villager.sex,
      x: villager.x,
      y: villager.y,
    },
    { kind: 'event', event: villager.ranOut.sleep },
  );
}

/** Drinking at the water: a sip every `eating.sipTicks` until thirst is quenched. */
function drink(
  world: World,
  villager: Villager,
  action: Extract<VillagerAction, { kind: 'drink' }>,
) {
  if (world.tick < action.next) return;
  const { sipPoints, sipTicks } = DATA.balance.eating;
  gain(villager, 'water', sipPoints);
  if (isSated(villager.needs.water, 'water')) {
    nextStep(world, villager);
    return;
  }
  action.next = world.tick + sipTicks;
}

/** A need is met by `amount` points (never above full). */
function gain(villager: Villager, need: Meal, amount: number): void {
  villager.needs[need] = Math.min(FULL, villager.needs[need] + amount);
}

/**
 * A standing villager goes on with its plan: thinks it over at its moment (standing — on its tick
 * of thought, or at once when its rest is over; walking — at the first step after it), then
 * carries on with the step under way — eats, drinks, sleeps, picks up, puts down, rests, takes the
 * next step of its path or waits for the way to clear. Returns true if a new step started.
 */
function decide(world: World, villager: Villager): boolean {
  if (villager.needs.sleep <= 0 && villager.action.kind !== 'sleep') faint(world, villager);
  // A load is held only while carrying: anything else (sleep, a meal…) lets it go here.
  if (villager.load && !carries(villager.plan)) dropLoad(world, villager);
  const action = villager.action;
  if (action.kind === 'sleep' && action.fainted) {
    if (villager.needs.sleep >= DATA.balance.sleeping.faintWakePoints) {
      settle(world, villager, 'done', 0);
    }
    return false;
  }
  const thinking =
    thinkingDue(world, villager) || (action.kind === 'idle' && world.tick >= action.until);
  if (thinking && think(world, villager)) {
    if (villager.load && !carries(villager.plan)) dropLoad(world, villager);
    return stepOn(world, villager);
  }
  switch (action.kind) {
    case 'sleep':
    case 'sit':
      return false;
    case 'eat':
      eat(world, villager, action);
      return false;
    case 'eat_stored':
      eatStored(world, villager, action);
      return false;
    case 'pick':
      pick(world, villager, action);
      break;
    case 'drink':
      drink(world, villager, action);
      return false;
    case 'pick_up':
      pickUp(world, villager, action);
      break;
    case 'put_down':
      putDown(world, villager, action);
      break;
    case 'take':
      take(world, villager, action);
      break;
    case 'kindle':
    case 'stoke':
      fireWork(world, villager, action);
      break;
    case 'idle':
      if (world.tick >= action.until) nextStep(world, villager);
      break;
    case 'walk':
      break;
  }
  return stepOn(world, villager);
}

/** A walker takes the next step of its path (or arrives, or waits). Returns true if it stepped. */
function stepOn(world: World, villager: Villager): boolean {
  const walk = villager.action;
  if (walk.kind !== 'walk') return false;
  const next = walk.path[0];
  if (!next) {
    arrive(world, villager, walk);
    return false;
  }
  const dx = next.x - villager.x;
  const dy = next.y - villager.y;
  const adjacent = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0);
  if (!adjacent || !canStep(world.map, world.objects, villager.x, villager.y, dx, dy)) {
    // The world changed under the path: look for another one.
    return replan(world, villager, walk);
  }
  if (isTaken(world, next.x, next.y, villager)) {
    walk.waited += 1;
    if (walk.waited > patience(world, villager, next)) replan(world, villager, walk);
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

/**
 * How long a villager waits for tile `next` to clear before looking for a way around. One who
 * stands there (resting, eating) is gone round after `villagers.giveWayTicks`. One who walks will
 * clear the way, so it is waited for longer — except when the two meet head-on (each wants the
 * other's tile — in a passage one tile wide): then the one with the larger id gives way after
 * `giveWayTicks` and the other waits. Both turning back at the same moment would meet again and
 * again (step 1.3 had that).
 */
function patience(world: World, villager: Villager, next: Tile): number {
  const giveWay = DATA.balance.villagers.giveWayTicks;
  const other = world.villagers.list.find(
    (v) =>
      v !== villager &&
      ((v.x === next.x && v.y === next.y) || (v.toX === next.x && v.toY === next.y)),
  );
  if (other?.action.kind !== 'walk') return giveWay;
  const wants = [{ x: other.toX, y: other.toY }, ...other.action.path.slice(0, 1)];
  const headOn = wants.some((tile) => tile.x === villager.x && tile.y === villager.y);
  return headOn && villager.id > other.id ? giveWay : WALKER_PATIENCE * giveWay;
}

/** At the end of a walk: the next step of the plan, at what the walk led to. */
function arrive(world: World, villager: Villager, walk: Extract<VillagerAction, { kind: 'walk' }>) {
  nextStep(world, villager, walk.source);
}

/** A new path to the same goal around the others; none — give up: the plan fails. */
function replan(
  world: World,
  villager: Villager,
  walk: Extract<VillagerAction, { kind: 'walk' }>,
): boolean {
  const result = planPath(world, villager, villager, walk.goal);
  if (result.ok && result.path.length > 0) {
    villager.action = { ...walk, path: result.path, waited: 0 };
  } else if (result.ok) {
    arrive(world, villager, walk);
  } else {
    fail(world, villager, DATA.balance.villagers.giveWayTicks);
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
      lookAround(world, villager);
    }
    if (!decide(world, villager)) return;
  }
}

/**
 * On a new tile the villager looks around (step 1.11b, ./memory.ts `look`). Scouting, it stops as
 * soon as it sees food (the plan is carried out: it thinks again at once); walking to a bush it now
 * sees bare (another picked it), it gives up the way and thinks again.
 */
function lookAround(world: World, villager: Villager): void {
  const found = look(world, villager);
  const { action, plan } = villager;
  if (plan.activity === 'scout' && found.length > 0) {
    settle(world, villager, 'done', 0);
    return;
  }
  if (action.kind !== 'walk' || action.source?.kind !== 'bush') return;
  const bush = findObject(world.objects, action.source.object);
  if (bush && !hasFood(bush, calendarAt(world.tick).season)) {
    const { sightTiles } = DATA.balance.ai;
    const dx = bush.x - villager.x;
    const dy = bush.y - villager.y;
    if (dx * dx + dy * dy <= sightTiles * sightTiles) fail(world, villager, 0);
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
      // Stopped carrying (lay down to sleep on the way, gave up a blocked path…): the load stays here.
      if (villager.load && !carries(villager.plan)) dropLoad(world, villager);
    }
  },
};
