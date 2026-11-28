/**
 * The observer's panel (step 1.6, GDD §1.3, §10.6, §11.4): the minimal interface for watching.
 *
 *   ┌ ☼ Год 2 · зима · день 2 из 3 ☁ −6°  👥 2 ─────────── ❚❚ ×1 ×2 ×5 ×20   Мир ▾ ┐
 *   │ События                                                           (menu «Мир») │
 *   │  ☠ Умерла женщина — голод                                                      │
 *   │                                                                                │
 *   │ (the card: portrait, name, age, doing and why, scales, family, memory) (debug) │
 *   └────────────────────────────────────────────────────────────────────────────────┘
 *
 * - The top bar: the date, an icon of the time of day, the weather and the temperature (step
 *   1.10), the population; the speed buttons (pause,
 *   ×1, ×2, ×5, ×20 — the keys Space and 1–4 do the same, src/app/controls.ts); «Мир» opens the
 *   menu of the world (how it is saved, «Save to file», «To the menu», the keys).
 * - The event feed (./feed.ts): the latest significant events; a click flies the camera to the
 *   place (or to the villager, while it lives).
 * - The card of the chosen villager (step 2.1, GDD §11.4): a portrait (its sprite, enlarged), the
 *   name, sex and age, where it comes from; what it does now and why (from its journal of
 *   decisions); five scales; the family — a click on a relative opens the relative's card; the last
 *   memories of its life. Of a dead villager — its name and what it died of.
 *
 * Everything stands at the edges: the middle of the screen stays the world's. `ui=0` shows none of
 * it (the scene does not create the panel). The panel only reads the world; what it changes is
 * the observer's: the speed, the camera, the choice.
 */
import { DATA } from '../data/index.ts';
import { calendarAt, type DayPhase } from '../sim/calendar.ts';
import type { Decision } from '../sim/minds.ts';
import type { Tile } from '../sim/path.ts';
import { ageOf, cameFromOutside } from '../sim/profile.ts';
import { findVillager, type Villager } from '../sim/villagers.ts';
import { airTemperature, type WeatherKind } from '../sim/weather.ts';
import type { World } from '../sim/world.ts';
import { dateOf, shortDateOf } from './dates.ts';
import { createFeed, type FeedEntry } from './feed.ts';
import {
  CARD,
  capitalize,
  deathNote,
  doingOf,
  HUD,
  memoryText,
  SCALE_NAME,
  speedName,
  temperatureText,
  whyOf,
} from './texts.ts';

/** The icon of each weather in the top bar (step 1.10); clear — none (the sun or moon says it). */
const WEATHER_ICON: Readonly<Record<WeatherKind, string | null>> = {
  clear: null,
  cloudy: 'hud_cloudy',
  rain: 'hud_rain',
  snow: 'hud_snow',
};

/** The name of a resource for the words of the panel (data/resources.json). */
const resourceName = (id: string): string => DATA.resources.get(id).name;

/** The speeds of the buttons and their keys (src/app/controls.ts). */
const SPEED_BUTTONS = [
  { speed: 0, key: HUD.pauseKey },
  { speed: 1, key: '1' },
  { speed: 2, key: '2' },
  { speed: 5, key: '3' },
  { speed: 20, key: '4' },
] as const;

type ButtonSpeed = (typeof SPEED_BUTTONS)[number]['speed'];

/** Sprites of the icons (src/art/sprites/hud_*.ts, bubble_*.ts). */
const PHASE_ICON: Record<DayPhase, string> = {
  dawn: 'hud_dawn',
  day: 'hud_day',
  dusk: 'hud_dusk',
  night: 'hud_night',
};

/** The bubble of a need that nearly killed (step 2.1). */
const NEED_ICON = { food: 'bubble_food', water: 'bubble_water', warmth: 'bubble_cold' } as const;

function feedIcon(entry: FeedEntry, world: World): string {
  switch (entry.type) {
    case 'villager_arrived':
      return 'hud_people';
    case 'villager_died':
      return 'hud_death';
    case 'villager_fainted':
      return 'bubble_sleep';
    case 'villager_nearly_died': {
      const event = world.events.list[entry.id - 1];
      if (event?.type !== 'villager_nearly_died') return 'hud_death';
      return NEED_ICON[event.need];
    }
    case 'fire_lit':
      return 'hud_fire';
    case 'fire_out':
      return 'hud_fire_out';
    default: {
      const event = world.events.list[entry.id - 1];
      return event?.type === 'need_ran_out' && event.need === 'water'
        ? 'bubble_water'
        : 'bubble_food';
    }
  }
}

/** What the panel reads and what it may change — the observer's things only. */
export interface HudSource {
  world: World;
  /** The game speed (src/app/loop.ts). */
  loop: {
    readonly speed: number;
    readonly lagging: boolean;
    setSpeed(speed: ButtonSpeed): void;
    togglePause(): void;
  };
  /** The chosen villager (null — none) and choosing. */
  selected(): number | null;
  select(id: number | null): void;
  /** Fly the camera to a tile (marking the place) or to a living villager. */
  flyToTile(tile: Tile): void;
  flyToVillager(id: number): boolean;
  /** A canvas with the sprite `name` drawn at ×`scale` (crisp: the canvas is exactly its size). */
  icon(name: string, scale: number): HTMLCanvasElement;
  /** A canvas with the villager's portrait: its own sprite and colours, head and shoulders, enlarged. */
  portrait(villager: Villager): HTMLCanvasElement;
  /** The menu «Мир» is open at the start (`menu=1`). */
  menuOpen: boolean;
}

export interface Hud {
  /** The body of the menu «Мир»: the scene puts the panel of the world here. */
  readonly menu: HTMLElement;
  /** A box at the bottom right for the debug lines (`debug=`). */
  readonly debug: HTMLElement;
  /** Show the world as it is now: called every frame, touches the page only where it changed. */
  update(): void;
}

type Child = Node | string;

/** Element with a class and children (text is set as text, never as HTML). */
function h(tag: string, className: string, ...children: Child[]): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.append(...children);
  return element;
}

function button(className: string, title: string, ...children: Child[]): HTMLButtonElement {
  const element = h('button', className, ...children) as HTMLButtonElement;
  element.type = 'button';
  element.title = title;
  return element;
}

/** Set text only if it changed (the page is touched only when something is new). */
function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

export function createHud(ui: HTMLElement, source: HudSource): Hud {
  const { world, loop } = source;

  // ── The top bar ──
  const phaseIcon = h('span', 'hud-icon');
  const date = h('span', 'hud-bar-date');
  // The weather and the temperature of the air (step 1.10): an icon under clouds, rain, snow.
  const weatherIcon = h('span', 'hud-icon hud-weather-icon');
  const temperature = h('span', 'hud-temperature');
  const weather = h('div', 'hud-weather', weatherIcon, temperature);
  const when = h('div', 'hud-when', phaseIcon, date, weather);
  const peopleCount = h('span', 'hud-count');
  const people = h('div', 'hud-people', source.icon('hud_people', 2), peopleCount);

  const speedButtons = new Map<number, HTMLButtonElement>();
  const speeds = h('div', 'hud-speeds');
  speeds.setAttribute('role', 'group');
  speeds.setAttribute('aria-label', HUD.speedLabel);
  for (const { speed, key } of SPEED_BUTTONS) {
    const label = speed === 0 ? h('span', 'hud-pause-glyph') : speedName(speed);
    const control = button('hud-speed-button', HUD.speedTitle(speed, key), label);
    control.dataset.speed = String(speed);
    if (speed === 0) control.setAttribute('aria-label', speedName(0));
    control.addEventListener('click', () => {
      if (speed === 0) loop.togglePause();
      else loop.setSpeed(speed);
    });
    speedButtons.set(speed, control);
    speeds.append(control);
  }
  const lagging = h('span', 'hud-lagging', HUD.lagging);
  lagging.title = HUD.laggingTitle;
  lagging.hidden = true;

  const menuButton = button('hud-menu-button', HUD.menuTitle, HUD.menu);
  menuButton.setAttribute('aria-haspopup', 'true');
  const controls = h('div', 'hud-controls', speeds, lagging, menuButton);
  const bar = h('div', 'hud-bar', when, people, controls);

  const menu = h('div', 'hud-menu world-panel');
  menu.hidden = !source.menuOpen;
  const syncMenu = () => {
    menuButton.setAttribute('aria-expanded', String(!menu.hidden));
    menuButton.classList.toggle('open', !menu.hidden);
  };
  menuButton.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    syncMenu();
  });
  syncMenu();

  // ── The event feed ──
  const feed = createFeed();
  const feedList = h('ol', 'hud-feed-list');
  feedList.title = HUD.feedHint;
  const feedTitle = button('hud-feed-title', HUD.feedToggle, HUD.feedTitle);
  feedTitle.setAttribute('aria-expanded', 'true');
  feedTitle.addEventListener('click', () => {
    feedList.hidden = !feedList.hidden;
    feedTitle.setAttribute('aria-expanded', String(!feedList.hidden));
  });
  const feedBox = h('section', 'hud-feed', feedTitle, feedList);
  let feedShown = false;

  const renderFeed = (fresh: boolean) => {
    const rows = feed.entries.map((entry, index) => {
      const line = button(
        'hud-event',
        HUD.feedHint,
        h('span', 'hud-event-icon', source.icon(feedIcon(entry, world), 2)),
        h(
          'span',
          'hud-event-text',
          h('span', '', entry.text),
          h('small', 'hud-event-date', shortDateOf(entry.tick)),
        ),
      );
      line.dataset.event = String(entry.id);
      line.addEventListener('click', () => {
        if (entry.place) source.flyToTile(entry.place);
        else if (!source.flyToVillager(entry.villager)) {
          // Dead since: to the place of its death.
          const died = world.events.list.findLast(
            (e) => e.type === 'villager_died' && e.villager === entry.villager,
          );
          if (died?.type === 'villager_died') source.flyToTile({ x: died.x, y: died.y });
        }
      });
      const item = h('li', fresh && index === 0 ? 'fresh' : '', line);
      return item;
    });
    if (rows.length === 0) feedList.replaceChildren(h('li', 'hud-feed-empty', HUD.feedEmpty));
    else feedList.replaceChildren(...rows);
  };

  // ── The card of the chosen villager (step 2.1) ──
  const portrait = h('div', 'hud-card-portrait');
  const cardTitle = h('div', 'hud-card-title');
  const cardWho = h('div', 'hud-card-who');
  const cardOrigin = h('div', 'hud-card-origin');
  const close = button('hud-card-close', HUD.close, '×');
  close.addEventListener('click', () => source.select(null));
  const cardDoing = h('div', 'hud-card-doing');
  const cardWhy = h('div', 'hud-card-why');
  const scales = (['food', 'water', 'sleep', 'warmth', 'health'] as const).map((key) => {
    const fill = h('i', 'hud-scale-fill');
    const value = h('span', 'hud-scale-value');
    const row = h(
      'div',
      `hud-scale hud-scale-${key}`,
      h('span', 'hud-scale-name', SCALE_NAME[key]),
      h('span', 'hud-scale-bar', fill),
      value,
    );
    return { key, row, fill, value };
  });
  const cardScales = h('div', 'hud-card-scales', ...scales.map((scale) => scale.row));
  const familyRows = h('dl', 'hud-card-family');
  const cardFamily = h(
    'section',
    'hud-card-section',
    h('h3', 'hud-card-heading', CARD.family),
    familyRows,
  );
  const memoryList = h('ol', 'hud-card-memory');
  const cardMemory = h(
    'section',
    'hud-card-section',
    h('h3', 'hud-card-heading', CARD.memory),
    memoryList,
  );
  const cardLiving = h(
    'div',
    'hud-card-living',
    cardDoing,
    cardWhy,
    cardScales,
    cardFamily,
    cardMemory,
  );
  const card = h(
    'section',
    'hud-card',
    h(
      'div',
      'hud-card-head',
      portrait,
      h('div', 'hud-card-id', cardTitle, cardWho, cardOrigin),
      close,
    ),
    cardLiving,
  );
  card.hidden = true;

  const debug = h('div', 'hud-debug world-panel');
  debug.hidden = true;

  const root = h('div', 'observer', bar, menu, feedBox, card, debug);
  // A button clicked with the mouse or a finger does not keep the focus: Space must stay the
  // pause key (src/app/controls.ts), not «press the last button again».
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (target && event.detail > 0) target.blur();
  });
  ui.append(root);

  // ── Every frame ──
  let shownTick = -1;
  let shownPhase: DayPhase | null = null;
  let shownWeather: WeatherKind | null = null;
  const weatherIcons = new Map<WeatherKind, HTMLCanvasElement>();
  let shownSpeed = -1;
  const phaseIcons = new Map<DayPhase, HTMLCanvasElement>();
  /** The dead the card was asked about: id → its name, sex and last words. */
  const deaths = new Map<number, { name: string; note: string } | null>();
  const deathOf = (id: number) => {
    if (!deaths.has(id)) {
      const event = world.events.list.findLast(
        (e) => e.type === 'villager_died' && e.villager === id,
      );
      deaths.set(
        id,
        event?.type === 'villager_died'
          ? {
              name: event.name,
              note: capitalize(deathNote(event.sex, calendarAt(event.tick).day, event.reason)),
            }
          : null,
      );
    }
    return deaths.get(id) ?? null;
  };
  /** A relative's name: of the living, or of the dead from the journal; null — unknown to the world. */
  const nameOf = (id: number): { name: string; alive: boolean } | null => {
    const living = findVillager(world, id);
    if (living) return { name: living.name, alive: true };
    const dead = deathOf(id);
    return dead ? { name: dead.name, alive: false } : null;
  };

  /** A relative in the card: a button that opens its card (and flies the camera to it). */
  const kinButton = (id: number) => {
    const kin = nameOf(id);
    const name = kin?.name ?? HUD.cardTitle(undefined, id);
    const control = button('hud-kin', CARD.kinTitle(name), CARD.kin(name, kin?.alive ?? false));
    control.dataset.villager = String(id);
    control.addEventListener('click', () => {
      source.select(id);
      source.flyToVillager(id);
    });
    return control;
  };
  const familyRow = (label: string, ...value: Child[]) =>
    [h('dt', '', label), h('dd', '', ...value)] as const;
  const kinList = (ids: readonly number[]): Child[] => {
    if (ids.length === 0) return [CARD.none];
    return ids.flatMap((id, index) => (index === 0 ? [kinButton(id)] : [', ', kinButton(id)]));
  };

  /** What the family and memory rows were built from: rebuilt only when it changes. */
  let shownId: number | null = null;
  let shownFamily = '';
  let shownMemory = '';
  let shownPortrait = '';

  const showFamily = (villager: Villager) => {
    const key = JSON.stringify([
      villager.mother,
      villager.father,
      villager.spouse,
      villager.children,
      [villager.mother, villager.father, villager.spouse, ...villager.children].map(
        (id) => id !== null && findVillager(world, id) !== undefined,
      ),
    ]);
    if (key === shownFamily) return;
    shownFamily = key;
    const parent = (id: number | null, unknown: string) =>
      id === null ? [unknown] : [kinButton(id)];
    familyRows.replaceChildren(
      ...familyRow(CARD.mother, ...parent(villager.mother, CARD.unknownMother)),
      ...familyRow(CARD.father, ...parent(villager.father, CARD.unknownFather)),
      ...familyRow(
        CARD.spouse(villager.sex),
        ...(villager.spouse === null ? [CARD.none] : [kinButton(villager.spouse)]),
      ),
      ...familyRow(CARD.children, ...kinList(villager.children)),
    );
  };

  const showMemory = (villager: Villager) => {
    const last = villager.memories.at(-1);
    const key = `${villager.memories.length}:${last?.event ?? 0}:${last?.tick ?? 0}`;
    if (key === shownMemory) return;
    shownMemory = key;
    if (villager.memories.length === 0) {
      memoryList.replaceChildren(
        h('li', 'hud-memory hud-card-empty', CARD.memoryEmpty(villager.sex)),
      );
      return;
    }
    // The newest first.
    memoryList.replaceChildren(
      ...villager.memories
        .toReversed()
        .map((memory) =>
          h(
            'li',
            'hud-memory',
            h('span', '', memoryText(memory, villager.sex)),
            h('small', 'hud-card-date', shortDateOf(memory.tick)),
          ),
        ),
    );
  };

  const updateCard = () => {
    const id = source.selected();
    card.hidden = id === null;
    if (id === null) {
      shownId = null;
      return;
    }
    if (id !== shownId) {
      shownId = id;
      shownFamily = '';
      shownMemory = '';
      shownPortrait = '';
    }
    const villager = findVillager(world, id);
    if (!villager) {
      const dead = deathOf(id);
      setText(cardTitle, dead ? HUD.deadTitle(dead.name) : HUD.cardTitle(undefined, id));
      setText(cardWho, dead?.note ?? '');
      setText(cardOrigin, '');
      portrait.hidden = true;
      cardLiving.hidden = true;
      return;
    }
    cardLiving.hidden = false;
    portrait.hidden = false;
    const look = `${villager.id}:${villager.sex}:${villager.skin}:${villager.hair}`;
    if (look !== shownPortrait) {
      shownPortrait = look;
      const canvas = source.portrait(villager);
      canvas.title = CARD.portrait(villager.name);
      portrait.replaceChildren(canvas);
    }
    setText(cardTitle, villager.name);
    setText(cardWho, CARD.who(villager.sex, ageOf(villager, world.tick)));
    setText(
      cardOrigin,
      CARD.origin(villager.sex, cameFromOutside(villager), shortDateOf(Math.max(0, villager.born))),
    );
    setText(cardDoing, `${CARD.now}: ${doingOf(villager, resourceName)}`);
    const decision: Decision | undefined = villager.log.at(-1);
    const night = calendarAt(world.tick).phase === 'night';
    setText(cardWhy, `${CARD.why}: ${whyOf(villager, decision, night)}`);
    for (const scale of scales) {
      const value = Math.round(
        scale.key === 'health' ? villager.health : villager.needs[scale.key],
      );
      const width = `${Math.max(0, Math.min(100, value))}%`;
      if (scale.fill.style.width !== width) scale.fill.style.width = width;
      setText(scale.value, String(value));
      scale.row.classList.toggle('low', value <= 20);
    }
    showFamily(villager);
    showMemory(villager);
  };

  return {
    menu,
    debug,
    update() {
      if (world.tick !== shownTick) {
        shownTick = world.tick;
        setText(date, capitalize(dateOf(world.tick)));
        const phase = calendarAt(world.tick).phase;
        if (phase !== shownPhase) {
          shownPhase = phase;
          let icon = phaseIcons.get(phase);
          if (!icon) {
            icon = source.icon(PHASE_ICON[phase], 2);
            phaseIcons.set(phase, icon);
          }
          phaseIcon.replaceChildren(icon);
          when.title = HUD.phaseTitle(phase);
        }
        const kind = world.weather.kind;
        if (kind !== shownWeather) {
          shownWeather = kind;
          const name = WEATHER_ICON[kind];
          let icon = name ? weatherIcons.get(kind) : undefined;
          if (name && !icon) {
            icon = source.icon(name, 2);
            weatherIcons.set(kind, icon);
          }
          if (icon) weatherIcon.replaceChildren(icon);
          else weatherIcon.replaceChildren();
          weatherIcon.hidden = !icon;
        }
        const degrees = airTemperature(world);
        setText(temperature, temperatureText(degrees));
        weather.title = HUD.weatherTitle(kind, degrees);
        const population = world.villagers.list.length;
        setText(peopleCount, HUD.population(population));
        people.title = HUD.populationTitle(population);
        if (feed.update(world) || !feedShown) {
          renderFeed(feedShown);
          feedShown = true;
        }
      }
      if (loop.speed !== shownSpeed) {
        shownSpeed = loop.speed;
        for (const [speed, control] of speedButtons) {
          const active = speed === loop.speed;
          control.classList.toggle('active', active);
          control.setAttribute('aria-pressed', String(active));
        }
      }
      lagging.hidden = !(loop.lagging && loop.speed !== 0);
      updateCard();
    },
  };
}
