/**
 * Metrics of the world — what headless runs (`npm run sim`) count for every world, as totals and
 * per year. One line per metric; the kinds (gauge, count, sum, mean, max, min) are described in
 * ./stats.ts, how to read the results — in docs/ARCHITECTURE.md, «Прогоны без графики».
 *
 * A new system adds its metrics here, usually from its events:
 *
 *   count('deaths_cold', 'Умерли от холода', 'villager_died', (e) => e.cause === 'cold'),
 *   mean('food_trip', 'Поход за едой, тайлов', 'food_found', (e) => e.distance),
 *   gauge('population', 'Население', (world) => world.villagers.length),
 *
 * The id becomes a CSV column: keep ids stable, never reuse one for a different meaning.
 * The order here is the order of columns and of the console table.
 */
import { TIME } from './calendar.ts';
import { count, gauge, type Metric, max, mean, min, sum } from './stats.ts';

export const METRICS: readonly Metric[] = [
  count('events', 'Событий', 'any'),
  gauge('journal', 'Записей в журнале (на конец)', (world) => world.events.list.length),
  count('nights', 'Ночей', 'phase_started', (e) => e.phase === 'night'),
  // Fireflies — the night swarm (ADR-018); so far the only randomness in the world.
  count('swarms', 'Роёв светлячков', 'fireflies_rose'),
  sum('fireflies', 'Светлячков всего', 'fireflies_rose', (e) => e.count),
  mean('swarm_mean', 'Светлячков в рое: среднее', 'fireflies_rose', (e) => e.count),
  min('swarm_min', 'Светлячков в рое: меньше всего', 'fireflies_rose', (e) => e.count),
  max('swarm_max', 'Светлячков в рое: больше всего', 'fireflies_rose', (e) => e.count),
  // Villagers (step 1.3): so far they only walk.
  gauge('population', 'Жителей (на конец)', (world) => world.villagers.list.length),
  gauge('walked', 'Пройдено тайлов всеми жителями (на конец)', (world) =>
    Math.round(world.villagers.list.reduce((total, villager) => total + villager.walked, 0)),
  ),
  // Needs (step 1.4): hunger and thirst, deaths by cause (GDD §15.2).
  count('deaths', 'Умерли', 'villager_died'),
  count('deaths_hunger', 'Умерли от голода', 'villager_died', (e) => e.reason === 'hunger'),
  count('deaths_thirst', 'Умерли от жажды', 'villager_died', (e) => e.reason === 'thirst'),
  count(
    'deaths_mind',
    'Умерли при доступной еде и воде (ошибка ИИ)',
    'villager_died',
    (e) => e.foodReachable && e.waterReachable,
  ),
  min('first_death_day', 'Первая смерть, день', 'villager_died', (e) => dayOf(e.tick)),
  count('starving', 'Сытость падала до нуля, раз', 'need_ran_out', (e) => e.need === 'food'),
  count('thirsting', 'Жажда падала до нуля, раз', 'need_ran_out', (e) => e.need === 'water'),
  gauge('berries_left', 'Ягод на кустах (на конец), рационов', (world) =>
    world.objects.list.reduce((total, object) => total + object.stock, 0),
  ),
];

/** Day of the world's life a tick falls on, from 1. */
function dayOf(tick: number): number {
  return Math.floor(tick / TIME.ticksPerDay) + 1;
}
