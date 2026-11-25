/**
 * Weather and temperature (step 1.10, GDD §3.2): the year goes round, winter is cold.
 *
 *   - The weather is one of clear, cloudy, rain, snow (`WEATHER_KINDS`). It holds for a spell of
 *     `weather.spellTicks` (drawn from the stream `weather`), then the next kind is drawn by the
 *     weights of the season (`weather.chances`); it may stay the same. Rain and snow come only out of
 *     clouds: from clear weather a drawn rain or snow brings clouds first. A change is an event
 *     `weather_changed` caused by the rule `weather`.
 *   - The temperature of the air, in degrees: the season (`weather.seasonTemp`) + the time of day
 *     (`weather.phaseTemp`) + the weather (`weather.kindTemp`).
 *   - What a villager feels: the air plus the heat of a burning campfire nearby (`fire.heat` ×
 *     ./fire.ts `warmthAt`). The need «warmth» (./needs.ts) follows it.
 *
 * Plain data (docs/ARCHITECTURE.md, rule 7); only exact arithmetic.
 */
import { DATA } from '../data/index.ts';
import { WEATHER_KINDS, type WeatherKind } from '../data/tables.ts';
import { calendarAt } from './calendar.ts';
import { emit } from './events.ts';
import { warmthAt } from './fire.ts';
import { intRange, type Rng, weightedIndex } from './rng.ts';
import type { System, World } from './world.ts';

export { WEATHER_KINDS, type WeatherKind };

/** The weather of the world now. */
export interface Weather {
  kind: WeatherKind;
  /** The tick the current kind began (0 — the world's creation). */
  since: number;
  /** The tick its spell ends and the next kind is drawn. */
  until: number;
}

/** A spell's length, ticks, from the stream `weather`. */
function spell(rng: Rng): number {
  const { min, max } = DATA.balance.weather.spellTicks;
  return intRange(rng, min, max);
}

/** The world begins on a clear spring dawn; the first spell is drawn. */
export function createWeather(rng: Rng): Weather {
  return { kind: 'clear', since: 0, until: spell(rng) };
}

/** Is it raining (the fire gets soaked, ./fire.ts)? */
export function isRaining(world: World): boolean {
  return world.weather.kind === 'rain';
}

/** The kind that follows `from` in `season`: drawn by weights; rain or snow out of clear sky — clouds. */
export function nextKind(
  rng: Rng,
  season: keyof typeof DATA.balance.weather.chances,
  from: WeatherKind,
): WeatherKind {
  const chances = DATA.balance.weather.chances[season];
  const drawn =
    WEATHER_KINDS[
      weightedIndex(
        rng,
        WEATHER_KINDS.map((kind) => chances[kind]),
      )
    ]!;
  if (from === 'clear' && (drawn === 'rain' || drawn === 'snow')) return 'cloudy';
  return drawn;
}

/** The temperature of the air at `tick` in weather `kind`, degrees. */
export function airTemperatureAt(tick: number, kind: WeatherKind): number {
  const { seasonTemp, phaseTemp, kindTemp } = DATA.balance.weather;
  const { season, phase } = calendarAt(tick);
  return seasonTemp[season] + phaseTemp[phase] + kindTemp[kind];
}

/** The temperature of the air in the world now, degrees. */
export function airTemperature(world: World): number {
  return airTemperatureAt(world.tick, world.weather.kind);
}

/** What one feels on tile (x, y): the air plus the heat of a burning campfire nearby, degrees. */
export function feltAt(world: World, x: number, y: number): number {
  return airTemperature(world) + DATA.balance.fire.heat * warmthAt(world, x, y);
}

/** Is it freezing out in the open now (`fire.coldSleepBelow`): one goes to sleep by the fire from afar. */
export function isFreezing(world: World): boolean {
  return airTemperature(world) < DATA.balance.fire.coldSleepBelow;
}

/** The weather changes when its spell is over. */
export const weatherSystem: System = {
  id: 'weather',
  step(world) {
    const weather = world.weather;
    const { season } = calendarAt(world.tick);
    // A kind the new season never has (autumn rain on the first day of winter) ends at once.
    const out = DATA.balance.weather.chances[season][weather.kind] === 0;
    if (world.tick < weather.until && !out) return;
    const rng = world.rng.weather;
    const from = weather.kind;
    const to = nextKind(rng, season, from);
    weather.until = world.tick + spell(rng);
    if (to === from) return;
    weather.kind = to;
    weather.since = world.tick;
    emit(world, { type: 'weather_changed', from, to }, { kind: 'rule', rule: 'weather' });
  },
};
