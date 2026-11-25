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
import { calendarAt, type Season, TIME } from './calendar.ts';
import type { Cause } from './events.ts';
import { countAll, inPile, inStore } from './items.ts';
import { count, gauge, type Metric, max, mean, min, sum } from './stats.ts';

/** «весной», «летом», «осенью» — for the names of the metrics by season (berries have none in winter). */
const SEASON_IN: Record<Exclude<Season, 'winter'>, string> = {
  spring: 'весной',
  summer: 'летом',
  autumn: 'осенью',
};

/** «осенью», «зимой» — for the names of the metrics of the store by season. */
const SEASON_IN_ALL: Record<'autumn' | 'winter', string> = { autumn: 'осенью', winter: 'зимой' };

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
    // Of cold (step 1.10) — a mistake only if warmth was in reach too.
    (e) => e.foodReachable && e.waterReachable && (e.reason !== 'cold' || e.warmReachable),
  ),
  min('first_death_day', 'Первая смерть, день', 'villager_died', (e) => dayOf(e.tick)),
  count('starving', 'Сытость падала до нуля, раз', 'need_ran_out', (e) => e.need === 'food'),
  count('thirsting', 'Жажда падала до нуля, раз', 'need_ran_out', (e) => e.need === 'water'),
  // Sleep (step 1.5): a need at zero fells a villager — a faint.
  count('sleepless', 'Сон падал до нуля, раз', 'need_ran_out', (e) => e.need === 'sleep'),
  count('fainted', 'Обмороков от недосыпа', 'villager_fainted'),
  gauge('berries_left', 'Ягод на кустах (на конец), рационов', (world) =>
    world.objects.list.reduce(
      (total, object) => total + (object.def === 'berry_bush' ? object.stock : 0),
      0,
    ),
  ),
  // Items (step 1.7): branches fall under trees, the villagers carry them to the pile.
  gauge('branches_made', 'Упало веток всего (на конец)', (world) => world.items.made),
  gauge('branches_pile', 'Веток в куче у стоянки (на конец)', (world) => inPile(world, 'branches')),
  gauge('branches_loose', 'Стопок веток на земле вне кучи (на конец)', (world) =>
    world.items.list.reduce((n, item) => n + (item.place === 'ground' ? 1 : 0), 0),
  ),
  gauge('items_lost', 'Предметов потеряно или лишних (ошибка, на конец)', (world) =>
    Math.abs(
      Object.values(countAll(world)).reduce((total, n) => total + n, 0) +
        world.items.burned +
        world.items.rotted +
        world.items.eaten +
        world.items.spoiled -
        world.items.made -
        world.items.picked,
    ),
  ),
  // The campfire (step 1.9): lit from the pile, fed, goes out without wood.
  min('fire_first_day', 'Первый костёр, день', 'fire_lit', (e) => (e.first ? dayOf(e.tick) : null)),
  count('fires_lit', 'Костёр разведён, раз', 'fire_lit'),
  count('fires_out', 'Костёр погас, раз', 'fire_out'),
  gauge('fire_burning', 'Костёр горит (на конец): 1 — да', (world) => (world.fire.lit ? 1 : 0)),
  gauge('wood_burned', 'Сожжено веток (на конец)', (world) => world.items.burned),
  gauge('wood_rotted', 'Сгнило веток на земле (на конец)', (world) => world.items.rotted),
  // Warmth, seasons, weather (step 1.10): winter is cold, rain soaks the fire.
  gauge('pair_alive', 'Пара жива (на конец года): 1 — да', (world) =>
    world.villagers.list.length >= 2 ? 1 : 0,
  ),
  count('deaths_cold', 'Умерли от холода', 'villager_died', (e) => e.reason === 'cold'),
  count('freezing', 'Тепло падало до нуля, раз', 'need_ran_out', (e) => e.need === 'warmth'),
  count('fires_rained_out', 'Костёр залило дождём, раз', 'fire_out', (e) =>
    isRule(e.cause, 'rain'),
  ),
  count('rains', 'Дождей', 'weather_changed', (e) => e.to === 'rain'),
  count('snows', 'Снегопадов', 'weather_changed', (e) => e.to === 'snow'),
  gauge('forage_left', 'Орехов и кореньев (на конец), рационов', (world) =>
    world.objects.list.reduce(
      (total, object) =>
        total + (object.def === 'hazel' || object.def === 'roots' ? object.stock : 0),
      0,
    ),
  ),
  // The yearly crop (step 1.11): bushes bear once a year, the near ones are picked bare first.
  count('food_visits', 'Подходов к еде (куст, лещина, коренья)', 'food_found', (e) => !e.stored),
  mean('food_trip', 'Поход за едой: от стоянки до еды, тайлов', 'food_found', (e) =>
    e.stored ? null : e.distance,
  ),
  // Berries ripen in spring: the near bushes are picked bare first, by autumn one goes farther.
  ...(['spring', 'summer', 'autumn'] as const).map((season) =>
    mean(
      `berry_trip_${season}`,
      `Поход за ягодами ${SEASON_IN[season]}: от стоянки, тайлов`,
      'food_found',
      (e) =>
        e.food === 'berries' && !e.stored && calendarAt(e.tick).season === season
          ? e.distance
          : null,
    ),
  ),
  mean('forage_trip', 'Поход за орехами и кореньями: от стоянки, тайлов', 'food_found', (e) =>
    e.food === 'berries' || e.stored ? null : e.distance,
  ),
  // Memory, scouting, the store (step 1.11b): one knows only the land one saw.
  gauge('explored', 'Разведано земли (на конец), доля клеток у самого знающего', (world) =>
    world.villagers.list.reduce(
      (most, villager) =>
        Math.max(
          most,
          Math.round(
            (villager.seen.reduce((n, cell) => n + cell, 0) / Math.max(1, villager.seen.length)) *
              100,
          ) / 100,
        ),
      0,
    ),
  ),
  sum('stored', 'Отнесено еды в запас, горстей', 'food_stored', (e) => e.count),
  ...(['autumn', 'winter'] as const).map((season) =>
    sum(
      `stored_${season}`,
      `Отнесено в запас ${SEASON_IN_ALL[season]}, горстей`,
      'food_stored',
      (e) => (calendarAt(e.tick).season === season ? e.count : null),
    ),
  ),
  count('store_meals', 'Ели из запаса, раз', 'food_found', (e) => e.stored),
  count(
    'store_meals_winter',
    'Ели из запаса зимой, раз',
    'food_found',
    (e) => e.stored && calendarAt(e.tick).season === 'winter',
  ),
  gauge('store_eaten', 'Съедено из запаса (на конец), горстей', (world) => world.items.eaten),
  gauge('store_spoiled', 'Испортилось еды (на конец), горстей', (world) => world.items.spoiled),
  gauge('store_left', 'Еды в запасе (на конец), горстей', (world) => inStore(world)),
];

/** Is the cause of an event this rule of the world? */
function isRule(cause: Cause, rule: string): boolean {
  return cause.kind === 'rule' && cause.rule === rule;
}

/** Day of the world's life a tick falls on, from 1. */
function dayOf(tick: number): number {
  return Math.floor(tick / TIME.ticksPerDay) + 1;
}
