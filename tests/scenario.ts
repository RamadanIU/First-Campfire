/**
 * Small hand-drawn worlds for scenario tests (docs/ARCHITECTURE.md, «Тестирование»): a map is a
 * list of rows, one character per tile.
 *
 *   .  grass        ,  sand        :  dirt
 *   ~  shallow water               =  deep water
 *   T  oak (blocks the way)        B  berry bush (blocks)        o  boulder (blocks)
 *   *  flowers (walkable)          "  tall grass (walkable)
 *   H  hazel — nuts (blocks)       R  roots (blocks) — winter food, step 1.10
 *
 * The world is a real one — `createWorld(seed, { map })` — so its villagers, systems and streams
 * are the game's own; only the map is given.
 */

import { DATA } from '../src/data/index.ts';
import { calendarAt } from '../src/sim/calendar.ts';
import { canHold, countAll, isPileTile, stackOf } from '../src/sim/items.ts';
import { createMap, setGround } from '../src/sim/map.ts';
import type { GeneratedMap } from '../src/sim/mapgen.ts';
import { FULL } from '../src/sim/needs.ts';
import { createObjects, placeObject } from '../src/sim/objects.ts';
import { carries, placeVillager } from '../src/sim/villagers.ts';
import { createWorld, stepWorld, type World } from '../src/sim/world.ts';

const GROUND: Record<string, string> = {
  '.': 'grass',
  ',': 'sand',
  ':': 'dirt',
  '~': 'shallow_water',
  '=': 'deep_water',
};
const OBJECTS: Record<string, string> = {
  T: 'oak',
  B: 'berry_bush',
  o: 'boulder',
  '*': 'flowers',
  '"': 'tall_grass',
  H: 'hazel',
  R: 'roots',
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A map from rows of characters (see the legend above); objects stand on grass. */
export function mapFromRows(rows: readonly string[]): GeneratedMap {
  const height = rows.length;
  const width = rows[0]!.length;
  if (rows.some((row) => row.length !== width)) throw new Error('Ряды карты разной длины');
  const map = createMap(width, height, gcd(width, height));
  const objects = createObjects();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const char = rows[y]![x]!;
      const ground = GROUND[char] ?? (OBJECTS[char] ? 'grass' : undefined);
      if (!ground) throw new Error(`Неизвестный знак карты «${char}» в (${x}, ${y})`);
      setGround(map, x, y, ground);
      const object = OBJECTS[char];
      if (object) placeObject(map, objects, object, x, y);
    }
  }
  return { map, objects };
}

/**
 * A world on a hand-drawn map. Its two villagers stand where the game puts them, or — if `places`
 * are given (one per villager) — on those tiles, which become their homes; they rest until the
 * first tick.
 */
export function worldOn(
  rows: readonly string[],
  places: readonly { x: number; y: number }[] = [],
  seed = 1,
): World {
  const world = createWorld(seed, { map: mapFromRows(rows) });
  if (places.length === 0) return world;
  if (places.length !== world.villagers.list.length) {
    throw new Error(`Нужно ${world.villagers.list.length} места — по одному на жителя`);
  }
  places.forEach((place, i) => {
    const villager = world.villagers.list[i]!;
    placeVillager(world, villager, place.x, place.y);
    villager.home = { x: place.x, y: place.y };
  });
  return world;
}

/**
 * One tick in a «mild climate» (step 1.10): after it every villager is warm again. For scenarios of
 * the other needs on maps without trees (no wood — no fire), where winter would kill first; cold has
 * scenarios of its own (tests/warmth.test.ts).
 */
export function stepWarm(world: World): void {
  stepWorld(world);
  for (const villager of world.villagers.list) villager.needs.warmth = FULL;
}

/** `ticks` ticks in a mild climate (`stepWarm`). */
export function runWarm(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepWarm(world);
}

/**
 * Food without end (step 1.11): every bush, hazel and patch of roots carries `rations` in its seasons
 * (none out of them — raspberries still have nothing in winter). Bushes bear a handful a year now;
 * scenarios of the other needs call it every tick so that hunger does not get in their way.
 */
export function plenty(world: World, rations = 100): void {
  const { season } = calendarAt(world.tick);
  for (const object of world.objects.list) {
    const harvest = DATA.objects.get(object.def).harvest;
    if (harvest === null || !(harvest.seasons as readonly string[]).includes(season)) continue;
    object.stock = rations;
    object.state = DATA.objects.get(object.def).states[0]!;
  }
}

/** An open meadow `width`×`height` of grass. */
export function meadow(width: number, height: number): string[] {
  return Array.from({ length: height }, () => '.'.repeat(width));
}

/**
 * Every rule items keep (step 1.7; a violation — a message, none — an empty list): all that lies
 * and is carried plus all that was burnt (step 1.9) and rotted (step 1.10) adds up to all that fell, one stack per tile
 * within its size, stacks only where things may lie and the pile's on its tiles, nothing on the
 * middle of the camp (the fire), a load only while the plan carries things (work, the fire).
 */
export function brokenRules(world: World): string[] {
  const broken: string[] = [];
  const all = countAll(world);
  const total = Object.values(all).reduce((sum, n) => sum + n, 0);
  if (total + world.items.burned + world.items.rotted !== world.items.made) {
    broken.push(
      `предметов ${total}, сожжено ${world.items.burned} и сгнило ${world.items.rotted}, а упало ${world.items.made} (тик ${world.tick})`,
    );
  }
  const tiles = new Set<string>();
  for (const item of world.items.list) {
    const at = `${item.x},${item.y}`;
    if (tiles.has(at)) broken.push(`две стопки на тайле ${at}`);
    tiles.add(at);
    if (item.count < 1 || item.count > stackOf(item.resource)) {
      broken.push(`стопка #${item.id}: ${item.count} — больше стопки или пусто`);
    }
    if (!canHold(world.map, world.objects, item.x, item.y)) {
      broken.push(`стопка #${item.id} на тайле ${at}, где ничего не может лежать`);
    }
    if (item.x === world.camp.x && item.y === world.camp.y) {
      broken.push(`стопка #${item.id} на месте костра ${at}`);
    }
    if ((item.place === 'pile') !== isPileTile(world, item.x, item.y)) {
      broken.push(`стопка #${item.id} (${item.place}) на ${at} — не своё место`);
    }
  }
  const ids = world.items.list.map((item) => item.id);
  if (ids.some((id, i) => i > 0 && id <= ids[i - 1]!)) broken.push('список не по порядку id');
  for (const villager of world.villagers.list) {
    const load = villager.load;
    if (!load) continue;
    if (load.count < 1 || load.count > stackOf(load.resource)) {
      broken.push(`ноша жителя ${villager.id}: ${load.count}`);
    }
    if (ids.includes(load.id)) broken.push(`id ноши ${load.id} и на земле`);
    const { action } = villager;
    const hauling =
      action.kind === 'pick_up' ||
      action.kind === 'put_down' ||
      action.kind === 'take' ||
      action.kind === 'kindle' ||
      action.kind === 'stoke' ||
      (action.kind === 'walk' &&
        (action.purpose === 'fetch' || action.purpose === 'carry' || action.purpose === 'fire'));
    if (!hauling) broken.push(`житель ${villager.id} держит ношу, делая «${action.kind}»`);
    if (!carries(villager.plan)) {
      broken.push(`житель ${villager.id} держит ношу, а план — «${villager.plan.activity}»`);
    }
  }
  return broken;
}
