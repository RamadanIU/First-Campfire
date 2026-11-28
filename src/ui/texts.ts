/**
 * Every text the player sees (step 1.6): one module, so that the words of the game live in one
 * place, read alike everywhere and can be translated one day without hunting through the code.
 * The interface (src/app, src/ui, src/render) writes no Russian of its own — a test guards it
 * (tests/architecture.test.ts). The words of the content (names of resources, objects, sprites)
 * live with the content itself, in data/*.json and src/art/sprites.
 *
 * Pure functions and constants without the browser: tools (`npm run sim`) and tests use them too.
 * Only types are imported: the module loads before the game and its data tables (src/main.ts
 * tells with its words that a broken table stopped the game), so it computes nothing of the
 * world — dates come in as a calendar date (src/app/dates.ts turns a tick into words).
 *
 * Sections: numbers and plural forms · dates and the time of day · villagers · events of the
 * journal · saves · the title menu · the observer's panel · debug scenes.
 */
import type { CalendarDate, DayPhase, Season } from '../sim/calendar.ts';
import type { Cause, DeathReason, WorldEvent } from '../sim/events.ts';
import type { Activity, Considered, Decision, Hold, PlanStep, Why } from '../sim/minds.ts';
import type { Deadly, Need } from '../sim/needs.ts';
import type { Memory } from '../sim/profile.ts';
import type { LoadError, LoadWarning } from '../sim/save.ts';
import type { Plan, Sex, Villager } from '../sim/villagers.ts';
import type { WeatherKind } from '../sim/weather.ts';

// ── Numbers and plural forms ─────────────────────────────────────────────────────────────────

/** The three Russian forms of a noun after a number: one (1, 21), few (2–4), many (5–20, 11–14). */
export type Forms = readonly [one: string, few: string, many: string];

/** Nouns counted in the interface, tools and debug scenes. */
export const FORMS = {
  tick: ['тик', 'тика', 'тиков'],
  year: ['год', 'года', 'лет'],
  season: ['сезон', 'сезона', 'сезонов'],
  day: ['день', 'дня', 'дней'],
  tile: ['тайл', 'тайла', 'тайлов'],
  ration: ['рацион', 'рациона', 'рационов'],
  point: ['пункт', 'пункта', 'пунктов'],
  world: ['мир', 'мира', 'миров'],
  frame: ['кадр', 'кадра', 'кадров'],
  sprite: ['спрайт', 'спрайта', 'спрайтов'],
  villager: ['житель', 'жителя', 'жителей'],
  armful: ['охапка', 'охапки', 'охапок'],
  branch: ['ветка', 'ветки', 'веток'],
} as const satisfies Record<string, Forms>;

/**
 * The form of a noun after `n`: 1 мир, 2 мира, 5 миров, 11 миров, 21 мир. A fraction takes the
 * «few» form: 2,5 тика.
 */
export function plural(n: number, forms: Forms): string {
  if (!Number.isInteger(n)) return forms[1];
  const tens = Math.abs(n) % 100;
  const units = tens % 10;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (units === 1) return forms[0];
  if (units >= 2 && units <= 4) return forms[1];
  return forms[2];
}

/** Whole numbers with spaces between thousands: 9 000. */
export function formatCount(value: number): string {
  return value.toLocaleString('ru-RU');
}

/** A number and its noun: «5 миров», «9 000 тиков». */
export function countOf(n: number, forms: Forms): string {
  return `${formatCount(n)} ${plural(n, forms)}`;
}

/** The first letter capital: «год 2…» → «Год 2…». */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Speed of the game as shown: «пауза», «×5». */
export function speedName(speed: number): string {
  return speed === 0 ? 'пауза' : `×${speed}`;
}

/** A zoom step as shown: «×0,5», «×2». */
export function zoomName(zoom: number): string {
  return `×${String(zoom).replace('.', ',')}`;
}

// ── Dates and the time of day ────────────────────────────────────────────────────────────────

export const SEASON_NAME: Record<Season, string> = {
  spring: 'весна',
  summer: 'лето',
  autumn: 'осень',
  winter: 'зима',
};

/** «весной», «летом»… — in a season. */
export const SEASON_WHEN: Record<Season, string> = {
  spring: 'весной',
  summer: 'летом',
  autumn: 'осенью',
  winter: 'зимой',
};

export const PHASE_NAME: Record<DayPhase, string> = {
  dawn: 'рассвет',
  day: 'день',
  dusk: 'закат',
  night: 'ночь',
};

/** The parts of a calendar date a text needs. */
export type DateParts = Pick<CalendarDate, 'year' | 'season' | 'dayOfSeason'>;

/** «год 2 · лето · день 1 из 3». */
export function dateText(now: DateParts, daysPerSeason: number): string {
  return `год ${now.year} · ${SEASON_NAME[now.season]} · день ${now.dayOfSeason} из ${daysPerSeason}`;
}

/** «год 2, лето, день 1» — a short date, for the lines of the event feed. */
export function shortDateText(now: DateParts): string {
  return `год ${now.year}, ${SEASON_NAME[now.season]}, день ${now.dayOfSeason}`;
}

// ── Villagers ────────────────────────────────────────────────────────────────────────────────

export const WHO: Record<Sex, string> = { male: 'мужчина', female: 'женщина' };

/** «Мужчина», «Женщина» — the title of a villager's card. */
export const WHO_TITLE: Record<Sex, string> = {
  male: 'Мужчина',
  female: 'Женщина',
};

/** A villager in words: «мужчина (житель 1)». */
export function villagerName(sex: Sex | undefined, id: number): string {
  return sex ? `${WHO[sex]} (житель ${id})` : `житель ${id}`;
}

const WALKS_TO = {
  wander: 'гуляет у стоянки',
  order: 'идёт, куда послали',
  eat: 'идёт к малине',
  drink: 'идёт к воде',
  wood: 'идёт за дровами',
  fire: 'несёт дрова к костру',
  sit: 'идёт к костру',
  bed: 'идёт спать к костру',
  scout: 'ищет еду: идёт в незнакомые места',
  pick: 'идёт собирать еду впрок',
} as const;

/**
 * Words for a resource a villager handles (step 1.7): «идёт за ветками» (`with` — after «за»),
 * «несёт 6 веток» (`forms` — after a number). The names of resources are content
 * (data/resources.json, «Ветки»); a resource without words here is named by its name.
 */
const HANDLED: Readonly<Record<string, { with: string; what: string; forms: Forms }>> = {
  branches: {
    with: 'ветками',
    what: 'ветки',
    forms: ['ветку', 'ветки', 'веток'],
  },
  // Food in the hands and in the store (step 1.11b) — handfuls.
  nuts: {
    with: 'орехами',
    what: 'орехи',
    forms: ['горсть орехов', 'горсти орехов', 'горстей орехов'],
  },
};

function handled(resource: string, name: (resource: string) => string) {
  const words = HANDLED[resource];
  if (words) return words;
  const what = name(resource).toLowerCase();
  return { with: what, what, forms: [what, what, what] as Forms };
}

/** «6 веток» — how many of a resource, in words. */
export function resourceCount(
  resource: string,
  count: number,
  name: (resource: string) => string,
): string {
  return `${count} ${plural(count, handled(resource, name).forms)}`;
}

/**
 * What a villager is doing, in words. `name` — the name of a resource (data/resources.json; the
 * module does not load the tables).
 */
export function doingOf(villager: Villager, name: (resource: string) => string): string {
  const action = villager.action;
  switch (action.kind) {
    case 'idle':
      return 'отдыхает';
    case 'walk':
      if (action.purpose === 'fetch' && action.source?.kind === 'item') {
        return `идёт за ${handled(action.source.resource, name).with}`;
      }
      if (action.purpose === 'carry' && villager.load) {
        const to = villager.plan.activity === 'store' ? 'в запас' : 'в кучу';
        return `несёт ${resourceCount(villager.load.resource, villager.load.count, name)} ${to}`;
      }
      if (action.purpose === 'fetch' || action.purpose === 'carry') return 'носит в кучу';
      if (action.purpose === 'eat' && action.source?.kind === 'store') return 'идёт к запасу еды';
      if (action.purpose === 'pick' && villager.load) {
        return `несёт ${resourceCount(villager.load.resource, villager.load.count, name)}, собирает ещё`;
      }
      if (action.purpose === 'fire' && villager.load) {
        return `несёт к костру ${resourceCount(villager.load.resource, villager.load.count, name)}`;
      }
      return WALKS_TO[action.purpose];
    case 'pick_up':
      return `подбирает ${handled(action.resource, name).what}`;
    case 'put_down':
      return villager.plan.activity === 'store'
        ? `складывает ${handled(action.resource, name).what} в запас`
        : `складывает ${handled(action.resource, name).what} в кучу`;
    case 'eat':
      return `ест ${name(action.food).toLowerCase()}`;
    case 'eat_stored':
      return `ест ${name(action.food).toLowerCase()} из запаса`;
    case 'pick':
      return `собирает ${name(action.food).toLowerCase()} впрок`;
    case 'drink':
      return 'пьёт';
    case 'sleep':
      return action.fainted ? 'лежит без сил' : 'спит';
    case 'take':
      return 'берёт дрова из кучи';
    case 'kindle':
      return 'разводит огонь';
    case 'stoke':
      return 'подкладывает дрова в костёр';
    case 'sit':
      return villager.plan.activity === 'warm' ? 'греется у костра' : 'сидит у костра';
  }
}

/** Names of the scales of a villager, as in its card. */
export const SCALE_NAME = {
  food: 'Сытость',
  water: 'Жажда',
  sleep: 'Сон',
  warmth: 'Тепло',
  health: 'Здоровье',
} as const;

/** A line of the debug panel for a villager (`debug=needs`): doing what, its scales. */
export function needsLine(villager: Villager, name: (resource: string) => string): string {
  const round = (value: number) => Math.round(value);
  return `${villagerName(villager.sex, villager.id)}: ${doingOf(villager, name)} · сытость ${round(villager.needs.food)} · жажда ${round(villager.needs.water)} · сон ${round(villager.needs.sleep)} · тепло ${round(villager.needs.warmth)} · здоровье ${round(villager.health)}`;
}

// ── The mind of a villager: plans and decisions (step 1.8, `debug=mind`) ────────────────────

/** Names of activities, as the journal of decisions shows them. */
export const ACTIVITY_NAME: Record<Activity, string> = {
  rest: 'отдых',
  sleep: 'сон',
  eat: 'еда',
  drink: 'питьё',
  haul: 'работа',
  kindle: 'развести огонь',
  stoke: 'подложить дров',
  sit: 'у огня',
  warm: 'греться',
  scout: 'разведка',
  store: 'запас',
  order: 'приказ',
};

/** Steps of plans, in the words of the journal. */
const STEP_NAME: Record<PlanStep, string> = {
  stand: 'постоять',
  stroll: 'прогуляться',
  sleep: 'спать',
  go: 'дойти',
  eat: 'есть',
  drink: 'пить',
  fetch: 'дойти до веток',
  pick_up: 'поднять',
  gather: 'набрать ещё',
  carry: 'донести до кучи',
  put_down: 'сложить',
  fetch_wood: 'дойти до дров',
  take: 'взять',
  to_fire: 'донести до костра',
  kindle: 'развести огонь',
  stoke: 'подложить',
  sit: 'сесть у огня',
  bed: 'лечь у огня',
  pick: 'собрать',
};

/** A score of the mind: «0,52». */
export function score(value: number): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * An option of a decision: «еда 0,52», «питьё ≤ 0,12» (its upper bound: not worth a search),
 * «еда — негде», «сон 0,19 — сейчас», «работа — в деле (порог 0,30)» (the plan under way and its bar).
 */
function optionText(option: Considered): string {
  const name = ACTIVITY_NAME[option.kind];
  if (option.current && (option.kind === 'rest' || option.kind === 'sleep')) {
    return `${name} ${score(option.utility)} — сейчас`;
  }
  if (option.current) return `${name} — в деле (порог ${score(option.utility)})`;
  if (option.nowhere) return `${name} — негде`;
  if (option.kind !== 'rest' && option.kind !== 'sleep') {
    return option.searched
      ? `${name} ${score(option.utility)}`
      : `${name} ≤ ${score(option.utility)}`;
  }
  return `${name} ${score(option.utility)}`;
}

const WHY_TEXT: Record<Exclude<Why, 'chose'>, (from: string, plan: string) => string> = {
  done: (from, plan) => `${from}: сделано → ${plan}`,
  failed: (from, plan) => `${from}: не вышло (источник пропал, нет пути или места) → ${plan}`,
  order: () => 'приказ наблюдателя',
  faint: () => 'упал без сил → сон',
};

export const MIND = {
  title: (who: string) => `Решения: ${who}`,
  more: (n: number) => `…и ещё ${n} — раньше`,
  empty: 'Ещё ничего не решал — отдыхает с начала мира',
  /** The plan under way: its activity, worth, the steps ahead and what breaks it off. */
  now: (plan: Plan, hold: Hold, bar: number) => {
    const ahead =
      plan.steps.length > 0
        ? ` · дальше: ${plan.steps.map((step) => STEP_NAME[step]).join(' → ')}`
        : '';
    const name = ACTIVITY_NAME[plan.activity];
    let keeps: string;
    if (hold === 'fixed') keeps = 'не передумывает';
    else if (hold === 'loose') keeps = 'уступит всему, что полезнее';
    else keeps = `бросит ради того, что полезнее ${score(bar)}`;
    const worth = plan.activity === 'order' ? '' : ` ${score(plan.utility)}`;
    return `Сейчас: ${name}${worth} · ${keeps}${ahead}`;
  },
  /** A decision in two lines: when and what was decided; what else was weighed. */
  decision: (decision: Decision, when: string): [string, string] => {
    const plan = ACTIVITY_NAME[decision.plan];
    const from = decision.from === null ? '—' : ACTIVITY_NAME[decision.from];
    if (decision.why !== 'chose') return [`${when} · ${WHY_TEXT[decision.why](from, plan)}`, ''];
    const over = decision.bar === null ? '' : ` (порог ${score(decision.bar)})`;
    const first = decision.ahead ? ` — сначала, перед «${ACTIVITY_NAME[decision.ahead]}»` : '';
    return [
      `${when} · ${from} → ${plan} ${score(decision.utility)}${over}${first}`,
      decision.options.map(optionText).join(' · '),
    ];
  },
  /** When: «12-й день, закат». */
  when: (day: number, phase: DayPhase) => `${day}-й день, ${PHASE_NAME[phase]}`,
} as const;

export const DIED_OF: Record<DeathReason, string> = {
  hunger: 'голод',
  thirst: 'жажда',
  cold: 'холод',
};

/** «от голода» — what a villager nearly died of (step 2.1). */
export const NEAR_DEATH_OF: Record<Deadly, string> = {
  food: 'от голода',
  water: 'от жажды',
  warmth: 'от холода',
};

/** «умерла на 104-й день — голод» — of a dead villager; `day` — the day of the world, from 1. */
export function deathNote(sex: Sex, day: number, reason: DeathReason): string {
  return `${sex === 'male' ? 'умер' : 'умерла'} на ${day}-й день — ${DIED_OF[reason]}`;
}

// ── Events of the journal ────────────────────────────────────────────────────────────────────

const SEASON_CAME: Record<Season, string> = {
  spring: 'наступила весна',
  summer: 'наступило лето',
  autumn: 'наступила осень',
  winter: 'наступила зима',
};

const PHASE_CAME: Record<DayPhase, string> = {
  dawn: 'рассвет',
  day: 'взошло солнце',
  dusk: 'закат',
  night: 'наступила ночь',
};

const RAN_OUT: Record<Need, string> = {
  food: 'голодает',
  water: 'мучается жаждой',
  sleep: 'валится с ног от усталости',
  warmth: 'замерзает',
};

const NEED_GONE: Record<Need, string> = {
  food: 'кончилась сытость',
  water: 'кончилась вода',
  sleep: 'кончились силы — не спал',
  warmth: 'кончилось тепло — обморожение',
};

const RULE_CAUSE: Record<Extract<Cause, { kind: 'rule' }>['rule'], string> = {
  genesis: 'начало всего',
  calendar: 'ход времени',
  fuel: 'прогорели дрова',
  weather: 'погода переменилась сама',
  rain: 'залило дождём',
};

/** An event of the journal in words, as the debug journal shows it. */
export function describeEvent(event: WorldEvent): string {
  switch (event.type) {
    case 'world_created':
      return `сотворён мир (зерно ${event.seed})`;
    case 'year_started':
      return `начался год ${event.year}`;
    case 'season_started':
      return SEASON_CAME[event.season];
    case 'phase_started':
      return event.phase === 'dawn' ? `рассвет дня ${event.day}` : PHASE_CAME[event.phase];
    case 'fireflies_rose':
      return `вылетели светлячки: ${event.count}`;
    case 'fireflies_gone':
      return `светлячки исчезли: ${event.count}`;
    case 'villager_arrived':
      return `${event.sex === 'male' ? 'пришёл мужчина' : 'пришла женщина'} ${event.name} (житель ${event.villager})`;
    case 'villager_nearly_died':
      return `житель ${event.villager} чуть не ${event.sex === 'male' ? 'умер' : 'умерла'} ${NEAR_DEATH_OF[event.need]}`;
    case 'need_ran_out':
      return `житель ${event.villager} ${RAN_OUT[event.need]}`;
    case 'villager_fainted':
      return `${event.sex === 'male' ? 'упал' : 'упала'} без сил житель ${event.villager}`;
    case 'villager_died':
      return `${event.sex === 'male' ? 'умер' : 'умерла'} житель ${event.villager} ${event.name}: ${DIED_OF[event.reason]}`;
    case 'fire_lit':
      return `${event.sex === 'male' ? 'развёл' : 'развела'} костёр житель ${event.villager}${event.first ? ' (первый костёр стоянки)' : ''}`;
    case 'fire_out':
      return `костёр погас (сжёг ${formatCount(event.burned)} ${plural(event.burned, ['охапку', 'охапки', 'охапок'])})`;
    case 'weather_changed':
      return `погода: ${WEATHER_NAME[event.from]} → ${WEATHER_NAME[event.to]}`;
    case 'food_found':
      if (event.stored) {
        return `житель ${event.villager} ест из запаса (${FOOD_NAME[event.food] ?? event.food})`;
      }
      return `житель ${event.villager} ест (${FOOD_NAME[event.food] ?? event.food}) в ${String(event.distance).replace('.', ',')} тайла от стоянки`;
    case 'food_stored':
      return `житель ${event.villager} сложил в запас: ${FOOD_NAME[event.food] ?? event.food}, ${event.count} ${plural(event.count, ['горсть', 'горсти', 'горстей'])}`;
  }
}

/** Food gathered on objects in words (step 1.11: the journal) — by resource id. */
const FOOD_NAME: Readonly<Record<string, string>> = {
  berries: 'ягоды',
  nuts: 'орехи',
  roots: 'коренья',
};

/** Kinds of weather in words (step 1.10): the journal, the panel. */
export const WEATHER_NAME: Record<WeatherKind, string> = {
  clear: 'ясно',
  cloudy: 'облачно',
  rain: 'дождь',
  snow: 'снег',
};

/** «−6°», «+12°», «0°» — a temperature for the panel (step 1.10), rounded to a degree. */
export function temperatureText(degrees: number): string {
  const whole = Math.round(degrees);
  if (whole === 0) return '0°';
  return `${whole > 0 ? '+' : '−'}${Math.abs(whole)}°`;
}

/**
 * The cause of an event in words; `source` — the event it points to, already in words
 * (`describeEvent`), when the cause is an event.
 */
export function describeCause(cause: Cause, source: string | null): string {
  if (cause.kind === 'rule') return RULE_CAUSE[cause.rule];
  if (cause.kind === 'need') return `у жителя ${cause.villager} ${NEED_GONE[cause.need]}`;
  if (cause.kind === 'decision') {
    return `решение жителя ${cause.villager}: ${ACTIVITY_NAME[cause.activity]}`;
  }
  return source === null ? `#${cause.event}` : `#${cause.event} ${source}`;
}

/** Who an event of the feed is about: its sex and name (step 2.1), as far as the feed knows. */
export interface FeedWho {
  sex: Sex;
  name: string;
}

/**
 * A line of the observer's event feed: the event told for a viewer, with who it was (by name —
 * step 2.1); null — not for the feed. (Which events go to the feed is decided by src/ui/feed.ts.)
 */
export function feedText(event: WorldEvent, who: FeedWho | undefined): string | null {
  // Not seen arriving (a test's journal): by the sex the event carries, if any.
  const sex = who?.sex ?? ('sex' in event ? event.sex : undefined);
  const name = who?.name ?? (sex ? WHO[sex] : 'житель');
  const female = sex === 'female';
  switch (event.type) {
    case 'villager_arrived':
      return `${female ? 'Пришла' : 'Пришёл'} ${name}`;
    case 'need_ran_out':
      return event.need === 'sleep' ? null : `${capitalize(name)} ${RAN_OUT[event.need]}`;
    case 'villager_nearly_died':
      return `${capitalize(name)} чуть не ${female ? 'умерла' : 'умер'} ${NEAR_DEATH_OF[event.need]}`;
    case 'villager_fainted':
      return `${capitalize(name)} ${female ? 'упала' : 'упал'} без сил — не спал${female ? 'а' : ''}`;
    case 'villager_died':
      return `${female ? 'Умерла' : 'Умер'} ${name} — ${DIED_OF[event.reason]}`;
    case 'fire_lit':
      return event.first
        ? `${capitalize(name)} ${female ? 'развела' : 'развёл'} первый костёр`
        : `${capitalize(name)} ${female ? 'развела' : 'развёл'} костёр`;
    case 'fire_out':
      return event.cause.kind === 'rule' && event.cause.rule === 'rain'
        ? 'Костёр залило дождём'
        : 'Костёр погас — прогорели дрова';
    default:
      return null;
  }
}

// ── The villager's card (step 2.1) ───────────────────────────────────────────────────────────

/** A word by the sex: «пришёл» / «пришла». */
function bySex(sex: Sex, male: string, female: string): string {
  return sex === 'female' ? female : male;
}

/** What a villager remembers, in words (./profile.ts `Memory`), without the date. */
export function memoryText(memory: Memory, sex: Sex): string {
  switch (memory.kind) {
    case 'arrived':
      return memory.tick === 0
        ? `${bySex(sex, 'Пришёл', 'Пришла')} к стоянке в день сотворения мира`
        : `${bySex(sex, 'Пришёл', 'Пришла')} к стоянке`;
    case 'first_fire':
      return `${bySex(sex, 'Развёл', 'Развела')} первый костёр стоянки`;
    case 'fainted':
      return `${bySex(sex, 'Упал', 'Упала')} без сил — долго не ${bySex(sex, 'спал', 'спала')}`;
    case 'near_death':
      return `Чуть не ${bySex(sex, 'умер', 'умерла')} ${NEAR_DEATH_OF[memory.need]}`;
    case 'loss':
      return `${bySex(memory.sex, 'Умер', 'Умерла')} ${memory.name} — ${DIED_OF[memory.reason]}`;
  }
}

/**
 * Why a villager does what it does — the reason of its plan for a viewer (from its journal of
 * decisions: the last decision says how the plan came; the scales say what presses now).
 * `decision` — the last of the journal (undefined — it has decided nothing yet); `night` — it is
 * night now.
 */
export function whyOf(villager: Villager, decision: Decision | undefined, night: boolean): string {
  const sex = villager.sex;
  const value = (need: Need) => Math.round(villager.needs[need]);
  if (!decision) return `ещё ничего не ${bySex(sex, 'решал', 'решала')} — отдыхает с начала мира`;
  if (decision.why === 'faint') {
    return `${bySex(sex, 'упал', 'упала')} без сил — долго не ${bySex(sex, 'спал', 'спала')}`;
  }
  const before =
    decision.ahead === null || decision.plan !== villager.plan.activity
      ? ''
      : ` — сначала это, потом ${AHEAD_WORDS[decision.ahead]}`;
  switch (villager.plan.activity) {
    case 'rest':
      return decision.why === 'failed'
        ? 'задуманное не вышло — отдыхает и думает, что дальше'
        : 'нужды утолены, дел у стоянки нет';
    case 'sleep':
      return night
        ? 'ночь — время спать'
        : `${bySex(sex, 'устал', 'устала')} — сон ${value('sleep')}`;
    case 'eat':
      return `${bySex(sex, 'проголодался', 'проголодалась')} — сытость ${value('food')}${before}`;
    case 'drink':
      return `хочет пить — жажда ${value('water')}${before}`;
    case 'haul':
      return 'под деревьями лежат ветки — их нужно снести в кучу для костра';
    case 'kindle':
      return 'костёр не горит, а в куче есть дрова';
    case 'stoke':
      return 'костёр прогорает — нужны дрова';
    case 'sit':
      return 'вечер — время посидеть у огня';
    case 'warm':
      return `${bySex(sex, 'замёрз', 'замёрзла')} — тепло ${value('warmth')}`;
    case 'scout':
      return `вся знакомая еда собрана — ищет новую${before}`;
    case 'store':
      return 'осень — запасает еду на зиму';
    case 'order':
      return 'так велел наблюдатель';
  }
}

/** What a villager put off for a precaution (`Decision.ahead`): «потом за едой». */
const AHEAD_WORDS: Readonly<Record<string, string>> = {
  eat: 'за едой',
  drink: 'к воде',
  scout: 'на разведку',
  rest: 'отдых',
  sleep: 'сон',
  haul: 'работа',
  kindle: 'огонь',
  stoke: 'дрова в костёр',
  sit: 'к огню',
  warm: 'греться',
  store: 'запасы',
};

/** The words of the villager's card (step 2.1, GDD §11.4). */
export const CARD = {
  /** «мужчина, 20 лет». */
  who: (sex: Sex, years: number) => `${WHO[sex]}, ${countOf(years, FORMS.year)}`,
  /** Where it comes from: the first pair came at the creation; the born — their date of birth. */
  origin: (sex: Sex, came: boolean, born: string) =>
    came
      ? `${bySex(sex, 'пришёл', 'пришла')} при сотворении мира`
      : `${bySex(sex, 'родился', 'родилась')}: ${born}`,
  now: 'Сейчас',
  why: 'Почему',
  needs: 'Нужды',
  family: 'Семья',
  mother: 'Мать',
  father: 'Отец',
  spouse: (sex: Sex) => bySex(sex, 'Жена', 'Муж'),
  children: 'Дети',
  unknownMother: 'неизвестна',
  unknownFather: 'неизвестен',
  none: 'нет',
  /** A relative in the list: «Любава», a dead one — «Любава †». */
  kin: (name: string, alive: boolean) => (alive ? name : `${name} †`),
  kinTitle: (name: string) => `Открыть карточку: ${name}`,
  memory: 'Память',
  memoryEmpty: (sex: Sex) => `Пока ничего не ${bySex(sex, 'запомнил', 'запомнила')}`,
  portrait: (name: string) => `Портрет: ${name}`,
} as const;

// ── Saves ────────────────────────────────────────────────────────────────────────────────────

const DAMAGED: Record<NonNullable<LoadError['reason']>, string> = {
  unreadable: 'не удалось прочитать',
  cut: 'файл обрезан или испорчен',
  no_version: 'нет номера версии',
  no_world: 'в нём нет мира',
  no_header: 'не хватает заголовка',
  header_mismatch: 'заголовок не совпадает с миром',
  hash_mismatch: 'данные мира изменены или испорчены (не сходится контрольная сумма)',
};

/** Why a save did not open — for the player (src/sim/save.ts gives the code). */
export function loadErrorText(error: LoadError): string {
  const found = error.versions?.found ?? '?';
  const current = error.versions?.current ?? '?';
  switch (error.code) {
    case 'empty':
      return 'Сохранение пустое.';
    case 'not_save':
      return 'Это не сохранение «Первого костра».';
    case 'damaged':
      return `Сохранение повреждено: ${DAMAGED[error.reason ?? 'unreadable']}.`;
    case 'too_new':
      return `Сохранение сделано более новой версией игры (формат ${found}, а эта версия понимает до ${current}).`;
    case 'too_old':
      return `Сохранение сделано старой версией игры (формат ${found}, а эта версия — ${current}): с тех пор мир устроен иначе, и перенести его нельзя.`;
  }
}

/** A warning about a save that did open. */
export function loadWarningText(warning: LoadWarning): string {
  switch (warning.code) {
    case 'data_changed':
      return 'Числа в таблицах данных изменились после сохранения — мир продолжится по новым.';
  }
}

/**
 * Size of save text for people: «1,7 МБ», «16 КБ» — about the size of the same save as a file
 * (save text is almost all Latin letters and digits: a byte each).
 */
export function storedSize(length: number): string {
  const kilobytes = length / 1024;
  return kilobytes < 1024
    ? `${Math.max(1, Math.round(kilobytes))} КБ`
    : `${(kilobytes / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
}

/** Messages of the autosave slot and of saving. */
export const SAVE_TEXT = {
  noStorage:
    'Браузер не даёт игре хранилище (частный режим или запрет данных сайтов) — автосохранения не будет. Сохраняйте мир в файл.',
  storageFull: (size: string) =>
    `Хранилище браузера переполнено (сохранение — ${size}): автосохранение не записано. Сохраните мир в файл.`,
  storageRefused: (why: string) =>
    `Браузер не дал записать автосохранение (${why}). Сохраните мир в файл.`,
  notSaved: (why: string) => `Мир не сохранился: ${why}.`,
  savedToFile: (name: string) => `Сохранено в файл «${name}»`,
} as const;

// ── The title menu ───────────────────────────────────────────────────────────────────────────

export const MENU = {
  gameTitle: 'ПЕРВЫЙ КОСТЁР',
  gameTagline: 'симулятор эволюции цивилизации',
  label: 'Меню',
  details: (detail: string) => `Подробности: ${detail}`,
  /** «год 2 · зима · день 2 из 3, зерно 7» — a world in one line (`date` — `dateOf`). */
  worldLine: (date: string, seed: number) => `${date}, зерно ${seed}`,
  savedProblemTitle: 'Сохранённый мир не открылся',
  savedProblemText: (why: string) =>
    `${why} Можно начать новый мир или загрузить сохранение из файла.`,
  noStorageTitle: 'Мир не будет сохраняться сам',
  eraseText: (world: string) => `Текущий мир (${world}) сотрётся.`,
  cancel: 'Отмена',
  continueTitle: 'Продолжить',
  continueSeed: (seed: number, tick: number) => `зерно ${seed} · тик ${formatCount(tick)}`,
  seedLabel: 'Зерно мира',
  seedWord: 'зерно',
  reroll: 'Случайное зерно',
  begin: 'Начать',
  seedError: (max: number) => `Зерно — целое число от 0 до ${formatCount(max)}`,
  newTitle: 'Новый мир',
  newTagline: 'одно зерно — одна история',
  newAsk: 'Начать новый мир?',
  newYes: 'Начать новый',
  newFailed: 'Новый мир не начался',
  fileFailed: (name: string) => `Файл «${name}» не открылся`,
  fileProblemText: (why: string) => `${why} Можно выбрать другой файл или начать новый мир.`,
  openAsk: (name: string, world: string) => `Открыть «${name}» (${world})?`,
  openYes: 'Открыть',
  loadTitle: 'Загрузить из файла',
  loadSub: 'мир, сохранённый в файл (.json)',
} as const;

// ── The observer's panel (step 1.6) ──────────────────────────────────────────────────────────

export const HUD = {
  population: (n: number) => `${formatCount(n)}`,
  populationTitle: (n: number) => `Жителей: ${formatCount(n)}`,
  phaseTitle: (phase: DayPhase) => `Время суток: ${PHASE_NAME[phase]}`,
  /** The weather in the top bar (step 1.10): «Погода: снег, −8°». */
  weatherTitle: (kind: WeatherKind, degrees: number) =>
    `Погода: ${WEATHER_NAME[kind]}, ${temperatureText(degrees)}`,
  speedLabel: 'Скорость',
  speedTitle: (speed: number, key: string) =>
    speed === 0 ? `Пауза (${key})` : `Скорость ×${speed} (клавиша ${key})`,
  pauseKey: 'пробел',
  lagging: 'не успевает',
  laggingTitle: 'Компьютер не успевает считать мир на этой скорости — он идёт медленнее',
  menu: 'Мир',
  menuTitle: 'Мир: сохранение, клавиши, выход в меню',
  feedTitle: 'События',
  feedToggle: 'Свернуть или развернуть события',
  cardTitle: (sex: Sex | undefined, id: number) =>
    sex ? `${WHO_TITLE[sex]} · житель ${id}` : `Житель ${id}`,
  /** The card of a dead villager (step 2.1): its name, of what and when it died. */
  deadTitle: (name: string) => `${name} †`,
  feedEmpty: 'Пока ничего не случилось',
  feedHint: 'Щелчок по событию — камера летит к месту',
  close: 'Закрыть',
  doing: (text: string) => text,
  chosenHint: 'Щелчок по жителю — выбрать, по пустому месту — снять выбор',
  /** The world panel (the «Мир» menu). */
  tick: (tick: number) => `тик\u00a0${formatCount(tick)}`,
  keysSpeed: 'пробел — пауза, 1–4 — скорость',
  zoomLine: (zoom: number) =>
    `масштаб ${zoomName(zoom)} (колесо, щипок, +/−) · карту двигать мышью, пальцем, WASD/стрелками`,
  fromUrl: (seed: number) => `Зерно ${seed}, из адреса`,
  savedAt: (date: string, tick: number) => `Сохранён: ${date}, тик\u00a0${formatCount(tick)}`,
  notSavedYet: 'Ещё не сохранялся',
  hintUrl:
    'Мир задан адресом и сам не сохраняется. Чтобы вернуться к нему позже — сохраните в файл.',
  hintSaved: 'Сохраняется сам: раз в игровой год и при закрытии вкладки.',
  toFile: 'Сохранить в файл',
  toMenu: 'В меню',
  bubbles: (on: boolean) => `Пузырьки мыслей: ${on ? 'вкл' : 'выкл'} (B)`,
  bubblesTitle: 'Значки над головами: чего хочет житель. Клавиша B — включить или выключить',
  warn: (text: string) => `⚠ ${text}`,
  debug: (text: string) => `Отладка: ${text}`,
} as const;

/** Debug clicks on the world (`debug=1`, step 1.3). */
export const DEBUG = {
  chosen: (sex: Sex | undefined, id: number) =>
    `${sex === 'female' ? 'выбрана' : 'выбран'} ${villagerName(sex, id)}`,
  goes: (who: string, x: number, y: number) => `${who} идёт к тайлу (${x}, ${y})`,
  goesSteps: (who: string, x: number, y: number, steps: number) =>
    `${who} идёт к тайлу (${x}, ${y}): шагов ${steps}`,
  howTo: 'щелчок по жителю — выбрать, по карте — отправить его туда',
  howToShort: 'щелчок по жителю — выбрать, по карте — отправить туда',
  refused: (x: number, y: number, why: string) => `тайл (${x}, ${y}): ${why}`,
  why: {
    blocked: 'туда нельзя встать — вода, дерево, куст или там другой житель',
    unreachable: 'туда не дойти — путь отрезан водой',
    too_far: 'слишком далеко — поиск пути сдался',
  },
} as const;

/** Problems at the start of the game (src/main.ts). */
export const START = {
  failed: 'Игра не запустилась',
  brokenRefs: 'Битые ссылки в таблицах данных',
} as const;

// ── Debug scenes ─────────────────────────────────────────────────────────────────────────────

/** Scene `clock` (step 0.2). */
export const CLOCK = {
  keys: 'пробел — пауза · 1–4 — ×1 ×2 ×5 ×20',
  journal: 'Журнал событий',
  meta: (tick: number, day: number, seed: number) =>
    `тик ${formatCount(tick)} · день мира ${formatCount(day)} · зерно ${seed}`,
  speed: 'скорость',
  journalMeta: (id: number, tick: number) => `#${id} · тик ${formatCount(tick)}`,
} as const;

/** Scene `stylesheet` (step 0.4). */
export const STYLESHEET = {
  caption: (zoom: number) => `Лист стиля · эпоха 0 · стоянка у реки · ${zoomName(zoom)}`,
} as const;

/** Scene `palette` (step 0.4). */
export const PALETTE_SCENE = {
  title: 'Мастер-палитра',
  intro: (colours: number, seasonal: number, ramps: number) =>
    `${colours} цветов мира + цвет тени + служебные + ${seasonal} сезонных (шаг 1.10: подмена травы, песка и листвы весной, осенью и зимой) · ${ramps} рядов, в каждом цвета идут от тёмного к светлому · под образцом — имя цвета, код и сколько спрайтов его используют`,
  alpha: (percent: number) => ` · прозрачность ${percent} %`,
  screens: 'экраны',
  people: (skins: number, hairs: number) =>
    `Перекраска жителей: ${skins} тонов кожи × ${hairs} цветов волос — один рисунок, подмена рядов палитры`,
  /** «кожа светлая» → «светлая»: the ramp's title without the word of its group. */
  shortRamp: (title: string) => title.replace(/^(кожа|волосы) /, ''),
} as const;

/** Scene `gallery` (step 0.3). */
export const GALLERY = {
  kinds: {
    tile: 'Тайлы',
    object: 'Объекты',
    item: 'Предметы',
    character: 'Персонажи',
    icon: 'Значки',
  },
  kind: {
    tile: 'тайл',
    object: 'объект',
    item: 'предмет',
    character: 'персонаж',
    icon: 'значок',
  },
  seconds: (ms: number) => `${(ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} с`,
  wrongFile: (name: string, file: string) =>
    `спрайт «${name}»: лежит в файле ${file}.ts — имя файла должно совпадать с именем`,
  noSprite: (name: string, known: string) => `Нет спрайта «${name}». Есть: ${known || 'ни одного'}`,
  oneFrame: (name: string) => `${name}: 1 кадр`,
  frames: (name: string, count: number, cycle: string) =>
    `${name}: ${countOf(count, FORMS.frame)}, цикл ${cycle}`,
  atlas: (width: number, height: number, frames: number) =>
    `Атлас: ${width}×${height}, ${countOf(frames, FORMS.frame)} всех спрайтов на одном холсте, ×2`,
  details: (name: string, kind: string, size: string, x: number, y: number, ramps: string) =>
    `${name} · ${kind} · ${size} · привязка (${x}, ${y}) · ряды палитры: ${ramps}`,
  anchorCaption: (scale: number) => `×${scale}, крестик — точка привязки`,
  isDefault: ', по умолчанию',
  still: '1 кадр, неподвижный',
  timing: (count: number, cycle: string) => `${countOf(count, FORMS.frame)}, цикл ${cycle}`,
  animation: (name: string, isDefault: string, timing: string) =>
    `Анимация «${name}»${isDefault}: ${timing}`,
  frameCaption: (index: number, ms: number) => `${index} · ${ms} мс`,
  together: 'вместе',
  swaps: 'Перекраска (подмена рядов палитры)',
  base: 'основной',
  legend: 'Легенда',
  title: 'Галерея спрайтов',
  intro: (count: number, width: number, height: number, ms: string) =>
    `${countOf(count, FORMS.sprite)} · атлас ${width}×${height} собран за ${ms} мс · ?scene=gallery&amp;sprite=имя — один спрайт крупно`,
  problems: 'Ошибки в спрайтах',
} as const;

/** Scene `data` (step 0.5). */
export const DATA_SCENE = {
  categories: { food: 'Еда', material: 'Материалы', product: 'Изделия' },
  places: {
    forest: 'лес',
    edge: 'опушка',
    scatter: 'россыпь',
    meadow: 'луг',
    forage: 'корм у опушки',
  },
  yes: 'да',
  no: 'нет',
  none: '—',
  pieces: (n: number) => `${n} шт.`,
  spoilsNever: 'не портится',
  spoilsDays: (days: string) => `${days} сут`,
  weight: (place: string, weight: number) => `${place} · вес ${weight}`,
  litter: (resource: string, max: number, days: string) =>
    `${resource} · до ${max} · раз в ${days} сут`,
  title: 'Таблицы данных',
  intro: (
    tables: number,
    resources: number,
    terrain: number,
    objects: number,
    numbers: number,
    refsOk: boolean,
  ) =>
    `Содержание игры живёт в файлах <b>data/*.json</b>, а не в коде: новая строка в таблице — новый ресурс на этой странице. ${tables} таблицы · ${resources} ресурсов · ${terrain} типов земли · ${objects} видов объектов карты · ${numbers} параметров баланса. Все таблицы проверены при загрузке${refsOk ? ', ссылки на спрайты и виды земли — тоже' : ''}.`,
  brokenRefs: (count: number, list: string) => `Битые ссылки в таблицах (${count}):\n${list}`,
  resources: (file: string) => `Ресурсы — ${file}`,
  resourcesMeta:
    'Значок — спрайт ресурса: так стопка лежит на земле. Стопка — сколько лежит на одном тайле и сколько уносят руки; еда считается в рационах (еда взрослого на сутки). Портится — под навесом; под дождём втрое быстрее.',
  resourceHeads: ['', 'Название · id · эпоха', 'Стопка', 'Портится'],
  ground: (file: string) => `Земля — ${file}`,
  groundMeta: (walk: string) =>
    `Скорость — относительно травы; тиков на тайл — сколько идёт взрослый (${walk} по траве, balance.json). Вид — как земля нарисована (тайлы и переходы, src/art/terrain.ts).`,
  groundHeads: ['', 'Название · id', 'Проходима', 'Скорость', 'Тиков на тайл', 'Вид'],
  objects: (file: string) => `Объекты карты — ${file}`,
  objectsMeta:
    'Деревья, кусты, камни, цветы — то, что стоит на тайле (GDD §2.2). Место и вес — где их ставит генератор карты и как часто среди соседей по месту; состояние — как объект выглядит (первое — начальное); еда — что с него собирают и съедают на месте (шаг 1.4): урожай за год, в какие сезоны собирают, когда зреет (шаг 1.11); роняет — что падает с него на соседний свободный тайл и как часто (шаг 1.7).',
  objectHeads: [
    '',
    'Название · id',
    'Проходим',
    'Состояния',
    'Место · вес',
    'Еда на нём',
    'Роняет',
    'Спрайт',
  ],
  balance: (file: string) => `Баланс — ${file}`,
  balanceMeta: (season: string, year: string, days: number, minutes: string) =>
    `Числа GDD §2.1 и §13.1; карта — §2.2 и §3.1; потребности и выбор действия — §4.2, §13.2 и §2.3. Ядро симуляции берёт время отсюда: сезон — ${season}, год — ${year} (${days} сут, ${minutes} мин на ×1).`,
  balanceHeads: ['Что', 'Значение', 'Поле'],
  howTo:
    'Как добавить ресурс: строка в data/resources.json (и, если нужен новый значок, файл src/art/sprites/<id>.ts) → npm test проверит таблицу и ссылку на спрайт. Подробно — docs/ARCHITECTURE.md, «Таблицы данных».',
  /** Units of the balance as the schema names them (src/data/tables.ts). */
  unitTicks: 'тиков',
  unitRations: 'рационов',
  /** After the year's crop of an object (step 1.11): «за год». */
  perYear: 'за год',
  /** When the crop of an object ripens (step 1.11): «зреет весной». */
  ripens: (season: Season) => `зреет ${SEASON_WHEN[season]}`,
  /** Units of the balance (the schema, src/data/tables.ts) and their forms after a number. */
  units: {
    тиков: FORMS.tick,
    лет: FORMS.year,
    сезонов: FORMS.season,
    тайлов: FORMS.tile,
    рационов: FORMS.ration,
    пунктов: FORMS.point,
    охапок: FORMS.armful,
    веток: FORMS.branch,
  } as Readonly<Record<string, Forms>>,
} as const;
