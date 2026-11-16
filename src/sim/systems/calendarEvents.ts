/**
 * Announces the passage of time in the event journal: a new year, a new season, the start of
 * each phase of the day. Other systems react to these events (fireflies rise when night falls)
 * and name them as the cause of what they do.
 */
import {
  DAY_PHASES,
  PHASE_START,
  SEASONS,
  TICKS_PER_SEASON,
  TICKS_PER_YEAR,
  TIME,
} from '../calendar.ts';
import { type Cause, emit } from '../events.ts';
import type { System } from '../world.ts';

const CALENDAR: Cause = { kind: 'rule', rule: 'calendar' };

export const calendarEventsSystem: System = {
  id: 'calendar',
  step(world) {
    const tick = world.tick;
    if (tick % TICKS_PER_YEAR === 0) {
      emit(world, { type: 'year_started', year: tick / TICKS_PER_YEAR + 1 }, CALENDAR);
    }
    if (tick % TICKS_PER_SEASON === 0) {
      const seasonIndex = (tick / TICKS_PER_SEASON) % TIME.seasonsPerYear;
      emit(
        world,
        {
          type: 'season_started',
          season: SEASONS[seasonIndex]!,
          year: Math.floor(tick / TICKS_PER_YEAR) + 1,
        },
        CALENDAR,
      );
    }
    const tickOfDay = tick % TIME.ticksPerDay;
    for (const phase of DAY_PHASES) {
      if (PHASE_START[phase] === tickOfDay) {
        const day = Math.floor(tick / TIME.ticksPerDay) + 1;
        emit(world, { type: 'phase_started', phase, day }, CALENDAR);
      }
    }
  },
};
