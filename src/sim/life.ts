/**
 * Life of the villagers (step 1.4): the system that makes needs fall and health suffer, and
 * writes to the journal when a need runs out and when someone dies (GDD §4.2, §4.3).
 *
 * Every tick, for every villager (./needs.ts — the arithmetic):
 *   - satiety, thirst and sleep fall (sleep comes back while asleep); a need that reaches zero is an event `need_ran_out` caused by the
 *     need itself — the villager starts to starve or to thirst;
 *   - warmth (step 1.10) follows the temperature felt on the villager's tile (./weather.ts `feltAt`);
 *   - hunger, thirst or cold at zero harms health (sleep at zero fells — ./villagers.ts), and health heals while nothing is at zero;
 *   - health falling below `life.nearDeathHealth` from hunger, thirst or cold is an event
 *     `villager_nearly_died` (step 2.1): the villager remembers it (./profile.ts);
 *   - health at zero is death: an event `villager_died` with what it died of (`reason` — the need
 *     that ran out first, its event is the cause) and whether food and water could be reached from
 *     where it died; then the villager leaves the world.
 *
 * Runs before the villagers act (src/sim/world.ts, SYSTEMS): a villager acts on the needs of the
 * current tick, and the dead do not act.
 */

import { DATA } from '../data/index.ts';
import { type DeathReason, emit } from './events.ts';
import { hearthOf, isBurning, WOOD } from './fire.ts';
import { inPile } from './items.ts';
import { findSource, searchSeat } from './minds.ts';
import { type Deadly, isDeadly, liveTick, NEEDS } from './needs.ts';
import { removeVillager, type Villager } from './villagers.ts';
import { feltAt, isRaining } from './weather.ts';
import type { System, World } from './world.ts';

/** What a need at zero kills by. */
const DEATH_BY: Record<Deadly, DeathReason> = { food: 'hunger', water: 'thirst', warmth: 'cold' };

/** The need among `empty` that ran out first (its event is older). */
function firstRanOut(villager: Villager, empty: readonly Deadly[]): Deadly {
  let first = empty[0]!;
  for (const need of empty) {
    if (villager.ranOut[need] < villager.ranOut[first]) first = need;
  }
  return first;
}

/**
 * Could `villager` warm itself (step 1.10): a place by the hearth in reach, and the fire burning or
 * ready to be lit (wood enough in the pile, no rain)?
 */
function canWarm(world: World, villager: Villager): boolean {
  if (!hearthOf(world)) return false;
  const lightable =
    isBurning(world) ||
    (!isRaining(world) && inPile(world, WOOD) >= DATA.balance.fire.kindleBranches);
  return lightable && searchSeat(world, villager) !== null;
}

function die(world: World, villager: Villager, empty: readonly Deadly[]): void {
  const need = firstRanOut(villager, empty);
  const reachable = (what: 'food' | 'water') =>
    findSource(world, villager, what, { others: false, known: false }) !== null;
  emit(
    world,
    {
      type: 'villager_died',
      villager: villager.id,
      name: villager.name,
      sex: villager.sex,
      x: villager.x,
      y: villager.y,
      reason: DEATH_BY[need],
      foodReachable: reachable('food'),
      waterReachable: reachable('water'),
      warmReachable: canWarm(world, villager),
    },
    { kind: 'event', event: villager.ranOut[need] },
  );
  removeVillager(world, villager.id);
}

/** Did health just fall below `life.nearDeathHealth` (step 2.1)? */
function nearlyDied(before: number, after: number): boolean {
  const line = DATA.balance.life.nearDeathHealth;
  return before >= line && after < line;
}

/** The villager nearly died of the need among `empty` that ran out first (step 2.1). */
function nearDeath(world: World, villager: Villager, empty: readonly Deadly[]): void {
  const need = firstRanOut(villager, empty);
  emit(
    world,
    {
      type: 'villager_nearly_died',
      villager: villager.id,
      sex: villager.sex,
      x: villager.x,
      y: villager.y,
      need,
    },
    { kind: 'event', event: villager.ranOut[need] },
  );
}

export const lifeSystem: System = {
  id: 'life',
  step(world) {
    // A copy: the dead leave the list.
    for (const villager of [...world.villagers.list]) {
      const asleep = villager.action.kind === 'sleep';
      const felt = feltAt(world, villager.x, villager.y);
      const before = villager.health;
      const { ranOut, empty, health } = liveTick(villager.needs, villager.health, asleep, felt);
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
      const deadly = empty.filter(isDeadly);
      if (health <= 0 && deadly.length > 0) die(world, villager, deadly);
      else if (deadly.length > 0 && nearlyDied(before, health)) nearDeath(world, villager, deadly);
    }
  },
};
