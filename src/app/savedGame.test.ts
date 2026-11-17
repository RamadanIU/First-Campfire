import { describe, expect, it } from 'vitest';
import { TICKS_PER_YEAR } from '../sim/calendar.ts';
import { hashState } from '../sim/hash.ts';
import { loadWorld, saveWorld } from '../sim/save.ts';
import { createWorld, runTicks } from '../sim/world.ts';
import { parseParams } from './params.ts';
import {
  applySlotPreset,
  createAutosave,
  inspectSlot,
  openWorld,
  randomSeed,
  saveFileName,
  saveOnLeave,
  startNewWorld,
} from './savedGame.ts';
import { createSaveSlot, type KeyValueStorage } from './saveSlot.ts';

/** In-memory storage with a size limit (characters), like localStorage. */
function fakeStorage(limit = Number.POSITIVE_INFINITY) {
  const items = new Map<string, string>();
  let writes = 0;
  const storage: KeyValueStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      if (value.length > limit) {
        throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      }
      writes++;
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
  return { storage, items, writes: () => writes };
}

/** Minimal page: listeners by event type and a visibility state. */
function fakePage() {
  const listeners = new Map<string, (() => void)[]>();
  const target = {
    visibilityState: 'visible',
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    fire(type: string) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
  };
  return target;
}

describe('какой мир открывает сцена world', () => {
  it('пустой слот — новый мир со случайным зерном, сразу записан в слот', () => {
    const { storage } = fakeStorage();
    const slot = createSaveSlot(storage);
    const opened = openWorld(parseParams('?scene=world'), slot, () => 4242);
    expect(opened).toMatchObject({ kind: 'world', origin: 'new' });
    expect(opened.kind === 'world' && opened.world.seed).toBe(4242);
    expect(inspectSlot(slot)).toMatchObject({ kind: 'saved', header: { seed: 4242, tick: 0 } });
  });

  it('мир из слота — тот же мир на том же тике', () => {
    const slot = createSaveSlot(fakeStorage().storage);
    const world = createWorld(7);
    runTicks(world, 9_000);
    slot.write(saveWorld(world));
    const opened = openWorld(parseParams('?scene=world'), slot);
    expect(opened.kind).toBe('world');
    if (opened.kind !== 'world') return;
    expect(opened.origin).toBe('saved');
    expect(hashState(opened.world)).toBe(hashState(world));
  });

  it('мир из адреса не читает и не пишет слот', () => {
    const { storage, writes } = fakeStorage();
    const slot = createSaveSlot(storage);
    slot.write(saveWorld(createWorld(99)));
    const opened = openWorld(parseParams('?scene=world&seed=5&ticks=300'), slot);
    expect(opened).toMatchObject({ kind: 'world', origin: 'url' });
    expect(opened.kind === 'world' && [opened.world.seed, opened.world.tick]).toEqual([5, 300]);
    expect(writes()).toBe(1);
    expect(inspectSlot(slot)).toMatchObject({ header: { seed: 99 } });
  });

  it('повреждённое, чужое и новое сохранения — понятная причина, а не падение', () => {
    const cases = [
      ['broken', 'damaged'],
      ['alien', 'not_save'],
      ['newer', 'too_new'],
    ] as const;
    for (const [preset, code] of cases) {
      const slot = createSaveSlot(fakeStorage().storage);
      const params = parseParams(`?scene=world&slot=${preset}&seed=3&ticks=2000`);
      applySlotPreset(slot, preset, params);
      const opened = openWorld(params, slot);
      expect(opened.kind, preset).toBe('problem');
      expect(opened.kind === 'problem' && opened.error.code, preset).toBe(code);
      expect(inspectSlot(slot)).toMatchObject({ kind: 'problem', error: { code } });
    }
  });

  it('отладочные заготовки слота: world и empty', () => {
    const slot = createSaveSlot(fakeStorage().storage);
    const params = parseParams('?scene=title&slot=world&seed=7&ticks=9000');
    applySlotPreset(slot, 'world', params);
    expect(inspectSlot(slot)).toMatchObject({ kind: 'saved', header: { seed: 7, tick: 9000 } });
    applySlotPreset(slot, 'empty', params);
    expect(inspectSlot(slot)).toEqual({ kind: 'none' });
  });

  it('«Новый мир» кладёт в слот мир с выбранным зерном', () => {
    const slot = createSaveSlot(fakeStorage().storage);
    expect(startNewWorld(slot, 123_456_789)).toEqual({ ok: true });
    expect(inspectSlot(slot)).toMatchObject({ header: { seed: 123_456_789, tick: 0 } });
  });

  it('случайное зерно — от 1 до 999 999', () => {
    expect(randomSeed(() => 0)).toBe(1);
    expect(randomSeed(() => 0.999_999_999)).toBe(999_999);
  });
});

describe('автосохранение', () => {
  it('раз в игровой год — когда начинается новый год', () => {
    const fake = fakeStorage();
    const slot = createSaveSlot(fake.storage);
    const world = createWorld(1);
    slot.write(saveWorld(world));
    const autosave = createAutosave(world, slot, { enabled: true, savedTick: 0 });
    const writesBefore = fake.writes();
    for (let i = 0; i < TICKS_PER_YEAR * 3 + 100; i++) {
      runTicks(world, 1);
      autosave.afterTicks();
    }
    expect(fake.writes() - writesBefore).toBe(3);
    expect(autosave.savedTick).toBe(TICKS_PER_YEAR * 3);
  });

  it('за кадр может пройти несколько тиков — год всё равно сохраняется один раз', () => {
    const fake = fakeStorage();
    const slot = createSaveSlot(fake.storage);
    const world = createWorld(1);
    runTicks(world, TICKS_PER_YEAR - 2);
    const autosave = createAutosave(world, slot, { enabled: true, savedTick: world.tick });
    runTicks(world, 5); // one frame at a high speed jumps over the new year
    autosave.afterTicks();
    autosave.afterTicks();
    expect(fake.writes()).toBe(1);
    expect(autosave.savedTick).toBe(TICKS_PER_YEAR + 3);
  });

  it('закрыл вкладку → открыл снова: тот же мир на том же тике', () => {
    const fake = fakeStorage();
    // First visit: a new world, played for a while.
    const first = openWorld(parseParams('?scene=world'), createSaveSlot(fake.storage), () => 77);
    if (first.kind !== 'world') throw new Error('мир не открылся');
    const page = fakePage();
    const autosave = createAutosave(first.world, createSaveSlot(fake.storage), {
      enabled: true,
      savedTick: first.world.tick,
    });
    saveOnLeave(autosave, page, page);
    for (let i = 0; i < 3_333; i++) {
      runTicks(first.world, 1);
      autosave.afterTicks();
    }
    page.fire('pagehide'); // the tab closes or reloads

    // Second visit: the same world on the same tick, and it goes on with the same history.
    const second = openWorld(parseParams('?scene=world'), createSaveSlot(fake.storage));
    if (second.kind !== 'world') throw new Error('мир не открылся');
    expect(second.origin).toBe('saved');
    expect(second.world.tick).toBe(3_333);
    expect(hashState(second.world)).toBe(hashState(first.world));
    runTicks(second.world, 1_000);
    runTicks(first.world, 1_000);
    expect(hashState(second.world)).toBe(hashState(first.world));
  });

  it('вкладка скрыта (телефон свернул браузер) — тоже сохраняет; видимая — нет', () => {
    const fake = fakeStorage();
    const slot = createSaveSlot(fake.storage);
    const world = createWorld(2);
    const autosave = createAutosave(world, slot, { enabled: true, savedTick: 0 });
    const page = fakePage();
    saveOnLeave(autosave, page, page);
    runTicks(world, 50);
    page.fire('visibilitychange');
    expect(fake.writes()).toBe(0);
    page.visibilityState = 'hidden';
    page.fire('visibilitychange');
    expect(fake.writes()).toBe(1);
    expect(autosave.savedTick).toBe(50);
    page.fire('pagehide'); // nothing changed since — no second write
    expect(fake.writes()).toBe(1);
  });

  it('мир из адреса не сохраняется сам', () => {
    const fake = fakeStorage();
    const world = createWorld(3);
    const autosave = createAutosave(world, createSaveSlot(fake.storage), {
      enabled: false,
      savedTick: null,
    });
    runTicks(world, TICKS_PER_YEAR + 1);
    autosave.afterTicks();
    expect(autosave.saveNow()).toBe(false);
    expect(fake.writes()).toBe(0);
    expect(autosave.error).toBeNull();
  });

  it('хранилище переполнено — сообщение, мир идёт дальше, повтор только в следующий раз', () => {
    const world = createWorld(4);
    runTicks(world, 100);
    const limit = saveWorld(world).length + 5_000;
    const fake = fakeStorage(limit);
    const slot = createSaveSlot(fake.storage);
    const autosave = createAutosave(world, slot, { enabled: true, savedTick: 100 });
    runTicks(world, TICKS_PER_YEAR * 2); // the journal grows past the limit
    autosave.afterTicks();
    expect(autosave.error).toMatch(/переполнено \(сохранение — \d+ КБ\).*в файл/);
    expect(autosave.savedTick).toBe(100);
    autosave.afterTicks(); // same year: no new attempt every frame
    expect(autosave.error).not.toBeNull();
    expect(fake.writes()).toBe(0);
  });

  it('браузер не даёт хранилище — автосохранения нет, игрок предупреждён', () => {
    const world = createWorld(5);
    const slot = createSaveSlot(null);
    expect(openWorld(parseParams('?scene=world'), slot, () => 5)).toMatchObject({
      kind: 'world',
      origin: 'new',
    });
    const autosave = createAutosave(world, slot, { enabled: true, savedTick: null });
    expect(autosave.enabled).toBe(false);
    expect(autosave.error).toMatch(/хранилище/);
    expect(inspectSlot(slot)).toEqual({ kind: 'none' });
  });

  it('сохранение в файл открывается тем же загрузчиком', () => {
    const world = createWorld(7);
    runTicks(world, 9_000);
    expect(saveFileName(world)).toBe('first-campfire-seed-7-year-2-tick-9000.json');
    const result = loadWorld(saveWorld(world));
    expect(result.ok && hashState(result.world)).toBe(hashState(world));
  });
});
