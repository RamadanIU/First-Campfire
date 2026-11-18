import { describe, expect, it } from 'vitest';
import { TICKS_PER_YEAR, TIME, tickAt } from '../sim/calendar.ts';
import { dateOf, shortDateOf } from './dates.ts';

describe('дата мира словами', () => {
  it('идёт верно: сутки 400 тиков, сезон 3 дня, год 12 дней (GDD §2.1)', () => {
    expect(TIME.ticksPerDay).toBe(400);
    expect(dateOf(0)).toBe('год 1 · весна · день 1 из 3');
    expect(dateOf(399)).toBe('год 1 · весна · день 1 из 3');
    expect(dateOf(400)).toBe('год 1 · весна · день 2 из 3');
    expect(dateOf(tickAt(3, 399))).toBe('год 1 · весна · день 3 из 3');
    expect(dateOf(tickAt(4))).toBe('год 1 · лето · день 1 из 3');
    expect(dateOf(tickAt(7, 200))).toBe('год 1 · осень · день 1 из 3');
    expect(dateOf(tickAt(12, 399))).toBe('год 1 · зима · день 3 из 3');
    expect(dateOf(TICKS_PER_YEAR)).toBe('год 2 · весна · день 1 из 3');
    // The control world of the menu: seed 7 at tick 9 000.
    expect(dateOf(9000)).toBe('год 2 · зима · день 2 из 3');
    expect(dateOf(42_100)).toBe('год 9 · зима · день 1 из 3');
  });

  it('короткая дата для ленты событий', () => {
    expect(shortDateOf(0)).toBe('год 1, весна, день 1');
    expect(shortDateOf(9000)).toBe('год 2, зима, день 2');
  });
});
