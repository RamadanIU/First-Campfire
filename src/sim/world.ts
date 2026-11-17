/**
 * The world: the whole simulation state and the step that moves it one tick forward.
 *
 * State is plain data (docs/ARCHITECTURE.md, rule 7): objects, arrays, numbers, strings — no
 * classes, closures or Maps. It can be hashed (./hash.ts), saved and compared.
 *
 * `world.tick` counts ticks already simulated. `stepWorld` advances it by one and then runs
 * every system in the fixed order of SYSTEMS; systems see the new tick.
 */
import { createJournal, type EventJournal, emit } from './events.ts';
import { lifeSystem } from './life.ts';
import type { WorldMap } from './map.ts';
import { type GeneratedMap, generateMap } from './mapgen.ts';
import type { MapObjects } from './objects.ts';
import { createRng, type Rng } from './rng.ts';
import { calendarEventsSystem } from './systems/calendarEvents.ts';
import { createFireflies, type Fireflies, firefliesSystem } from './systems/fireflies.ts';
import { createVillagers, settleFirstPair, type Villagers, villagersSystem } from './villagers.ts';

/**
 * Named random streams, one per system. A new system adds its name to the end; streams are
 * derived from (seed, name), so adding one does not change the numbers of the others.
 */
export const RNG_STREAMS = ['fireflies', 'map', 'villagers', 'minds'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

export interface World {
  /** One seed — one history. */
  seed: number;
  /** Ticks simulated so far. Tick 0 is the moment of creation. */
  tick: number;
  rng: Record<RngStream, Rng>;
  events: EventJournal;
  /** The night swarm of fireflies (ADR-018); see ./systems/fireflies.ts. */
  fireflies: Fireflies;
  /** The map: ground and object layers (./map.ts), made from the seed by ./mapgen.ts. */
  map: WorldMap;
  /** Trees, bushes, boulders… standing on the map (./objects.ts). */
  objects: MapObjects;
  /** The people of the world (./villagers.ts, step 1.3), their needs and health (step 1.4). */
  villagers: Villagers;
}

/** A system updates one aspect of the world once per tick. */
export interface System {
  id: string;
  step(world: World): void;
}

/**
 * Systems in the order they run every tick. The order is part of the rules: do not reorder.
 * Life (needs, health, death — ./life.ts) goes before the villagers act.
 */
export const SYSTEMS: readonly System[] = [
  calendarEventsSystem,
  firefliesSystem,
  lifeSystem,
  villagersSystem,
];

export interface WorldOptions {
  /**
   * A ready map instead of the generated one (scenario tests: a small map drawn by hand). The
   * stream `map` is created all the same, so the other streams do not change.
   */
  map?: GeneratedMap;
}

/** A new world: the map from the seed, then the first two people at the camp site. */
export function createWorld(seed: number, options: WorldOptions = {}): World {
  const rng = {} as Record<RngStream, Rng>;
  for (const stream of RNG_STREAMS) rng[stream] = createRng(seed, stream);
  const { map, objects } = options.map ?? generateMap(rng.map);
  const world: World = {
    seed,
    tick: 0,
    rng,
    events: createJournal(),
    fireflies: createFireflies(),
    map,
    objects,
    villagers: createVillagers(),
  };
  const created = emit(world, { type: 'world_created', seed }, { kind: 'rule', rule: 'genesis' });
  settleFirstPair(world, { kind: 'event', event: created.id });
  return world;
}

/** Advance the world by one tick. */
export function stepWorld(world: World): void {
  world.tick += 1;
  for (const system of SYSTEMS) system.step(world);
}

/** Advance the world by `ticks` ticks. */
export function runTicks(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepWorld(world);
}
