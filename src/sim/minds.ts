/**
 * The mind of a villager, level 1 of GDD §2.3 (step 1.4): what to do right now — eat, drink, or
 * go on resting and strolling near home. A small utility choice, built to grow into the full one
 * of step 1.8 (more activities, plans of several steps, character, interruptions).
 *
 *   - Every activity serves a need and scores `utility = urgency² × availability`: urgency is
 *     0…1 (./needs.ts — 1 when the scale is at zero), squared so that the slightly hungry stay
 *     put and the very hungry drop everything; availability is 1 next to the source and ½ on a
 *     path of `ai.halfAvailabilityTiles` tiles of grass — nearer sources win.
 *   - Rest (standing, strolling near home) has a constant utility, `ai.restUtility`: a need wins
 *     once it outweighs it.
 *   - A little randomness keeps the two from acting like robots: every option's utility is
 *     multiplied by 1 ± `ai.jitterPercent` %, one draw per option from the stream `minds`, always
 *     the same number of draws whatever is chosen.
 *   - Finding a source costs a search of the map (./path.ts `findNearest`), so an activity is
 *     looked into only if its best possible utility (availability 1) could beat the best found so
 *     far — a fed villager never searches at all — and only as far as a source could still win
 *     (`reachFor`). A search in vain (nothing anywhere, or nothing near enough) is not repeated for
 *     `ai.retryTicks`: needs change slowly.
 *   - Precaution: before a trip, if another need would fall below `ai.reservePoints` by the time
 *     the villager is back (there and back, plus the meal) and there is room to top it up, that
 *     need is met first — one drinks before walking far for berries.
 *
 * Where: food is a bush (an object with `harvest` in data/objects.json) that still has some, and
 * the villager stands on a tile beside it — on one of its four sides, facing it; water is drunk
 * from a tile beside the water, the same way. The spot must be free of other villagers and not
 * the goal another one is walking to.
 */
import { DATA } from '../data/index.ts';
import { inside, isWater } from './map.ts';
import {
  FULL,
  fallPerTick,
  isSated,
  type Need,
  portionOf,
  portionTicks,
  urgency,
} from './needs.ts';
import { defOf, objectAt } from './objects.ts';
import { findNearest, type Tile } from './path.ts';
import { floatRange } from './rng.ts';
import { isGoalOfAnother, isTaken, type Source, type Villager } from './villagers.ts';
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

/** What meets a need on the tile beside (x, y), if anything: a bush with food, the water. */
function sourceBeside(world: World, need: Need, x: number, y: number): Source | null {
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
    if (object && object.stock > 0 && defOf(object).harvest !== null) {
      return { kind: 'bush', object: object.id, x: sx, y: sy };
    }
  }
  return null;
}

/** Marks of tiles beside a bush with food, reused by every search (not part of the world). */
let marks: { size: number; stamp: number; at: Uint32Array } | null = null;

/**
 * A fast «is a source beside (x, y)?» for one search — it is asked of every tile the search
 * looks at. Water: the four sides by the ground's code. Food: the sides of every bush with food
 * are marked once, before the search (a map has a couple of dozen bushes).
 */
function besideTest(world: World, need: Need): (x: number, y: number) => boolean {
  const { map, objects } = world;
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
  for (const object of objects.list) {
    if (object.stock <= 0 || defOf(object).harvest === null) continue;
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
}

/** A search for a source: found, nowhere in reach at all, or not within `maxCost`. */
export type SourceSearch = ({ ok: true } & Found) | { ok: false; reason: 'nowhere' | 'too_far' };

/** The nearest place by path where `villager` can meet `need`. */
export function searchSource(
  world: World,
  villager: Villager,
  need: Need,
  { others = true, maxCost }: FindOptions = {},
): SourceSearch {
  const from = { x: villager.x, y: villager.y };
  const beside = besideTest(world, need);
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
    },
  );
  if (!result.ok) return { ok: false, reason: result.reason === 'too_far' ? 'too_far' : 'nowhere' };
  const source = sourceBeside(world, need, result.tile.x, result.tile.y)!;
  return { ok: true, source, goal: result.tile, path: result.path, cost: result.cost };
}

/** The nearest place by path where `villager` can meet `need`, or null if there is none. */
export function findSource(
  world: World,
  villager: Villager,
  need: Need,
  options: FindOptions = {},
): Found | null {
  const search = searchSource(world, villager, need, options);
  if (!search.ok) return null;
  const { ok: _, ...found } = search;
  return found;
}

/** Is the source still there for a villager standing on (x, y): beside it, with food left? */
export function canUse(world: World, source: Source, x: number, y: number): boolean {
  if (Math.abs(source.x - x) + Math.abs(source.y - y) !== 1) return false;
  if (source.kind === 'water') return isWater(world.map, source.x, source.y);
  const object = objectAt(world.map, world.objects, source.x, source.y);
  return object !== undefined && object.id === source.object && object.stock > 0;
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

/** Activities a need can drive (step 1.4). Step 1.8 adds work, sleep, warmth… */
export type ActivityId = 'eat' | 'drink';

/** An activity and the need behind it, in the order of the jitter draws. */
export const ACTIVITIES: readonly { readonly id: ActivityId; readonly need: Need }[] = [
  { id: 'eat', need: 'food' },
  { id: 'drink', need: 'water' },
];

/** What the mind chose: rest on, or go and meet a need. */
export type Choice =
  | { kind: 'rest'; utility: number }
  | ({ kind: ActivityId; need: Need; utility: number } & Found);

/** A scored option of one decision (the debug view and tests read them). */
export interface Considered {
  kind: 'rest' | ActivityId;
  /** Utility with the jitter; for an activity not looked into — its upper bound. */
  utility: number;
  /** Was the source searched for (false — it could not win anyway)? */
  searched: boolean;
  /** Nowhere to meet the need (searched now and found nothing at all, or in vain a moment ago). */
  nowhere: boolean;
}

/**
 * Choose what `villager` does now: rest on, eat or drink (the highest utility). `considered`, if
 * given, receives every option with its score — the trail of the decision.
 */
export function choose(world: World, villager: Villager, considered?: Considered[]): Choice {
  const rng = world.rng.minds;
  const jitter = DATA.balance.ai.jitterPercent / 100;
  const noise = () => 1 + floatRange(rng, -jitter, jitter);
  // The draws come first, one per option, so the stream does not depend on what is searched.
  let best: Choice = { kind: 'rest', utility: DATA.balance.ai.restUtility * noise() };
  considered?.push({ kind: 'rest', utility: best.utility, searched: false, nowhere: false });
  const options = ACTIVITIES.map((activity, order) => {
    const pressing = urgency(villager.needs[activity.need]);
    return { ...activity, order, ceiling: pressing * pressing * noise() };
  });
  // The most promising first: once an upper bound cannot beat the best, neither can the rest.
  options.sort((a, b) => b.ceiling - a.ceiling || a.order - b.order);
  for (const option of options) {
    if (option.ceiling <= best.utility) {
      considered?.push({
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
    if (vain > 0 && world.tick - vain < DATA.balance.ai.retryTicks) {
      considered?.push({ kind: option.id, utility: 0, searched: false, nowhere: true });
      continue;
    }
    const search = searchSource(world, villager, option.need, {
      maxCost: reachFor(option.ceiling, best.utility),
    });
    villager.nowhere[option.need] = search.ok ? 0 : world.tick;
    const utility = search.ok ? option.ceiling * availability(search.cost) : 0;
    considered?.push({
      kind: option.id,
      utility,
      searched: true,
      nowhere: !search.ok && search.reason === 'nowhere',
    });
    if (search.ok && utility > best.utility) {
      const { ok: _, ...found } = search;
      best = { kind: option.id, need: option.need, utility, ...found };
    }
  }
  return best.kind === 'rest' ? best : (precaution(world, villager, best, considered) ?? best);
}

/**
 * Before a trip: would another need fall below `ai.reservePoints` by the time the villager is
 * back (the way there and back, plus the meal or the drink itself)? Then meet that one first —
 * drink before walking far for berries. Null — the trip may go ahead.
 */
function precaution(
  world: World,
  villager: Villager,
  trip: Exclude<Choice, { kind: 'rest' }>,
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
    considered?.push({ kind: activity.id, utility, searched: true, nowhere: false });
    return { kind: activity.id, need: activity.need, utility, ...found };
  }
  return null;
}

/** About how many ticks it takes to fill a need from where it is now (bites, sips). */
export function fillTicks(need: Need, villager: Villager): number {
  return ((FULL - villager.needs[need]) / portionOf(need)) * portionTicks(need);
}
