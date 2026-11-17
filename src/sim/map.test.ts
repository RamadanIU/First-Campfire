import { describe, expect, it } from 'vitest';
import { DATA } from '../data/index.ts';
import {
  chunkGrid,
  chunkRect,
  createMap,
  groundAt,
  groundCode,
  groundCounts,
  inside,
  isWater,
  setGround,
  tileIndex,
} from './map.ts';

describe('карта', () => {
  it('создаётся пустой: всё — первый тип земли из таблицы, объектов нет, скрытых полей нет', () => {
    const map = createMap(64, 32, 32);
    expect([map.width, map.height, map.chunkSize]).toEqual([64, 32, 32]);
    expect(map.groundTypes).toEqual(DATA.terrain.records.map((t) => t.id));
    expect(map.ground).toBeInstanceOf(Uint8Array);
    expect(map.ground.length).toBe(64 * 32);
    expect(map.object).toBeInstanceOf(Uint32Array);
    expect(map.object.every((id) => id === 0)).toBe(true);
    expect(map.fields).toEqual({});
    expect(groundCounts(map)[map.groundTypes[0]!]).toBe(64 * 32);
  });

  it('стороны карты должны делиться на чанки', () => {
    expect(() => createMap(70, 64, 32)).toThrow('не делится на чанки');
  });

  it('тайл по координатам; за краем карты — ближайший тайл края', () => {
    const map = createMap(32, 32, 32);
    setGround(map, 0, 0, 'deep_water');
    setGround(map, 31, 5, 'sand');
    expect(map.ground[tileIndex(map, 31, 5)]).toBe(groundCode(map, 'sand'));
    expect(groundAt(map, 0, 0)).toBe('deep_water');
    expect(groundAt(map, -3, -9)).toBe('deep_water');
    expect(groundAt(map, 40, 5)).toBe('sand');
    expect(isWater(map, 0, 0)).toBe(true);
    expect(isWater(map, 31, 5)).toBe(false);
    expect(inside(map, 31, 31)).toBe(true);
    expect(inside(map, 32, 0)).toBe(false);
    expect(inside(map, 0, -1)).toBe(false);
  });

  it('неизвестный тип земли — ошибка в коде', () => {
    const map = createMap(32, 32, 32);
    expect(() => setGround(map, 1, 1, 'lava')).toThrow('нет типа земли «lava»');
  });

  it('чанки 32×32 покрывают карту без пропусков и наложений', () => {
    const map = createMap(64, 96, 32);
    const { cols, rows } = chunkGrid(map);
    expect([cols, rows]).toEqual([2, 3]);
    const covered = new Uint8Array(64 * 96);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const rect = chunkRect(map, cx, cy);
        for (let y = rect.y; y < rect.y + rect.height; y++) {
          for (let x = rect.x; x < rect.x + rect.width; x++) covered[tileIndex(map, x, y)]! += 1;
        }
      }
    }
    expect(covered.every((n) => n === 1)).toBe(true);
  });
});
