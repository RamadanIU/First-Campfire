/**
 * The yearly crop (step 1.11, GDD §3.2 «ягодные кусты плодоносят раз в год»): food on objects —
 * berries on raspberry bushes, nuts on hazel, roots in a patch — ripens once a year, little by
 * little, and what is picked does not come back until the next year.
 *
 *   - Every object with a `harvest` (data/objects.json) ripens in the season `harvest.ripens`: at
 *     the start of each of its days a like share of the year's crop (`harvest.rations` ÷ days of a
 *     season) comes on the object. Eaten berries are gone — the shares are fixed, they do not top
 *     the stock up — so a bush gives `rations` a year, no more.
 *   - At the start of the season of ripening the old crop is gone (what was left falls), and at the
 *     start of a season out of `harvest.seasons` — too: raspberries have nothing in winter, hazel
 *     and roots nothing in spring and summer. A bush picked clean stays empty until it ripens again.
 *   - The world begins at the start of a day (tick 0, the first day of spring): `setCrops` sets
 *     every object as that day's start would — raspberries carry the first share of the year,
 *     hazel and roots nothing until autumn.
 *
 * Checked once a day (the start of a day), so a year of a map's ≈ 40 objects with food costs some
 * 500 updates. No randomness: every bush of a kind ripens alike.
 */
import { DATA } from '../data/index.ts';
import type { MapObjectDef } from '../data/tables.ts';
import { calendarAt, TIME } from './calendar.ts';
import { defOf, type MapObject } from './objects.ts';
import type { System, World } from './world.ts';

type Harvest = NonNullable<MapObjectDef['harvest']>;

/**
 * The crop of `object` at the start of the day `tick` falls on (a tick at the start of a day):
 * the old crop falls at the start of its ripening season or of a season without harvest; on a day
 * of ripening a share of the year's crop comes. Objects without harvest are left alone.
 */
export function ripenDay(object: MapObject, tick: number): void {
  const harvest = defOf(object).harvest;
  if (harvest === null) return;
  const { season, dayOfSeason } = calendarAt(tick);
  const first = dayOfSeason === 1;
  const inSeason = (harvest.seasons as readonly string[]).includes(season);
  if (first && (season === harvest.ripens || !inSeason)) setStock(object, 0);
  if (season === harvest.ripens) setStock(object, object.stock + shareOf(harvest.rations));
}

/** The share of a year's crop that ripens in a day of the season of ripening. */
function shareOf(rations: number): number {
  return rations / TIME.daysPerSeason;
}

/** Food on the object becomes `stock`; with none it is in its empty state, with some — the first. */
function setStock(object: MapObject, stock: number): void {
  const def = defOf(object);
  object.stock = stock;
  object.state = stock > 0 ? def.states[0]! : def.harvest!.empty;
}

/**
 * The crop an object of this harvest carries on the day of `tick` if no one has touched it this year:
 * none out of its seasons; on a day of ripening — the shares of the days so far; later in its
 * seasons — the whole year's crop.
 */
export function untouchedCrop(harvest: Harvest, tick: number): number {
  const { season, dayOfSeason } = calendarAt(tick);
  if (!(harvest.seasons as readonly string[]).includes(season)) return 0;
  if (season === harvest.ripens) return shareOf(harvest.rations) * dayOfSeason;
  return harvest.rations;
}

/**
 * Every crop of the world as it would be on this day if no one had touched it (`untouchedCrop`): a
 * new world (tick 0 — raspberries carry the first share of the year, hazel and roots nothing), and
 * scenario tests that move the clock by hand.
 */
export function setCrops(world: World): void {
  for (const object of world.objects.list) {
    const harvest = defOf(object).harvest;
    if (harvest !== null) setStock(object, untouchedCrop(harvest, world.tick));
  }
}

export const harvestSystem: System = {
  id: 'harvest',
  step(world) {
    if (world.tick % DATA.balance.time.ticksPerDay !== 0) return;
    for (const object of world.objects.list) ripenDay(object, world.tick);
  },
};
