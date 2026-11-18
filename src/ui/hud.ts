/**
 * The observer's panel (step 1.6, GDD §1.3, §10.6, §11.4): the minimal interface for watching.
 *
 *   ┌ ☼ Год 2 · зима · день 2 из 3   👥 2 ─────────────── ❚❚ ×1 ×2 ×5 ×20   Мир ▾ ┐
 *   │ События                                                           (menu «Мир») │
 *   │  ☠ Умерла женщина — голод                                                      │
 *   │                                                                                │
 *   │ (the chosen villager: name, what it does, four scales)            (debug lines) │
 *   └────────────────────────────────────────────────────────────────────────────────┘
 *
 * - The top bar: the date, an icon of the time of day, the population; the speed buttons (pause,
 *   ×1, ×2, ×5, ×20 — the keys Space and 1–4 do the same, src/app/controls.ts); «Мир» opens the
 *   menu of the world (how it is saved, «Save to file», «To the menu», the keys).
 * - The event feed (./feed.ts): the latest significant events; a click flies the camera to the
 *   place (or to the villager, while it lives).
 * - The card of the chosen villager: what it does and its four scales (the full card — step 2.1).
 *
 * Everything stands at the edges: the middle of the screen stays the world's. `ui=0` shows none of
 * it (the scene does not create the panel). The panel only reads the world; what it changes is
 * the observer's: the speed, the camera, the choice.
 */
import { calendarAt, type DayPhase } from '../sim/calendar.ts';
import type { Tile } from '../sim/path.ts';
import { findVillager } from '../sim/villagers.ts';
import type { World } from '../sim/world.ts';
import { dateOf, shortDateOf } from './dates.ts';
import { createFeed, type FeedEntry } from './feed.ts';
import { capitalize, deathNote, doingOf, HUD, SCALE_NAME, speedName } from './texts.ts';

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

function feedIcon(entry: FeedEntry, world: World): string {
  switch (entry.type) {
    case 'villager_arrived':
      return 'hud_people';
    case 'villager_died':
      return 'hud_death';
    case 'villager_fainted':
      return 'bubble_sleep';
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
  const date = h('span', 'hud-date');
  const when = h('div', 'hud-when', phaseIcon, date);
  const peopleCount = h('span', 'hud-count');
  const people = h('div', 'hud-people', source.icon('hud_people', 2), peopleCount);

  const speedButtons = new Map<number, HTMLButtonElement>();
  const speeds = h('div', 'hud-speeds');
  speeds.setAttribute('role', 'group');
  speeds.setAttribute('aria-label', HUD.speedLabel);
  for (const { speed, key } of SPEED_BUTTONS) {
    const label = speed === 0 ? h('span', 'hud-pause-glyph') : speedName(speed);
    const control = button('hud-speed', HUD.speedTitle(speed, key), label);
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

  // ── The card of the chosen villager ──
  const cardTitle = h('div', 'hud-card-title');
  const close = button('hud-card-close', HUD.close, '×');
  close.addEventListener('click', () => source.select(null));
  const cardDoing = h('div', 'hud-card-doing');
  const scales = (['food', 'water', 'sleep', 'health'] as const).map((key) => {
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
  const card = h(
    'section',
    'hud-card',
    h('div', 'hud-card-head', cardTitle, close),
    cardDoing,
    cardScales,
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
  let shownSpeed = -1;
  const phaseIcons = new Map<DayPhase, HTMLCanvasElement>();
  /** The dead the card was asked about: id → who it was and its last words. */
  const deaths = new Map<number, { title: string; note: string }>();
  const deathOf = (id: number) => {
    let found = deaths.get(id);
    if (!found) {
      const event = world.events.list.findLast(
        (e) => e.type === 'villager_died' && e.villager === id,
      );
      found =
        event?.type === 'villager_died'
          ? {
              title: HUD.cardTitle(event.sex, id),
              note: capitalize(deathNote(event.sex, calendarAt(event.tick).day, event.reason)),
            }
          : { title: HUD.cardTitle(undefined, id), note: '' };
      deaths.set(id, found);
    }
    return found;
  };

  const updateCard = () => {
    const id = source.selected();
    card.hidden = id === null;
    if (id === null) return;
    const villager = findVillager(world, id);
    if (!villager) {
      const dead = deathOf(id);
      setText(cardTitle, dead.title);
      setText(cardDoing, dead.note);
      cardScales.hidden = true;
      return;
    }
    cardScales.hidden = false;
    setText(cardTitle, HUD.cardTitle(villager.sex, id));
    setText(cardDoing, capitalize(doingOf(villager)));
    for (const scale of scales) {
      const value = Math.round(
        scale.key === 'health' ? villager.health : villager.needs[scale.key],
      );
      const width = `${Math.max(0, Math.min(100, value))}%`;
      if (scale.fill.style.width !== width) scale.fill.style.width = width;
      setText(scale.value, String(value));
      scale.row.classList.toggle('low', value <= 20);
    }
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
