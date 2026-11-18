/**
 * Life of the villagers (step 1.4): the system that makes needs fall and health suffer, and
 * writes to the journal when a need runs out and when someone dies (GDD §4.2, §4.3).
 *
 * Every tick, for every villager (./needs.ts — the arithmetic):
 *   - satiety, thirst and sleep fall (sleep comes back while asleep); a need that reaches zero is an event `need_ran_out` caused by the
 *     need itself — the villager starts to starve or to thirst;
 *   - hunger or thirst at zero harms health (sleep at zero fells — ./villagers.ts), and health heals while nothing is at zero;
 *   - health at zero is death: an event `villager_died` with what it died of (`reason` — the need
 *     that ran out first, its event is the cause) and whether food and water could be reached from
 *     where it died; then the villager leaves the world.
 *
 * Runs before the villagers act (src/sim/world.ts, SYSTEMS): a villager acts on the needs of the
 * current tick, and the dead do not act.
 */
import { type DeathReason, emit } from './events.ts';
import { findSource } from './minds.ts';
import { isMeal, liveTick, type Meal, NEEDS } from './needs.ts';
import { removeVillager, type Villager } from './villagers.ts';
import type { System, World } from './world.ts';

/** What a need at zero kills by. */
const DEATH_BY: Record<Meal, DeathReason> = { food: 'hunger', water: 'thirst' };

/** The need among `empty` that ran out first (its event is older). */
function firstRanOut(villager: Villager, empty: readonly Meal[]): Meal {
  let first = empty[0]!;
  for (const need of empty) {
    if (villager.ranOut[need] < villager.ranOut[first]) first = need;
  }
  return first;
}

function die(world: World, villager: Villager, empty: readonly Meal[]): void {
  const need = firstRanOut(villager, empty);
  const reachable = (what: Meal) => findSource(world, villager, what, { others: false }) !== null;
  emit(
    world,
    {
      type: 'villager_died',
      villager: villager.id,
      sex: villager.sex,
      x: villager.x,
      y: villager.y,
      reason: DEATH_BY[need],
      foodReachable: reachable('food'),
      waterReachable: reachable('water'),
    },
    { kind: 'event', event: villager.ranOut[need] },
  );
  removeVillager(world, villager.id);
}

export const lifeSystem: System = {
  id: 'life',
  step(world) {
    // A copy: the dead leave the list.
    for (const villager of [...world.villagers.list]) {
      const asleep = villager.action.kind === 'sleep';
      const { ranOut, empty, health } = liveTick(villager.needs, villager.health, asleep);
      villager.health = health;
      for (const need of NEEDS) if (villager.needs[need] > 0) villager.ranOut[need] = 0;
      for (const need of ranOut) {
        const event = emit(
          world,
          { type: 'need_ran_out', villager: villager.id, need },
          { kind: 'need', villager: villager.id, need },
        );
        villager.ranOut[need] = event.id;
      }
      const deadly = empty.filter(isMeal);
      if (health <= 0 && deadly.length > 0) die(world, villager, deadly);
    }
  },
};
