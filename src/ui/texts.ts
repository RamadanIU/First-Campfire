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
import type { Need } from '../sim/needs.ts';
import type { LoadError, LoadWarning } from '../sim/save.ts';
import type { Sex, Villager } from '../sim/villagers.ts';

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
export const WHO_TITLE: Record<Sex, string> = { male: 'Мужчина', female: 'Женщина' };

/** A villager in words: «мужчина (житель 1)». */
export function villagerName(sex: Sex | undefined, id: number): string {
  return sex ? `${WHO[sex]} (житель ${id})` : `житель ${id}`;
}

const WALKS_TO = {
  wander: 'гуляет у стоянки',
  order: 'идёт, куда послали',
  eat: 'идёт к малине',
  drink: 'идёт к воде',
} as const;

/**
 * Words for a resource a villager handles (step 1.7): «идёт за ветками» (`with` — after «за»),
 * «несёт 6 веток» (`forms` — after a number). The names of resources are content
 * (data/resources.json, «Ветки»); a resource without words here is named by its name.
 */
const HANDLED: Readonly<Record<string, { with: string; what: string; forms: Forms }>> = {
  branches: { with: 'ветками', what: 'ветки', forms: ['ветку', 'ветки', 'веток'] },
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
        return `несёт ${resourceCount(villager.load.resource, villager.load.count, name)} в кучу`;
      }
      if (action.purpose === 'fetch' || action.purpose === 'carry') return 'носит в кучу';
      return WALKS_TO[action.purpose];
    case 'pick_up':
      return `подбирает ${handled(action.resource, name).what}`;
    case 'put_down':
      return `складывает ${handled(action.resource, name).what} в кучу`;
    case 'eat':
      return 'ест ягоды';
    case 'drink':
      return 'пьёт';
    case 'sleep':
      return action.fainted ? 'лежит без сил' : 'спит';
  }
}

/** Names of the scales of a villager, as in its card. */
export const SCALE_NAME = {
  food: 'Сытость',
  water: 'Жажда',
  sleep: 'Сон',
  health: 'Здоровье',
} as const;

/** A line of the debug panel for a villager (`debug=needs`): doing what, its scales. */
export function needsLine(villager: Villager, name: (resource: string) => string): string {
  const round = (value: number) => Math.round(value);
  return `${villagerName(villager.sex, villager.id)}: ${doingOf(villager, name)} · сытость ${round(villager.needs.food)} · жажда ${round(villager.needs.water)} · сон ${round(villager.needs.sleep)} · здоровье ${round(villager.health)}`;
}

export const DIED_OF: Record<DeathReason, string> = { hunger: 'голод', thirst: 'жажда' };

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
};

const NEED_GONE: Record<Need, string> = {
  food: 'кончилась сытость',
  water: 'кончилась вода',
  sleep: 'кончились силы — не спал',
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
      return `${event.sex === 'male' ? 'пришёл мужчина' : 'пришла женщина'} (житель ${event.villager})`;
    case 'need_ran_out':
      return `житель ${event.villager} ${RAN_OUT[event.need]}`;
    case 'villager_fainted':
      return `${event.sex === 'male' ? 'упал' : 'упала'} без сил житель ${event.villager}`;
    case 'villager_died':
      return `${event.sex === 'male' ? 'умер' : 'умерла'} житель ${event.villager}: ${DIED_OF[event.reason]}`;
  }
}

/**
 * The cause of an event in words; `source` — the event it points to, already in words
 * (`describeEvent`), when the cause is an event.
 */
export function describeCause(cause: Cause, source: string | null): string {
  if (cause.kind === 'rule') return cause.rule === 'genesis' ? 'начало всего' : 'ход времени';
  if (cause.kind === 'need') return `у жителя ${cause.villager} ${NEED_GONE[cause.need]}`;
  return source === null ? `#${cause.event}` : `#${cause.event} ${source}`;
}

/**
 * A line of the observer's event feed: the event told for a viewer, with who it was; null — not
 * for the feed. (Which events go to the feed is decided by src/ui/feed.ts.)
 */
export function feedText(event: WorldEvent, sex: Sex | undefined): string | null {
  const who = sex ? WHO[sex] : 'житель';
  const female = sex === 'female';
  switch (event.type) {
    case 'villager_arrived':
      return `${female ? 'Пришла' : 'Пришёл'} ${who}`;
    case 'need_ran_out':
      return event.need === 'sleep' ? null : `${capitalize(who)} ${RAN_OUT[event.need]}`;
    case 'villager_fainted':
      return `${capitalize(who)} ${female ? 'упала' : 'упал'} без сил — не спал${female ? 'а' : ''}`;
    case 'villager_died':
      return `${female ? 'Умерла' : 'Умер'} ${who} — ${DIED_OF[event.reason]}`;
    default:
      return null;
  }
}

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
  intro: (colours: number, ramps: number) =>
    `${colours} цветов мира + цвет тени + служебные · ${ramps} рядов, в каждом цвета идут от тёмного к светлому · под образцом — имя цвета, код и сколько спрайтов его используют`,
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
  places: { forest: 'лес', edge: 'опушка', scatter: 'россыпь', meadow: 'луг' },
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
    'Деревья, кусты, камни, цветы — то, что стоит на тайле (GDD §2.2). Место и вес — где их ставит генератор карты и как часто среди соседей по месту; состояние — как объект выглядит (первое — начальное); еда — что с него собирают и съедают на месте (шаг 1.4); роняет — что падает с него на соседний свободный тайл и как часто (шаг 1.7).',
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
  /** Units of the balance (the schema, src/data/tables.ts) and their forms after a number. */
  units: {
    тиков: FORMS.tick,
    лет: FORMS.year,
    сезонов: FORMS.season,
    тайлов: FORMS.tile,
    рационов: FORMS.ration,
    пунктов: FORMS.point,
  } as Readonly<Record<string, Forms>>,
} as const;
