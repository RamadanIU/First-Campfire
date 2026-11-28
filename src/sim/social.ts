/**
 * Social life (step 2.2, GDD §4.2, §4.7): relations between acquaintances, the hidden «chemistry»
 * of a pair, and the two needs of the soul — company (`social`) and leisure (`leisure`).
 *
 *   - Two villagers become acquainted when they first see each other (within `ai.sightTiles`,
 *     checked every `ai.thinkTicks`) or first talk. Only acquaintances have a relation: a number
 *     −100…+100 (starting at 0) and the pair's chemistry — a constant −1…+1 drawn once from the
 *     stream `social`, never shown (GDD §4.7: «so that love can be unexpected»).
 *   - A talk (./villagers.ts: two stand facing each other, or talk sitting at the fire) changes the
 *     relation by `social.talkPoints`, time spent together — both sitting at the fire, both working
 *     within `social.togetherTiles` — by `social.togetherPerDay` a day; each × the pair's
 *     compatibility, 1 + `social.chemistryWeight` × chemistry. Nearer to ±100 a change counts less: a relation approaches
 *     the edge and never jumps past it. Isolated people's relations do not change.
 *   - Company comes back while talking (`social.talkFillDays` from 0 to 100), leisure while sitting
 *     at the fire (`leisure.fireFillDays`) and on a stroll (`leisure.roamFillDays`). Both fall by
 *     the clock (./needs.ts, ./life.ts) and at zero do not harm health.
 *
 * The relations are a list in the world, sorted by the pair (a < b); looked up by halving.
 * Relations of the dead are forgotten once the living have remembered the death (./profile.ts).
 */
import { DATA } from '../data/index.ts';
import type { Activity } from './minds.ts';
import { FULL } from './needs.ts';
import { floatRange } from './rng.ts';
import type { Villager } from './villagers.ts';
import type { System, World } from './world.ts';

/** A relation of two acquaintances `a` < `b` (ids). */
export interface Relation {
  a: number;
  b: number;
  /** −100…+100: hostility … closeness (GDD §4.7). */
  value: number;
  /** The pair's hidden chemistry, −1…+1, constant. */
  chemistry: number;
  /** The tick they met. */
  since: number;
}

/** The edge of a relation. */
export const RELATION_MAX = 100;

/** Index of the relation of the pair (a, b) in the sorted list, or where it would go (−1 − index). */
function indexOf(list: readonly Relation[], a: number, b: number): number {
  const [first, second] = a < b ? [a, b] : [b, a];
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = list[mid]!;
    const order = r.a - first || r.b - second;
    if (order === 0) return mid;
    if (order < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1 - lo;
}

/** The relation of two villagers (by ids), if they know each other. */
export function relationOf(world: World, a: number, b: number): Relation | undefined {
  const index = indexOf(world.relations, a, b);
  return index >= 0 ? world.relations[index] : undefined;
}

/** Do they know each other? */
export function knows(world: World, a: number, b: number): boolean {
  return a !== b && indexOf(world.relations, a, b) >= 0;
}

/** They meet (if they have not yet): a relation of 0 and the pair's chemistry. */
export function meet(world: World, a: number, b: number): Relation {
  const index = indexOf(world.relations, a, b);
  if (index >= 0) return world.relations[index]!;
  const relation: Relation = {
    a: Math.min(a, b),
    b: Math.max(a, b),
    value: 0,
    chemistry: floatRange(world.rng.social, -1, 1),
    since: world.tick,
  };
  world.relations.splice(-1 - index, 0, relation);
  return relation;
}

/**
 * Change the relation of the pair by `delta` (they meet first, if they had not): the nearer the
 * relation to the edge it moves towards, the less it changes.
 */
export function changeRelation(world: World, a: number, b: number, delta: number): void {
  const relation = meet(world, a, b);
  const toward = delta > 0 ? Math.max(0, relation.value) : Math.max(0, -relation.value);
  const next = relation.value + delta * (1 - toward / RELATION_MAX);
  relation.value = Math.min(RELATION_MAX, Math.max(-RELATION_MAX, next));
}

/**
 * How well the pair gets on: 1 + `social.chemistryWeight` × chemistry. Everything they do together
 * brings them closer by this much (traits — step 2.6 — will weigh here too, GDD §4.7).
 */
export function compatibility(relation: Relation): number {
  return 1 + DATA.balance.social.chemistryWeight * relation.chemistry;
}

/** What a talk does to the relation of the pair: `social.talkPoints` × their compatibility. */
export function talkDelta(relation: Relation): number {
  return DATA.balance.social.talkPoints * compatibility(relation);
}

/** The acquaintances of villager `id`: who and the relation, the closest first (then by id). */
export function acquaintancesOf(world: World, id: number): { id: number; value: number }[] {
  const out: { id: number; value: number }[] = [];
  for (const relation of world.relations) {
    if (relation.a === id) out.push({ id: relation.b, value: relation.value });
    else if (relation.b === id) out.push({ id: relation.a, value: relation.value });
  }
  return out.sort((x, y) => y.value - x.value || x.id - y.id);
}

/** Forget every relation of villager `id` (it died). */
export function forget(world: World, id: number): void {
  world.relations = world.relations.filter((relation) => relation.a !== id && relation.b !== id);
}

/** Work done side by side brings people together: carrying wood, the fire, the store. */
const WORK: ReadonlySet<Activity> = new Set(['haul', 'kindle', 'stoke', 'store']);

/** Is the villager sitting at the fire (also talking seated)? */
export function isSeated(villager: Villager): boolean {
  const action = villager.action;
  return action.kind === 'sit' || (action.kind === 'talk' && action.seated);
}

/** Are the two spending time together now (not talking: a talk counts by itself)? */
function together(a: Villager, b: Villager): boolean {
  const near = DATA.balance.social.togetherTiles;
  if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) > near) return false;
  if (a.action.kind === 'talk' && b.action.kind === 'talk') return false;
  if (isSeated(a) && isSeated(b)) return true;
  return WORK.has(a.plan.activity) && WORK.has(b.plan.activity);
}

/** Points a need of the soul gains in a tick of something that fills it in `days`. */
function fillPerTick(days: number): number {
  return FULL / (days * DATA.balance.time.ticksPerDay);
}

/** One tick of a villager's needs of the soul: company while talking, leisure at the fire, on a stroll. */
function soulTick(villager: Villager): void {
  const { needs } = villager;
  if (villager.action.kind === 'talk') {
    needs.social = Math.min(FULL, needs.social + fillPerTick(DATA.balance.social.talkFillDays));
  }
  const { fireFillDays, roamFillDays } = DATA.balance.leisure;
  const leisure = isSeated(villager)
    ? fillPerTick(fireFillDays)
    : villager.plan.activity === 'roam'
      ? fillPerTick(roamFillDays)
      : 0;
  needs.leisure = Math.min(FULL, needs.leisure + leisure);
}

/**
 * The system: the needs of the soul come back by what each one does; acquaintances are made by
 * sight; time spent together brings people together. Runs after the villagers act.
 */
export const socialSystem: System = {
  id: 'social',
  step(world) {
    const list = world.villagers.list;
    for (const villager of list) soulTick(villager);
    const { sightTiles, thinkTicks } = DATA.balance.ai;
    const looking = world.tick % thinkTicks === 0;
    const perTick = DATA.balance.social.togetherPerDay / DATA.balance.time.ticksPerDay;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (looking) {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const awake = a.action.kind !== 'sleep' || b.action.kind !== 'sleep';
          if (awake && dx * dx + dy * dy <= sightTiles * sightTiles) meet(world, a.id, b.id);
        }
        if (perTick > 0 && together(a, b)) {
          const relation = meet(world, a.id, b.id);
          changeRelation(world, a.id, b.id, perTick * compatibility(relation));
        }
      }
    }
  },
};
