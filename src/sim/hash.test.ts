import { describe, expect, it } from 'vitest';
import { hashState } from './hash.ts';

describe('hashState', () => {
  it('одинаковые данные — одинаковый хэш, порядок ключей не важен', () => {
    const a = { x: 1, y: [1, 2, { z: 'текст' }], f: 0.5, ok: true, none: null };
    const b = { none: null, ok: true, f: 0.5, y: [1, 2, { z: 'текст' }], x: 1 };
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('любое изменение меняет хэш', () => {
    const base = { tick: 10, items: [1, 2, 3], name: 'мир' };
    const variants = [
      { tick: 11, items: [1, 2, 3], name: 'мир' },
      { tick: 10, items: [1, 2], name: 'мир' },
      { tick: 10, items: [1, 3, 2], name: 'мир' },
      { tick: 10, items: [1, 2, 3], name: 'мир!' },
      { tick: 10.5, items: [1, 2, 3], name: 'мир' },
      { tick: 10, items: [1, 2, 3], name: 'мир', extra: 0 },
      { tick: '10', items: [1, 2, 3], name: 'мир' },
    ];
    const hashes = new Set([hashState(base), ...variants.map(hashState)]);
    expect(hashes.size).toBe(variants.length + 1);
  });

  it('различает типы и структуру', () => {
    const values = [
      0,
      '0',
      false,
      null,
      [],
      {},
      [0],
      { 0: 0 },
      [[]],
      [null],
      2 ** 40,
      -1,
      4294967295,
      'ab',
      ['a', 'b'],
    ];
    expect(new Set(values.map(hashState)).size).toBe(values.length);
  });

  it('следует JSON: −0 = 0, undefined-поля пропускаются', () => {
    expect(hashState({ v: -0 })).toBe(hashState({ v: 0 }));
    expect(hashState({ a: 1, b: undefined })).toBe(hashState({ a: 1 }));
    expect(hashState([undefined])).toBe(hashState([null]));
    const data = { list: [1.25, -3, 'x'], nested: { deep: [true, null] } };
    expect(hashState(JSON.parse(JSON.stringify(data)))).toBe(hashState(data));
  });

  it('учитывает типизированные массивы', () => {
    expect(hashState(new Uint8Array([1, 2]))).toBe(hashState(new Uint8Array([1, 2])));
    expect(hashState(new Uint8Array([1, 2]))).not.toBe(hashState(new Uint8Array([1, 3])));
    expect(hashState(new Uint8Array([1, 2]))).not.toBe(hashState(new Int16Array([1, 2])));
  });

  it('отвергает не простые данные и называет путь', () => {
    expect(() => hashState({ a: { b: new Map() } })).toThrow(/a\.b/);
    expect(() => hashState({ list: [1, new Set()] })).toThrow(/list\.1/);
    expect(() => hashState({ f: () => 1 })).toThrow(/f/);
    class Thing {}
    expect(() => hashState({ thing: new Thing() })).toThrow(/Thing/);
  });

  it('быстрый: 100 000 чисел меньше чем за 100 мс', () => {
    const data = Array.from({ length: 10_000 }, (_, i) => ({ id: i, x: i * 0.5, y: -i }));
    const started = performance.now();
    hashState(data);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
