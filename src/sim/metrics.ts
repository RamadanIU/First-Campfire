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
];
