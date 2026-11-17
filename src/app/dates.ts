/**
 * Dates of the world in words, for the interface: «год 2 · лето · день 1».
 * (A single module of all player-facing texts arrives with the observer HUD, stage 1.)
 */
import { calendarAt, type Season, TIME } from '../sim/calendar.ts';

export const SEASON_NAME: Record<Season, string> = {
  spring: 'весна',
  summer: 'лето',
  autumn: 'осень',
  winter: 'зима',
};

/** «год 2 · лето · день 1 из 3» — the date of a tick. */
export function dateOf(tick: number): string {
  const now = calendarAt(tick);
  return `год ${now.year} · ${SEASON_NAME[now.season]} · день ${now.dayOfSeason} из ${TIME.daysPerSeason}`;
}

/** Whole numbers with thin spaces between thousands: 9 000. */
export function formatCount(value: number): string {
  return value.toLocaleString('ru-RU');
}
