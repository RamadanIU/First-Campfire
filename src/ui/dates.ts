/**
 * Dates of the world for the interface: a tick in words (the words — src/ui/texts.ts, which
 * computes nothing of the world itself).
 */
import { calendarAt, TIME } from '../sim/calendar.ts';
import { dateText, shortDateText } from './texts.ts';

/** «год 2 · лето · день 1 из 3» — the date of a tick. */
export function dateOf(tick: number): string {
  return dateText(calendarAt(tick), TIME.daysPerSeason);
}

/** «год 2, лето, день 1» — the short date of a tick (the event feed). */
export function shortDateOf(tick: number): string {
  return shortDateText(calendarAt(tick));
}
