import { describe, expect, it } from 'vitest';
import { DATA } from '../data/index.ts';
import { hashState } from './hash.ts';
import { createMap, setGround } from './map.ts';
import { distanceField, findCampSite, generateMap } from './mapgen.ts';
import { createObjects, placeObject } from './objects.ts';
import { createRng } from './rng.ts';
import { createWorld } from './world.ts';

const mapHash = (seed: number) => hashState(generateMap(createRng(seed, 'map')));

describe('генератор карты', () => {
  it('одно зерно — одна и та же карта', () => {
    for (const seed of [1, 7, 123_456]) expect(mapHash(seed)).toBe(mapHash(seed));
    const a = createWorld(42);
    const b = createWorld(42);
    expect(hashState(a.map)).toBe(hashState(b.map));
    expect(a.objects).toEqual(b.objects);
  });

  it('разные зёрна — разные карты', () => {
    const hashes = Array.from({ length: 30 }, (_, i) => mapHash(i + 1));
    expect(new Set(hashes).size).toBe(30);
    // Not only the objects: the ground differs too.
    const grounds = [1, 2, 3, 4, 5].map((seed) =>
      hashState(generateMap(createRng(seed, 'map')).map.ground),
    );
    expect(new Set(grounds).size).toBe(5);
  });

  it('карта строится из своего потока случайности: светлячки не сдвинулись', () => {
    const world = createWorld(5);
    expect(world.rng.fireflies).toEqual(createRng(5, 'fireflies'));
    expect(world.rng.map).not.toEqual(createRng(5, 'map'));
  });

  it('размер и чанки — из таблицы data/balance.json', () => {
    const { map } = createWorld(3);
    const { width, height, chunkSize } = DATA.balance.map;
    expect([map.width, map.height, map.chunkSize]).toEqual([width, height, chunkSize]);
  });

  it('работает и на другом размере карты', () => {
    const params = { ...DATA.balance.map, width: 32, height: 32, chunkSize: 16 };
    for (let seed = 1; seed <= 10; seed++) {
      const { map, objects } = generateMap(createRng(seed, 'map'), params);
      expect(map.ground.length).toBe(32 * 32);
      expect(objects.list.filter((o) => o.def === 'berry_bush').length).toBeGreaterThanOrEqual(
        params.bushes.min,
      );
    }
  });
});

describe('расстояния', () => {
  it('ходом короля: диагональ — тоже один шаг; дальше предела — предел', () => {
    const field = distanceField(5, 3, (i) => i === 0, 3);
    expect(Array.from(field)).toEqual([0, 1, 2, 3, 3, 1, 1, 2, 3, 3, 2, 2, 2, 3, 3]);
  });
});

describe('место для стоянки', () => {
  /** Grass 32×32, a river along the left edge, an oak grove on the right. */
  function meadow() {
    const map = createMap(32, 32, 32);
    const objects = createObjects();
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) setGround(map, x, y, x < 2 ? 'shallow_water' : 'grass');
    }
    for (let y = 0; y < 32; y += 2) placeObject(map, objects, 'oak', 14, y);
    return { map, objects };
  }

  it('сухой свободный квадрат у воды и леса', () => {
    const { map, objects } = meadow();
    const camp = findCampSite(map, objects)!;
    const { size, waterDistance, forestDistance } = DATA.balance.map.camp;
    expect(camp).not.toBeNull();
    expect(camp.waterDistance).toBeLessThanOrEqual(waterDistance);
    expect(camp.forestDistance).toBeLessThanOrEqual(forestDistance);
    const half = Math.floor(size / 2);
    expect(camp.x - half).toBeGreaterThanOrEqual(2); // not in the water
    expect(camp.x + half).toBeLessThan(14); // not in the grove
  });

  it('препятствие в квадрате — место ищется в другом месте; без воды — места нет', () => {
    const { map, objects } = meadow();
    const first = findCampSite(map, objects)!;
    placeObject(map, objects, 'boulder', first.x, first.y);
    const second = findCampSite(map, objects)!;
    expect(Math.max(Math.abs(second.x - first.x), Math.abs(second.y - first.y))).toBeGreaterThan(2);

    const dry = createMap(32, 32, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) setGround(dry, x, y, 'grass');
    const grove = createObjects();
    placeObject(dry, grove, 'oak', 10, 10);
    expect(findCampSite(dry, grove)).toBeNull();
  });

  it('цветы и высокая трава стоянке не мешают', () => {
    const { map, objects } = meadow();
    const first = findCampSite(map, objects)!;
    placeObject(map, objects, 'flowers', first.x, first.y);
    expect(findCampSite(map, objects)).toEqual(first);
  });
});
