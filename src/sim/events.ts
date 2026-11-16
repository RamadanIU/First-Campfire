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
import type { World } from './world.ts';

/** Why an event happened. Later steps add needs, decisions, villagers… */
export type Cause =
  /** A law of the world itself: `genesis` (the world's creation), `calendar` (time passing). */
  | { kind: 'rule'; rule: 'genesis' | 'calendar' }
  /** Another event of the journal, by id. */
  | { kind: 'event'; event: number };

/** What happened. One member per event type. */
export type EventBody =
  | { type: 'world_created'; seed: number }
  | { type: 'year_started'; year: number }
  | { type: 'season_started'; season: Season; year: number }
  | { type: 'phase_started'; phase: DayPhase; day: number }
  | { type: 'fireflies_rose'; count: number }
  | { type: 'fireflies_gone'; count: number };

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
