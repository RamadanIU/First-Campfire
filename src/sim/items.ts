/**
 * Items (step 1.7, GDD §5.1): resources as physical things. Nothing is teleported or made out of
 * thin air: every branch in the pile was carried there by someone.
 *
 *   - A stack (`Stack`) is some of one resource (data/resources.json): an id, the resource, how
 *     many. At most a resource's `stack` lies on one tile, and as much is carried in the hands.
 *   - An item (`Item`) is a stack lying on a tile: loose on the ground (`place: 'ground'` — where
 *     it fell or was dropped) or stored in the pile at the camp (`'pile'`). One tile — at most one
 *     item. A stack in the hands is the villager's `load` (./villagers.ts); it keeps its id when
 *     picked up whole and put down on an empty tile, and merges into the stack already there.
 *   - The camp (`Camp`): where the first two came (the camp site, ./mapgen.ts `findCampSite`) and
 *     the place of the pile — `items.pileOffset` tiles south of it (the middle is left for the
 *     fire). The pile is the tiles within `items.pileRadius` of that place on which things can lie,
 *     in a fixed order (`pileTiles`): it fills from the middle outwards.
 *   - Litter (`litterSystem`, the stream `items`): trees drop branches on a free tile beside them
 *     (`litter` of data/objects.json — what, how many at most, every how many days on average);
 *     some lie there from the start (`items.startLitter`). Branches of one place gather into one
 *     stack: nothing falls within `items.litterSpacing` of another loose stack but onto it. Not
 *     above `items.maxLoose` stacks lie loose on the map: when there are as many, the oldest of them
 *     rots away before the next falls (step 1.10) — so branches never stop falling near the camp
 *     while the far bank of a river is full of them.
 *
 * Conservation (docs/ARCHITECTURE.md, rule 5): `made` counts every unit that ever appeared, `burned`
 * every unit put into the fire (step 1.9, ./fire.ts), `rotted` every unit that rotted away (step 1.10);
 * the items on tiles and in the hands always add up to the difference (`countAll`, tests/scenario.ts
 * `brokenRules`). Only falling makes things and only the fire and rot take them away; moving them
 * never changes the sum.
 *
 * Falls are not written to the journal: they happen several times a day and are of no news (the
 * tree beside the branches is their visible cause). Plain data (docs/ARCHITECTURE.md, rule 7).
 */
import { DATA } from '../data/index.ts';
import type { MapObjectDef } from '../data/tables.ts';
import { TIME } from './calendar.ts';
import { inside, type WorldMap } from './map.ts';
import { findCampSite } from './mapgen.ts';
import { defOf, type MapObject, type MapObjects, objectAt } from './objects.ts';
import { type Tile, tileSpeed } from './path.ts';
import { chance, intRange } from './rng.ts';
import type { Villager } from './villagers.ts';
import type { System, World } from './world.ts';

/** Some of one resource: in the hands, or (as an `Item`) on a tile. */
export interface Stack {
  id: number;
  /** Id of a record of data/resources.json. */
  resource: string;
  /** How many: 1 … the resource's `stack`. */
  count: number;
  /**
   * The tick it spoils at (step 1.11b: food picked into the hands — its `spoilDays` from then; two
   * stacks merged spoil with the older); 0 — never (branches).
   */
  spoils: number;
}

/** Where an item lies: loose on the ground, or stored in the pile at the camp. */
export type ItemPlace = 'ground' | 'pile';

/** A stack lying on a tile. */
export interface Item extends Stack {
  x: number;
  y: number;
  place: ItemPlace;
}

export interface Items {
  /** Every item lying on a tile, in the order of ids. */
  list: Item[];
  /** The id of the next new stack (on a tile or in the hands). */
  nextId: number;
  /** Every unit that ever appeared (fell from a tree): the items and the burnt add up to it. */
  made: number;
  /** Every unit put into the fire (step 1.9, ./fire.ts): gone from the items, counted here. */
  burned: number;
  /** Every unit that rotted away lying loose (step 1.10): gone from the items, counted here. */
  rotted: number;
  /** Every unit of food picked from a bush into the hands (step 1.11b): it appeared as an item. */
  picked: number;
  /** Every unit of food eaten from the store (step 1.11b): gone from the items, counted here. */
  eaten: number;
  /** Every unit of food that spoiled (step 1.11b): gone from the items, counted here. */
  spoiled: number;
}

/**
 * The camp of the people (step 1.7): its middle (the fire, step 1.9), the place of the pile of
 * branches and the place of the store of food beside it (step 1.11b).
 */
export interface Camp {
  x: number;
  y: number;
  pile: Tile;
  store: Tile;
}

/** The four sides of a tile, in a fixed order: north, east, south, west. */
const SIDES: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function createItems(): Items {
  return {
    list: [],
    nextId: 1,
    made: 0,
    burned: 0,
    rotted: 0,
    picked: 0,
    eaten: 0,
    spoiled: 0,
  };
}

/** Is the resource food (data/resources.json, category `food`; step 1.11b)? */
export function isFood(resource: string): boolean {
  return DATA.resources.get(resource).category === 'food';
}

/**
 * Is the food worth storing (step 1.11b, ADR-032): it keeps at least `stores.keepDays` (its
 * `spoilDays`; none — it keeps for ever). Berries and roots spoil before the winter is over.
 */
export function keeps(resource: string): boolean {
  const { spoilDays } = DATA.resources.get(resource);
  return isFood(resource) && (spoilDays === null || spoilDays >= DATA.balance.stores.keepDays);
}

/** The tick a stack of `resource` made at `tick` spoils at: its `spoilDays` later; 0 — never. */
export function spoilsAt(resource: string, tick: number): number {
  const { spoilDays } = DATA.resources.get(resource);
  return spoilDays === null ? 0 : tick + spoilDays * TIME.ticksPerDay;
}

/** Of two stacks merged, the sooner spoiling (0 — never). */
function sooner(a: number, b: number): number {
  if (a === 0) return b;
  if (b === 0) return a;
  return Math.min(a, b);
}

/** How many of a resource lie on one tile and are carried in the hands (data/resources.json). */
export function stackOf(resource: string): number {
  return DATA.resources.get(resource).stack;
}

/** The tile nearest to (x, y) that passes `test` (rings of growing radius, each in a fixed order). */
export function nearestTile(
  map: WorldMap,
  x: number,
  y: number,
  test: (x: number, y: number) => boolean,
): Tile | null {
  const most = Math.max(map.width, map.height);
  for (let r = 0; r < most; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (inside(map, tx, ty) && test(tx, ty)) return { x: tx, y: ty };
      }
    }
  }
  return null;
}

/** Can things lie on tile (x, y): land one can walk on, no object (flowers, bushes…) on it. */
export function canHold(map: WorldMap, objects: MapObjects, x: number, y: number): boolean {
  return (
    inside(map, x, y) &&
    tileSpeed(map, objects, x, y) > 0 &&
    objectAt(map, objects, x, y) === undefined
  );
}

/**
 * The camp of a new world: the camp site of the map (or the free tile nearest to its middle — a
 * test's small map), the place of the pile, `items.pileOffset` tiles south of it (the nearest
 * tile that can hold things, not the middle itself), and the place of the store of food (step
 * 1.11b), `items.storeOffset` tiles east of the pile — the nearest such tile whose square does not
 * touch the pile's nor the ring of tiles around the fire (none — the pile's place: on a small map
 * the two share it).
 */
export function createCamp(map: WorldMap, objects: MapObjects): Camp {
  const site = findCampSite(map, objects);
  const free = (x: number, y: number) => canHold(map, objects, x, y);
  const middle =
    site !== null
      ? { x: site.x, y: site.y }
      : nearestTile(map, map.width >> 1, map.height >> 1, free);
  if (!middle) throw new Error('На карте нет ни одного тайла для стоянки');
  const pile =
    nearestTile(
      map,
      middle.x,
      middle.y + DATA.balance.items.pileOffset,
      (x, y) => free(x, y) && (x !== middle.x || y !== middle.y),
    ) ?? middle;
  const { pileRadius, storeRadius, storeOffset } = DATA.balance.items;
  const apart = pileRadius + storeRadius;
  const store =
    nearestTile(
      map,
      pile.x + storeOffset,
      pile.y,
      (x, y) =>
        free(x, y) &&
        Math.max(Math.abs(x - pile.x), Math.abs(y - pile.y)) > apart &&
        // Off the places by the fire where one sits to warm up (its ring of tiles is left free).
        Math.max(Math.abs(x - middle.x), Math.abs(y - middle.y)) > storeRadius + 1,
    ) ?? pile;
  return { x: middle.x, y: middle.y, pile, store };
}

/** The item lying on tile (x, y), if any. */
export function itemAt(world: World, x: number, y: number): Item | undefined {
  for (const item of world.items.list) if (item.x === x && item.y === y) return item;
  return undefined;
}

export function findItem(world: World, id: number): Item | undefined {
  return world.items.list.find((item) => item.id === id);
}

/** Is (x, y) within the square of `radius` around `place`, can hold things, not the middle? */
function inSquare(world: World, place: Tile, radius: number, x: number, y: number): boolean {
  const { camp } = world;
  if (Math.abs(x - place.x) > radius || Math.abs(y - place.y) > radius) return false;
  if (x === camp.x && y === camp.y) return false;
  return canHold(world.map, world.objects, x, y);
}

/** Is (x, y) a tile of the pile of branches (not of the store of food)? */
function isWoodTile(world: World, x: number, y: number): boolean {
  return inSquare(world, world.camp.pile, DATA.balance.items.pileRadius, x, y);
}

/** Is (x, y) a tile of the store of food (step 1.11b; a tile of both is the pile's)? */
function isStoreTile(world: World, x: number, y: number): boolean {
  return (
    inSquare(world, world.camp.store, DATA.balance.items.storeRadius, x, y) &&
    !isWoodTile(world, x, y)
  );
}

/**
 * Tiles where `resource` is kept at the camp, in the order they fill: food (step 1.11b) — the
 * store, anything else — the pile; its place first, then the tiles around it (within
 * `items.pileRadius` / `items.storeRadius`) — nearer first, each ring in a fixed order. Only tiles
 * that can hold things, never the middle of the camp.
 */
export function pileTiles(world: World, resource = 'branches'): Tile[] {
  const food = isFood(resource);
  const { camp } = world;
  const place = food ? camp.store : camp.pile;
  const radius = food ? DATA.balance.items.storeRadius : DATA.balance.items.pileRadius;
  const tiles: Tile[] = [];
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = place.x + dx;
        const y = place.y + dy;
        if (food ? isStoreTile(world, x, y) : isWoodTile(world, x, y)) tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

/**
 * Is tile (x, y) a tile of the pile — of branches, or of the store of food (step 1.11b)? Things on
 * it are kept at the camp (`place: 'pile'`).
 */
export function isPileTile(world: World, x: number, y: number): boolean {
  return isWoodTile(world, x, y) || isStoreTile(world, x, y);
}

/**
 * How many more of `resource` tile (x, y) can take: 0 — another resource lies there, or nothing can
 * (the middle of the camp is kept for the fire, step 1.9).
 */
export function roomAt(world: World, x: number, y: number, resource: string): number {
  if (x === world.camp.x && y === world.camp.y) return 0;
  if (!canHold(world.map, world.objects, x, y)) return 0;
  // Food is kept in the store, branches in the pile (step 1.11b); loose — anywhere.
  if (isWoodTile(world, x, y) && isFood(resource)) return 0;
  if (isStoreTile(world, x, y) && !isFood(resource)) return 0;
  const item = itemAt(world, x, y);
  if (!item) return stackOf(resource);
  return item.resource === resource ? stackOf(resource) - item.count : 0;
}

/**
 * Where in the pile to put `resource`: a stack of it begun and not full (topped up first — what
 * does not fit goes on to the next tile), else an empty tile — in the order of `pileTiles`, so
 * the pile grows from its middle. Tiles another villager stands on or walks to (`busy`) are
 * skipped. Null — the pile has no room for it.
 */
export function pileSpot(
  world: World,
  resource: string,
  busy: (x: number, y: number) => boolean = () => false,
): Tile | null {
  const tiles = pileTiles(world, resource).filter((tile) => !busy(tile.x, tile.y));
  const full = stackOf(resource);
  const room = (tile: Tile) => roomAt(world, tile.x, tile.y, resource);
  return (
    tiles.find((tile) => room(tile) > 0 && room(tile) < full) ??
    tiles.find((tile) => room(tile) === full) ??
    null
  );
}

/** Is there room in the pile for at least one of `resource`? */
export function pileHasRoom(world: World, resource: string): boolean {
  return pileTiles(world, resource).some((tile) => roomAt(world, tile.x, tile.y, resource) > 0);
}

/**
 * Put up to `count` of `resource` on tile (x, y): onto the stack of it lying there, or as a new
 * item (with id `id`, if given — a stack from the hands keeps its id). In the pile if the tile is
 * one of the pile's. Returns how many were put: the room of the tile limits it.
 */
export function lay(
  world: World,
  resource: string,
  count: number,
  x: number,
  y: number,
  id?: number,
  spoils = 0,
): number {
  const placed = Math.min(count, roomAt(world, x, y, resource));
  if (placed <= 0) return 0;
  const there = itemAt(world, x, y);
  if (there) {
    there.count += placed;
    there.spoils = sooner(there.spoils, spoils);
    return placed;
  }
  const items = world.items;
  const item: Item = {
    id: id ?? items.nextId++,
    resource,
    count: placed,
    spoils,
    x,
    y,
    place: isPileTile(world, x, y) ? 'pile' : 'ground',
  };
  // Keep the list in the order of ids: an id from the hands may be older than the last one.
  let at = items.list.length;
  while (at > 0 && items.list[at - 1]!.id > item.id) at--;
  items.list.splice(at, 0, item);
  return placed;
}

/**
 * Take up to `count` from an item into the hands of `villager` (empty hands, or holding the same
 * resource): the whole stack keeps its id; an emptied item leaves the tile. Returns how many.
 */
export function takeItem(world: World, villager: Villager, item: Item, count: number): number {
  const load = villager.load;
  if (load && load.resource !== item.resource) return 0;
  const room = stackOf(item.resource) - (load?.count ?? 0);
  const taken = Math.min(count, item.count, room);
  if (taken <= 0) return 0;
  item.count -= taken;
  if (item.count === 0) {
    const list = world.items.list;
    list.splice(list.indexOf(item), 1);
  }
  if (load) {
    load.count += taken;
    load.spoils = sooner(load.spoils, item.spoils);
  } else {
    const id = item.count === 0 ? item.id : world.items.nextId++;
    villager.load = {
      id,
      resource: item.resource,
      count: taken,
      spoils: item.spoils,
    };
  }
  return taken;
}

/**
 * The villager lets its load go where it stands: on its tile, or — what does not fit there — on
 * the nearest tiles with room (in the pile if they are the pile's). Nothing is lost.
 */
export function dropLoad(world: World, villager: Villager): void {
  const load = villager.load;
  if (!load) return;
  // The stack keeps its id where it lies on its own, not where it tops up another one.
  let kept = false;
  while (load.count > 0) {
    const tile = nearestTile(
      world.map,
      villager.x,
      villager.y,
      (x, y) => roomAt(world, x, y, load.resource) > 0,
    );
    if (!tile) throw new Error(`Некуда положить ношу жителя #${villager.id}`);
    const fresh: boolean = !kept && itemAt(world, tile.x, tile.y) === undefined;
    load.count -= lay(
      world,
      load.resource,
      load.count,
      tile.x,
      tile.y,
      fresh ? load.id : undefined,
      load.spoils,
    );
    kept ||= fresh;
  }
  villager.load = null;
}

/** How many of every resource there are: on tiles and in the hands (the conservation law). */
export function countAll(world: World): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (stack: Stack) => {
    counts[stack.resource] = (counts[stack.resource] ?? 0) + stack.count;
  };
  for (const item of world.items.list) add(item);
  for (const villager of world.villagers.list) if (villager.load) add(villager.load);
  return counts;
}

/** How many units of food lie in the store at the camp (step 1.11b). */
export function inStore(world: World): number {
  let total = 0;
  for (const item of world.items.list) {
    if (item.place === 'pile' && isFood(item.resource)) total += item.count;
  }
  return total;
}

/**
 * Spoiling (step 1.11b): at the start of a day food that has kept its `spoilDays` is gone — lying
 * anywhere, or in the hands; counted in `items.spoiled`.
 */
export const spoilSystem: System = {
  id: 'spoil',
  step(world) {
    if (world.tick % TIME.ticksPerDay !== 0) return;
    const items = world.items;
    const spoiled = (stack: Stack) => stack.spoils > 0 && world.tick >= stack.spoils;
    for (let i = items.list.length - 1; i >= 0; i--) {
      const item = items.list[i]!;
      if (!spoiled(item)) continue;
      items.spoiled += item.count;
      items.list.splice(i, 1);
    }
    for (const villager of world.villagers.list) {
      if (villager.load && spoiled(villager.load)) {
        items.spoiled += villager.load.count;
        villager.load = null;
      }
    }
  },
};

/** How many of `resource` lie in the pile. */
export function inPile(world: World, resource: string): number {
  let total = 0;
  for (const item of world.items.list) {
    if (item.place === 'pile' && item.resource === resource) total += item.count;
  }
  return total;
}

// ── Litter ──────────────────────────────────────────────────────────────────────────────────

type Litter = NonNullable<MapObjectDef['litter']>;

/** Objects that drop something and have a tile beside them where it could lie, by map. */
const droppersOf = new WeakMap<MapObjects, { key: string; list: MapObject[] }>();

/**
 * Objects that drop things (their def has `litter`) with at least one side tile that can hold
 * them, in the order of ids. Derived from the map alone, so it is cached outside the world and
 * rebuilt when objects appear or disappear.
 */
export function droppers(world: World): MapObject[] {
  const { map, objects } = world;
  const key = `${objects.nextId}/${objects.list.length}`;
  const cached = droppersOf.get(objects);
  if (cached && cached.key === key) return cached.list;
  const list = objects.list.filter(
    (object) =>
      defOf(object).litter !== null &&
      SIDES.some(([dx, dy]) => canHold(map, objects, object.x + dx, object.y + dy)),
  );
  droppersOf.set(objects, { key, list });
  return list;
}

function looseCount(world: World): number {
  let loose = 0;
  for (const item of world.items.list) if (item.place === 'ground') loose++;
  return loose;
}

/**
 * Is another stack lying loose within `items.litterSpacing` of (x, y) (not on it)? Then nothing
 * falls there: the branches of one place gather into one stack, not a scatter over the ground.
 */
function crowded(world: World, x: number, y: number): boolean {
  const spacing = DATA.balance.items.litterSpacing;
  return world.items.list.some(
    (item) =>
      item.place === 'ground' &&
      (item.x !== x || item.y !== y) &&
      Math.abs(item.x - x) <= spacing &&
      Math.abs(item.y - y) <= spacing,
  );
}

/**
 * Something falls from `object` on a random side of it: if that tile can hold it (not the pile,
 * not another resource, no other loose stack near), 1…`litter.max` — as much as fits. Returns
 * how many fell.
 */
export function fall(world: World, object: MapObject, litter: Litter): number {
  const rng = world.rng.items;
  const [dx, dy] = SIDES[intRange(rng, 0, SIDES.length - 1)]!;
  const wanted = intRange(rng, 1, litter.max);
  const x = object.x + dx;
  const y = object.y + dy;
  if (!canHold(world.map, world.objects, x, y) || isPileTile(world, x, y)) return 0;
  if (crowded(world, x, y)) return 0;
  const fell = lay(world, litter.resource, wanted, x, y);
  world.items.made += fell;
  return fell;
}

/** Litter of a new world: what fell before it began (`items.startLitter` falls from random trees). */
export function scatterLitter(world: World): void {
  const list = droppers(world);
  if (list.length === 0) return;
  const rng = world.rng.items;
  for (let i = 0; i < DATA.balance.items.startLitter; i++) {
    const object = list[intRange(rng, 0, list.length - 1)]!;
    fall(world, object, defOf(object).litter!);
  }
}

/** The oldest stack lying loose rots away (step 1.10): the one with the smallest id. */
function rotOldest(world: World): void {
  const list = world.items.list;
  const index = list.findIndex((item) => item.place === 'ground');
  if (index < 0) return;
  world.items.rotted += list[index]!.count;
  list.splice(index, 1);
}

/**
 * Litter (step 1.7): every `items.litterCheckTicks` one random dropper may drop something. Its
 * chance is such that each dropper drops once in `litter.everyDays` on average:
 * checks a day × chance / droppers = 1 / everyDays (capped at 1 — then they drop less often).
 */
export const litterSystem: System = {
  id: 'litter',
  step(world) {
    const { litterCheckTicks, maxLoose } = DATA.balance.items;
    if (world.tick % litterCheckTicks !== 0) return;
    const list = droppers(world);
    if (list.length === 0) return;
    if (looseCount(world) >= maxLoose) rotOldest(world);
    const rng = world.rng.items;
    const object = list[intRange(rng, 0, list.length - 1)]!;
    const litter = defOf(object).litter!;
    const p = (litterCheckTicks * list.length) / (TIME.ticksPerDay * litter.everyDays);
    if (chance(rng, Math.min(1, p))) fall(world, object, litter);
  },
};
