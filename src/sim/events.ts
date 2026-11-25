/**
 * The world's event journal: everything notable the simulation did, each with its cause.
 *
 * The chronicle, sounds, speech bubbles and statistics of later steps read from here; the
 * simulation never talks to the screen directly. Every event says *why* it happened
 * (docs/ARCHITECTURE.md, rule 4): either a rule of the world (the calendar, the world's birth)
 * or another event in the journal, which makes chains of "why?" possible.
 *
 * New event types are added to `EventBody` below; `type` is a snake_case id.
 */
import type { DayPhase, Season } from './calendar.ts';
import type { Activity } from './minds.ts';
import type { Need } from './needs.ts';
import type { Sex } from './villagers.ts';
import type { World } from './world.ts';

/** Why an event happened. Later steps add decisions… */
export type Cause =
  /**
   * A law of the world itself: `genesis` (the world's creation), `calendar` (time passing), `fuel`
   * (step 1.9: the wood of a fire burnt out).
   */
  | { kind: 'rule'; rule: 'genesis' | 'calendar' | 'fuel' }
  /** Another event of the journal, by id. */
  | { kind: 'event'; event: number }
  /** A need of a villager (step 1.4): its scale fell to zero. */
  | { kind: 'need'; villager: number; need: Need }
  /**
   * A decision of a villager (step 1.9): what its mind set itself to do — its journal of decisions
   * (./minds.ts `Decision`) says why.
   */
  | { kind: 'decision'; villager: number; activity: Activity };

/** What a villager died of (step 1.4). Later: cold, old age, illness… (GDD §4.3). */
export type DeathReason = 'hunger' | 'thirst';

/** What happened. One member per event type. */
export type EventBody =
  | { type: 'world_created'; seed: number }
  | { type: 'year_started'; year: number }
  | { type: 'season_started'; season: Season; year: number }
  | { type: 'phase_started'; phase: DayPhase; day: number }
  | { type: 'fireflies_rose'; count: number }
  | { type: 'fireflies_gone'; count: number }
  /** A villager came to the world: the first two at its creation (step 1.3). */
  | { type: 'villager_arrived'; villager: number; sex: Sex; x: number; y: number }
  /**
   * A need of a villager fell to zero (step 1.4): hunger or thirst begins to harm health. The
   * cause is the need itself; the death it may lead to points here.
   */
  | { type: 'need_ran_out'; villager: number; need: Need }
  /**
   * A villager fainted from want of sleep (step 1.5): it falls where it stands and lies until
   * `sleeping.faintWakePoints`. The cause is the event of its sleep running out.
   */
  | { type: 'villager_fainted'; villager: number; sex: Sex; x: number; y: number }
  /**
   * A villager lit the campfire (step 1.9): the cause is its decision to kindle it. `first` — the
   * hearth was built just now (the first fire of the camp).
   */
  | {
      type: 'fire_lit';
      villager: number;
      sex: Sex;
      x: number;
      y: number;
      first: boolean;
    }
  /**
   * The campfire went out (step 1.9): its wood burnt out (the cause — the rule `fuel`). `lit` — the
   * event of its lighting; `burned` — armfuls of wood it burnt since then.
   */
  | { type: 'fire_out'; x: number; y: number; lit: number; burned: number }
  /**
   * A villager died (step 1.4). `reason` — of what; the cause is the event of the need that ran
   * out first. Could food and water be reached from where it died (`foodReachable`,
   * `waterReachable`)? Death of a need that could be met is a mistake of the mind (GDD §15.2).
   */
  | {
      type: 'villager_died';
      villager: number;
      sex: Sex;
      x: number;
      y: number;
      reason: DeathReason;
      foodReachable: boolean;
      waterReachable: boolean;
    };

export type EventType = EventBody['type'];

export type WorldEvent = EventBody & {
  /** Sequential id from 1; also the event's place in the journal. */
  id: number;
  /** Tick at which it happened. */
  tick: number;
  cause: Cause;
};

export interface EventJournal {
  /** All events in order of occurrence. */
  list: WorldEvent[];
  nextId: number;
}

export function createJournal(): EventJournal {
  return { list: [], nextId: 1 };
}

/** Record an event at the current tick and return it. */
export function emit(world: World, body: EventBody, cause: Cause): WorldEvent {
  const event = { ...body, id: world.events.nextId, tick: world.tick, cause } as WorldEvent;
  world.events.nextId += 1;
  world.events.list.push(event);
  return event;
}

/** Event by id, or undefined. */
export function findEvent(world: World, id: number): WorldEvent | undefined {
  const list = world.events.list;
  // Ids are sequential, so the id points straight at the slot; scan only if that ever changes.
  const guess = list[id - 1];
  if (guess?.id === id) return guess;
  return list.find((event) => event.id === id);
}

/** Events recorded at the current tick of type `type`, in order. */
export function eventsThisTick<T extends EventType>(
  world: World,
  type: T,
): Extract<WorldEvent, { type: T }>[] {
  const found: Extract<WorldEvent, { type: T }>[] = [];
  const list = world.events.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const event = list[i]!;
    if (event.tick !== world.tick) break;
    if (event.type === type) found.unshift(event as Extract<WorldEvent, { type: T }>);
  }
  return found;
}
