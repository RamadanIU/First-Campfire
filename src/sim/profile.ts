/**
 * A villager's profile (step 2.1, GDD §4.1): its name, age, birth, kin and the memory of the
 * significant events of its life — what its card shows and, later, its biography (GDD §11.4).
 *
 * - The name — ./names.ts, from the stream `profiles`; not repeated among the living.
 * - The age goes with the calendar: whole years since the tick of birth. The first pair is born
 *   before the world (a negative tick): young adults of `life.firstPairAge`, each with its own
 *   birthday somewhere in the year.
 * - Kin by ids: mother, father, spouse, children. The first pair has no known parents (it came at
 *   the creation of the world); unions and children come with step 2.3.
 * - Memory: the last `life.memorySize` significant events (GDD §4.1: 5–10). Significant are the
 *   rare events that change a life or are remembered for ever (`MEMORABLE` below): coming to the
 *   world, lighting the first fire of the camp, fainting from want of sleep, nearly dying of
 *   hunger, thirst or cold (health below `life.nearDeathHealth`), the death of another villager.
 *   The everyday — eating (even for the first time), drinking, sleeping, work, the weather, a need
 *   at zero — is not remembered.
 *
 * Memories come from the journal of events: the system `memories` reads the events of the tick
 * after every other system (src/sim/world.ts, SYSTEMS) and gives each memorable one to whom it
 * concerns. A memory keeps what its card needs (the name of the dead…), so that it outlives the
 * journal (step 2.10 decides what the journal keeps), and the id of its event — the cause.
 */
import { DATA } from '../data/index.ts';
import { TICKS_PER_YEAR } from './calendar.ts';
import type { DeathReason, WorldEvent } from './events.ts';
import { pickName } from './names.ts';
import type { Deadly } from './needs.ts';
import type { Tile } from './path.ts';
import { intRange } from './rng.ts';
import type { Sex, Villager } from './villagers.ts';
import type { System, World } from './world.ts';

/** A memory of a villager: an event of its life, when, and the journal event it came from. */
export type Memory = {
  tick: number;
  event: number;
} & /** It came to the world (the first pair: at its creation). */
(
  | { kind: 'arrived' }
  /** It lit the first fire of the camp. */
  | { kind: 'first_fire' }
  /** It fell from want of sleep. */
  | { kind: 'fainted' }
  /** It nearly died: health fell below `life.nearDeathHealth` while `need` was at zero. */
  | { kind: 'near_death'; need: Deadly }
  /** Another villager died: who (its name and sex — it is gone from the world) and of what. */
  | { kind: 'loss'; villager: number; name: string; sex: Sex; reason: DeathReason }
);

export type MemoryKind = Memory['kind'];

/** The profile of a newcomer: everything of it but the body, the needs and the mind. */
export interface Profile {
  name: string;
  born: number;
  birthplace: Tile;
  mother: number | null;
  father: number | null;
  spouse: number | null;
  children: number[];
  memories: Memory[];
}

/**
 * The profile of one of the first pair, who comes to the world at its creation on `tile`: a name
 * not worn by `living`, a young adult's age, no known parents. Draws from the stream `profiles`.
 */
export function firstComer(
  world: World,
  sex: Sex,
  tile: Tile,
  living: readonly Villager[],
): Profile {
  const rng = world.rng.profiles;
  const name = pickName(rng, sex, new Set(living.map((villager) => villager.name)));
  const { min, max } = DATA.balance.life.firstPairAge;
  const years = intRange(rng, min, max);
  // Its birthday — any tick of the year: at the creation it is `years` old exactly.
  const sinceBirthday = intRange(rng, 0, TICKS_PER_YEAR - 1);
  return {
    name,
    born: world.tick - years * TICKS_PER_YEAR - sinceBirthday,
    birthplace: { ...tile },
    mother: null,
    father: null,
    spouse: null,
    children: [],
    memories: [],
  };
}

/** Whole years of life at `tick`. */
export function ageOf(villager: Pick<Villager, 'born'>, tick: number): number {
  return Math.floor((tick - villager.born) / TICKS_PER_YEAR);
}

/** Did it come to the world from nowhere (the first pair, later — wanderers) rather than be born in it? */
export function cameFromOutside(villager: Pick<Villager, 'mother' | 'father'>): boolean {
  return villager.mother === null && villager.father === null;
}

/** Add a memory to the villager's; it keeps the last `life.memorySize`. */
export function addMemory(villager: Villager, memory: Memory): void {
  villager.memories.push(memory);
  const extra = villager.memories.length - DATA.balance.life.memorySize;
  if (extra > 0) villager.memories.splice(0, extra);
}

/** Whom an event is memorable for — `null`: everyone alive — and what they remember. */
type Remembered = { who: number | null; memory: Memory };

/**
 * The rule of memory: which events of the journal are significant and for whom (see the comment
 * at the top). Everything else returns nothing.
 */
export function memorable(event: WorldEvent): Remembered | null {
  const at = { tick: event.tick, event: event.id };
  switch (event.type) {
    case 'villager_arrived':
      return { who: event.villager, memory: { ...at, kind: 'arrived' } };
    case 'fire_lit':
      return event.first ? { who: event.villager, memory: { ...at, kind: 'first_fire' } } : null;
    case 'villager_fainted':
      return { who: event.villager, memory: { ...at, kind: 'fainted' } };
    case 'villager_nearly_died':
      return { who: event.villager, memory: { ...at, kind: 'near_death', need: event.need } };
    case 'villager_died':
      return {
        who: null,
        memory: {
          ...at,
          kind: 'loss',
          villager: event.villager,
          name: event.name,
          sex: event.sex,
          reason: event.reason,
        },
      };
    default:
      return null;
  }
}

/** Give the memorable events of the current tick to those they concern. */
export function recallTick(world: World): void {
  const list = world.events.list;
  let first = list.length;
  while (first > 0 && list[first - 1]!.tick === world.tick) first--;
  for (let i = first; i < list.length; i++) {
    const remembered = memorable(list[i]!);
    if (!remembered) continue;
    for (const villager of world.villagers.list) {
      if (remembered.who !== null && villager.id !== remembered.who) continue;
      // The dead are gone from the list; one does not mourn oneself.
      addMemory(villager, { ...remembered.memory });
    }
  }
}

export const memoriesSystem: System = {
  id: 'memories',
  step: recallTick,
};
