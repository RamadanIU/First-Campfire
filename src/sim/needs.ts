/**
 * Needs of a villager (step 1.4, GDD §4.2): satiety, thirst and (step 1.5) sleep, scales 0…100
 * where 100 means no need at all (fed, not thirsty, rested), and health. The numbers live in data/balance.json (`needs`);
 * here they become rates per tick.
 *
 *   - Every tick satiety falls 100 → 0 in `needs.food.emptyDays`, thirst in `needs.water.emptyDays`
 *     (25 and 15 days: ten times GDD §4.2 — the owner's decision, ADR-024, so that the two do not
 *     spend their lives eating and drinking).
 *   - A need at zero harms health: from 100 to 0 in its `deathDays` (hunger 40 days, thirst 20);
 *     both at zero harm faster. Health at zero is death (./life.ts writes it to the journal).
 *   - While no need is at zero, health comes back: 0 → 100 in `needs.healDays`.
 *   - Sleep falls 100 → 0 in `needs.sleep.emptyDays` (1.5 days) while awake and comes back while
 *     asleep (`sleeping`); at zero it does not kill — the villager faints.
 *   - A ration fills `eating.rationPoints` of satiety (40, as when it was a day's food).
 *   - Warmth (step 1.10) does not fall by the clock: it follows the temperature the villager feels
 *     (./weather.ts `feltAt` — the air and the campfire). Colder than `needs.warmth.comfort`, it
 *     falls by `pointsPerDegreeDay` a day for every degree short; warmer — rises as fast. At zero —
 *     frostbite: it harms health like hunger and thirst (death — of cold).
 *
 * Pure arithmetic over plain numbers: the world is not touched here.
 */
import { DATA } from '../data/index.ts';
import { TIME } from './calendar.ts';

/** Needs, in a fixed order (the order of checks and of the debug bars); sleep — step 1.5, warmth — 1.10. */
export const NEEDS = ['food', 'water', 'sleep', 'warmth'] as const;
export type Need = (typeof NEEDS)[number];

/** Needs met at a source by eating or drinking (bites, sips), and whose absence kills. */
export const MEALS = ['food', 'water'] as const;
export type Meal = (typeof MEALS)[number];

/** Is it a need of eating or drinking (not sleep or warmth)? */
export function isMeal(need: Need): need is Meal {
  return need === 'food' || need === 'water';
}

/** Needs whose zero harms health and kills (step 1.10: and warmth — frostbite, death of cold). */
export const DEADLY = ['food', 'water', 'warmth'] as const;
export type Deadly = (typeof DEADLY)[number];

/** Does this need at zero harm health? */
export function isDeadly(need: Need): need is Deadly {
  return need !== 'sleep';
}

/** A value per need: the scales of a villager, ids of events… */
export type PerNeed<T> = Record<Need, T>;

/** The top of every scale: no need at all; full health. */
export const FULL = 100;

export function fullNeeds(): PerNeed<number> {
  return { food: FULL, water: FULL, sleep: FULL, warmth: FULL };
}

/** A value of `value` for every need. */
export function perNeed<T>(value: T): PerNeed<T> {
  return { food: value, water: value, sleep: value, warmth: value };
}

/** How much a need that falls by the clock falls in a tick (sleep — while awake). */
export function fallPerTick(need: Meal | 'sleep'): number {
  return FULL / (DATA.balance.needs[need].emptyDays * TIME.ticksPerDay);
}

/** How much health a need at zero takes away in a tick. */
export function harmPerTick(need: Deadly): number {
  return FULL / (DATA.balance.needs[need].deathDays * TIME.ticksPerDay);
}

/**
 * How much warmth changes in a tick at a felt temperature of `felt` degrees (step 1.10): falls below
 * `needs.warmth.comfort`, rises above it, by `pointsPerDegreeDay` a day per degree.
 */
export function warmthPerTick(felt: number): number {
  const { comfort, pointsPerDegreeDay } = DATA.balance.needs.warmth;
  return ((felt - comfort) * pointsPerDegreeDay) / TIME.ticksPerDay;
}

/** Is a villager with this warmth shivering with cold (seen on the map)? */
export function isShivering(warmth: number): boolean {
  return warmth < DATA.balance.needs.warmth.shiverPoints;
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
export function portionOf(need: Meal): number {
  const { biteRations, sipPoints } = DATA.balance.eating;
  return need === 'food' ? biteRations * satietyPerRation() : sipPoints;
}

/** Ticks one bite or one sip takes. */
export function portionTicks(need: Meal): number {
  const { biteTicks, sipTicks } = DATA.balance.eating;
  return need === 'food' ? biteTicks : sipTicks;
}

/** Is there no room for another bite or sip (it would be partly wasted)? Eating stops then. */
export function isSated(value: number, need: Meal): boolean {
  return value > FULL - portionOf(need);
}

/** How pressing a need is: 0 — none (the scale is full), 1 — the scale is at zero. */
export function urgency(value: number): number {
  return (FULL - value) / FULL;
}

/**
 * How much sleep comes back in a tick of sleep: a bed fills the scale in `sleeping.fillDays`,
 * the bare ground `sleeping.groundFactor` times slower (GDD §4.2: ×0.5). Beds — later.
 */
export function sleepPerTick(): number {
  const { fillDays, groundFactor } = DATA.balance.sleeping;
  return (FULL / (fillDays * TIME.ticksPerDay)) * groundFactor;
}

/** What one tick of life did to a villager's scales. */
export interface NeedsTick {
  /** Needs that reached zero on this tick (were above it before). */
  ranOut: Need[];
  /** Needs at zero now. */
  empty: Need[];
}

/**
 * One tick of the needs of one villager: the scales fall (sleep rises instead while `asleep`;
 * warmth follows the temperature `felt`, degrees — by default comfortable), a need of food, water
 * or warmth at zero harms health, health heals while none is at zero. Sleep at zero does not harm:
 * it fells (a faint — ./villagers.ts). Changes `needs` and returns the new health.
 */
export function liveTick(
  needs: PerNeed<number>,
  health: number,
  asleep = false,
  felt: number = DATA.balance.needs.warmth.comfort,
): NeedsTick & { health: number } {
  const ranOut: Need[] = [];
  const empty: Need[] = [];
  for (const need of NEEDS) {
    const before = needs[need];
    if (need === 'sleep' && asleep) {
      needs.sleep = Math.min(FULL, before + sleepPerTick());
      continue;
    }
    const after =
      need === 'warmth'
        ? Math.min(FULL, Math.max(0, before + warmthPerTick(felt)))
        : Math.max(0, before - fallPerTick(need));
    needs[need] = after;
    if (after === 0) {
      empty.push(need);
      if (before > 0) ranOut.push(need);
    }
  }
  let next = health;
  const harmful = empty.filter(isDeadly);
  if (harmful.length > 0) {
    for (const need of harmful) next -= harmPerTick(need);
  } else {
    next += healPerTick();
  }
  return { ranOut, empty, health: Math.min(FULL, Math.max(0, next)) };
}
