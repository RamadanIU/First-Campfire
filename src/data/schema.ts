/**
 * A tiny schema library for the data tables (data/*.json, docs/ARCHITECTURE.md, rule 3).
 *
 * A schema describes what a value must be — «whole number from 1 to 1000», «sprite name»,
 * «list of records with unique ids» — and reads raw JSON into a typed value. Every problem is
 * collected with its exact place (file → record → field) and a message in Russian that a
 * non-programmer can act on: what was expected, what was found, and a likely fix («maybe you
 * meant spoilDays?»). Reading never stops at the first problem: a broken table reports
 * everything at once.
 *
 * No dependencies and no browser or Node APIs: the same code checks the tables in the game,
 * in tests and in headless runs.
 *
 * References:
 * - `ref(table)` — an id of a record of another table; checked by `readTables` once all tables
 *   are read;
 * - `external(kind)` — a name defined outside the data (a sprite, a look of the ground). src/data
 *   cannot import src/art, so such references are only collected; whoever knows both sides
 *   (tests, debug scenes) checks them with `checkExternalRefs`.
 */

/** Where a problem is and what it is. */
export interface DataIssue {
  /** Table file, e.g. `data/resources.json`. */
  readonly file: string;
  /** Record of a table: `«berries»`, or `№3` when the record has no usable id; null outside tables. */
  readonly record: string | null;
  /** Path of the field inside the record or file (`spoilDays`, `time.phasePercent.dawn`); '' — the whole thing. */
  readonly field: string;
  readonly message: string;
}

/** One line: `data/resources.json · запись «berries» · поле «stack»: ожидается …`. */
export function formatIssue(issue: DataIssue): string {
  const parts = [issue.file];
  if (issue.record !== null) parts.push(`запись ${issue.record}`);
  if (issue.field !== '') parts.push(`поле «${issue.field}»`);
  return `${parts.join(' · ')}: ${issue.message}`;
}

/** Thrown when tables do not pass the check; the message lists every problem. */
export class DataError extends Error {
  readonly issues: readonly DataIssue[];

  constructor(issues: readonly DataIssue[]) {
    const lines = issues.map((issue) => `  • ${formatIssue(issue)}`);
    super(`Ошибки в таблицах данных (${issues.length}):\n${lines.join('\n')}`);
    this.name = 'DataError';
    this.issues = issues;
  }
}

/** A reference to a record of another table, checked after all tables are read. */
interface TableRef {
  readonly table: string;
  readonly id: string;
  readonly at: Location;
}

/** A reference to something defined outside the data tables (a sprite, a look of the ground). */
export interface ExternalRef {
  /** What is referenced: `sprite`, `terrain_look`… — the key of the catalog in `checkExternalRefs`. */
  readonly kind: string;
  /** Its Russian name for messages: «спрайт», «вид земли». */
  readonly noun: string;
  readonly id: string;
  readonly at: Location;
}

interface Location {
  readonly file: string;
  readonly record: string | null;
  readonly field: string;
}

interface Sink {
  issues: DataIssue[];
  refs: TableRef[];
  external: ExternalRef[];
}

/** The place being read. */
export interface Cursor {
  readonly file: string;
  readonly record: string | null;
  readonly path: string;
  readonly sink: Sink;
}

function child(cursor: Cursor, key: string): Cursor {
  const path =
    key.startsWith('[') || cursor.path === '' ? `${cursor.path}${key}` : `${cursor.path}.${key}`;
  return { ...cursor, path };
}

function location(cursor: Cursor): Location {
  return { file: cursor.file, record: cursor.record, field: cursor.path };
}

function report(cursor: Cursor, message: string): void {
  cursor.sink.issues.push({ ...location(cursor), message });
}

/** Description shared by all fields: shown in the debug scene `data`. */
export interface FieldInfo {
  /** What the field means, in Russian. */
  readonly doc?: string;
  /** Unit of a number: «тиков», «сут», «%». */
  readonly unit?: string;
}

/** A schema of one value. */
export interface Field<T> {
  /** What the value must be, in Russian: «целое число от 1 до 1000». */
  readonly expects: string;
  readonly doc: string | null;
  readonly unit: string | null;
  /** A single value (not an object or a list): its problems are reported as one message. */
  readonly scalar: boolean;
  /** Value used when the key is absent; null — the key is required. */
  readonly fallback: { readonly value: T } | null;
  /** Nested fields of an object (for documentation). */
  readonly fields: Readonly<Record<string, Field<unknown>>> | null;
  /** Schema of one record, if this is a table. */
  readonly record: Field<unknown> | null;
  /**
   * Read a raw JSON value. Problems go to the cursor's sink; the returned value is then a
   * placeholder that must not be used (readers throw if there were problems).
   */
  read(value: unknown, cursor: Cursor): T;
}

export type Infer<F> = F extends Field<infer T> ? T : never;
type Shape = Readonly<Record<string, Field<unknown>>>;
export type InferShape<S extends Shape> = { readonly [K in keyof S]: Infer<S[K]> };

function field<T>(
  expects: string,
  info: FieldInfo,
  read: (value: unknown, cursor: Cursor) => T,
  extra: Partial<Pick<Field<T>, 'scalar' | 'fields' | 'record' | 'fallback'>> = {},
): Field<T> {
  return {
    expects,
    doc: info.doc ?? null,
    unit: info.unit ?? null,
    scalar: extra.scalar ?? true,
    fallback: extra.fallback ?? null,
    fields: extra.fields ?? null,
    record: extra.record ?? null,
    read,
  };
}

// ── Showing values in messages ─────────────────────────────────────────────────────────────

/** A number the Russian way: 0,25 rather than 0.25. */
export function formatNumber(value: number): string {
  return String(value).replace('.', ',');
}

function clip(text: string, length = 40): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** What was found instead of the expected value. */
export function show(value: unknown): string {
  if (value === undefined) return 'ничего';
  if (value === null) return 'null';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return `"${clip(value)}"`;
  if (Array.isArray(value)) return `список из ${value.length} элементов`;
  return `объект ${clip(JSON.stringify(value))}`;
}

/** A hint when a number or a boolean was written in quotes. */
function quotedHint(value: unknown, wanted: 'number' | 'boolean'): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const looksRight =
    wanted === 'number'
      ? trimmed !== '' && Number.isFinite(Number(trimmed.replace(',', '.')))
      : trimmed === 'true' || trimmed === 'false';
  return looksRight ? ' (это строка в кавычках — уберите кавычки)' : '';
}

function mismatch(cursor: Cursor, expects: string, value: unknown, hint = ''): void {
  report(cursor, `ожидается ${expects}, получено ${show(value)}${hint}`);
}

// ── Suggestions ────────────────────────────────────────────────────────────────────────────

/** Edit distance between two words (insertions, deletions, substitutions). */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** The known word closest to a misspelt one, if it is close enough to be a likely typo. */
export function closest(word: string, known: Iterable<string>): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of known) {
    const distance = editDistance(word.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  // One typo per three letters: «fod» → food, «beries» → berries, but not «meat» → man.
  return bestDistance <= Math.max(1, Math.floor(word.length / 3)) ? best : null;
}

function suggestion(word: string, known: Iterable<string>): string {
  const guess = closest(word, known);
  return guess === null ? '' : ` — может быть, «${guess}»?`;
}

// ── Scalars ────────────────────────────────────────────────────────────────────────────────

interface Range {
  readonly min: number;
  readonly max: number;
}

/** A whole number within [min, max]. */
export function int(options: Range & FieldInfo): Field<number> {
  const { min, max } = options;
  const expects = `целое число от ${formatNumber(min)} до ${formatNumber(max)}`;
  return field(expects, options, (value, cursor) => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) {
      return value;
    }
    mismatch(cursor, expects, value, quotedHint(value, 'number'));
    return min;
  });
}

/** Any finite number within [min, max]. */
export function num(options: Range & FieldInfo): Field<number> {
  const { min, max } = options;
  const expects = `число от ${formatNumber(min)} до ${formatNumber(max)}`;
  return field(expects, options, (value, cursor) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) {
      return value;
    }
    mismatch(cursor, expects, value, quotedHint(value, 'number'));
    return min;
  });
}

/** true or false. */
export function bool(options: FieldInfo = {}): Field<boolean> {
  const expects = 'true или false';
  return field(expects, options, (value, cursor) => {
    if (typeof value === 'boolean') return value;
    mismatch(cursor, expects, value, quotedHint(value, 'boolean'));
    return false;
  });
}

/** A non-empty string (names and descriptions for the player). */
export function text(options: FieldInfo & { readonly maxLength?: number } = {}): Field<string> {
  const maxLength = options.maxLength ?? 200;
  const expects = `непустая строка до ${maxLength} знаков`;
  return field(expects, options, (value, cursor) => {
    if (typeof value === 'string' && value.trim() !== '' && value.length <= maxLength) {
      return value;
    }
    mismatch(cursor, expects, value);
    return '';
  });
}

/** snake_case latin identifier: `berry_bush`. */
export const ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const ID_EXPECTS = 'идентификатор snake_case латиницей (как berry_bush)';

function readId(value: unknown, cursor: Cursor, expects: string): string | null {
  if (typeof value === 'string' && ID_PATTERN.test(value)) return value;
  mismatch(cursor, expects, value);
  return null;
}

/** The id of a record: snake_case, unique within its table (checked by `table`). */
export function id(options: FieldInfo = {}): Field<string> {
  return field(ID_EXPECTS, options, (value, cursor) => readId(value, cursor, ID_EXPECTS) ?? '');
}

/** One of a fixed list of values; `names` — their Russian names for docs and messages. */
export function oneOf<const V extends string>(
  values: readonly V[],
  options: FieldInfo & { readonly names?: Readonly<Record<V, string>> } = {},
): Field<V> {
  const list = values
    .map((value) => (options.names ? `${value} (${options.names[value]})` : value))
    .join(', ');
  const expects = `одно из: ${list}`;
  return field(expects, options, (value, cursor) => {
    if (typeof value === 'string' && (values as readonly string[]).includes(value)) {
      return value as V;
    }
    const hint = typeof value === 'string' ? suggestion(value, values) : '';
    mismatch(cursor, expects, value, hint);
    return values[0]!;
  });
}

/** The id of a record of another table of the same load (`readTables` checks it exists). */
export function ref(table: string, options: FieldInfo = {}): Field<string> {
  const expects = `id записи таблицы ${table}`;
  return field(expects, options, (value, cursor) => {
    const found = readId(value, cursor, expects);
    if (found !== null) cursor.sink.refs.push({ table, id: found, at: location(cursor) });
    return found ?? '';
  });
}

/**
 * A name defined outside the data — a sprite, a look of the ground. Only collected here
 * (src/data cannot see src/art); checked by `checkExternalRefs`.
 */
export function external(kind: string, noun: string, options: FieldInfo = {}): Field<string> {
  const expects = `имя: ${noun} (snake_case)`;
  return field(expects, options, (value, cursor) => {
    const found = readId(value, cursor, expects);
    if (found !== null) cursor.sink.external.push({ kind, noun, id: found, at: location(cursor) });
    return found ?? '';
  });
}

// ── Modifiers ──────────────────────────────────────────────────────────────────────────────

/** Fork the cursor into a scratch sink. */
function scratch(cursor: Cursor): Cursor {
  return { ...cursor, sink: { issues: [], refs: [], external: [] } };
}

function merge(into: Sink, from: Sink, withIssues = true): void {
  if (withIssues) into.issues.push(...from.issues);
  into.refs.push(...from.refs);
  into.external.push(...from.external);
}

/** The value may be `null`; `meaning` says what null means: «не портится». */
export function nullable<T>(inner: Field<T>, meaning: string): Field<T | null> {
  const expects = `${inner.expects} или null (${meaning})`;
  return {
    ...inner,
    expects,
    fallback: null,
    read(value, cursor) {
      if (value === null) return null;
      const attempt = scratch(cursor);
      const result = inner.read(value, attempt);
      // A single value: one message that mentions null too, instead of the inner one.
      const replace = inner.scalar && attempt.sink.issues.length > 0;
      merge(cursor.sink, attempt.sink, !replace);
      if (replace) mismatch(cursor, expects, value);
      return result;
    },
  };
}

/** The key may be left out of the object; then `value` is used. */
export function optional<T>(inner: Field<T>, value: T): Field<T> {
  return {
    ...inner,
    expects: `${inner.expects}; необязательно, без него — ${show(value)}`,
    fallback: { value },
  };
}

// ── Compounds ──────────────────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface ObjectOptions<T> extends FieldInfo {
  /** A rule about the whole object (sums, ranges between fields): an error message or null. */
  readonly check?: (value: T) => string | null;
}

/**
 * An object with exactly these keys. A missing required key and an unknown key (most likely a
 * typo) are both errors.
 */
export function obj<S extends Shape>(
  fields: S,
  options: ObjectOptions<InferShape<S>> = {},
): Field<InferShape<S>> {
  const keys = Object.keys(fields);
  const expects = `объект с полями ${keys.join(', ')}`;
  return field(
    expects,
    options,
    (value, cursor) => {
      const result: Record<string, unknown> = {};
      if (!isPlainObject(value)) {
        mismatch(cursor, expects, value);
        return result as InferShape<S>;
      }
      const before = cursor.sink.issues.length;
      for (const key of keys) {
        const schema = fields[key]!;
        if (Object.hasOwn(value, key)) {
          result[key] = schema.read(value[key], child(cursor, key));
        } else if (schema.fallback !== null) {
          result[key] = schema.fallback.value;
        } else {
          report(child(cursor, key), `нет обязательного поля (ожидается ${schema.expects})`);
        }
      }
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(fields, key)) {
          const guess = suggestion(key, keys);
          report(
            child(cursor, key),
            `лишнее поле${guess === '' ? '.' : guess} Известные поля: ${keys.join(', ')}`,
          );
        }
      }
      const clean = cursor.sink.issues.length === before;
      const problem = clean && options.check ? options.check(result as InferShape<S>) : null;
      if (problem !== null) report(cursor, problem);
      return result as InferShape<S>;
    },
    { scalar: false, fields },
  );
}

/** A list of values. */
export function list<T>(
  item: Field<T>,
  options: FieldInfo & { readonly min?: number; readonly max?: number } = {},
): Field<readonly T[]> {
  const min = options.min ?? 0;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  const size = max === Number.POSITIVE_INFINITY ? `не меньше ${min}` : `от ${min} до ${max}`;
  const expects = `список (${size} элементов), каждый — ${item.expects}`;
  return field(
    expects,
    options,
    (value, cursor) => {
      if (!Array.isArray(value)) {
        mismatch(cursor, expects, value);
        return [];
      }
      if (value.length < min || value.length > max) {
        report(cursor, `в списке ${value.length} элементов, а нужно ${size}`);
      }
      return value.map((element, index) => item.read(element, child(cursor, `[${index}]`)));
    },
    { scalar: false },
  );
}

type RecordShape = Shape & { readonly id: Field<string> };

/** How a record is named in messages: by its id, or by its number if the id is unusable. */
function recordLabel(raw: unknown, index: number): string {
  const rawId = isPlainObject(raw) ? raw.id : undefined;
  return typeof rawId === 'string' && ID_PATTERN.test(rawId) ? `«${rawId}»` : `№${index + 1}`;
}

/**
 * A table: a list of records (objects) with unique `id`s. Problems inside a record name the
 * record by its id. An empty table is an error unless `minRecords` is 0.
 */
export function table<S extends RecordShape>(
  fields: S,
  options: ObjectOptions<InferShape<S>> & { readonly minRecords?: number } = {},
): Field<readonly InferShape<S>[]> {
  const record = obj(fields, options);
  const minRecords = options.minRecords ?? 1;
  const expects = `список записей [{ … }, { … }], у каждой — ${record.expects}`;
  return field(
    expects,
    options,
    (value, cursor) => {
      if (!Array.isArray(value)) {
        mismatch(cursor, expects, value);
        return [];
      }
      if (value.length < minRecords) {
        report(cursor, `в таблице ${value.length} записей, а нужно хотя бы ${minRecords}`);
      }
      const firstIndex = new Map<string, number>();
      return value.map((raw, index) => {
        const at: Cursor = { ...cursor, record: recordLabel(raw, index), path: '' };
        const read = record.read(raw, at);
        const rawId = isPlainObject(raw) ? raw.id : undefined;
        if (typeof rawId === 'string' && ID_PATTERN.test(rawId)) {
          const first = firstIndex.get(rawId);
          if (first === undefined) firstIndex.set(rawId, index);
          else {
            report(
              { ...at, record: `«${rawId}» (№${index + 1})`, path: 'id' },
              `id «${rawId}» уже занят записью №${first + 1} — id в таблице не повторяются`,
            );
          }
        }
        return read;
      });
    },
    { scalar: false, record },
  );
}

// ── Reading a set of tables ────────────────────────────────────────────────────────────────

export interface TableSchema<T> {
  /** File name shown in messages: `data/resources.json`. */
  readonly file: string;
  readonly schema: Field<T>;
}

type SchemaSet = Readonly<Record<string, TableSchema<unknown>>>;
export type InferTables<S extends SchemaSet> = {
  readonly [K in keyof S]: S[K] extends TableSchema<infer T> ? T : never;
};

export interface ReadResult<S extends SchemaSet> {
  readonly values: InferTables<S>;
  readonly issues: readonly DataIssue[];
  readonly external: readonly ExternalRef[];
}

/**
 * Read every table and check references between them. Never throws on bad data: problems are
 * returned (the caller decides — `loadTables` throws a `DataError`).
 */
export function readTables<S extends SchemaSet>(
  schemas: S,
  raw: { readonly [K in keyof S]: unknown },
): ReadResult<S> {
  const sink: Sink = { issues: [], refs: [], external: [] };
  const values: Record<string, unknown> = {};
  const ids = new Map<string, Set<string>>();
  for (const name of Object.keys(schemas)) {
    const { file, schema } = schemas[name]!;
    const cursor: Cursor = { file, record: null, path: '', sink };
    const value = schema.read(raw[name], cursor);
    values[name] = value;
    // A file that is not a list of records at all has its own error; references into it are
    // not checked (every one of them would fail and bury that error).
    if (schema.record !== null && Array.isArray(value) && Array.isArray(raw[name])) {
      ids.set(name, new Set(value.map((record) => String((record as { id: unknown }).id))));
    }
  }
  for (const { table: target, id: wanted, at } of sink.refs) {
    if (!Object.hasOwn(schemas, target)) {
      throw new Error(`Схема ссылается на неизвестную таблицу «${target}»`);
    }
    const known = ids.get(target);
    if (!known) continue;
    if (!known.has(wanted)) {
      sink.issues.push({
        ...at,
        message: `нет записи «${wanted}» в таблице ${schemas[target]!.file}${suggestion(wanted, known)}`,
      });
    }
  }
  return { values: values as InferTables<S>, issues: sink.issues, external: sink.external };
}

/**
 * Check references to things outside the data: `catalogs` maps a kind (`sprite`) to every
 * name that exists. Kinds without a catalog are left unchecked.
 */
export function checkExternalRefs(
  refs: readonly ExternalRef[],
  catalogs: Readonly<Record<string, Iterable<string>>>,
): DataIssue[] {
  const issues: DataIssue[] = [];
  const sets = new Map<string, Set<string>>();
  for (const ref of refs) {
    const catalog = catalogs[ref.kind];
    if (catalog === undefined) continue;
    let known = sets.get(ref.kind);
    if (!known) {
      known = new Set(catalog);
      sets.set(ref.kind, known);
    }
    if (!known.has(ref.id)) {
      issues.push({
        ...ref.at,
        message: `ссылка на несуществующий ${ref.noun} «${ref.id}»${suggestion(ref.id, known)}`,
      });
    }
  }
  return issues;
}

/** Freeze a value and everything inside it: loaded tables are read-only. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}
