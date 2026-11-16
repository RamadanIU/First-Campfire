import { describe, expect, it } from 'vitest';
import {
  calendarAt,
  DAYS_PER_YEAR,
  PHASE_LENGTH,
  PHASE_START,
  TICKS_PER_SEASON,
  TICKS_PER_YEAR,
  TIME,
  tickAt,
} from './calendar.ts';

describe('календарь', () => {
  it('числа из GDD §13.1: сутки 400 тиков, сезон 3 дня, год 12 дней', () => {
    expect(TIME.ticksPerDay).toBe(400);
    expect(TICKS_PER_SEASON).toBe(1200);
    expect(TICKS_PER_YEAR).toBe(4800);
    expect(DAYS_PER_YEAR).toBe(12);
  });

  it('фазы суток: рассвет 10 %, день 50 %, закат 10 %, ночь 30 %', () => {
    expect(PHASE_START).toEqual({ dawn: 0, day: 40, dusk: 240, night: 280 });
    expect(PHASE_LENGTH).toEqual({ dawn: 40, day: 200, dusk: 40, night: 120 });
  });

  it('мир начинается с рассвета первого дня весны первого года', () => {
    expect(calendarAt(0)).toEqual({
      tick: 0,
      year: 1,
      season: 'spring',
      seasonIndex: 0,
      dayOfSeason: 1,
      dayOfYear: 1,
      day: 1,
      tickOfDay: 0,
      dayProgress: 0,
      phase: 'dawn',
      phaseProgress: 0,
    });
  });

  it('границы фаз внутри дня', () => {
    const phases = [39, 40, 239, 240, 279, 280].map((tick) => calendarAt(tick).phase);
    expect(phases).toEqual(['dawn', 'day', 'day', 'dusk', 'dusk', 'night']);
    expect(calendarAt(20).phaseProgress).toBe(0.5);
    expect(calendarAt(340).phaseProgress).toBe(0.5);
  });

  it('последний тик дня — ещё ночь того же дня, следующий — рассвет нового', () => {
    expect(calendarAt(399)).toMatchObject({ day: 1, tickOfDay: 399, phase: 'night' });
    expect(calendarAt(400)).toMatchObject({ day: 2, tickOfDay: 0, phase: 'dawn', dayOfSeason: 2 });
  });

  it('последний тик сезона и первый тик следующего', () => {
    expect(calendarAt(TICKS_PER_SEASON - 1)).toMatchObject({
      season: 'spring',
      dayOfSeason: 3,
      dayOfYear: 3,
      phase: 'night',
    });
    expect(calendarAt(TICKS_PER_SEASON)).toMatchObject({
      season: 'summer',
      seasonIndex: 1,
      dayOfSeason: 1,
      dayOfYear: 4,
      phase: 'dawn',
    });
    expect(calendarAt(3 * TICKS_PER_SEASON)).toMatchObject({ season: 'winter', dayOfYear: 10 });
  });

  it('последний тик года и первый тик следующего', () => {
    expect(calendarAt(TICKS_PER_YEAR - 1)).toMatchObject({
      year: 1,
      season: 'winter',
      dayOfSeason: 3,
      dayOfYear: 12,
      day: 12,
      tickOfDay: 399,
      phase: 'night',
    });
    expect(calendarAt(TICKS_PER_YEAR)).toMatchObject({
      year: 2,
      season: 'spring',
      dayOfSeason: 1,
      dayOfYear: 1,
      day: 13,
      tickOfDay: 0,
      phase: 'dawn',
    });
  });

  it('далёкое будущее: 150-й год', () => {
    const tick = 149 * TICKS_PER_YEAR + 2 * TICKS_PER_SEASON + 400 + 300;
    expect(calendarAt(tick)).toMatchObject({
      year: 150,
      season: 'autumn',
      dayOfSeason: 2,
      dayOfYear: 8,
      day: 149 * 12 + 8,
      tickOfDay: 300,
      phase: 'night',
    });
  });

  it('tickAt — обратное преобразование', () => {
    expect(tickAt(1)).toBe(0);
    expect(tickAt(2, 280)).toBe(680);
    expect(calendarAt(tickAt(13, 40))).toMatchObject({ year: 2, day: 13, phase: 'day' });
  });

  it('отвергает отрицательный и дробный тик', () => {
    expect(() => calendarAt(-1)).toThrow();
    expect(() => calendarAt(1.5)).toThrow();
  });
});
