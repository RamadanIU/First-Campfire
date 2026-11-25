/**
 * The mind of a villager, level 1 of GDD §2.3 (steps 1.4–1.8): what to do now — rest and stroll
 * near home, sleep, eat, drink, work — and how firmly to hold on to what it has begun.
 *
 *   - Every activity is a description (`ACTIVITY`): the need behind it, its utility, how its plan
 *     holds on, and the plan itself — a few steps («walk to the branches → pick them up → gather
 *     more → carry them to the pile → put them down»). ./villagers.ts carries the plans out.
 *   - Utility = need × availability × character × context (GDD §2.3): the need is urgency²
 *     (./needs.ts — 1 when the scale is at zero), squared so that the slightly hungry stay put and
 *     the very hungry drop everything; availability is 1 next to the source and ½ on a path of
 *     `ai.halfAvailabilityTiles` tiles of grass — nearer sources win; character is 1 for everyone
 *     until traits come (stage 2); context — the phase of the day for sleep. Rest has a constant
 *     utility, `ai.restUtility`; work — `ai.haulUtility`.
 *   - A little randomness keeps the two from acting like robots: every option's utility is
 *     multiplied by 1 ± `ai.jitterPercent` %, one draw per option from the stream `minds`, always
 *     the same number of draws whatever is chosen.
 *   - Finding a source costs a search of the map (./path.ts `findNearest`), so an activity is
 *     looked into only if its best possible utility (availability 1) could beat the best found so
 *     far — a fed villager never searches at all — and only as far as a source could still win
 *     (`reachFor`). A search in vain (nothing anywhere, or nothing near enough) is not repeated for
 *     `ai.retryTicks` (work — `ai.workRetryTicks`): needs change slowly.
 *   - Precaution: before a trip, if another need would fall below `ai.reservePoints` by the time
 *     the villager is back (there and back, plus the meal) and there is room to top it up, that
 *     need is met first — one drinks before walking far for berries.
 *   - Hysteresis (step 1.8): a villager thinks over its plan every `ai.thinkTicks` whatever it is
 *     doing (`reconsider`). A begun meal, drink or work (`firm`) is broken off only for an option
 *     better than its hold by `ai.keepMargin` — the hold is the utility it was chosen with, or its
 *     need now if that grew: the slightly hungry carry their load home, the very hungry drop it
 *     (it stays on the ground) and go to eat. Sleep holds on by the wish to sleep now plus a little
 *     (`ai.sleepHold`); rest gives way to anything better; the observer's order is not thought
 *     over.
 *   - Every decision goes to the villager's journal of decisions (`Decision`, the last
 *     `ai.logSize`): the options with their scores, the plan given up and the bar it set — any act
 *     can be explained by it (the debug view `debug=mind`).
 *
 * Work (step 1.7): carrying things lying loose to the pile at the camp — `ai.haulUtility` ×
 * availability of the nearest loose item whose resource has room in the pile. It beats rest, so
 * free time goes to work, and loses to a pressing need. The need of wood (step 1.9) makes it worth
 * more while the pile holds less than `fire.woodReserve` branches. In the cold (step 1.10) one does
 * not go farther for work than one's warmth lasts there and back (`coldReach`).
 *
 * The fire (step 1.9, ./fire.ts): `kindle` — light it when it does not burn and the pile holds
 * branches enough (worth more than work); `stoke` — feed it, the more urgent the less wood is left
 * in it, more so in the evening (it has to last the night); one villager at a time tends it. Both
 * take wood from the pile, carry it to the fire and put it in; in the evening the fire is fed to
 * last the night. `sit` — in the evening sit at the
 * burning fire, facing it (leisure: a begun meal, drink or work is not broken off for it, and
 * work that would last into the evening is worth less, `fire.eveningWork`); at night sleep wins, and one goes to sleep beside the fire (the step
 * `bed` of the plan of sleep — if the hearth is near enough, else where one stands).
 *
 * Where: food is a bush (an object with `harvest` in data/objects.json) that still has some, and
 * the villager stands on a tile beside it — on one of its four sides, facing it; water is drunk
 * from a tile beside the water, the same way. The spot must be free of other villagers and not
 * the goal another one is walking to.
 */
import { DATA } from '../data/index.ts';
import { calendarAt, PHASE_START } from './calendar.ts';
import {
  eveningStart,
  fireRoom,
  fuelTillMorning,
  hearthOf,
  isBurning,
  isEvening,
  isEveningOrNight,
  knowsFire,
  tendedByOther,
  WOOD,
} from './fire.ts';
import {
  type Item,
  inPile,
  inStore,
  isFood,
  isPileTile,
  itemAt,
  keeps,
  pileHasRoom,
  pileTiles,
  stackOf,
} from './items.ts';
import { inside, isWater } from './map.ts';
import { believedFood, believesFood, searchFrontier } from './memory.ts';
import {
  FULL,
  fallPerTick,
  isSated,
  type Meal,
  type Need,
  portionOf,
  portionTicks,
  urgency,
  warmthPerTick,
} from './needs.ts';
import { defOf, hasFood, type MapObject, objectAt } from './objects.ts';
import { DIAGONAL, findNearest, findPath, leastCost, type Tile, tileSpeed } from './path.ts';
import { floatRange } from './rng.ts';
import { isGoalOfAnother, isTaken, type Source, type Villager } from './villagers.ts';
import { airTemperature, isRaining } from './weather.ts';
import type { World } from './world.ts';

/** The four sides of a tile, in a fixed order: north, east, south, west. */
const SIDES: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Where to go to meet a need: the source, the spot beside it and the way there. */
export interface Found {
  source: Source;
  /** The tile to stand on. */
  goal: Tile;
  /** Tiles to step on to get there; empty if the villager stands there already. */
  path: Tile[];
  /** Cost of the way, tiles of grass. */
  cost: number;
}

/**
 * What meets a need on the tile beside (x, y), if anything: a bush with food (`food` — of these
 * only), the water.
 */
function sourceBeside(
  world: World,
  need: Meal,
  x: number,
  y: number,
  food: (object: MapObject) => boolean,
): Source | null {
  const { map, objects } = world;
  for (const [dx, dy] of SIDES) {
    const sx = x + dx;
    const sy = y + dy;
    if (!inside(map, sx, sy)) continue;
    if (need === 'water') {
      if (isWater(map, sx, sy)) return { kind: 'water', x: sx, y: sy };
      continue;
    }
    const object = objectAt(map, objects, sx, sy);
    if (object && food(object)) {
      return { kind: 'bush', object: object.id, x: sx, y: sy };
    }
  }
  return null;
}

/**
 * Up to how many bushes a search heads for them (A*, ./path.ts `towards`); more — it floods the map
 * in rings (each step of A* weighs every side of every bush).
 */
const TOWARDS_MOST = 12;

/** The tiles beside `bushes` (their four sides inside the map). */
function sidesOf(world: World, bushes: readonly MapObject[]): Tile[] {
  const tiles: Tile[] = [];
  for (const object of bushes) {
    for (const [dx, dy] of SIDES) {
      const x = object.x + dx;
      const y = object.y + dy;
      if (inside(world.map, x, y)) tiles.push({ x, y });
    }
  }
  return tiles;
}

/** Marks of tiles beside a bush with food, reused by every search (not part of the world). */
let marks: { size: number; stamp: number; at: Uint32Array } | null = null;

/**
 * A fast «is a source beside (x, y)?» for one search — it is asked of every tile the search
 * looks at. Water: the four sides by the ground's code. Food: the sides of every bush in `bushes`
 * are marked once, before the search (a map has a couple of dozen bushes).
 */
function besideTest(
  world: World,
  need: Meal,
  bushes: readonly MapObject[],
): (x: number, y: number) => boolean {
  const { map } = world;
  const { width, height } = map;
  if (need === 'water') {
    const wet = map.groundTypes.map((id) => !DATA.terrain.get(id).walkable);
    const ground = map.ground;
    return (x, y) =>
      (y > 0 && wet[ground[(y - 1) * width + x]!]!) ||
      (x < width - 1 && wet[ground[y * width + x + 1]!]!) ||
      (y < height - 1 && wet[ground[(y + 1) * width + x]!]!) ||
      (x > 0 && wet[ground[y * width + x - 1]!]!);
  }
  const size = width * height;
  if (marks === null || marks.size !== size || marks.stamp >= 0xfffffff0) {
    marks = { size, stamp: 0, at: new Uint32Array(size) };
  }
  marks.stamp += 1;
  const { stamp, at } = marks;
  for (const object of bushes) {
    for (const [dx, dy] of SIDES) {
      const x = object.x + dx;
      const y = object.y + dy;
      if (inside(map, x, y)) at[y * width + x] = stamp;
    }
  }
  return (x, y) => at[y * width + x] === stamp;
}

export interface FindOptions {
  /**
   * Keep clear of the other villagers (their tiles and the goals they walk to) — for a real
   * trip; without it — could the source be reached at all (a death's «was food in reach?»).
   */
  others?: boolean;
  /** Do not look farther than this, tiles of grass: a source beyond would be of no use. */
  maxCost?: number;
  /**
   * Food the villager knows of only (step 1.11b, ./memory.ts — it believes there is some on it), the
   * default; false — any bush that has food (the truth: a death's «was food in reach?»).
   */
  known?: boolean;
  /** Of the food objects, only these (step 1.11b: picking food to store — what keeps). */
  only?: (object: MapObject) => boolean;
}

/** A search for a source: found, nowhere in reach at all, or not within `maxCost`. */
export type SourceSearch = ({ ok: true } & Found) | { ok: false; reason: 'nowhere' | 'too_far' };

/** The nearest place by path where `villager` can meet `need`. */
export function searchSource(
  world: World,
  villager: Villager,
  need: Meal,
  { others = true, maxCost, known = true, only }: FindOptions = {},
): SourceSearch {
  const from = { x: villager.x, y: villager.y };
  // What it knows (a bush believed full may turn out picked by another: one sees it on the way,
  // ./villagers.ts), or the truth.
  const { season } = calendarAt(world.tick);
  const truth = known
    ? (object: MapObject) => believesFood(world, villager, object)
    : (object: MapObject) => hasFood(object, season);
  const food = only ? (object: MapObject) => truth(object) && only(object) : truth;
  const bushes =
    need === 'water'
      ? []
      : (known ? believedFood(world, villager) : world.objects.list).filter(food);
  // No food known at all: nothing to search for.
  if (need === 'food' && bushes.length === 0) return { ok: false, reason: 'nowhere' };
  const beside = besideTest(world, need, bushes);
  // A few bushes known (step 1.11b): head for them rather than flood the map.
  const towards = need === 'food' && bushes.length <= TOWARDS_MOST ? sidesOf(world, bushes) : null;
  const result = findNearest(
    world.map,
    world.objects,
    from,
    (x, y) => {
      if (!beside(x, y)) return false;
      return !(
        others &&
        (isTaken(world, x, y, villager) || isGoalOfAnother(world, { x, y }, villager))
      );
    },
    {
      ...(others ? { avoid: (x: number, y: number) => isTaken(world, x, y, villager) } : {}),
      ...(maxCost === undefined ? {} : { maxCost }),
      ...(towards === null ? {} : { towards }),
    },
  );
  if (!result.ok)
    return {
      ok: false,
      reason: result.reason === 'too_far' ? 'too_far' : 'nowhere',
    };
  const source = sourceBeside(world, need, result.tile.x, result.tile.y, food)!;
  return {
    ok: true,
    source,
    goal: result.tile,
    path: result.path,
    cost: result.cost,
  };
}

/** The nearest place by path where `villager` can meet `need`, or null if there is none. */
export function findSource(
  world: World,
  villager: Villager,
  need: Meal,
  options: FindOptions = {},
): Found | null {
  const search = searchSource(world, villager, need, options);
  if (!search.ok) return null;
  const { ok: _, ...found } = search;
  return found;
}

/**
 * The nearest stack of food in the store at the camp (step 1.11b) that `villager` can eat from:
 * it stands on its tile; nobody else stands there or walks there. Null — none within `maxCost`.
 */
export function searchStore(world: World, villager: Villager, maxCost?: number): Found | null {
  const { width } = world.map;
  const stacks = new Map<number, Item>();
  for (const item of world.items.list) {
    if (item.place !== 'pile' || !isFood(item.resource)) continue;
    if (isTaken(world, item.x, item.y, villager)) continue;
    if (isGoalOfAnother(world, { x: item.x, y: item.y }, villager)) continue;
    stacks.set(item.y * width + item.x, item);
  }
  if (stacks.size === 0) return null;
  const result = findNearest(
    world.map,
    world.objects,
    { x: villager.x, y: villager.y },
    (x, y) => stacks.has(y * width + x),
    {
      avoid: (x: number, y: number) => isTaken(world, x, y, villager),
      ...(maxCost === undefined ? {} : { maxCost }),
      towards: [...stacks.values()],
    },
  );
  if (!result.ok) return null;
  const item = stacks.get(result.tile.y * width + result.tile.x)!;
  return {
    source: {
      kind: 'store',
      item: item.id,
      resource: item.resource,
      x: item.x,
      y: item.y,
    },
    goal: result.tile,
    path: result.path,
    cost: result.cost,
  };
}

/**
 * Where `villager` goes to eat (step 1.11b): the nearest bush it knows to have food; the store at
 * the camp in winter if it is nearer (it is by the fire), and in any season when no bush with food
 * is known at all — food is stored for the winter, it is not eaten while bushes bear.
 */
export function searchFood(world: World, villager: Villager, maxCost?: number): SourceSearch {
  const bush = searchSource(world, villager, 'food', maxCost === undefined ? {} : { maxCost });
  const winter = calendarAt(world.tick).season === 'winter';
  if (!winter && (bush.ok || bush.reason === 'too_far')) return bush;
  const reach = bush.ok ? Math.min(maxCost ?? Number.POSITIVE_INFINITY, bush.cost) : maxCost;
  const store = searchStore(world, villager, reach);
  if (store && (!bush.ok || store.cost < bush.cost)) return { ok: true, ...store };
  return bush;
}

/**
 * Is the source still there for a villager standing on (x, y): beside it, with food left; on the
 * item's tile, the item still lying loose there; on the tile of the pile; on the tile of the pile's
 * stack of wood, the stack still there; on its spot by the fire; beside the fire.
 */
export function canUse(world: World, source: Source, x: number, y: number): boolean {
  if (source.kind === 'item') {
    const item = itemAt(world, x, y);
    return source.x === x && source.y === y && item?.id === source.item && item.place === 'ground';
  }
  if (source.kind === 'pile') return source.x === x && source.y === y;
  if (source.kind === 'store') {
    const item = itemAt(world, x, y);
    return source.x === x && source.y === y && item?.id === source.item && item.place === 'pile';
  }
  if (source.kind === 'spot') return source.x === x && source.y === y;
  if (Math.abs(source.x - x) + Math.abs(source.y - y) !== 1) return false;
  if (source.kind === 'fire') return world.camp.x === source.x && world.camp.y === source.y;
  if (source.kind === 'water') return isWater(world.map, source.x, source.y);
  const object = objectAt(world.map, world.objects, source.x, source.y);
  return (
    object !== undefined &&
    object.id === source.object &&
    hasFood(object, calendarAt(world.tick).season)
  );
}

/** Marks of tiles with loose items to carry, reused by every search (not part of the world). */
let looseMarks: { size: number; stamp: number; at: Uint32Array } | null = null;

export interface LooseOptions {
  /** Only items of this resource (gathering an armful); otherwise any with room in the pile. */
  resource?: string;
  /** Do not look farther than this, tiles of grass. */
  maxCost?: number;
}

/** Does anything lie loose on the ground that the pile has room for? */
export function anyLoose(world: World): boolean {
  const room = new Map<string, boolean>();
  for (const item of world.items.list) {
    if (item.place !== 'ground') continue;
    let fits = room.get(item.resource);
    if (fits === undefined) {
      fits = pileHasRoom(world, item.resource);
      room.set(item.resource, fits);
    }
    if (fits) return true;
  }
  return false;
}

/**
 * The nearest loose item (lying on the ground, not in the pile) that `villager` could carry to the
 * pile: its resource has room there, nobody else stands on it or walks to it. The villager stands
 * on the item's tile to pick it up. Null — none within reach.
 */
export function searchLoose(
  world: World,
  villager: Villager,
  { resource, maxCost }: LooseOptions = {},
): Found | null {
  const { map } = world;
  const size = map.width * map.height;
  if (looseMarks === null || looseMarks.size !== size || looseMarks.stamp >= 0xfffffff0) {
    looseMarks = { size, stamp: 0, at: new Uint32Array(size) };
  }
  looseMarks.stamp += 1;
  const { stamp, at } = looseMarks;
  const room = new Map<string, boolean>();
  let any = false;
  for (const item of world.items.list) {
    if (item.place !== 'ground') continue;
    if (resource !== undefined && item.resource !== resource) continue;
    let fits = room.get(item.resource);
    if (fits === undefined) {
      fits = pileHasRoom(world, item.resource);
      room.set(item.resource, fits);
    }
    if (!fits) continue;
    at[item.y * map.width + item.x] = stamp;
    any = true;
  }
  if (!any) return null;
  const result = findNearest(
    world.map,
    world.objects,
    { x: villager.x, y: villager.y },
    (x, y) =>
      at[y * map.width + x] === stamp &&
      !isTaken(world, x, y, villager) &&
      !isGoalOfAnother(world, { x, y }, villager),
    {
      avoid: (x: number, y: number) => isTaken(world, x, y, villager),
      ...(maxCost === undefined ? {} : { maxCost }),
    },
  );
  if (!result.ok) return null;
  const item = itemAt(world, result.tile.x, result.tile.y) as Item;
  return {
    source: {
      kind: 'item',
      item: item.id,
      resource: item.resource,
      x: item.x,
      y: item.y,
    },
    goal: result.tile,
    path: result.path,
    cost: result.cost,
  };
}

/**
 * A stack of wood in the pile (step 1.9) that `villager` can take some from — the last one in the
 * order the pile fills (./items.ts `pileTiles`): a begun stack is used up first and the pile shrinks
 * from its edge, its middle stays full. Nobody else stands on it or walks to it. Null — none, or
 * not within `maxCost`.
 */
export function searchWood(world: World, villager: Villager, maxCost?: number): Found | null {
  const tiles = pileTiles(world);
  let target: Item | undefined;
  for (let i = tiles.length - 1; i >= 0 && !target; i--) {
    const { x, y } = tiles[i]!;
    const item = itemAt(world, x, y);
    if (item?.place !== 'pile' || item.resource !== WOOD) continue;
    if (isTaken(world, x, y, villager) || isGoalOfAnother(world, { x, y }, villager)) continue;
    target = item;
  }
  if (!target) return null;
  const item = target;
  const from = { x: villager.x, y: villager.y };
  if (maxCost !== undefined && leastCost(from, item) > maxCost) return null;
  const result = findPath(world.map, world.objects, from, item, {
    avoid: (x: number, y: number) => isTaken(world, x, y, villager),
  });
  if (!result.ok || (maxCost !== undefined && result.cost > maxCost)) return null;
  return {
    source: {
      kind: 'store',
      item: item.id,
      resource: item.resource,
      x: item.x,
      y: item.y,
    },
    goal: { x: item.x, y: item.y },
    path: result.path,
    cost: result.cost,
  };
}

/**
 * The nearest free tile beside the fire for `villager` to stand on and put wood in (one of its four
 * sides). Null — none within `maxCost`.
 */
export function searchFireSide(world: World, villager: Villager, maxCost?: number): Found | null {
  const { camp } = world;
  const result = findNearest(
    world.map,
    world.objects,
    { x: villager.x, y: villager.y },
    (x, y) =>
      Math.abs(x - camp.x) + Math.abs(y - camp.y) === 1 &&
      objectAt(world.map, world.objects, x, y) === undefined &&
      !isTaken(world, x, y, villager) &&
      !isGoalOfAnother(world, { x, y }, villager),
    {
      avoid: (x: number, y: number) => isTaken(world, x, y, villager),
      ...(maxCost === undefined ? {} : { maxCost }),
      towards: SIDES.map(([dx, dy]) => ({ x: camp.x + dx, y: camp.y + dy })),
    },
  );
  if (!result.ok) return null;
  return {
    source: { kind: 'fire', x: camp.x, y: camp.y },
    goal: result.tile,
    path: result.path,
    cost: result.cost,
  };
}

/**
 * Is (x, y) a place to sit or sleep at the fire within `ring` tiles of it (`ring` 0 — only straight
 * to its left and right, the best places): to its side (not straight above or below it — one sits
 * facing the fire sideways), bare, not the pile, nobody there or walking there.
 */
function isSeat(world: World, villager: Villager, x: number, y: number, ring: number): boolean {
  const { camp, map, objects } = world;
  const dx = x - camp.x;
  const dy = y - camp.y;
  // The far ring is round (step 1.11b): its corners are too far from the fire to warm one up in a
  // frost — one sitting there to warm up froze.
  const near =
    ring === 0
      ? Math.abs(dx) === 1 && dy === 0
      : Math.max(Math.abs(dx), Math.abs(dy)) <= ring &&
        (ring === 1 || dx * dx + dy * dy <= ring * ring);
  return (
    dx !== 0 &&
    near &&
    tileSpeed(map, objects, x, y) > 0 &&
    objectAt(map, objects, x, y) === undefined &&
    !isPileTile(world, x, y) &&
    !isTaken(world, x, y, villager) &&
    !isGoalOfAnother(world, { x, y }, villager)
  );
}

/**
 * A place by the fire for `villager` to sit or sleep (step 1.9): the nearest by path of the two
 * straight to its left and right (the two face each other across the fire), else of the tiles next
 * to it, else within `fire.nearTiles`. Null — none within `maxCost`.
 */
export function searchSeat(world: World, villager: Villager, maxCost?: number): Found | null {
  const from = { x: villager.x, y: villager.y };
  const { nearTiles } = DATA.balance.fire;
  // No seat is nearer than the fire less its ring: too far — no search.
  if (maxCost !== undefined && leastCost(from, world.camp) - nearTiles * DIAGONAL > maxCost) {
    return null;
  }
  for (const ring of [0, 1, nearTiles]) {
    // The places of the ring (step 1.11b): the search heads for them instead of flooding the map.
    const seats: Tile[] = [];
    for (let y = world.camp.y - ring - 1; y <= world.camp.y + ring + 1; y++) {
      for (let x = world.camp.x - ring - 1; x <= world.camp.x + ring + 1; x++) {
        if (inside(world.map, x, y) && isSeat(world, villager, x, y, ring)) seats.push({ x, y });
      }
    }
    if (seats.length === 0) continue;
    const result = findNearest(
      world.map,
      world.objects,
      from,
      (x, y) => isSeat(world, villager, x, y, ring),
      {
        avoid: (x: number, y: number) => isTaken(world, x, y, villager),
        ...(maxCost === undefined ? {} : { maxCost }),
        towards: seats,
      },
    );
    if (result.ok) {
      return {
        source: { kind: 'spot', x: result.tile.x, y: result.tile.y },
        goal: result.tile,
        path: result.path,
        cost: result.cost,
      };
    }
  }
  return null;
}

/** Availability of a source `cost` tiles of grass away: 1 beside it, ½ at the half distance. */
export function availability(cost: number): number {
  const half = DATA.balance.ai.halfAvailabilityTiles;
  return half / (half + cost);
}

/**
 * The farthest a source may be for an option of upper bound `ceiling` to beat `best`: beyond it
 * `ceiling × availability(cost)` is no more than `best` (the inverse of `availability`).
 */
export function reachFor(ceiling: number, best: number): number {
  return DATA.balance.ai.halfAvailabilityTiles * (ceiling / best - 1);
}

/** What a villager can set itself to do: every plan is one of these (step 1.8). */
export type Activity =
  | 'rest'
  | 'sleep'
  | 'eat'
  | 'drink'
  | 'haul'
  | 'kindle'
  | 'stoke'
  | 'sit'
  | 'warm'
  | 'scout'
  | 'store'
  | 'order';

/**
 * Activities at the fire (step 1.9; `warm` — step 1.10): they need no search of the map for a
 * source of a need.
 */
export type FireActivity = 'kindle' | 'stoke' | 'sit' | 'warm';

/** Activities met at a source one walks to (step 1.4). */
export type ActivityId = 'eat' | 'drink';

/** A trip that may be put off for another need first (precaution): to eat, to drink, to scout. */
export type Ahead = ActivityId | 'scout';

/** Activities the mind weighs (the observer's order is given, not chosen). */
export type Option = Exclude<Activity, 'order'>;

/**
 * A step of a plan (./villagers.ts carries them out): `stand` — rest standing a while; `stroll` —
 * walk to a free tile near home; `sleep` — on the ground; `go` — walk to the source of the plan
 * (the bush, the water, the observer's tile); `eat`, `drink` — beside it till full; `fetch` — walk
 * to an item lying loose; `pick_up`; `gather` — more of it near and the hands not full: `fetch`
 * and `pick_up` again; `carry` — walk to the pile; `put_down` — into the pile (what does not fit
 * is carried on). The fire (step 1.9): `fetch_wood` — walk to a stack of wood in the pile; `take` —
 * take as much as the fire takes; `to_fire` — walk to its side; `kindle` — light it; `stoke` — put
 * the wood in; `sit` — walk to a place by it and sit, facing it; `bed` — walk to a place by it to
 * sleep (if it is near enough; else sleep where one stands). The store (step 1.11b): `pick` — pick
 * food from the bush beside into the hands (`gather` then goes on to another bush near).
 */
export type PlanStep =
  | 'stand'
  | 'stroll'
  | 'sleep'
  | 'go'
  | 'eat'
  | 'drink'
  | 'fetch'
  | 'pick_up'
  | 'gather'
  | 'carry'
  | 'put_down'
  | 'fetch_wood'
  | 'take'
  | 'to_fire'
  | 'kindle'
  | 'stoke'
  | 'sit'
  | 'bed'
  | 'pick';

/**
 * How a begun plan holds on (hysteresis): `firm` — broken off only for an option better than its
 * hold (its utility when chosen, or now if that grew) by `ai.keepMargin`; `fresh` — held by what it
 * is worth now plus a little, `ai.sleepHold` (the wish to sleep fades towards morning: one gets up
 * rested; a pressing need wakes one at night);
 * `loose` — gives way to anything better (rest, the default plan); `fixed` — not thought over at
 * all (the observer's order).
 */
export type Hold = 'firm' | 'fresh' | 'loose' | 'fixed';

/** The description of an activity: its need, its utility, how it holds on and its plan. */
export interface ActivityDef {
  readonly id: Activity;
  /** The need it meets, if any. */
  readonly need: Need | null;
  /**
   * Need × character × context, before availability and the jitter: the upper bound of its
   * utility (null — never weighed: the order).
   */
  readonly utility: ((world: World, villager: Villager) => number) | null;
  readonly hold: Hold;
  /** Its plan, the steps in order (`gather` may repeat `fetch` and `pick_up`, rest loops). */
  readonly steps: readonly PlanStep[];
}

/** The need factor of a meal: urgency², 1 when the scale is at zero (GDD §2.3: the square). */
function pressingOf(need: Meal): (world: World, villager: Villager) => number {
  return (_world, villager) => {
    const pressing = urgency(villager.needs[need]);
    return pressing * pressing;
  };
}

/** Every activity, described. */
export const ACTIVITY: Readonly<Record<Activity, ActivityDef>> = {
  rest: {
    id: 'rest',
    need: null,
    utility: () => DATA.balance.ai.restUtility,
    hold: 'loose',
    steps: ['stand', 'stroll'],
  },
  sleep: {
    id: 'sleep',
    need: 'sleep',
    utility: (world, villager) => sleepWish(world, villager),
    hold: 'fresh',
    steps: ['bed', 'sleep'],
  },
  eat: {
    id: 'eat',
    need: 'food',
    utility: pressingOf('food'),
    hold: 'firm',
    steps: ['go', 'eat'],
  },
  drink: {
    id: 'drink',
    need: 'water',
    utility: pressingOf('water'),
    hold: 'firm',
    steps: ['go', 'drink'],
  },
  haul: {
    id: 'haul',
    need: null,
    utility: (world) => DATA.balance.ai.haulUtility * woodNeed(world),
    hold: 'firm',
    steps: ['fetch', 'pick_up', 'gather', 'carry', 'put_down'],
  },
  kindle: {
    id: 'kindle',
    need: null,
    utility: (world, villager) => kindleWorth(world, villager),
    hold: 'firm',
    steps: ['fetch_wood', 'take', 'to_fire', 'kindle'],
  },
  stoke: {
    id: 'stoke',
    need: null,
    utility: (world, villager) => stokeWorth(world, villager),
    hold: 'firm',
    steps: ['fetch_wood', 'take', 'to_fire', 'stoke'],
  },
  sit: {
    id: 'sit',
    need: null,
    utility: (world, villager) => sitWorth(world, villager),
    hold: 'fresh',
    steps: ['go', 'sit'],
  },
  warm: {
    id: 'warm',
    need: 'warmth',
    utility: (world, villager) => warmWorth(world, villager),
    hold: 'fresh',
    steps: ['go', 'sit'],
  },
  scout: {
    id: 'scout',
    need: 'food',
    utility: (world, villager) => pressingOf('food')(world, villager) * DATA.balance.ai.scoutFactor,
    hold: 'firm',
    steps: ['go'],
  },
  store: {
    id: 'store',
    need: null,
    utility: (world) => storeWorth(world),
    hold: 'firm',
    steps: ['go', 'pick', 'gather', 'carry', 'put_down'],
  },
  order: {
    id: 'order',
    need: null,
    utility: null,
    hold: 'fixed',
    steps: ['go'],
  },
};

/**
 * The context of work (step 1.9): the need of wood — 1 while the pile holds `fire.woodReserve`
 * branches or more, up to 1 + `fire.woodBoost` when it is empty (and the people know fire).
 */
export function woodNeed(world: World): number {
  const { woodReserve, woodBoost } = DATA.balance.fire;
  if (!knowsFire(world) || woodReserve <= 0) return 1;
  const shortage = Math.max(0, 1 - inPile(world, WOOD) / woodReserve);
  return 1 + woodBoost * shortage;
}

/**
 * The evening context of work (step 1.9): `fire.eveningWork` for a trip that would end in the
 * evening or at night (now, plus there and back by the way found, plus `busy` ticks there — step
 * 1.11b) once there is a hearth — one does
 * not set off for branches late in the day, one sits at the fire; else 1.
 */
export function eveningWork(world: World, cost: number, busy = 0): number {
  // Step 1.10: a hearth the rain put out does not keep one working into the night either.
  if (!hearthOf(world)) return 1;
  const away = Math.ceil(2 * cost * DATA.balance.movement.walkTicksPerTile + busy);
  // Back in the evening or at night — or after it (step 1.11b: a trip that takes the whole night).
  const late =
    isEveningOrNight(world.tick + away) ||
    isEvening(world.tick) ||
    (!isEveningOrNight(world.tick) && away >= untilEvening(world.tick));
  return late ? DATA.balance.fire.eveningWork : 1;
}

/**
 * The context of a meal or a drink (step 1.10), unless the need presses (the scale at
 * `ai.reservePoints` or below — then one goes all the same, and wakes at night for it; step 1.11b:
 * but a far trip into the night waits for the morning until the scale is below half the reserve):
 *   - in the cold, a trip too long for even full warmth to last there and back is worth nothing —
 *     it waits for a warmer day (satiety lasts weeks);
 *   - a trip that would end in the evening or at night is worth less, as work is (`eveningWork`):
 *     with winter food far away, a late trip would cost the night's sleep by the fire; one farther
 *     than `fire.sleepWalkTiles` is worth nothing (step 1.11b) — it waits for the morning.
 */
export function mealContext(world: World, villager: Villager, need: Meal, cost: number): number {
  const { reservePoints } = DATA.balance.ai;
  const now = villager.needs[need];
  // Below half the reserve: one goes whatever the hour and the weather.
  if (now <= reservePoints / 2) return 1;
  // The meal itself takes time too (step 1.11b).
  const late = lateTrip(world, cost, fillTicks(need, villager));
  // Pressing (the reserve or below): a far trip into the night waits for the morning (step 1.11b:
  // satiety lasts weeks, a night costs a point), anything else goes ahead.
  if (now <= reservePoints) return late === 0 ? 0 : 1;
  const loss = -warmthPerTick(airTemperature(world));
  if (loss > 0) {
    const longest = (FULL - reservePoints) / loss;
    if (2 * cost * DATA.balance.movement.walkTicksPerTile > longest) return 0;
  }
  return late;
}

/**
 * The evening context of a trip that is no work for the camp (step 1.11b: a meal, scouting, storing):
 * as `eveningWork` (`busy` — ticks spent there), but a trip farther than `fire.sleepWalkTiles` that
 * would run into the night (there, `busy` there and back by nightfall) is worth nothing — it waits
 * for the morning. One who knew only a far bush set off late and walked back to the fire all night.
 */
export function lateTrip(world: World, cost: number, busy: number): number {
  if (hearthOf(world) && cost > DATA.balance.fire.sleepWalkTiles) {
    const { tickOfDay } = calendarAt(world.tick);
    const away = 2 * cost * DATA.balance.movement.walkTicksPerTile + busy;
    if (tickOfDay >= PHASE_START.night || tickOfDay + away > PHASE_START.night) return 0;
  }
  return eveningWork(world, cost, busy);
}

/**
 * Store food for the winter (step 1.11b): `stores.utility` × how much the store lacks of
 * `stores.reserveRations` (a unit of food — `eating.biteRations` rations); 0 when it holds as much.
 */
export function storeWorth(world: World): number {
  const { reserveRations, utility } = DATA.balance.stores;
  if (reserveRations <= 0) return 0;
  const stored = inStore(world) * DATA.balance.eating.biteRations;
  return utility * Math.max(0, 1 - stored / reserveRations);
}

/**
 * The nearest food `villager` knows of that is worth storing (step 1.11b): it keeps
 * (`stores.keepDays`, ./items.ts `keeps`) and the store has room for it. Null — none within
 * `maxCost`.
 */
export function searchPick(world: World, villager: Villager, maxCost?: number): Found | null {
  const search = pickSearch(world, villager, maxCost);
  if (!search.ok) return null;
  const { ok: _, ...found } = search;
  return found;
}

/** `searchPick` with why nothing was found: no such food known at all, or none near enough. */
function pickSearch(world: World, villager: Villager, maxCost?: number): SourceSearch {
  const only = (object: MapObject) => {
    const food = defOf(object).harvest?.food;
    return food !== undefined && keeps(food) && pileHasRoom(world, food);
  };
  return searchSource(world, villager, 'food', {
    only,
    ...(maxCost === undefined ? {} : { maxCost }),
  });
}

/**
 * Could food that keeps be on bushes now (step 1.11b): the season is one of the harvest seasons of
 * an object whose food keeps — in autumn and winter hazel bears nuts.
 */
function storableInSeason(world: World): boolean {
  const { season } = calendarAt(world.tick);
  for (const def of DATA.objects.records) {
    const harvest = def.harvest;
    if (harvest === null || !keeps(harvest.food)) continue;
    if ((harvest.seasons as readonly string[]).includes(season)) return true;
  }
  return false;
}

/**
 * Light the fire (step 1.9): `fire.kindleUtility` when it does not burn, the pile holds
 * `fire.kindleBranches` and nobody else tends it; else 0.
 */
export function kindleWorth(world: World, villager: Villager): number {
  const { kindleBranches, kindleUtility } = DATA.balance.fire;
  if (!knowsFire(world) || isBurning(world) || tendedByOther(world, villager)) return 0;
  // Step 1.10: wet wood does not catch in the rain; a cold villager wants the fire more.
  if (isRaining(world)) return 0;
  const cold = urgency(villager.needs.warmth);
  return inPile(world, WOOD) >= kindleBranches ? kindleUtility + cold * cold : 0;
}

/**
 * Feed the fire (step 1.9): `fire.stokeUtility` × (1 − fuel / max)² — the less wood is left, the
 * more urgent; in the evening, if what is left will not last till the morning, at least
 * `fire.eveningStoke`. Only when it burns, takes an armful more, the pile has wood and nobody else
 * tends it; else 0.
 */
export function stokeWorth(world: World, villager: Villager): number {
  const { maxFuel, stokeUtility, eveningStoke } = DATA.balance.fire;
  if (!isBurning(world) || fireRoom(world) < 1 || tendedByOther(world, villager)) return 0;
  if (inPile(world, WOOD) < 1) return 0;
  const { fuel } = world.fire;
  const empty = 1 - fuel / maxFuel;
  const worth = stokeUtility * empty * empty;
  const short = isEvening(world.tick) && fuel < fuelTillMorning(world);
  return short ? Math.max(worth, eveningStoke) : worth;
}

/**
 * Sit at the fire (step 1.9): `fire.sitUtility` in the evening and at night while it burns; else 0.
 * It is leisure: to one busy with a begun meal, drink or work (a firm plan) it is worth nothing.
 */
export function sitWorth(world: World, villager: Villager): number {
  if (ACTIVITY[villager.plan.activity].hold === 'firm') return 0;
  return isBurning(world) && isEveningOrNight(world.tick) ? DATA.balance.fire.sitUtility : 0;
}

/**
 * Warm oneself at the fire (step 1.10): the need of warmth — urgency², 1 at zero — while the fire
 * burns; else 0. Unlike sitting in the evening, it is a need: it may break off a begun plan if it
 * beats its hold. One sits at the fire, facing it, till warm enough for something else to win.
 */
export function warmWorth(world: World, villager: Villager): number {
  if (!isBurning(world)) return 0;
  const cold = urgency(villager.needs.warmth);
  return cold * cold;
}

/**
 * The character factor of the utility (GDD §2.3: a glutton eats sooner, a hard worker works
 * more): 1 for everyone — traits come at stage 2, and this is where they will weigh.
 */
export function character(_villager: Villager, _activity: Option): number {
  return 1;
}

/** Activities that need a source to walk to, in the order of the jitter draws. */
export const ACTIVITIES: readonly {
  readonly id: ActivityId;
  readonly need: Meal;
}[] = [
  { id: 'eat', need: 'food' },
  { id: 'drink', need: 'water' },
];

/** What the mind chose: rest on, sleep where it stands, go and meet a need, or go and haul. */
export type Choice =
  | { kind: 'rest'; utility: number }
  | { kind: 'sleep'; utility: number }
  | Trip
  | Scout
  | Haul
  | Stock
  | Tend;

/**
 * A choice to scout (step 1.11b): no food known — walk to the edge of the known land (the goal),
 * looking around; the plan ends when food comes in sight.
 */
export type Scout = {
  kind: 'scout';
  need: 'food';
  utility: number;
  ahead?: Ahead;
} & Found;

/** A choice to pick food that keeps and carry it to the store (step 1.11b). */
export type Stock = { kind: 'store'; utility: number } & Found;

/**
 * A choice at the fire (step 1.9): `kindle` and `stoke` walk to wood in the pile first (the found
 * source is the stack), `sit` walks to its place by the fire.
 */
export type Tend = {
  kind: FireActivity;
  utility: number;
  ahead?: Ahead;
} & Found;

/** A choice to walk to a loose item and carry it to the pile (step 1.7). */
export type Haul = { kind: 'haul'; utility: number } & Found;

/**
 * A choice to walk to a source and eat or drink there; `ahead` — chosen ahead of that trip, by
 * precaution (drink before a long way to the berries): then `utility` is that trip's.
 */
export type Trip = {
  kind: ActivityId;
  need: Meal;
  utility: number;
  ahead?: Ahead;
} & Found;

/**
 * How much the villager wants to sleep now (step 1.5): `urgency² × factor + wish` of the phase
 * of the day (data/balance.json, `sleeping`). At night the wish alone outweighs rest — one goes to
 * sleep at nightfall and sleeps till dawn even when rested; by day only a sleepless one naps.
 */
export function sleepWish(world: World, villager: Villager): number {
  const { factor, wish } = DATA.balance.sleeping;
  const { phase } = calendarAt(world.tick);
  const pressing = urgency(villager.needs.sleep);
  return pressing * pressing * factor[phase] + wish[phase];
}

/** A scored option of one decision (the journal of decisions, the debug view and tests read them). */
export interface Considered {
  kind: Option;
  /**
   * Utility with the jitter; for an activity not looked into — its upper bound; for the current
   * plan — the bar another option has to clear to break it off.
   */
  utility: number;
  /** Was the source searched for (false — it could not win anyway)? */
  searched: boolean;
  /** Nowhere to meet the need (searched now and found nothing at all, or in vain a moment ago). */
  nowhere: boolean;
  /** Is it the plan being carried out (not searched again: it is kept unless outbid)? */
  current: boolean;
}

/**
 * Choose what `villager` does now: rest on, sleep, eat, drink or work (the highest utility).
 * `considered`, if given, receives every option with its score — the trail of the decision.
 */
export function choose(world: World, villager: Villager, considered?: Considered[]): Choice {
  const best = weigh(world, villager, considered, 0, null);
  if (best.kind === 'eat' || best.kind === 'drink' || best.kind === 'scout') {
    return precaution(world, villager, best, considered) ?? best;
  }
  return best;
}

/**
 * Think over a plan under way (step 1.8): is anything better than going on with `current`? The
 * plan holds on with `bar` (./villagers.ts takes it from `holdOf`): another option must be worth
 * more than that; the current activity itself is not searched again. Null — go on as planned.
 */
export function reconsider(
  world: World,
  villager: Villager,
  current: Activity,
  bar: number,
  considered?: Considered[],
): Choice | null {
  const best = weigh(world, villager, considered, bar, current);
  if (best.kind === current || best.utility <= bar) return null;
  if (best.kind === 'eat' || best.kind === 'drink' || best.kind === 'scout') {
    const first = precaution(world, villager, best, considered) ?? best;
    // «Drink first» while drinking already — that is the plan under way.
    return first.kind === current ? null : first;
  }
  return best;
}

/**
 * The bar a plan holds on with: what another option has to be worth to break it off. `firm` — its
 * utility when chosen, or what its need is worth now if that grew (one walking to a bush grows
 * hungrier), raised by `ai.keepMargin`; `fresh` — what it is worth now plus `ai.sleepHold` (at
 * dusk, as sleep comes back little by little, one does not get up and lie down again and again,
 * yet wakes when a need presses; the wish fades towards morning, and one gets up); `loose` — 0 (anything that wins the
 * choice); `fixed` — nothing breaks it.
 */
export function holdOf(
  world: World,
  villager: Villager,
  plan: { activity: Activity; utility: number },
): number {
  const activity = ACTIVITY[plan.activity];
  switch (activity.hold) {
    case 'firm': {
      const now = activity.utility?.(world, villager) ?? 0;
      return Math.max(plan.utility, now) * (1 + DATA.balance.ai.keepMargin);
    }
    case 'fresh':
      return (activity.utility?.(world, villager) ?? 0) + DATA.balance.ai.sleepHold;
    case 'loose':
      return 0;
    case 'fixed':
      return Number.POSITIVE_INFINITY;
  }
}

/**
 * The best option for `villager` now. `bar` — what an option has to beat besides the others (the
 * hold of the plan under way; 0 — none): no source is looked for farther than it could beat it,
 * and a source that is merely not worth the way against the plan is not remembered as in vain.
 * `current` — the activity under way: it is not searched for again.
 */
function weigh(
  world: World,
  villager: Villager,
  considered: Considered[] | undefined,
  bar: number,
  current: Activity | null,
): Choice {
  const rng = world.rng.minds;
  const jitter = DATA.balance.ai.jitterPercent / 100;
  const score = (id: Option) =>
    ACTIVITY[id].utility!(world, villager) *
    character(villager, id) *
    (1 + floatRange(rng, -jitter, jitter));
  const note = (entry: Omit<Considered, 'current'>) =>
    considered?.push({ ...entry, current: entry.kind === current });
  // The draws come first, one per option in a fixed order (rest, eat, drink, sleep, work), so the
  // stream does not depend on what is searched.
  let best: Choice = { kind: 'rest', utility: score('rest') };
  note({
    kind: 'rest',
    utility: best.utility,
    searched: false,
    nowhere: false,
  });
  const options = ACTIVITIES.map((activity, order) => ({
    ...activity,
    order,
    ceiling: score(activity.id),
  }));
  // Sleep needs no search: one lies down where one stands (beds and shelters — later steps).
  const sleep = score('sleep');
  note({ kind: 'sleep', utility: sleep, searched: false, nowhere: false });
  if (sleep > best.utility) best = { kind: 'sleep', utility: sleep };
  const work = score('haul');
  // The fire (step 1.9): drawn after the others, so their numbers stay as they were.
  const tending = FIRE_ACTIVITIES.map((id) => ({ id, ceiling: score(id) }));
  // What an option must beat to be of use: the best so far, and the plan under way.
  const beat = () => Math.max(best.utility, bar);
  // Not worth the way against the best of rest and sleep — a search in vain, remembered; against
  // sleep (dusk, night: by morning the source is worth the way again) or against the plan under
  // way — not.
  const vainIfFar = () => best.kind !== 'sleep' && bar <= best.utility;
  // The most promising first: once an upper bound cannot beat the best, neither can the rest.
  options.sort((a, b) => b.ceiling - a.ceiling || a.order - b.order);
  for (const option of options) {
    if (option.id === current) {
      note({ kind: option.id, utility: bar, searched: false, nowhere: false });
      continue;
    }
    if (option.ceiling <= beat()) {
      note({
        kind: option.id,
        utility: option.ceiling,
        searched: false,
        nowhere: false,
      });
      continue;
    }
    // Searched in vain not long ago (nothing at all, or nothing near enough to be worth it): needs
    // change slowly, so it is not worth searching again so soon.
    const vain = villager.nowhere[option.need];
    // Food ripens at the start of a day (step 1.11b): a search in vain before it is out of date.
    const ripened = option.need === 'food' && dayOf(vain) !== dayOf(world.tick);
    if (vain > 0 && !ripened && world.tick - vain < DATA.balance.ai.retryTicks) {
      note({ kind: option.id, utility: 0, searched: false, nowhere: true });
      continue;
    }
    // Nothing near enough to be worth the way a moment ago (step 1.11): not again so soon.
    const far = villager.tooFar[option.need];
    const stale = option.need === 'food' && dayOf(far) !== dayOf(world.tick);
    if (far > 0 && !stale && world.tick - far < DATA.balance.ai.farRetryTicks) {
      note({ kind: option.id, utility: 0, searched: false, nowhere: false });
      continue;
    }
    const maxCost = reachFor(option.ceiling, beat());
    // What it has to beat, before this option changes the best.
    const bound = beat();
    const vainFar = vainIfFar();
    // Food (step 1.11b): what the villager knows of — bushes, the store in winter.
    const search =
      option.need === 'food'
        ? searchFood(world, villager, maxCost)
        : searchSource(world, villager, option.need, { maxCost });
    let utility = search.ok
      ? option.ceiling *
        availability(search.cost) *
        mealContext(world, villager, option.need, search.cost)
      : 0;
    note({
      kind: option.id,
      utility,
      searched: true,
      nowhere: !search.ok && search.reason === 'nowhere',
    });
    let nowhere = !search.ok && search.reason === 'nowhere';
    if (search.ok && utility > best.utility) {
      const { ok: _, ...found } = search;
      best = { kind: option.id, need: option.need, utility, ...found };
    }
    // No food known anywhere (step 1.11b): go and look for some — scouting.
    if (option.need === 'food' && nowhere) {
      const scouted = scout(world, villager, option.ceiling, best, bound, current, note);
      nowhere = scouted.nowhere;
      utility = scouted.utility;
      if (scouted.choice) best = scouted.choice;
    }
    const inVain = nowhere || (!search.ok && utility === 0 && vainFar);
    villager.nowhere[option.need] = inVain ? world.tick : 0;
    // Found, but not worth the way yet, or nothing near enough to beat the plan under way.
    villager.tooFar[option.need] = !inVain && utility <= bound ? world.tick : 0;
  }
  for (const { id, ceiling } of tending) {
    if (id === current) {
      note({ kind: id, utility: bar, searched: false, nowhere: false });
      continue;
    }
    if (ceiling <= beat()) {
      note({ kind: id, utility: ceiling, searched: false, nowhere: false });
      continue;
    }
    const reach = reachFor(ceiling, beat());
    const found =
      id === 'sit' || id === 'warm'
        ? searchSeat(world, villager, reach)
        : searchWood(world, villager, reach);
    const utility = found ? ceiling * availability(found.cost) : 0;
    note({ kind: id, utility, searched: true, nowhere: found === null });
    if (found && utility > best.utility) best = { kind: id, utility, ...found };
  }
  // The store (step 1.11b): drawn after the fire, so the numbers before stay as they were.
  const storing = score('store');
  if (current === 'store') {
    note({ kind: 'store', utility: bar, searched: false, nowhere: false });
  } else {
    best = stock(world, villager, storing, best, beat(), note) ?? best;
  }
  if (current === 'haul') {
    note({ kind: 'haul', utility: bar, searched: false, nowhere: false });
    return best;
  }
  return haul(world, villager, work, best, beat(), vainIfFar(), note) ?? best;
}

/**
 * Scouting (step 1.11b): no food known with something on it — walk to the nearest land not yet
 * explored (./memory.ts `searchFrontier`), worth the meal's `ceiling` × `ai.scoutFactor` ×
 * availability of that edge × the meal's context (the cold, the evening). `nowhere` — the whole
 * reachable land explored (then the search is not repeated for `ai.retryTicks`); `utility` — what
 * scouting is worth (0 — not looked into or nowhere to go); `choice` — chosen, it beats `best`.
 */
function scout(
  world: World,
  villager: Villager,
  ceiling: number,
  best: Choice,
  beat: number,
  current: Activity | null,
  note: (entry: Omit<Considered, 'current'>) => void,
): { nowhere: boolean; utility: number; choice: Scout | null } {
  const top = ceiling * DATA.balance.ai.scoutFactor;
  if (current === 'scout') {
    note({ kind: 'scout', utility: beat, searched: false, nowhere: false });
    return { nowhere: false, utility: 0, choice: null };
  }
  if (top <= beat) {
    note({ kind: 'scout', utility: top, searched: false, nowhere: false });
    return { nowhere: false, utility: 0, choice: null };
  }
  const frontier = searchFrontier(world, villager, busyFor(world, villager), reachFor(top, beat));
  // In the cold, only as far as one's warmth lasts there and back to the camp — even starving.
  if (frontier.ok && !warmEnough(world, villager, frontier.tile, frontier.cost)) {
    note({ kind: 'scout', utility: 0, searched: true, nowhere: false });
    return { nowhere: false, utility: 0, choice: null };
  }
  if (!frontier.ok) {
    const nowhere = frontier.reason === 'unreachable';
    note({ kind: 'scout', utility: 0, searched: true, nowhere });
    return { nowhere, utility: 0, choice: null };
  }
  const utility =
    top *
    availability(frontier.cost) *
    mealContext(world, villager, 'food', scoutReach(world, frontier.tile, frontier.cost));
  note({ kind: 'scout', utility, searched: true, nowhere: false });
  const choice: Scout | null =
    utility > best.utility
      ? {
          kind: 'scout',
          need: 'food',
          utility,
          source: { kind: 'spot', x: frontier.tile.x, y: frontier.tile.y },
          goal: frontier.tile,
          path: frontier.path,
          cost: frontier.cost,
        }
      : null;
  return { nowhere: false, utility, choice };
}

/**
 * Does warmth last for a leg of scouting in the cold (step 1.11b): to `goal` (`cost` tiles of grass
 * by path) and from there back to the camp, warmth stays above `ai.reservePoints` at the temperature
 * of the air now. Warm weather — always.
 */
function warmEnough(world: World, villager: Villager, goal: Tile, cost: number): boolean {
  const loss = -warmthPerTick(airTemperature(world));
  if (loss <= 0) return true;
  const walk = (cost + leastCost(goal, world.camp)) * DATA.balance.movement.walkTicksPerTile;
  return villager.needs.warmth - walk * loss >= DATA.balance.ai.reservePoints;
}

/**
 * How far a leg of scouting really takes one, tiles of grass, for its context (the cold, the
 * evening — they count the way there and back): legs follow one another farther from the camp,
 * and the way back is to the camp — the longer of the leg and the way from its end to the camp.
 */
function scoutReach(world: World, goal: Tile, cost: number): number {
  return Math.max(cost, leastCost(goal, world.camp));
}

/**
 * Storing food for the winter (step 1.11b): pick food that keeps from a bush one knows of and carry
 * it to the store, if it beats `best` and `beat` — `ceiling` (the utility of storing with its
 * jitter) × availability of the nearest such bush × the evening. Searched only if it could win,
 * no farther than one's warmth lasts (`coldReach`), and not again for `ai.workRetryTicks` after a
 * search in vain. Null — not chosen.
 */
function stock(
  world: World,
  villager: Villager,
  ceiling: number,
  best: Choice,
  beat: number,
  note: (entry: Omit<Considered, 'current'>) => void,
): Stock | Scout | null {
  if (ceiling <= beat) {
    note({ kind: 'store', utility: ceiling, searched: false, nowhere: false });
    return null;
  }
  const vain = villager.noStore;
  // Out of the seasons of food that keeps (spring, summer) there is nothing to store at all.
  if (!storableInSeason(world) || (vain > 0 && world.tick - vain < DATA.balance.ai.retryTicks)) {
    note({ kind: 'store', utility: 0, searched: false, nowhere: true });
    return null;
  }
  const maxCost = Math.min(reachFor(ceiling, beat), coldReach(world, villager));
  const search = pickSearch(world, villager, maxCost);
  // Picking takes time too: a handful every `stores.pickTicks`, an armful in the hands.
  const picking = DATA.balance.stores.pickTicks * stackOf('nuts');
  const utility = search.ok
    ? ceiling * availability(search.cost) * lateTrip(world, search.cost, picking)
    : 0;
  const useful = search.ok && utility > best.utility;
  note({
    kind: 'store',
    utility,
    searched: true,
    nowhere: !search.ok && search.reason === 'nowhere',
  });
  if (search.ok) {
    // Storing is no pressing matter: not worth it now — not looked into again for a while.
    villager.noStore = useful ? 0 : world.tick;
    if (!useful) return null;
    const { ok: _, ...found } = search;
    return { kind: 'store', utility, ...found };
  }
  // No food that keeps known while it could be on bushes: go and look for some (scouting).
  if (search.reason === 'nowhere') {
    const top = ceiling * DATA.balance.ai.scoutFactor;
    const frontier =
      top > beat ? searchFrontier(world, villager, busyFor(world, villager), maxCost) : null;
    if (frontier?.ok) {
      const worth =
        top *
        availability(frontier.cost) *
        lateTrip(world, scoutReach(world, frontier.tile, frontier.cost), 0);
      note({ kind: 'scout', utility: worth, searched: true, nowhere: false });
      if (worth > best.utility) {
        villager.noStore = 0;
        return {
          kind: 'scout',
          need: 'food',
          utility: worth,
          source: { kind: 'spot', x: frontier.tile.x, y: frontier.tile.y },
          goal: frontier.tile,
          path: frontier.path,
          cost: frontier.cost,
        };
      }
    }
  }
  // Scouting for food to store is no pressing matter: not looked into again for a while.
  villager.noStore = world.tick;
  return null;
}

/** Tiles another villager than `self` stands on or walks to. */
function busyFor(world: World, self: Villager): (x: number, y: number) => boolean {
  return (x, y) => isTaken(world, x, y, self) || isGoalOfAnother(world, { x, y }, self);
}

/** Activities at the fire, in the order of their jitter draws (after all the others; `warm` — 1.10). */
const FIRE_ACTIVITIES: readonly FireActivity[] = ['kindle', 'stoke', 'sit', 'warm'];

/**
 * Work (step 1.7): carry a loose item to the pile, if it beats `best` and `beat` — `ceiling` (the
 * utility of work with its jitter) × availability of the nearest such item. Searched only if it
 * could win, and not again for `ai.workRetryTicks` after a search in vain (`vainIfFar` — is
 * nothing near enough a search in vain, or only not worth it against the plan under way). Null —
 * not chosen.
 */
function haul(
  world: World,
  villager: Villager,
  ceiling: number,
  best: Choice,
  beat: number,
  vainIfFar: boolean,
  note: (entry: Omit<Considered, 'current'>) => void,
): Haul | null {
  if (ceiling <= beat) {
    note({ kind: 'haul', utility: ceiling, searched: false, nowhere: false });
    return null;
  }
  const vain = villager.noWork;
  if (!anyLoose(world)) {
    // Nothing lies loose that the pile has room for: no work at all, nothing to search.
    note({ kind: 'haul', utility: 0, searched: false, nowhere: true });
    return null;
  }
  if (vain > 0 && world.tick - vain < DATA.balance.ai.workRetryTicks) {
    note({ kind: 'haul', utility: 0, searched: false, nowhere: true });
    return null;
  }
  // Work that would last into the evening is worth less (step 1.9): if that is too little to win,
  // only work done by the evening is worth looking for — a shorter search.
  let maxCost = reachFor(ceiling, beat);
  if (hearthOf(world) && ceiling * DATA.balance.fire.eveningWork <= beat) {
    maxCost = Math.min(
      maxCost,
      untilEvening(world.tick) / (2 * DATA.balance.movement.walkTicksPerTile),
    );
  }
  maxCost = Math.min(maxCost, coldReach(world, villager));
  const found = searchLoose(world, villager, { maxCost });
  const utility = found ? ceiling * availability(found.cost) * eveningWork(world, found.cost) : 0;
  const useful = found !== null && utility > best.utility;
  villager.noWork = useful || !vainIfFar ? 0 : world.tick;
  note({ kind: 'haul', utility, searched: true, nowhere: found === null });
  if (!found || !useful) return null;
  return { kind: 'haul', utility, ...found };
}

/**
 * How far one may go for work in the cold (step 1.10), tiles of grass: to the item, from it to the
 * camp (no farther than there and back again plus where one stands now), warmth must stay above
 * `ai.reservePoints` at the temperature of the air now — in winter one works near the fire and warms
 * up first. Warm weather — no limit.
 */
export function coldReach(world: World, villager: Villager): number {
  const loss = -warmthPerTick(airTemperature(world));
  if (loss <= 0) return Number.POSITIVE_INFINITY;
  const spare = villager.needs.warmth - DATA.balance.ai.reservePoints;
  if (spare <= 0) return 0;
  const budget = spare / (loss * DATA.balance.movement.walkTicksPerTile);
  return Math.max(0, (budget - leastCost(villager, world.camp)) / 2);
}

/** The day a tick falls on, from 0. */
function dayOf(tick: number): number {
  return Math.floor(tick / DATA.balance.time.ticksPerDay);
}

/** Ticks from `tick` to the evening (step 1.9): 0 in the evening, till the next evening at night. */
function untilEvening(tick: number): number {
  const { tickOfDay } = calendarAt(tick);
  const evening = eveningStart(tick);
  if (tickOfDay < evening) return evening - tickOfDay;
  if (tickOfDay < PHASE_START.night) return 0;
  return DATA.balance.time.ticksPerDay - tickOfDay + evening;
}

/**
 * Before a trip: would another need fall below `ai.reservePoints` by the time the villager is
 * back (the way there and back, plus the meal or the drink itself)? Then meet that one first —
 * drink before walking far for berries; in the cold (step 1.10) — warm up at the fire before
 * walking far for nuts. Null — the trip may go ahead.
 */
function precaution(
  world: World,
  villager: Villager,
  trip: Trip | Scout,
  considered?: Considered[],
): Choice | null {
  const ticks =
    2 * trip.cost * DATA.balance.movement.walkTicksPerTile + fillTicks(trip.need, villager);
  for (const activity of ACTIVITIES) {
    if (activity.need === trip.need) continue;
    const now = villager.needs[activity.need];
    // Full already (no room to top up): go anyway — the trip is just long.
    if (isSated(now, activity.need)) continue;
    const left = now - ticks * fallPerTick(activity.need);
    if (left >= DATA.balance.ai.reservePoints) continue;
    const found = findSource(world, villager, activity.need);
    if (!found) continue;
    const pressing = urgency(villager.needs[activity.need]);
    const utility = pressing * pressing * availability(found.cost);
    considered?.push({
      kind: activity.id,
      utility,
      searched: true,
      nowhere: false,
      current: false,
    });
    // It is worth what the trip it goes ahead of is worth: that is what it holds on with.
    return {
      kind: activity.id,
      need: activity.need,
      utility: trip.utility,
      ahead: trip.kind,
      ...found,
    };
  }
  // In the cold (step 1.10): would warmth fall below the reserve on the way? Warm up at the fire first.
  // The way back is to the fire (step 1.11b): from afar — a scout far from the camp — it is longer.
  const loss = -warmthPerTick(airTemperature(world));
  const back = Math.max(trip.cost, leastCost(trip.goal, world.camp));
  const walk = (trip.cost + back) * DATA.balance.movement.walkTicksPerTile;
  if (loss > 0 && villager.needs.warmth - walk * loss < DATA.balance.ai.reservePoints) {
    const seat = isBurning(world) ? searchSeat(world, villager) : null;
    if (seat) {
      considered?.push({
        kind: 'warm',
        utility: warmWorth(world, villager) * availability(seat.cost),
        searched: true,
        nowhere: false,
        current: false,
      });
      return { kind: 'warm', utility: trip.utility, ahead: trip.kind, ...seat };
    }
  }
  return null;
}

/** About how many ticks it takes to fill a need from where it is now (bites, sips). */
export function fillTicks(need: Meal, villager: Villager): number {
  return ((FULL - villager.needs[need]) / portionOf(need)) * portionTicks(need);
}

/**
 * Why a plan began (the journal of decisions): `chose` — at a moment of thought it beat the plan
 * under way; `done` — the plan before was carried out (rest follows); `failed` — it could not go
 * on (the bush picked clean, the item gone, no way, no room in the pile; rest follows); `order` —
 * the observer sent the villager; `faint` — sleep ran out.
 */
export type Why = 'chose' | 'done' | 'failed' | 'order' | 'faint';

/** A decision of the villager's mind: what it set itself to do, when, why, and what else it weighed. */
export interface Decision {
  tick: number;
  why: Why;
  /** The plan it left (null — none before). */
  from: Activity | null;
  /** The bar the new plan cleared to break off a firm plan under way (null — nothing broken off). */
  bar: number | null;
  plan: Activity;
  /** Utility of the new plan, with its jitter (0 — not chosen by utility: an order, a faint). */
  utility: number;
  /**
   * Chosen ahead of this option, which won (precaution: drink before a long way to the berries);
   * null — it won itself.
   */
  ahead: Option | null;
  /** Every option weighed, with its score (empty — not chosen: done, failed, an order, a faint). */
  options: Considered[];
}

/** Write a decision to the villager's journal, which keeps the last `ai.logSize`. */
export function remember(villager: Villager, decision: Decision): void {
  villager.log.push(decision);
  const extra = villager.log.length - DATA.balance.ai.logSize;
  if (extra > 0) villager.log.splice(0, extra);
}
