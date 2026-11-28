/**
 * Saves: the whole world as text and back (step 0.7, ADR-016).
 *
 * A save is one line of JSON — a header and the world itself:
 *
 *   {"format":"first-campfire/world","version":1,"seed":7,"tick":9000,
 *    "hash":"1f0c…","data":"8a2e…","world":{…}}
 *
 * - `format` tells our saves from any other file; `version` is the version of the save format
 *   (SAVE_VERSION). It goes up whenever the shape of the world changes — a guard test in
 *   ./save.test.ts fails until it does. A newer save is refused; an older one is upgraded by
 *   MIGRATIONS if there is a migration for every version in between (obligatory from stage 5),
 *   otherwise refused.
 * - `hash` — fingerprint of the world (./hash.ts): a save whose world does not match it is
 *   damaged. `seed` and `tick` repeat the world's own fields so that a menu can show them.
 * - `data` — fingerprint of the data tables the world was played with. Tables are not part of
 *   the save: a loaded world lives by the current tables, and a different fingerprint is only
 *   a warning (the numbers changed since the save).
 *
 * World state is plain data (docs/ARCHITECTURE.md, rule 7), so JSON carries it as is, except
 * typed arrays: they are written as `{"$typed":"Uint16Array","base64":"…"}` (little-endian
 * bytes) and restored on load. A number that JSON cannot carry (NaN, Infinity) is a bug of the
 * simulation and stops the save instead of silently turning into null.
 *
 * `loadWorld` never throws: whatever the text, it returns either the world or a problem with a
 * message for the player (in Russian) and a technical detail.
 */
import { RAW_TABLES } from '../data/index.ts';
import { hashState } from './hash.ts';
import type { World } from './world.ts';

/** Mark of our saves: the first field of every save. */
export const SAVE_FORMAT = 'first-campfire/world';

/**
 * Version of the save format. Raise it (and add a line to the shape history in ./save.test.ts)
 * whenever the shape of the world changes; from stage 5 also add a migration to MIGRATIONS.
 */
export const SAVE_VERSION = 13;

/** Turns the world of save format version N (the key) into the world of version N + 1. */
export type Migration = (world: Record<string, unknown>) => Record<string, unknown>;

/**
 * Upgrades of old saves, by the version they upgrade from. Empty until stage 5: before it, an
 * older save is refused with a clear message (docs/ARCHITECTURE.md, rule 7).
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** What the game needs to know to read saves: the current version and the upgrades. */
export interface SaveRules {
  version: number;
  migrations: Readonly<Record<number, Migration>>;
}

const CURRENT_RULES: SaveRules = { version: SAVE_VERSION, migrations: MIGRATIONS };

/** Header of a save: everything except the world. */
export interface SaveHeader {
  format: typeof SAVE_FORMAT;
  /** Format version the save was written in (before any migration). */
  version: number;
  seed: number;
  tick: number;
  /** Fingerprint of the world as saved. */
  hash: string;
  /** Fingerprint of the data tables at the moment of saving. */
  data: string;
}

/**
 * Why a save cannot be opened:
 * - `empty` — nothing there;
 * - `not_save` — not a save of this game (another file, another format);
 * - `damaged` — our save, but cut short or changed (the world does not match its fingerprint);
 * - `too_new` — written by a newer version of the game;
 * - `too_old` — written by an older version and cannot be upgraded.
 */
export type SaveProblem = 'empty' | 'not_save' | 'damaged' | 'too_new' | 'too_old';

/**
 * What exactly is damaged in a `damaged` save:
 * - `unreadable` — reading failed in a way no check foresaw;
 * - `cut` — the text is not JSON, but it starts as our save (cut short or garbled);
 * - `no_version` — no number of the format version;
 * - `no_world` — no world in it;
 * - `no_header` — the header lacks fields;
 * - `header_mismatch` — the header and the world disagree (seed, tick);
 * - `hash_mismatch` — the world was changed or spoiled (its fingerprint does not match).
 */
export type DamageReason =
  | 'unreadable'
  | 'cut'
  | 'no_version'
  | 'no_world'
  | 'no_header'
  | 'header_mismatch'
  | 'hash_mismatch';

/**
 * Why a save did not open. The simulation knows no interface: the words for the player are
 * chosen by the code (src/ui/texts.ts, `loadErrorText`).
 */
export interface LoadError {
  code: SaveProblem;
  /** `damaged` — what exactly; null for other codes. */
  reason: DamageReason | null;
  /** `too_new`, `too_old` — the format version of the save and the one this game reads. */
  versions: { found: number; current: number } | null;
  /** Technical detail for reports and the console; may be empty. */
  detail: string;
}

/** Not a reason to refuse a save, but worth telling: `data_changed` — the tables changed. */
export interface LoadWarning {
  code: 'data_changed';
}

export type LoadResult =
  | { ok: true; world: World; header: SaveHeader; warnings: LoadWarning[] }
  | { ok: false; error: LoadError };

// --- Typed arrays ----------------------------------------------------------------------------

const TYPED_ARRAYS = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
} as const;
type TypedName = keyof typeof TYPED_ARRAYS;

/** Key that marks an encoded typed array. World state must not use it as a field name. */
const TYPED_KEY = '$typed';

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function isTypedName(name: string): name is TypedName {
  return Object.hasOwn(TYPED_ARRAYS, name);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): ArrayBuffer {
  const binary = atob(text);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/** JSON.stringify replacer: typed arrays → tagged base64; NaN and Infinity → error. */
function encodeValue(key: string, value: unknown): unknown {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        `в мире ${value} в поле «${key}» — такое число не сохранить (ошибка симуляции)`,
      );
    }
    return value;
  }
  if (typeof value === 'object' && value !== null && ArrayBuffer.isView(value)) {
    const name = value.constructor.name;
    if (!isTypedName(name)) throw new Error(`поле «${key}»: ${name} не сохраняется`);
    if (!LITTLE_ENDIAN && TYPED_ARRAYS[name].BYTES_PER_ELEMENT > 1) {
      throw new Error(
        'сохранение типизированных массивов на этой машине (big-endian) не поддержано',
      );
    }
    return {
      [TYPED_KEY]: name,
      base64: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
    };
  }
  return value;
}

/** A tagged typed array → the typed array; anything else as is. Throws on a malformed one. */
function decodeValue(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, TYPED_KEY)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const name = record[TYPED_KEY];
  const base64 = record.base64;
  if (
    typeof name !== 'string' ||
    !isTypedName(name) ||
    typeof base64 !== 'string' ||
    Object.keys(record).length !== 2
  ) {
    throw new Error(`испорчен типизированный массив: ${JSON.stringify(value).slice(0, 80)}`);
  }
  const buffer = fromBase64(base64);
  const Type = TYPED_ARRAYS[name];
  if (buffer.byteLength % Type.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`испорчен типизированный массив ${name}: ${buffer.byteLength} байт`);
  }
  return new Type(buffer);
}

/**
 * Restore the typed arrays in parsed JSON, in place. A walk over the parsed data is several times
 * cheaper than a JSON.parse reviver, which is called for every value of a long journal.
 */
function restoreTyped(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === 'object' && item !== null) value[i] = restoreTyped(item);
    }
    return value;
  }
  if (Object.hasOwn(value, TYPED_KEY)) return decodeValue(value);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const item = record[key];
    if (typeof item === 'object' && item !== null) record[key] = restoreTyped(item);
  }
  return record;
}

/**
 * Any plain data as JSON text the way saves write it: typed arrays (the map's layers) as tagged
 * base64. Plain JSON.stringify would turn a typed array into an object of numbered keys.
 */
export function toSaveJson(value: unknown): string {
  return JSON.stringify(value, encodeValue);
}

/** Text written by `toSaveJson` back into data, typed arrays restored. */
export function fromSaveJson(text: string): unknown {
  return restoreTyped(JSON.parse(text));
}

// --- Saving ----------------------------------------------------------------------------------

let tablesFingerprint: string | null = null;

/** Fingerprint of the data tables (data/*.json as written). */
export function dataFingerprint(): string {
  tablesFingerprint ??= hashState(RAW_TABLES);
  return tablesFingerprint;
}

/**
 * The world as save text. Does not change the world. Throws if the world holds something that
 * is not plain data or a number JSON cannot carry — both are bugs of the simulation.
 */
export function saveWorld(world: World): string {
  const header: SaveHeader = {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    seed: world.seed,
    tick: world.tick,
    hash: hashState(world), // also checks that the world is plain data, naming the bad path
    data: dataFingerprint(),
  };
  return JSON.stringify({ ...header, world }, encodeValue);
}

// --- Loading ---------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function problem(
  code: SaveProblem,
  detail = '',
  versions: LoadError['versions'] = null,
): LoadResult {
  return { ok: false, error: { code, reason: null, versions, detail } };
}

function damaged(reason: DamageReason, detail = ''): LoadResult {
  return { ok: false, error: { code: 'damaged', reason, versions: null, detail } };
}

const SAVE_START = `{"format":"${SAVE_FORMAT}"`;

/**
 * Does broken text still look like (the beginning of) our save? Then it is damaged, not alien:
 * it carries our mark, or it is the first dozen characters of one cut short.
 */
function looksLikeSave(text: string): boolean {
  const head = text.trimStart().slice(0, 256);
  return (
    /"format"\s*:\s*"first-campfire\/world"/.test(head) ||
    (head.length >= 12 && SAVE_START.startsWith(head))
  );
}

/**
 * Open save text. Never throws: returns the world (with warnings, if any) or the problem.
 * `rules` — the current format version and migrations; tests pass their own.
 */
export function loadWorld(text: string, rules: SaveRules = CURRENT_RULES): LoadResult {
  try {
    return readSave(text, rules);
  } catch (error) {
    // Something no check foresaw: still not a crash of the game.
    return damaged('unreadable', error instanceof Error ? error.message : String(error));
  }
}

function readSave(text: string, rules: SaveRules): LoadResult {
  if (text.trim() === '') return problem('empty');

  let parsed: unknown;
  try {
    parsed = restoreTyped(JSON.parse(text));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return looksLikeSave(text)
      ? damaged('cut', detail)
      : problem('not_save', `not JSON: ${detail}`);
  }
  if (!isRecord(parsed) || parsed.format !== SAVE_FORMAT) {
    const format = isRecord(parsed) ? parsed.format : undefined;
    return problem(
      'not_save',
      format === undefined ? 'no "format" field' : `format "${String(format)}"`,
    );
  }

  const { version, seed, tick, hash, data, world } = parsed;
  if (!isCount(version) || version < 1) {
    return damaged('no_version', `version: ${JSON.stringify(version)}`);
  }
  if (version > rules.version) {
    return problem('too_new', '', { found: version, current: rules.version });
  }
  if (!isRecord(world)) return damaged('no_world');
  if (typeof hash !== 'string' || typeof data !== 'string' || !isCount(seed) || !isCount(tick)) {
    return damaged('no_header', 'needs seed, tick, hash, data');
  }
  if (world.seed !== seed || world.tick !== tick) {
    return damaged(
      'header_mismatch',
      `header: seed ${seed}, tick ${tick}; world: seed ${String(world.seed)}, tick ${String(world.tick)}`,
    );
  }
  const actual = hashState(world);
  if (actual !== hash) {
    return damaged('hash_mismatch', `expected hash ${hash}, got ${actual}`);
  }

  let upgraded = world;
  for (let from = version; from < rules.version; from++) {
    const migrate = rules.migrations[from];
    if (!migrate) {
      return problem('too_old', `no migration from format ${from} to ${from + 1}`, {
        found: version,
        current: rules.version,
      });
    }
    upgraded = migrate(upgraded);
  }

  const warnings: LoadWarning[] = [];
  if (data !== dataFingerprint()) {
    warnings.push({ code: 'data_changed' });
  }
  const header: SaveHeader = { format: SAVE_FORMAT, version, seed, tick, hash, data };
  return { ok: true, world: upgraded as unknown as World, header, warnings };
}
