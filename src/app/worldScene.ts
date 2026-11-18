/**
 * Scene `world` (step 0.7): the player's world — the one from the autosave slot, saved once a
 * game year and when the tab closes, so a page reload returns to it on the same tick.
 *
 *   ?scene=world                               the saved world (a new one if there is none)
 *   ?scene=world&seed=5&ticks=3000             a world of the address: shown, never saved by itself
 *   ?scene=world&slot=world&seed=7&ticks=9000  debug: this world put into the slot first
 *
 * The world is drawn as its map (./mapView.ts, step 1.1) seen through the observer's camera (step
 * 1.2: drag, wheel, pinch, WASD / arrows, +/−; `cam=`, `zoom=`). Over it — the observer's panel
 * (src/ui/hud.ts, step 1.6): the date, the time of day, the population, the speed buttons, the event
 * feed, the card of the chosen villager (`select=`) and the menu «Мир» (`menu=1`): how the world is
 * saved, «Save to file», «To the menu». A save that cannot be opened shows the title screen with
 * the reason and the offer of a new world.
 */

import { PALETTE } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { createSpriteSheet, type SpriteSheet } from '../render/spriteSheet.ts';
import { hashState } from '../sim/hash.ts';
import type { LoadWarning } from '../sim/save.ts';
import { saveWorld } from '../sim/save.ts';
import type { World } from '../sim/world.ts';
import { dateOf } from '../ui/dates.ts';
import { createHud, type Hud } from '../ui/hud.ts';
import { capitalize, HUD, loadWarningText, SAVE_TEXT, speedName } from '../ui/texts.ts';
import { createMapView, type MapView } from './mapView.ts';
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

  const start = { tick: world.tick, hash: hashState(world) };
  const view = createMapView(context, world);
  let hud: Hud | null = null;
  let panel: { update(): void } | null = null;
  if (params.ui) {
    const sheet = createSpriteSheet(SPRITES, PALETTE);
    hud = createHud(ui, {
      world,
      loop: view.loop,
      selected: view.selected,
      select: view.select,
      flyToTile: view.flyToTile,
      flyToVillager: view.flyToVillager,
      icon: (name, scale) => iconCanvas(sheet, name, scale),
      menuOpen: params.menu,
    });
    panel = createWorldPanel(hud, world, view, autosave, origin, warnings);
  }
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
    opened: start,
    villagers: () =>
      world.villagers.list.map((villager) => ({
        id: villager.id,
        sex: villager.sex,
        x: villager.x,
        y: villager.y,
        toX: villager.toX,
        toY: villager.toY,
        action: villager.action.kind,
        goal: villager.action.kind === 'walk' ? { ...villager.action.goal } : null,
        walked: villager.walked,
        needs: { ...villager.needs },
        health: villager.health,
      })),
  };

  return {
    update(elapsedMs) {
      view.scene.update?.(elapsedMs);
      autosave.afterTicks();
    },
    resize(width, height, pixelRatio) {
      view.scene.resize(width, height, pixelRatio);
    },
    render(frame) {
      view.scene.render(frame);
      hud?.update();
      panel?.update();
    },
  };
}

/** A canvas with sprite `name` at ×`scale`, exactly its size (crisp at any page zoom of 100 %). */
function iconCanvas(sheet: SpriteSheet, name: string, scale: number): HTMLCanvasElement {
  const entry = sheet.entry(name);
  const canvas = document.createElement('canvas');
  canvas.width = entry.width * scale;
  canvas.height = entry.height * scale;
  canvas.className = 'pixel-icon';
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  sheet.draw(ctx, name, entry.anchor.x * scale, entry.anchor.y * scale, { scale, frame: 0 });
  return canvas;
}

/**
 * The menu «Мир» of the observer's panel (step 0.7, in the panel since step 1.6): the date and the
 * tick, the speed and the keys, the zoom, how the world is saved, «Save to file», «To the menu».
 * Below the panel — debug lines: with `debug=1` what the last debug click did; with `debug=needs`
 * what each villager is doing and its scales, and who died of what.
 */
function createWorldPanel(
  hud: Hud,
  world: World,
  { loop, camera, debugNote, needsNotes }: MapView,
  autosave: Autosave,
  origin: 'url' | 'saved' | 'new',
  warnings: LoadWarning[],
) {
  const line = (className: string, text = '') => {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    return element;
  };
  const title = line('world-panel-title', HUD.menu);
  const date = line('world-panel-date');
  const clock = line('world-panel-clock');
  const view = line('world-panel-camera');
  const status = line('world-panel-status');
  const hint = line('world-panel-hint', origin === 'url' ? HUD.hintUrl : HUD.hintSaved);
  const notes = line('world-panel-notes');
  for (const warning of warnings) {
    const row = document.createElement('p');
    row.className = 'world-panel-warn';
    row.textContent = HUD.warn(loadWarningText(warning));
    notes.append(row);
  }
  const buttons = line('world-panel-buttons');
  const toFile = document.createElement('button');
  toFile.type = 'button';
  toFile.textContent = HUD.toFile;
  const toMenu = document.createElement('button');
  toMenu.type = 'button';
  toMenu.textContent = HUD.toMenu;
  buttons.append(toFile, toMenu);
  hud.menu.append(title, date, clock, view, status, hint, notes, buttons);

  const debugLine = line('world-panel-debug');
  const needsBlock = line('world-panel-debug world-panel-needs');
  debugLine.hidden = debugNote() === null;
  needsBlock.hidden = needsNotes() === null;
  hud.debug.append(debugLine, needsBlock);
  hud.debug.hidden = debugLine.hidden && needsBlock.hidden;

  const note = (text: string, kind: 'ok' | 'warn') => {
    const row = document.createElement('p');
    row.className = kind === 'ok' ? 'world-panel-ok' : 'world-panel-warn';
    row.textContent = text;
    notes.replaceChildren(row);
  };

  toFile.addEventListener('click', () => {
    try {
      const name = saveFileName(world);
      downloadText(name, saveWorld(world));
      note(SAVE_TEXT.savedToFile(name), 'ok');
    } catch (error) {
      note(
        HUD.warn(SAVE_TEXT.notSaved(error instanceof Error ? error.message : String(error))),
        'warn',
      );
    }
  });
  toMenu.addEventListener('click', () => {
    autosave.saveNow();
    window.location.assign('?scene=title');
  });

  const set = (element: HTMLElement, text: string) => {
    if (element.textContent !== text) element.textContent = text;
  };
  let shownNeeds = '';
  return {
    update() {
      const needsLines = needsNotes();
      const needsText = needsLines?.join('\n') ?? '';
      if (needsText !== shownNeeds) {
        shownNeeds = needsText;
        needsBlock.replaceChildren(...(needsLines ?? []).map((text) => line('', text)));
      }
      const debugText = debugNote();
      if (debugText !== null) set(debugLine, HUD.debug(debugText));
      set(date, capitalize(dateOf(world.tick)));
      const speed =
        speedName(loop.speed) + (loop.speed !== 0 && loop.lagging ? ` (${HUD.lagging})` : '');
      set(clock, `${HUD.tick(world.tick)} · ${speed} · ${HUD.keysSpeed}`);
      set(view, HUD.zoomLine(camera.camera.zoom));
      let text: string;
      if (origin === 'url') text = HUD.fromUrl(world.seed);
      else if (autosave.error !== null) text = HUD.warn(autosave.error);
      else if (autosave.savedTick !== null)
        text = HUD.savedAt(dateOf(autosave.savedTick), autosave.savedTick);
      else text = HUD.notSavedYet;
      set(status, text);
      status.classList.toggle('world-panel-warn', autosave.error !== null);
    },
  };
}
