/**
 * The campfire (step 1.9, GDD §7.4 «Огонь», §13.3): the middle of the camp — a fire that has to be
 * lit and fed with wood.
 *
 *   - The hearth is an object of the map (`campfire` in data/objects.json) on the middle of the camp
 *     (`world.camp`; nothing lies or stands there — ./items.ts keeps it free). It is built the first
 *     time a villager lights a fire: before that the place is bare (flowers or tall grass growing
 *     there are trampled). Its state is `burning` or `out`
 *     — the sprite of the same name.
 *   - Wood is armfuls of branches (one branch — one armful, ADR-029). A villager takes it from the
 *     pile and puts it into the fire (./villagers.ts, the plans `kindle` and `stoke` of ./minds.ts):
 *     what goes into the fire is burnt at once as far as the items are concerned (`items.burned` —
 *     the conservation law: all that lies and is carried plus all that was burnt is all that ever
 *     fell) and becomes the fire's `fuel`.
 *   - A burning fire eats `fire.fuelPerDay` of its season a day, evenly, tick by tick (GDD §13.3:
 *     one a day in summer, three in winter); at most `fire.maxFuel` lie in it. With no fuel left it
 *     goes out — an event caused by the rule `fuel`; lighting is an event caused by the villager's
 *     decision.
 *   - Warmth (`warmthAt`): full beside a burning fire, fading to nothing at `fire.heatRadius` tiles;
 *     step 1.10 — it warms by `fire.heat` degrees (./weather.ts `feltAt`).
 *   - Rain (step 1.10): a fire without a roof gets soaked — `wet` counts the ticks of rain on it, and
 *     at `fire.rainOutTicks` it goes out by the rule `rain`, whatever wood is in it; the wet wood
 *     stays in the hearth and burns again once the fire is lit anew. Out of the rain it dries as fast. It cannot be lit in the rain (./minds.ts `kindleWorth`).
 *   - Fire is known from the start for now; the technology «Огонь» of stage 4 will switch it on —
 *     the one condition is `knowsFire`.
 *
 * Plain data (docs/ARCHITECTURE.md, rule 7). No randomness.
 */
import { DATA } from '../data/index.ts';
import { calendarAt, PHASE_START, TIME } from './calendar.ts';
import { emit } from './events.ts';
import type { MapObject } from './objects.ts';
import { defOf, findObject, objectAt, placeObject, removeObject } from './objects.ts';
import type { Villager } from './villagers.ts';
import type { System, World } from './world.ts';

/** The resource that is burnt as wood: one unit — one armful (ADR-029). */
export const WOOD = 'branches';

/** The campfire of the camp. */
export interface Fire {
  /** Id of the hearth (the object `campfire` on the middle of the camp); 0 — not built yet. */
  object: number;
  /** Armfuls of wood left in the fire, 0 … `fire.maxFuel`; when out — 0, or the wet wood the rain put out. */
  fuel: number;
  /** While it burns — the id of the event of its lighting; 0 — out. */
  lit: number;
  /** Armfuls put into it since it was lit. */
  fed: number;
  /** Ticks of rain soaked into it (step 1.10): at `fire.rainOutTicks` the rain puts it out. */
  wet: number;
}

export function createFire(): Fire {
  return { object: 0, fuel: 0, lit: 0, fed: 0, wet: 0 };
}

/**
 * Do the people know fire? Yes from the start for now: the technology «Огонь» (stage 4) will be the
 * one condition here (the stage notes of docs/roadmap/stage-01.md).
 */
export function knowsFire(_world: World): boolean {
  return true;
}

/** The hearth, if built. */
export function hearthOf(world: World): MapObject | undefined {
  return world.fire.object === 0 ? undefined : findObject(world.objects, world.fire.object);
}

/** Is the campfire burning? */
export function isBurning(world: World): boolean {
  return world.fire.lit !== 0;
}

/** How many more armfuls the fire takes (0 — full). */
export function fireRoom(world: World): number {
  return Math.max(0, DATA.balance.fire.maxFuel - world.fire.fuel);
}

/** Is another villager than `self` lighting or feeding the fire (one at a time is enough)? */
export function tendedByOther(world: World, self: Villager): boolean {
  return world.villagers.list.some(
    (other) =>
      other !== self && (other.plan.activity === 'kindle' || other.plan.activity === 'stoke'),
  );
}

/**
 * Is it evening at `tick`: from `fire.eveningTicks` of the season before dusk to nightfall — the time to sit at
 * the fire and to feed it for the night.
 */
export function isEvening(tick: number): boolean {
  const { tickOfDay } = calendarAt(tick);
  return tickOfDay >= eveningStart(tick) && tickOfDay < PHASE_START.night;
}

/**
 * The tick of the day the evening of `tick`'s day begins: `fire.eveningTicks` of its season before
 * dusk (step 1.10: in winter earlier — a short frosty day, one is home by the fire before dark).
 */
export function eveningStart(tick: number): number {
  return PHASE_START.dusk - DATA.balance.fire.eveningTicks[calendarAt(tick).season];
}

/** Is it evening or night at `tick` (one sits at the fire till one goes to sleep)? */
export function isEveningOrNight(tick: number): boolean {
  return isEvening(tick) || calendarAt(tick).phase === 'night';
}

/** Armfuls a burning fire eats per tick now (its season's rate). */
export function burnPerTick(world: World): number {
  return DATA.balance.fire.fuelPerDay[calendarAt(world.tick).season] / TIME.ticksPerDay;
}

/**
 * Armfuls the fire needs to burn from `world.tick` till the morning (the start of tomorrow's day,
 * when the people are up), at its season's rate now.
 */
export function fuelTillMorning(world: World): number {
  const { tickOfDay } = calendarAt(world.tick);
  return burnPerTick(world) * (TIME.ticksPerDay - tickOfDay + PHASE_START.day);
}

/**
 * Warmth of the campfire at tile (x, y), 0…1: 1 within a tile of a burning fire, fading evenly to
 * 0 at `fire.heatRadius` tiles; 0 — no fire burning (the heat it gives — ./weather.ts `feltAt`).
 */
export function warmthAt(world: World, x: number, y: number): number {
  if (!isBurning(world)) return 0;
  const { camp } = world;
  const dx = x - camp.x;
  const dy = y - camp.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const radius = DATA.balance.fire.heatRadius;
  if (distance <= 1) return 1;
  if (distance >= radius) return 0;
  return (radius - distance) / (radius - 1);
}

/**
 * Put the wood `villager` holds into the fire (it stands beside it): the armfuls go into the fire up
 * to its room and are burnt as far as the items are concerned; what does not fit stays in the
 * hands. Returns how many went in.
 */
export function feedFire(world: World, villager: Villager): number {
  const load = villager.load;
  if (!load || load.resource !== WOOD) return 0;
  const put = Math.min(load.count, Math.floor(fireRoom(world)));
  if (put <= 0) return 0;
  load.count -= put;
  if (load.count === 0) villager.load = null;
  world.items.burned += put;
  world.fire.fuel += put;
  world.fire.fed += put;
  return put;
}

/**
 * `villager` lights the fire with the wood it holds (it stands beside the middle of the camp): the
 * hearth is built if there is none yet (the place must be free of people — false: not now), the
 * wood goes in and it burns — an event caused by the villager's decision. Lighting a burning fire
 * only feeds it. Returns false if it could not be lit (nobody's wood, or someone stands on the
 * place).
 */
export function lightFire(world: World, villager: Villager): boolean {
  if (isBurning(world)) {
    feedFire(world, villager);
    return true;
  }
  if (!villager.load || villager.load.resource !== WOOD) return false;
  const { camp, fire } = world;
  let first = false;
  if (!hearthOf(world)) {
    const blocked = world.villagers.list.some(
      (other) =>
        (other.x === camp.x && other.y === camp.y) ||
        (other.toX === camp.x && other.toY === camp.y),
    );
    if (blocked) return false;
    // Flowers or tall grass on the place (the camp site has nothing that blocks the way) are
    // trampled: the hearth takes the tile.
    const there = objectAt(world.map, world.objects, camp.x, camp.y);
    if (there) {
      if (!defOf(there).walkable) return false;
      removeObject(world.map, world.objects, there.id);
    }
    fire.object = placeObject(world.map, world.objects, 'campfire', camp.x, camp.y).id;
    first = true;
  }
  // Wood the rain put out (step 1.10) is still there: it catches again with the new.
  fire.fed = 0;
  feedFire(world, villager);
  hearthOf(world)!.state = 'burning';
  const event = emit(
    world,
    {
      type: 'fire_lit',
      villager: villager.id,
      sex: villager.sex,
      x: camp.x,
      y: camp.y,
      first,
    },
    { kind: 'decision', villager: villager.id, activity: 'kindle' },
  );
  fire.lit = event.id;
  return true;
}

/** The fire goes out: no wood left (the rule `fuel`), or soaked by the rain (the rule `rain`, step 1.10). */
function goOut(world: World): void {
  const { fire, camp } = world;
  const hearth = hearthOf(world);
  if (hearth) hearth.state = 'out';
  const rained = fire.wet >= DATA.balance.fire.rainOutTicks;
  emit(
    world,
    { type: 'fire_out', x: camp.x, y: camp.y, lit: fire.lit, burned: fire.fed },
    { kind: 'rule', rule: rained ? 'rain' : 'fuel' },
  );
  // Put out by the rain, the wet wood stays in the hearth and burns when it is lit again.
  if (!rained) fire.fuel = 0;
  fire.lit = 0;
  fire.fed = 0;
  fire.wet = 0;
}

/**
 * The fire burns its wood, evenly by its season's rate; none left — it goes out. The rain (step
 * 1.10) soaks it, a tick a tick, and dries off the same way; soaked through — it goes out.
 */
export const fireSystem: System = {
  id: 'fire',
  step(world) {
    if (!isBurning(world)) return;
    const { fire } = world;
    const raining = world.weather.kind === 'rain';
    fire.wet = raining ? fire.wet + 1 : Math.max(0, fire.wet - 1);
    fire.fuel -= burnPerTick(world);
    if (fire.fuel <= 1e-9 || fire.wet >= DATA.balance.fire.rainOutTicks) goOut(world);
  },
};
