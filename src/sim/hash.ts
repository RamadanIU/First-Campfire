/**
 * Stable 64-bit fingerprint of plain data — the basis of determinism tests.
 *
 * Two values get the same hash when they hold the same data, regardless of object key order.
 * The hash follows JSON semantics where they differ from JavaScript (−0 equals 0, `undefined`
 * object fields are skipped, `undefined` array items count as null), so a world that went
 * through JSON (a save file) hashes the same as the original.
 *
 * It doubles as a guard for the rule "world state is plain data" (docs/ARCHITECTURE.md, rule 7):
 * functions, Maps, Sets, class instances and other non-plain values throw with their path.
 */

// Two independent murmur3-style lanes give 64 bits without BigInt.
let h1 = 0;
let h2 = 0;
let words = 0;

const view = new DataView(new ArrayBuffer(8));
const TWO_POW_32 = 4294967296;

const TAG_NULL = 1;
const TAG_FALSE = 2;
const TAG_TRUE = 3;
const TAG_INT = 4;
const TAG_FLOAT = 5;
const TAG_NAN = 6;
const TAG_STRING = 7;
const TAG_ARRAY = 8;
const TAG_OBJECT = 9;
const TAG_TYPED = 10;

function mix(word: number): void {
  let k = Math.imul(word, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  h1 ^= Math.imul(k, 0x1b873593);
  h1 = (h1 << 13) | (h1 >>> 19);
  h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;

  let j = Math.imul(word ^ 0x5bd1e995, 0x85ebca6b);
  j = (j << 17) | (j >>> 15);
  h2 ^= Math.imul(j, 0xc2b2ae35);
  h2 = (h2 << 11) | (h2 >>> 21);
  h2 = (Math.imul(h2, 9) + 0x7f4a7c15) | 0;

  words++;
}

function finalize(h: number): number {
  let z = h ^ words;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

function mixNumber(value: number): void {
  if (Number.isSafeInteger(value)) {
    mix(TAG_INT);
    mix(value >>> 0); // low 32 bits (two's complement for negatives)
    mix(Math.floor(value / TWO_POW_32) | 0); // high bits
  } else if (Number.isNaN(value)) {
    mix(TAG_NAN);
  } else {
    // −0 is a safe integer equal to 0, so it never reaches this branch.
    view.setFloat64(0, value, true);
    mix(TAG_FLOAT);
    mix(view.getUint32(0, true));
    mix(view.getUint32(4, true));
  }
}

function mixString(text: string): void {
  mix(TAG_STRING);
  mix(text.length);
  let i = 0;
  for (; i + 1 < text.length; i += 2) mix(text.charCodeAt(i) | (text.charCodeAt(i + 1) << 16));
  if (i < text.length) mix(text.charCodeAt(i));
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function describe(value: unknown): string {
  if (typeof value !== 'object' || value === null) return typeof value;
  return Object.getPrototypeOf(value)?.constructor?.name ?? 'object';
}

function walk(value: unknown, path: (string | number)[]): void {
  switch (typeof value) {
    case 'number':
      mixNumber(value);
      return;
    case 'string':
      mixString(value);
      return;
    case 'boolean':
      mix(value ? TAG_TRUE : TAG_FALSE);
      return;
    case 'undefined':
      mix(TAG_NULL); // reached only for array items: JSON turns them into null
      return;
    case 'object':
      break;
    default:
      throw new Error(
        `hashState: недопустимое значение (${typeof value}) по пути ${formatPath(path)} — состояние мира должно быть простыми данными`,
      );
  }
  if (value === null) {
    mix(TAG_NULL);
    return;
  }
  if (Array.isArray(value)) {
    mix(TAG_ARRAY);
    mix(value.length);
    for (let i = 0; i < value.length; i++) {
      path.push(i);
      walk(value[i], path);
      path.pop();
    }
    return;
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const typed = value as unknown as ArrayLike<number | bigint>;
    mix(TAG_TYPED);
    mixString(describe(value));
    mix(typed.length);
    for (let i = 0; i < typed.length; i++) {
      const item = typed[i]!;
      mixNumber(typeof item === 'bigint' ? Number(item) : item);
    }
    return;
  }
  if (!isPlainObject(value)) {
    throw new Error(
      `hashState: недопустимое значение (${describe(value)}) по пути ${formatPath(path)} — состояние мира должно быть простыми данными`,
    );
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  mix(TAG_OBJECT);
  mix(keys.length);
  for (const key of keys) {
    mixString(key);
    path.push(key);
    walk(record[key], path);
    path.pop();
  }
}

function formatPath(path: (string | number)[]): string {
  return path.length === 0 ? '(корень)' : path.join('.');
}

/** 64-bit hash of plain data as 16 hex digits. */
export function hashState(value: unknown): string {
  h1 = 0x9747b28c;
  h2 = 0x2c1b3c6d;
  words = 0;
  walk(value, []);
  const a = finalize(h1 + h2);
  const b = finalize(h2 ^ a);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
