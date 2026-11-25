/**
 * What a villager knows of its land (step 1.11b, GDD §2.3): it sees around itself, remembers the
 * food it saw and goes only to food it knows of; when everything it knows is bare, it scouts.
 *
 *   - Sight: `ai.sightTiles` around the tile it stands on (no walls to sight — a tree hides
 *     nothing). It looks at every new tile it steps on (`look`) and when it comes into the world.
 *   - Explored land (`Villager.seen`): the map in square cells of `ai.cellTiles`; a cell is explored
 *     once it was in sight whole — so everything in it was seen. Land never changes, so a cell
 *     stays explored.
 *   - Known food (`Villager.foods`): every bush, hazel or patch of roots it saw, with the tick it
 *     saw it last and whether there was food on it then. The crops ripen by the calendar without
 *     chance (./harvest.ts), and the villager knows the calendar: food it saw stays there while
 *     its seasons last (unless someone else picks it), a bare one is bare until its next day of
 *     ripening (`believesFood`).
 *   - Scouting (`searchFrontier`): the nearest tile by path in a cell not yet explored — the edge
 *     of the known land; walking there opens some more of it.
 *
 * The truth is not hidden from the rest of the game: the renderer, the runs' «was food in reach?»
 * of a death (./life.ts) see the whole map. Plain data (docs/ARCHITECTURE.md, rule 7).
 */
import { DATA } from '../data/index.ts';
import { calendarAt, TIME } from './calendar.ts';
import type { WorldMap } from './map.ts';
import {
  defOf,
  findObject,
  hasFood,
  type MapObject,
  type MapObjects,
  objectAt,
} from './objects.ts';
import { findNearest, type NearestResult } from './path.ts';
import type { Villager } from './villagers.ts';
import type { World } from './world.ts';

/** A food object a villager saw: when last, and was there food on it then. */
export interface Known {
  /** Id of the object (./objects.ts). */
  object: number;
  /** The tick it was seen last. */
  at: number;
  /** Was there food on it then (in its seasons, some left)? */
  full: boolean;
}

/** Cells of the explored land across and down a map. */
export function cellsOf(map: WorldMap): { across: number; down: number } {
  const size = DATA.balance.ai.cellTiles;
  return {
    across: Math.ceil(map.width / size),
    down: Math.ceil(map.height / size),
  };
}

/** A new villager's memory of the land: nothing explored (an entry per cell), no food known. */
export function emptyMemory(map: WorldMap): { seen: number[]; foods: Known[] } {
  const { across, down } = cellsOf(map);
  return { seen: new Array<number>(across * down).fill(0), foods: [] };
}

/** Objects with a harvest (food), by map: derived from the map alone, cached outside the world. */
const foodObjectsOf = new WeakMap<MapObjects, { key: string; list: MapObject[] }>();

/** Every object of the map that bears food (its def has `harvest`), in the order of ids. */
export function foodObjects(objects: MapObjects): MapObject[] {
  const key = `${objects.nextId}/${objects.list.length}`;
  const cached = foodObjectsOf.get(objects);
  if (cached && cached.key === key) return cached.list;
  const list = objects.list.filter((object) => defOf(object).harvest !== null);
  foodObjectsOf.set(objects, { key, list });
  return list;
}

/** Is the cell (cx, cy) explored by `villager`? */
export function isExplored(world: World, villager: Villager, x: number, y: number): boolean {
  const size = DATA.balance.ai.cellTiles;
  const { across } = cellsOf(world.map);
  return villager.seen[Math.floor(y / size) * across + Math.floor(x / size)] === 1;
}

/** What `villager` learns of food object `object` now: where it is is known, food on it or not. */
export function noteFood(world: World, villager: Villager, object: MapObject): Known {
  const full = hasFood(object, calendarAt(world.tick).season);
  const { foods } = villager;
  // Kept in the order of ids: a binary search, an insert in its place.
  let low = 0;
  let high = foods.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (foods[middle]!.object < object.id) low = middle + 1;
    else high = middle;
  }
  const there = foods[low];
  if (there?.object === object.id) {
    there.at = world.tick;
    there.full = full;
    return there;
  }
  const known = { object: object.id, at: world.tick, full };
  foods.splice(low, 0, known);
  return known;
}

/** What `villager` knows of food object `id` (undefined — it never saw it). */
export function knownOf(villager: Villager, id: number): Known | undefined {
  const { foods } = villager;
  let low = 0;
  let high = foods.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const found = foods[middle]!;
    if (found.object === id) return found;
    if (found.object < id) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}

/**
 * The villager looks around from the tile it stands on: food objects within `ai.sightTiles` are
 * noted (food on them or not), cells in sight whole are explored. Returns the food objects it now
 * knows to have food that it did not before — something new to eat.
 */
export function look(world: World, villager: Villager): MapObject[] {
  const { sightTiles, cellTiles } = DATA.balance.ai;
  const sight2 = sightTiles * sightTiles;
  const { x, y } = villager;
  const found: MapObject[] = [];
  for (const object of foodObjects(world.objects)) {
    const dx = object.x - x;
    const dy = object.y - y;
    if (dx * dx + dy * dy > sight2) continue;
    const before = believesFood(world, villager, object);
    if (noteFood(world, villager, object).full && !before) found.push(object);
  }
  // Something new to eat: the old «nowhere» and «too far» are out of date.
  if (found.length > 0) {
    villager.nowhere.food = 0;
    villager.tooFar.food = 0;
  }
  const { across, down } = cellsOf(world.map);
  const reach = Math.ceil(sightTiles / cellTiles);
  const cx = Math.floor(x / cellTiles);
  const cy = Math.floor(y / cellTiles);
  for (let j = Math.max(0, cy - reach); j <= Math.min(down - 1, cy + reach); j++) {
    for (let i = Math.max(0, cx - reach); i <= Math.min(across - 1, cx + reach); i++) {
      const at = j * across + i;
      if (villager.seen[at] === 1) continue;
      // The farthest tile of the cell from the villager must be in sight.
      const fx = Math.max(Math.abs(i * cellTiles - x), Math.abs(i * cellTiles + cellTiles - 1 - x));
      const fy = Math.max(Math.abs(j * cellTiles - y), Math.abs(j * cellTiles + cellTiles - 1 - y));
      if (fx * fx + fy * fy <= sight2) villager.seen[at] = 1;
    }
  }
  return found;
}

/**
 * Has a day of ripening of `ripens` begun after tick `since` and by tick `now`? Then food has come
 * on a bush seen bare at `since` (./harvest.ts: a share at the start of each day of that season).
 */
function ripenedSince(ripens: string, since: number, now: number): boolean {
  const { ticksPerDay, daysPerSeason } = TIME;
  const first = Math.floor(since / ticksPerDay) + 1;
  const last = Math.floor(now / ticksPerDay);
  // A year is enough to look through: its every season comes once.
  const end = Math.min(last, first + 4 * daysPerSeason - 1);
  for (let day = first; day <= end; day++) {
    if (calendarAt(day * ticksPerDay).season === ripens) return true;
  }
  return false;
}

/**
 * Does `villager` believe there is food on `object` now: it saw it, the object's seasons last
 * (raspberries have nothing in winter), and it had food when seen — or has ripened since it was
 * seen bare. Another villager may have picked it meanwhile: one finds that out on the way.
 */
export function believesFood(world: World, villager: Villager, object: MapObject): boolean {
  const known = knownOf(villager, object.id);
  if (!known) return false;
  const harvest = defOf(object).harvest;
  if (harvest === null) return false;
  const { season } = calendarAt(world.tick);
  if (!(harvest.seasons as readonly string[]).includes(season)) return false;
  // Seen with food: it is there (or a new crop is, if the old one fell since). Seen bare: only if
  // it has ripened since.
  return known.full || ripenedSince(harvest.ripens, known.at, world.tick);
}

/** The food objects `villager` believes to have food now (in the order of ids). */
export function believedFood(world: World, villager: Villager): MapObject[] {
  const list: MapObject[] = [];
  for (const known of villager.foods) {
    const object = findObject(world.objects, known.object);
    if (object && believesFood(world, villager, object)) list.push(object);
  }
  return list;
}

/**
 * Scouting (step 1.11b): the nearest bare tile (nothing standing on it) by path from `villager` in
 * a cell it has not explored, no farther than `maxCost` (tiles of grass), avoiding the tiles of the others (`avoid`). The
 * whole reachable land explored — `nowhere`.
 */
export function searchFrontier(
  world: World,
  villager: Villager,
  avoid: (x: number, y: number) => boolean,
  maxCost?: number,
): NearestResult {
  return findNearest(
    world.map,
    world.objects,
    { x: villager.x, y: villager.y },
    (x, y) =>
      !isExplored(world, villager, x, y) &&
      objectAt(world.map, world.objects, x, y) === undefined &&
      !avoid(x, y),
    { avoid, ...(maxCost === undefined ? {} : { maxCost }) },
  );
}

/**
 * Two villagers by the fire tell each other what they saw (step 1.11b): each learns the land the
 * other explored, and of every food object the newer news (the later `at`).
 */
export function share(a: Villager, b: Villager): void {
  for (let i = 0; i < a.seen.length && i < b.seen.length; i++) {
    const seen = a.seen[i] === 1 || b.seen[i] === 1 ? 1 : 0;
    a.seen[i] = seen;
    b.seen[i] = seen;
  }
  const merged = new Map<number, Known>();
  for (const known of [...a.foods, ...b.foods]) {
    const there = merged.get(known.object);
    if (!there || there.at < known.at) merged.set(known.object, known);
  }
  const list = [...merged.values()].sort((x, y) => x.object - y.object);
  a.foods = list.map((known) => ({ ...known }));
  b.foods = list.map((known) => ({ ...known }));
}
