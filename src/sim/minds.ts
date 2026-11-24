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
 * free time goes to work, and loses to a pressing need.
 *
 * Where: food is a bush (an object with `harvest` in data/objects.json) that still has some, and
 * the villager stands on a tile beside it — on one of its four sides, facing it; water is drunk
 * from a tile beside the water, the same way. The spot must be free of other villagers and not
 * the goal another one is walking to.
 */
import { DATA } from '../data/index.ts';
import { calendarAt } from './calendar.ts';
import { type Item, itemAt, pileHasRoom } from './items.ts';
import { inside, isWater } from './map.ts';
import {
  FULL,
  fallPerTick,
  isSated,
  type Meal,
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
function sourceBeside(world: World, need: Meal, x: number, y: number): Source | null {
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
function besideTest(world: World, need: Meal): (x: number, y: number) => boolean {
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
  need: Meal,
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
  need: Meal,
  options: FindOptions = {},
): Found | null {
  const search = searchSource(world, villager, need, options);
  if (!search.ok) return null;
  const { ok: _, ...found } = search;
  return found;
}

/**
 * Is the source still there for a villager standing on (x, y): beside it, with food left; on the
 * item's tile, the item still lying loose there; on the tile of the pile.
 */
export function canUse(world: World, source: Source, x: number, y: number): boolean {
  if (source.kind === 'item') {
    const item = itemAt(world, x, y);
    return source.x === x && source.y === y && item?.id === source.item && item.place === 'ground';
  }
  if (source.kind === 'pile') return source.x === x && source.y === y;
  if (Math.abs(source.x - x) + Math.abs(source.y - y) !== 1) return false;
  if (source.kind === 'water') return isWater(world.map, source.x, source.y);
  const object = objectAt(world.map, world.objects, source.x, source.y);
  return object !== undefined && object.id === source.object && object.stock > 0;
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
    source: { kind: 'item', item: item.id, resource: item.resource, x: item.x, y: item.y },
    goal: result.tile,
    path: result.path,
    cost: result.cost,
  };
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
export type Activity = 'rest' | 'sleep' | 'eat' | 'drink' | 'haul' | 'order';

/** Activities met at a source one walks to (step 1.4). */
export type ActivityId = 'eat' | 'drink';

/** Activities the mind weighs (the observer's order is given, not chosen). */
export type Option = Exclude<Activity, 'order'>;

/**
 * A step of a plan (./villagers.ts carries them out): `stand` — rest standing a while; `stroll` —
 * walk to a free tile near home; `sleep` — on the ground; `go` — walk to the source of the plan
 * (the bush, the water, the observer's tile); `eat`, `drink` — beside it till full; `fetch` — walk
 * to an item lying loose; `pick_up`; `gather` — more of it near and the hands not full: `fetch`
 * and `pick_up` again; `carry` — walk to the pile; `put_down` — into the pile (what does not fit
 * is carried on).
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
  | 'put_down';

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
    steps: ['sleep'],
  },
  eat: { id: 'eat', need: 'food', utility: pressingOf('food'), hold: 'firm', steps: ['go', 'eat'] },
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
    utility: () => DATA.balance.ai.haulUtility,
    hold: 'firm',
    steps: ['fetch', 'pick_up', 'gather', 'carry', 'put_down'],
  },
  order: { id: 'order', need: null, utility: null, hold: 'fixed', steps: ['go'] },
};

/**
 * The character factor of the utility (GDD §2.3: a glutton eats sooner, a hard worker works
 * more): 1 for everyone — traits come at stage 2, and this is where they will weigh.
 */
export function character(_villager: Villager, _activity: Option): number {
  return 1;
}

/** Activities that need a source to walk to, in the order of the jitter draws. */
export const ACTIVITIES: readonly { readonly id: ActivityId; readonly need: Meal }[] = [
  { id: 'eat', need: 'food' },
  { id: 'drink', need: 'water' },
];

/** What the mind chose: rest on, sleep where it stands, go and meet a need, or go and haul. */
export type Choice =
  | { kind: 'rest'; utility: number }
  | { kind: 'sleep'; utility: number }
  | Trip
  | Haul;

/** A choice to walk to a loose item and carry it to the pile (step 1.7). */
export type Haul = { kind: 'haul'; utility: number } & Found;

/**
 * A choice to walk to a source and eat or drink there; `ahead` — chosen ahead of that trip, by
 * precaution (drink before a long way to the berries): then `utility` is that trip's.
 */
export type Trip = { kind: ActivityId; need: Meal; utility: number; ahead?: ActivityId } & Found;

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
  if (best.kind === 'eat' || best.kind === 'drink') {
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
  if (best.kind === 'eat' || best.kind === 'drink') {
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
  note({ kind: 'rest', utility: best.utility, searched: false, nowhere: false });
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
      note({ kind: option.id, utility: option.ceiling, searched: false, nowhere: false });
      continue;
    }
    // Searched in vain not long ago (nothing at all, or nothing near enough to be worth it): needs
    // change slowly, so it is not worth searching again so soon.
    const vain = villager.nowhere[option.need];
    if (vain > 0 && world.tick - vain < DATA.balance.ai.retryTicks) {
      note({ kind: option.id, utility: 0, searched: false, nowhere: true });
      continue;
    }
    const search = searchSource(world, villager, option.need, {
      maxCost: reachFor(option.ceiling, beat()),
    });
    const inVain = !search.ok && (search.reason === 'nowhere' || vainIfFar());
    villager.nowhere[option.need] = inVain ? world.tick : 0;
    const utility = search.ok ? option.ceiling * availability(search.cost) : 0;
    note({
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
  if (current === 'haul') {
    note({ kind: 'haul', utility: bar, searched: false, nowhere: false });
    return best;
  }
  return haul(world, villager, work, best, beat(), vainIfFar(), note) ?? best;
}

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
  const found = searchLoose(world, villager, { maxCost: reachFor(ceiling, beat) });
  villager.noWork = found || !vainIfFar ? 0 : world.tick;
  const utility = found ? ceiling * availability(found.cost) : 0;
  note({ kind: 'haul', utility, searched: true, nowhere: found === null });
  if (!found || utility <= best.utility) return null;
  return { kind: 'haul', utility, ...found };
}

/**
 * Before a trip: would another need fall below `ai.reservePoints` by the time the villager is
 * back (the way there and back, plus the meal or the drink itself)? Then meet that one first —
 * drink before walking far for berries. Null — the trip may go ahead.
 */
function precaution(
  world: World,
  villager: Villager,
  trip: Trip,
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
