/**
 * Scene `world` (step 0.7): the player's world — the one from the autosave slot, saved once a
 * game year and when the tab closes, so a page reload returns to it on the same tick.
 *
 *   ?scene=world                               the saved world (a new one if there is none)
 *   ?scene=world&seed=5&ticks=3000             a world of the address: shown, never saved by itself
 *   ?scene=world&slot=world&seed=7&ticks=9000  debug: this world put into the slot first
 *
 * The world is drawn as its map (./mapView.ts, step 1.1). In the corner — the panel of the world:
 * the date, how it is saved, «Save to file», «To the menu». A save that cannot be opened shows
 * the title screen with the reason and the offer of a new world.
 */
import { hashState } from '../sim/hash.ts';
import type { LoadWarning } from '../sim/save.ts';
import { saveWorld } from '../sim/save.ts';
import type { World } from '../sim/world.ts';
import { dateOf, formatCount } from './dates.ts';
import type { GameLoop } from './loop.ts';
import { createMapView } from './mapView.ts';
import {
  type Autosave,
  createAutosave,
  openSaveSlot,
  openWorld,
  randomSeed,
  saveFileName,
  saveOnLeave,
} from './savedGame.ts';
import { downloadText } from './saveFiles.ts';
import type { Scene, SceneContext } from './scene.ts';
import { createTitleScene } from './titleScene.ts';

export function createWorldScene(context: SceneContext): Scene {
  const { params, ui } = context;
  const slot = openSaveSlot(params);
  // An empty slot gets a new world with a random seed; a frozen frame (screenshots) takes `seed=`.
  const opened = openWorld(params, slot, params.frame === null ? randomSeed : () => params.seed);
  if (opened.kind === 'problem') {
    // The title menu reads the same slot and explains what is wrong, offering a new world.
    return createTitleScene({ ...context, params: { ...params, slot: null } });
  }

  const { world, origin, warnings } = opened;
  const autosave = createAutosave(world, slot, {
    enabled: origin !== 'url',
    savedTick: origin === 'url' ? null : world.tick,
  });
  saveOnLeave(autosave, window, document);

  const view = createMapView(context, world);
  const panel = params.ui
    ? createWorldPanel(ui, world, view.loop, autosave, origin, warnings)
    : null;
  // For automated checks (tools/e2e.ts): the world without reading it off the screen.
  window.__fc.world = {
    get seed() {
      return world.seed;
    },
    get tick() {
      return world.tick;
    },
    hash: () => hashState(world),
    origin,
    get savedTick() {
      return autosave.savedTick;
    },
  };

  return {
    update(elapsedMs) {
      view.scene.update?.(elapsedMs);
      autosave.afterTicks();
    },
    resize(width, height) {
      view.scene.resize(width, height);
    },
    render(frame) {
      view.scene.render(frame);
      panel?.update();
    },
  };
}

/** Panel of the world: the date, how it is saved, «Save to file», «To the menu». */
function createWorldPanel(
  ui: HTMLElement,
  world: World,
  loop: GameLoop,
  autosave: Autosave,
  origin: 'url' | 'saved' | 'new',
  warnings: LoadWarning[],
) {
  const panel = document.createElement('div');
  panel.className = 'world-panel';
  const title = document.createElement('div');
  title.className = 'world-panel-title';
  title.textContent = 'Мир';
  const date = document.createElement('div');
  date.className = 'world-panel-date';
  const clock = document.createElement('div');
  clock.className = 'world-panel-clock';
  const status = document.createElement('div');
  status.className = 'world-panel-status';
  const hint = document.createElement('div');
  hint.className = 'world-panel-hint';
  hint.textContent =
    origin === 'url'
      ? 'Мир задан адресом и сам не сохраняется. Чтобы вернуться к нему позже — сохраните в файл.'
      : 'Сохраняется сам: раз в игровой год и при закрытии вкладки.';
  const notes = document.createElement('div');
  notes.className = 'world-panel-notes';
  for (const warning of warnings) {
    const line = document.createElement('p');
    line.className = 'world-panel-warn';
    line.textContent = `⚠ ${warning.message}`;
    notes.append(line);
  }
  const buttons = document.createElement('div');
  buttons.className = 'world-panel-buttons';
  const toFile = document.createElement('button');
  toFile.type = 'button';
  toFile.textContent = 'Сохранить в файл';
  const toMenu = document.createElement('button');
  toMenu.type = 'button';
  toMenu.textContent = 'В меню';
  buttons.append(toFile, toMenu);
  panel.append(title, date, clock, status, hint, notes, buttons);
  ui.append(panel);

  const note = (text: string, kind: 'ok' | 'warn') => {
    const line = document.createElement('p');
    line.className = kind === 'ok' ? 'world-panel-ok' : 'world-panel-warn';
    line.textContent = text;
    notes.replaceChildren(line);
  };

  toFile.addEventListener('click', () => {
    try {
      const name = saveFileName(world);
      downloadText(name, saveWorld(world));
      note(`Сохранено в файл «${name}»`, 'ok');
    } catch (error) {
      note(
        `⚠ Мир не сохранился: ${error instanceof Error ? error.message : String(error)}`,
        'warn',
      );
    }
  });
  toMenu.addEventListener('click', () => {
    autosave.saveNow();
    window.location.assign('?scene=title');
  });

  let shown = '';
  let shownDate = '';
  let shownClock = '';
  return {
    update() {
      const today = dateOf(world.tick);
      const dateText = today.charAt(0).toUpperCase() + today.slice(1);
      if (dateText !== shownDate) {
        shownDate = dateText;
        date.textContent = dateText;
      }
      const speed =
        loop.speed === 0 ? 'пауза' : `×${loop.speed}${loop.lagging ? ' (не успевает)' : ''}`;
      const clockText = `тик\u00a0${formatCount(world.tick)} · ${speed} · пробел — пауза, 1–4 — скорость`;
      if (clockText !== shownClock) {
        shownClock = clockText;
        clock.textContent = clockText;
      }
      let text: string;
      if (origin === 'url') {
        text = `Зерно ${world.seed}, из адреса`;
      } else if (autosave.error !== null) {
        text = `⚠ ${autosave.error}`;
      } else if (autosave.savedTick !== null) {
        text = `Сохранён: ${dateOf(autosave.savedTick)}, тик\u00a0${formatCount(autosave.savedTick)}`;
      } else {
        text = 'Ещё не сохранялся';
      }
      if (text !== shown) {
        shown = text;
        status.textContent = text;
        status.classList.toggle('world-panel-warn', autosave.error !== null);
      }
    },
  };
}
