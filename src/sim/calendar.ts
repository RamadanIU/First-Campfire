/**
 * Calendar: simulation tick → time of day, day, season, year.
 *
 * The world starts at tick 0 = the first moment of dawn, day 1, spring, year 1.
 * A day starts with dawn: dawn → day → dusk → night, then the next day's dawn.
 *
 * The numbers (GDD §2.1, §13.1) live in data/balance.json, section `time`; here they are only
 * read. The lists of phases and seasons are mechanics, not balance: they stay in code.
 */
import { DATA } from '../data/index.ts';
import { DAY_PHASES, type DayPhase } from '../data/tables.ts';

export { DAY_PHASES, type DayPhase };

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/**
 * Time constants from data/balance.json: ticks per second at ×1, ticks per day, days per season,
 * share of each phase of the day in percent; plus the number of seasons in a year (the list
 * above).
 */
export const TIME = { ...DATA.balance.time, seasonsPerYear: SEASONS.length } as const;

export const TICKS_PER_SEASON = TIME.ticksPerDay * TIME.daysPerSeason;
export const TICKS_PER_YEAR = TICKS_PER_SEASON * TIME.seasonsPerYear;
export const DAYS_PER_YEAR = TIME.daysPerSeason * TIME.seasonsPerYear;

/** First tick of each phase within a day (dawn 0, day 40, dusk 240, night 280). */
export const PHASE_START: Readonly<Record<DayPhase, number>> = (() => {
  const starts = {} as Record<DayPhase, number>;
  let percent = 0;
  for (const phase of DAY_PHASES) {
    starts[phase] = Math.round((percent * TIME.ticksPerDay) / 100);
    percent += TIME.phasePercent[phase];
  }
  return starts;
})();

/** Length of each phase in ticks. */
export const PHASE_LENGTH: Readonly<Record<DayPhase, number>> = (() => {
  const lengths = {} as Record<DayPhase, number>;
  DAY_PHASES.forEach((phase, index) => {
    const next = DAY_PHASES[index + 1];
    lengths[phase] = (next ? PHASE_START[next] : TIME.ticksPerDay) - PHASE_START[phase];
  });
  return lengths;
})();

export interface CalendarDate {
  tick: number;
  /** Year number, from 1. */
  year: number;
  season: Season;
  /** 0 = spring … 3 = winter. */
  seasonIndex: number;
  /** Day within the season, from 1. */
  dayOfSeason: number;
  /** Day within the year, from 1. */
  dayOfYear: number;
  /** Days since the world began, from 1. */
  day: number;
  /** Tick within the day, 0 … ticksPerDay − 1. */
  tickOfDay: number;
  /** How far the day has gone, [0, 1). */
  dayProgress: number;
  phase: DayPhase;
  /** How far the current phase has gone, [0, 1). */
  phaseProgress: number;
}

/** Which phase a tick of the day belongs to. */
export function phaseOfTick(tickOfDay: number): DayPhase {
  for (let i = DAY_PHASES.length - 1; i > 0; i--) {
    const phase = DAY_PHASES[i]!;
    if (tickOfDay >= PHASE_START[phase]) return phase;
  }
  return DAY_PHASES[0];
}

export function calendarAt(tick: number): CalendarDate {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error(`Тик должен быть целым неотрицательным числом, получено: ${tick}`);
  }
  const dayIndex = Math.floor(tick / TIME.ticksPerDay);
  const tickOfDay = tick - dayIndex * TIME.ticksPerDay;
  const yearIndex = Math.floor(dayIndex / DAYS_PER_YEAR);
  const dayOfYearIndex = dayIndex - yearIndex * DAYS_PER_YEAR;
  const seasonIndex = Math.floor(dayOfYearIndex / TIME.daysPerSeason);
  const phase = phaseOfTick(tickOfDay);
  return {
    tick,
    year: yearIndex + 1,
    season: SEASONS[seasonIndex]!,
    seasonIndex,
    dayOfSeason: dayOfYearIndex - seasonIndex * TIME.daysPerSeason + 1,
    dayOfYear: dayOfYearIndex + 1,
    day: dayIndex + 1,
    tickOfDay,
    dayProgress: tickOfDay / TIME.ticksPerDay,
    phase,
    phaseProgress: (tickOfDay - PHASE_START[phase]) / PHASE_LENGTH[phase],
  };
}

/**
 * The tick at which a given moment happens: `day` from 1 (absolute) and a tick within the day.
 * Handy for tests and debug links (`?ticks=`).
 */
export function tickAt(day: number, tickOfDay = 0): number {
  return (day - 1) * TIME.ticksPerDay + tickOfDay;
}
