/**
 * The saved game in the browser (step 0.7, ADR-016): which world the world scene opens, the
 * autosave (once a game year and when the tab closes), the debug presets of `slot=`.
 *
 * The autosave slot (./saveSlot.ts) is the single source of «the current game»: «New world»
 * and «Load from file» on the title screen put a world there and open `?scene=world`; the world
 * scene reads it back. So a page reload always returns to the same world on the same tick.
 * A world given by the address (`seed=`, `ticks=`) is a different thing — a reproducible
 * picture for screenshots and bug reports: it never touches the slot.
 *
 * No DOM here (only the storage behind the slot), so all of it runs in Node tests.
 */
import { calendarAt, TICKS_PER_YEAR } from '../sim/calendar.ts';
import {
  type LoadError,
  type LoadWarning,
  loadWorld,
  SAVE_VERSION,
  type SaveHeader,
  saveWorld,
} from '../sim/save.ts';
import { findVillager, orderWalk } from '../sim/villagers.ts';
import { createWorld, runTicks, type World } from '../sim/world.ts';
import { SAVE_TEXT } from '../ui/texts.ts';
import type { LaunchParams, SlotPreset } from './params.ts';
import { browserStorage, createSaveSlot, type SaveSlot } from './saveSlot.ts';

/** Largest seed the player can type in «New world». */
export const MAX_SEED = 999_999_999;

/** A seed for a new world the player did not choose: 1…999 999 — short enough to remember. */
export function randomSeed(random: () => number = Math.random): number {
  return 1 + Math.floor(random() * 999_999);
}

/**
 * The world of the address: `seed=`, fast-forwarded to `ticks=`. With `go=x,y` (debug) the first
 * villager is sent to that tile at the very start — the walk is reproducible by URL.
 */
export function worldFromParams(params: LaunchParams): World {
  const world = createWorld(params.seed);
  const first = findVillager(world, 1);
  if (params.go && first) orderWalk(world, first, params.go);
  runTicks(world, params.ticks);
  return world;
}

/** Put a debug preset into the slot (see SLOT_PRESETS in ./params.ts). */
export function applySlotPreset(slot: SaveSlot, preset: SlotPreset, params: LaunchParams): void {
  switch (preset) {
    case 'empty':
      slot.clear();
      return;
    case 'world':
      slot.write(saveWorld(worldFromParams(params)));
      return;
    case 'broken': {
      const text = saveWorld(worldFromParams(params));
      slot.write(text.slice(0, Math.floor(text.length * 0.6)));
      return;
    }
    case 'alien':
      slot.write('{"app":"notes","notes":["buy bread","call mum"]}');
      return;
    case 'newer':
      slot.write(
        saveWorld(worldFromParams(params)).replace(
          `"version":${SAVE_VERSION},`,
          `"version":${SAVE_VERSION + 1},`,
        ),
      );
      return;
  }
}

/** The autosave slot of this page, with the debug preset of `slot=` (if any) put into it. */
export function openSaveSlot(params: LaunchParams): SaveSlot {
  const slot = createSaveSlot(browserStorage());
  if (params.slot !== null) applySlotPreset(slot, params.slot, params);
  return slot;
}

/** What lies in the slot — for the title menu. */
export type SlotContents =
  | { kind: 'none' }
  | { kind: 'saved'; header: SaveHeader; warnings: LoadWarning[] }
  | { kind: 'problem'; error: LoadError };

export function inspectSlot(slot: SaveSlot): SlotContents {
  const text = slot.read();
  if (text === null) return { kind: 'none' };
  const result = loadWorld(text);
  return result.ok
    ? { kind: 'saved', header: result.header, warnings: result.warnings }
    : { kind: 'problem', error: result.error };
}

/**
 * The world the world scene shows:
 * - `url` — given by the address (`seed=` / `ticks=`); the slot is not touched;
 * - `saved` — from the slot;
 * - `new` — the slot was empty: a new world with a random seed, put into the slot at once.
 * A save that cannot be opened is a `problem` — the scene offers a new world.
 */
export type OpenedWorld =
  | { kind: 'world'; world: World; origin: 'url' | 'saved' | 'new'; warnings: LoadWarning[] }
  | { kind: 'problem'; error: LoadError };

export function openWorld(
  params: LaunchParams,
  slot: SaveSlot,
  newSeed: () => number = randomSeed,
): OpenedWorld {
  if (params.worldFromUrl) {
    return { kind: 'world', world: worldFromParams(params), origin: 'url', warnings: [] };
  }
  const text = slot.read();
  if (text === null) {
    const world = createWorld(newSeed());
    slot.write(saveWorld(world));
    return { kind: 'world', world, origin: 'new', warnings: [] };
  }
  const result = loadWorld(text);
  return result.ok
    ? { kind: 'world', world: result.world, origin: 'saved', warnings: result.warnings }
    : { kind: 'problem', error: result.error };
}

/** Make a new world and put it into the slot (the title menu opens the world scene after). */
export function startNewWorld(slot: SaveSlot, seed: number) {
  return slot.write(saveWorld(createWorld(seed)));
}

/**
 * Autosave of a running world: once a game year (when a new year begins) and on demand
 * (closing the tab, leaving for the menu). A failed save is reported in `error` and retried
 * only at the next occasion — never every frame.
 */
export interface Autosave {
  /** False for a world of the address and when the browser keeps no storage. */
  readonly enabled: boolean;
  /** Tick of the last save in the slot; null — none. */
  readonly savedTick: number | null;
  /** Why the last attempt failed (for the player), or null. */
  readonly error: string | null;
  /** Call after the world has advanced: saves when a new game year has begun. */
  afterTicks(): void;
  /** Save now unless the slot already holds this very tick. True if the slot is up to date. */
  saveNow(): boolean;
}

export interface AutosaveOptions {
  enabled: boolean;
  /** Tick of the save already in the slot (the world was loaded from it or just put there). */
  savedTick: number | null;
}

export function createAutosave(world: World, slot: SaveSlot, options: AutosaveOptions): Autosave {
  const enabled = options.enabled && slot.available;
  let savedTick = options.savedTick;
  let triedTick = savedTick;
  let error: string | null = options.enabled && !slot.available ? SAVE_TEXT.noStorage : null;
  const yearIndex = (tick: number) => Math.floor(tick / TICKS_PER_YEAR);

  const save = (): boolean => {
    if (!enabled) return false;
    if (world.tick === savedTick) return true;
    triedTick = world.tick;
    let text: string;
    try {
      text = saveWorld(world);
    } catch (problem) {
      error = SAVE_TEXT.notSaved(problem instanceof Error ? problem.message : String(problem));
      return false;
    }
    const result = slot.write(text);
    if (!result.ok) {
      error = result.message;
      return false;
    }
    savedTick = world.tick;
    error = null;
    return true;
  };

  return {
    enabled,
    get savedTick() {
      return savedTick;
    },
    get error() {
      return error;
    },
    afterTicks() {
      if (!enabled) return;
      if (triedTick === null || yearIndex(world.tick) > yearIndex(triedTick)) save();
    },
    saveNow: save,
  };
}

/** The page events of «the tab is being closed or hidden». */
export interface PageEvents {
  addEventListener(type: string, listener: () => void): void;
}

/**
 * Save when the page goes away: `pagehide` (closing, reloading, leaving) and `visibilitychange`
 * to hidden (switching tabs or apps — on phones the last moment a page is sure to run).
 * localStorage is synchronous, so the save is complete before the page is gone.
 */
export function saveOnLeave(
  autosave: Autosave,
  win: PageEvents,
  doc: PageEvents & { visibilityState: string },
): void {
  win.addEventListener('pagehide', () => autosave.saveNow());
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') autosave.saveNow();
  });
}

/**
 * File name for «Save to file»: «first-campfire-seed-7-year-2-tick-9000.json». Latin letters
 * only: browsers and file systems may turn a Cyrillic name into «download».
 */
export function saveFileName(world: World): string {
  return `first-campfire-seed-${world.seed}-year-${calendarAt(world.tick).year}-tick-${world.tick}.json`;
}
