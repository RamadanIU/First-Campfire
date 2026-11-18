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
 *   - What to do is the mind's choice (./minds.ts, GDD §2.3): a resting villager thinks every
 *     `ai.thinkTicks`; when hunger or thirst outweighs rest, it walks to the nearest bush with
 *     berries or to the water's edge, stands beside it facing it and eats (`eating.biteRations`
 *     every `eating.biteTicks`, straight from the bush — ./objects.ts `takeFood`) or drinks
 *     (`eating.sipPoints` every `eating.sipTicks`) until full; the bush picked clean turns empty.
 *   - At night (and when sleepless) it lies down where it stands and sleeps (step 1.5): sleep
 *     comes back, and it gets up at dawn, rested, or earlier if hunger or thirst press harder.
 *     Sleep at zero fells it where it stands — a faint, an event of the journal.
 *   - Otherwise it rests `villagers.restTicks`, then walks to a free tile within
 *     `villagers.wanderRadius` of home.
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
import { type Cause, emit } from './events.ts';
import { inside } from './map.ts';
import { findCampSite } from './mapgen.ts';
import { type Choice, canUse, choose } from './minds.ts';
import {
  FULL,
  fullNeeds,
  isSated,
  type Meal,
  NEEDS,
  type Need,
  type PerNeed,
  perNeed,
  satietyPerRation,
} from './needs.ts';
import { findObject, objectAt, takeFood } from './objects.ts';
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

/**
 * Why a villager walks: to stroll near home, because the observer sent it (debug), to eat or to
 * drink (step 1.4).
 */
export type WalkPurpose = 'wander' | 'order' | 'eat' | 'drink';

/** What meets a need (step 1.4): a bush with food — object `object` on its tile — or water. */
export type Source =
  | { kind: 'bush'; object: number; x: number; y: number }
  | { kind: 'water'; x: number; y: number };

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
  /** Picks berries from the bush (object id) beside it and eats them; the next bite at `next`. */
  | { kind: 'eat'; bush: number; next: number }
  /** Drinks from the water tile beside it; the next sip at `next`. */
  | { kind: 'drink'; water: Tile; next: number }
  /**
   * Sleeps on the ground where it stands (step 1.5); `fainted` — fell from want of sleep and
   * lies until `sleeping.faintWakePoints`, deaf to everything; otherwise wakes when the mind
   * prefers anything to sleep (rested by day, or hunger or thirst press harder).
   */
  | { kind: 'sleep'; fainted: boolean };

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

/** Take a villager out of the world (it died). */
export function removeVillager(world: World, id: number): void {
  const list = world.villagers.list;
  const index = list.findIndex((villager) => villager.id === id);
  if (index >= 0) list.splice(index, 1);
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
    needs: fullNeeds(),
    health: FULL,
    ranOut: perNeed(0),
    nowhere: perNeed(0),
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

/** Rest: stand for a while (or `ticks`) before deciding again. */
function rest(world: World, villager: Villager, ticks = restTicks(world)): void {
  villager.action = { kind: 'idle', until: world.tick + ticks };
}

/** Pick a free tile near home and set off; none found — rest a little and try again later. */
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
  rest(world, villager, DATA.balance.villagers.giveWayTicks);
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

/** Does the villager think on this tick? Every `ai.thinkTicks`, each at its own moment. */
function thinksNow(world: World, villager: Villager): boolean {
  return (world.tick + villager.id) % DATA.balance.ai.thinkTicks === 0;
}

/**
 * Set off to meet a need: lie down to sleep where it stands, walk to the spot beside the source,
 * or start at once if there.
 */
function setOff(world: World, villager: Villager, choice: Exclude<Choice, { kind: 'rest' }>): void {
  if (choice.kind === 'sleep') {
    villager.action = { kind: 'sleep', fainted: false };
    return;
  }
  if (choice.path.length === 0) {
    begin(world, villager, choice.source);
    return;
  }
  villager.action = {
    kind: 'walk',
    purpose: choice.kind,
    goal: choice.goal,
    path: choice.path,
    waited: 0,
    source: choice.source,
  };
}

/**
 * Standing beside a source: face it and start eating or drinking. The bush emptied or the
 * spot is not beside it after all — think again on the next tick.
 */
function begin(world: World, villager: Villager, source: Source): void {
  if (!canUse(world, source, villager.x, villager.y)) {
    rest(world, villager, 0);
    return;
  }
  villager.facing = facingOf(source.x - villager.x, source.y - villager.y);
  const { biteTicks, sipTicks } = DATA.balance.eating;
  villager.action =
    source.kind === 'bush'
      ? { kind: 'eat', bush: source.object, next: world.tick + biteTicks }
      : { kind: 'drink', water: { x: source.x, y: source.y }, next: world.tick + sipTicks };
}

/** A meal or a drink is over: rest if the need is met, otherwise think again at once. */
function finish(world: World, villager: Villager, met: boolean): void {
  rest(world, villager, met ? undefined : 0);
}

/**
 * Eating at a bush: a bite every `eating.biteTicks` until full or the bush is bare. A meal is
 * long, so between bites the villager checks whether another need has become more pressing than
 * hunger (thirst — while eating far from the water) and goes to meet it if the mind says so.
 */
function eat(world: World, villager: Villager, action: Extract<VillagerAction, { kind: 'eat' }>) {
  if (world.tick < action.next) return;
  const { biteRations, biteTicks } = DATA.balance.eating;
  const bush = findObject(world.objects, action.bush);
  const taken = bush ? takeFood(bush, biteRations) : 0;
  gain(villager, 'food', taken * satietyPerRation());
  const full = isSated(villager.needs.food, 'food');
  if (full || taken === 0 || !bush || bush.stock <= 0) {
    finish(world, villager, full);
    return;
  }
  action.next = world.tick + biteTicks;
  if (morePressing(villager, 'food')) {
    const choice = choose(world, villager);
    if (choice.kind !== 'rest' && choice.kind !== 'eat') setOff(world, villager, choice);
  }
}

/**
 * Sleeping on the ground. Sleep comes back by itself (./life.ts). A fainted villager lies until
 * `sleeping.faintWakePoints`; one who lay down of its own will thinks now and then, as a resting
 * one does, and gets up when the mind prefers anything else: rest (rested, and it is no longer
 * night), or food or water that press harder than the wish to sleep («wakes if it must»).
 */
function sleep(
  world: World,
  villager: Villager,
  action: Extract<VillagerAction, { kind: 'sleep' }>,
) {
  if (action.fainted) {
    if (villager.needs.sleep >= DATA.balance.sleeping.faintWakePoints) rest(world, villager, 0);
    return;
  }
  if (!thinksNow(world, villager)) return;
  const choice = choose(world, villager);
  if (choice.kind === 'sleep') return;
  if (choice.kind === 'rest') rest(world, villager);
  else setOff(world, villager, choice);
}

/**
 * Sleep ran out: the villager falls where it stands (a faint, GDD §4.2) — an event caused by its
 * sleep running out.
 */
function faint(world: World, villager: Villager): void {
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

/** Is a need other than `current` more pressing than it (its scale lower)? */
function morePressing(villager: Villager, current: Need): boolean {
  return NEEDS.some((need) => need !== current && villager.needs[need] < villager.needs[current]);
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
    finish(world, villager, true);
    return;
  }
  action.next = world.tick + sipTicks;
}

/** A need is met by `amount` points (never above full). */
function gain(villager: Villager, need: Meal, amount: number): void {
  villager.needs[need] = Math.min(FULL, villager.needs[need] + amount);
}

/**
 * A standing villager decides what to do now: eat or drink on, rest on, think (eat, drink or
 * stroll), take the next step of its path, wait for the way to clear. Returns true if a new
 * step started.
 */
function decide(world: World, villager: Villager): boolean {
  if (villager.needs.sleep <= 0 && villager.action.kind !== 'sleep') faint(world, villager);
  const action = villager.action;
  if (action.kind === 'sleep') {
    sleep(world, villager, action);
    return false;
  }
  if (action.kind === 'eat') {
    eat(world, villager, action);
    return false;
  }
  if (action.kind === 'drink') {
    drink(world, villager, action);
    return false;
  }
  if (action.kind === 'idle') {
    const rested = world.tick >= action.until;
    if (!rested && !thinksNow(world, villager)) return false;
    const choice = choose(world, villager);
    if (choice.kind === 'rest') {
      if (!rested) return false;
      wander(world, villager);
    } else {
      setOff(world, villager, choice);
    }
    if (villager.action.kind !== 'walk') return false;
  }
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

/** At the end of a walk: eat or drink if that was the point, otherwise rest. */
function arrive(world: World, villager: Villager, walk: Extract<VillagerAction, { kind: 'walk' }>) {
  if (walk.source) begin(world, villager, walk.source);
  else rest(world, villager);
}

/** A new path to the same goal around the others; none — give up and stand. */
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
