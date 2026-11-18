/**
 * Needs of a villager (step 1.4, GDD §4.2): satiety and thirst, scales 0…100 where 100 means no
 * need at all (fed, not thirsty), and health. The numbers live in data/balance.json (`needs`);
 * here they become rates per tick.
 *
 *   - Every tick satiety falls 100 → 0 in `needs.food.emptyDays`, thirst in `needs.water.emptyDays`
 *     (25 and 15 days: ten times GDD §4.2 — the owner's decision, ADR-024, so that the two do not
 *     spend their lives eating and drinking).
 *   - A need at zero harms health: from 100 to 0 in its `deathDays` (hunger 40 days, thirst 20);
 *     both at zero harm faster. Health at zero is death (./life.ts writes it to the journal).
 *   - While no need is at zero, health comes back: 0 → 100 in `needs.healDays`.
 *   - A ration fills `eating.rationPoints` of satiety (40, as when it was a day's food).
 *
 * Pure arithmetic over plain numbers: the world is not touched here.
 */
import { DATA } from '../data/index.ts';
import { TIME } from './calendar.ts';

/** Needs of step 1.4, in a fixed order (the order of checks and of the debug bars). */
export const NEEDS = ['food', 'water'] as const;
export type Need = (typeof NEEDS)[number];

/** A value per need: the scales of a villager, ids of events… */
export type PerNeed<T> = Record<Need, T>;

/** The top of every scale: no need at all; full health. */
export const FULL = 100;

export function fullNeeds(): PerNeed<number> {
  return { food: FULL, water: FULL };
}

/** How much a need falls in a tick. */
export function fallPerTick(need: Need): number {
  return FULL / (DATA.balance.needs[need].emptyDays * TIME.ticksPerDay);
}

/** How much health a need at zero takes away in a tick. */
export function harmPerTick(need: Need): number {
  return FULL / (DATA.balance.needs[need].deathDays * TIME.ticksPerDay);
}

/** How much health comes back in a tick while no need is at zero. */
export function healPerTick(): number {
  return FULL / (DATA.balance.needs.healDays * TIME.ticksPerDay);
}

/**
 * Satiety one ration gives (`eating.rationPoints`). GDD §13.2 has a ration as a day's food; the
 * owner made satiety last ten times longer (ADR-024) and a ration still fills as much — so an
 * adult eats a tenth of a ration a day.
 */
export function satietyPerRation(): number {
  return DATA.balance.eating.rationPoints;
}

/** Points one bite (food) or one sip (water) gives back. */
export function portionOf(need: Need): number {
  const { biteRations, sipPoints } = DATA.balance.eating;
  return need === 'food' ? biteRations * satietyPerRation() : sipPoints;
}

/** Ticks one bite or one sip takes. */
export function portionTicks(need: Need): number {
  const { biteTicks, sipTicks } = DATA.balance.eating;
  return need === 'food' ? biteTicks : sipTicks;
}

/** Is there no room for another bite or sip (it would be partly wasted)? Eating stops then. */
export function isSated(value: number, need: Need): boolean {
  return value > FULL - portionOf(need);
}

/** How pressing a need is: 0 — none (the scale is full), 1 — the scale is at zero. */
export function urgency(value: number): number {
  return (FULL - value) / FULL;
}

/** What one tick of life did to a villager's scales. */
export interface NeedsTick {
  /** Needs that reached zero on this tick (were above it before). */
  ranOut: Need[];
  /** Needs at zero now. */
  empty: Need[];
}

/**
 * One tick of the needs of one villager: the scales fall, a need at zero harms health, health
 * heals while nothing is at zero. Changes `needs` and returns the new health.
 */
export function liveTick(needs: PerNeed<number>, health: number): NeedsTick & { health: number } {
  const ranOut: Need[] = [];
  const empty: Need[] = [];
  for (const need of NEEDS) {
    const before = needs[need];
    const after = Math.max(0, before - fallPerTick(need));
    needs[need] = after;
    if (after === 0) {
      empty.push(need);
      if (before > 0) ranOut.push(need);
    }
  }
  let next = health;
  if (empty.length > 0) {
    for (const need of empty) next -= harmPerTick(need);
  } else {
    next += healPerTick();
  }
  return { ranOut, empty, health: Math.min(FULL, Math.max(0, next)) };
}
