/**
 * The ground layer needs canvases; under Node the test gives it fake ones that keep the pixels
 * put on them. Checked: the picture is the composed tiles, and each ripple state is composed once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PALETTE } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { composeTerrainTile, prepareTerrain, TERRAIN_LOOKS, terrainGrid } from '../art/terrain.ts';
import { createTerrainLayer } from './terrainLayer.ts';

interface FakeCanvas {
  width: number;
  height: number;
  pixels: Uint8ClampedArray | null;
}

let created = 0;

beforeEach(() => {
  created = 0;
  vi.stubGlobal(
    'ImageData',
    class {
      data: Uint8ClampedArray;
      constructor(data: Uint8ClampedArray) {
        this.data = data;
      }
    },
  );
  vi.stubGlobal('document', {
    createElement: () => {
      created++;
      const canvas: FakeCanvas & { getContext(): unknown } = {
        width: 0,
        height: 0,
        pixels: null,
        getContext: () => ({
          putImageData: (image: { data: Uint8ClampedArray }) => {
            canvas.pixels = image.data;
          },
        }),
      };
      return canvas;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ART = prepareTerrain(TERRAIN_LOOKS, SPRITES, PALETTE);
const AT = terrainGrid([
  ['grass', 'sand', 'shallow_water'],
  ['dirt', 'sand', 'deep_water'],
]);

describe('слой земли', () => {
  it('картинка — собранные тайлы, пиксель в пиксель', () => {
    const layer = createTerrainLayer(ART, AT, 3, 2);
    const canvas = layer.canvasAt(0) as unknown as FakeCanvas;
    expect([canvas.width, canvas.height]).toEqual([3 * TILE_SIZE, 2 * TILE_SIZE]);
    const tile = composeTerrainTile(ART, AT, 2, 1, 0).pixels;
    for (let row = 0; row < TILE_SIZE; row++) {
      const from = ((TILE_SIZE + row) * canvas.width + 2 * TILE_SIZE) * 4;
      expect(canvas.pixels!.subarray(from, from + TILE_SIZE * 4)).toEqual(
        tile.subarray(row * TILE_SIZE * 4, (row + 1) * TILE_SIZE * 4),
      );
    }
  });

  it('каждое состояние ряби собирается один раз, дальше берётся из кеша', () => {
    const layer = createTerrainLayer(ART, AT, 3, 2);
    const ms = SPRITES.find((s) => s.name === 'water_deep')!.animations.idle!.frameMs as number;
    const first = layer.canvasAt(0);
    expect(layer.canvasAt(ms - 1)).toBe(first);
    expect(layer.canvasAt(ms)).not.toBe(first);
    for (let t = 0; t < ms * 12; t += 50) layer.canvasAt(t);
    expect(layer.cachedStates).toBe(4);
    expect(created).toBe(4);
  });

  it('composeAll собирает все состояния сразу — потом новые не собираются', () => {
    const layer = createTerrainLayer(ART, AT, 3, 2);
    layer.composeAll();
    expect(layer.cachedStates).toBe(4);
    for (let t = 0; t < 5000; t += 100) layer.canvasAt(t);
    expect(created).toBe(4);
  });
});

describe('слой земли — чанк большой карты', () => {
  /** 6×4 tiles: a pond in the middle of grass. */
  const POND = terrainGrid([
    ['grass', 'grass', 'grass', 'grass', 'grass', 'grass'],
    ['grass', 'sand', 'shallow_water', 'shallow_water', 'sand', 'grass'],
    ['grass', 'sand', 'shallow_water', 'deep_water', 'sand', 'grass'],
    ['grass', 'grass', 'grass', 'grass', 'grass', 'grass'],
  ]);

  function pixelsOf(layer: ReturnType<typeof createTerrainLayer>, timeMs: number) {
    return (layer.canvasAt(timeMs) as unknown as FakeCanvas).pixels!;
  }

  it('чанк со сдвигом — те же пиксели, что тот же кусок целой карты', () => {
    const whole = createTerrainLayer(ART, POND, 6, 4);
    const part = createTerrainLayer(ART, POND, 3, 2, { x: 3, y: 2 });
    const wholePixels = pixelsOf(whole, 0);
    const partPixels = pixelsOf(part, 0);
    for (let row = 0; row < 2 * TILE_SIZE; row++) {
      const from = ((2 * TILE_SIZE + row) * 6 * TILE_SIZE + 3 * TILE_SIZE) * 4;
      expect(partPixels.subarray(row * 3 * TILE_SIZE * 4, (row + 1) * 3 * TILE_SIZE * 4)).toEqual(
        wholePixels.subarray(from, from + 3 * TILE_SIZE * 4),
      );
    }
  });

  it('без воды рядом — одно состояние вместо четырёх', () => {
    // East of the pond (outside the map the edge column of grass repeats).
    const dry = createTerrainLayer(ART, POND, 2, 4, { x: 6, y: 0 });
    expect(dry.animated).toBe(false);
    dry.composeAll();
    for (let t = 0; t < 5000; t += 100) dry.canvasAt(t);
    expect(dry.cachedStates).toBe(1);
    const wet = createTerrainLayer(ART, POND, 6, 4);
    expect(wet.animated).toBe(true);
    wet.composeAll();
    expect(wet.cachedStates).toBe(4);
  });

  it('следующие состояния ряби пересобирают только тайлы у воды — картинка та же, что целиком', () => {
    const ms = SPRITES.find((s) => s.name === 'water_deep')!.animations.idle!.frameMs as number;
    const layer = createTerrainLayer(ART, POND, 6, 4);
    pixelsOf(layer, 0);
    const later = pixelsOf(layer, ms * 2);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 6; x++) {
        const tile = composeTerrainTile(ART, POND, x, y, ms * 2).pixels;
        for (let row = 0; row < TILE_SIZE; row++) {
          const from = ((y * TILE_SIZE + row) * 6 * TILE_SIZE + x * TILE_SIZE) * 4;
          expect(later.subarray(from, from + TILE_SIZE * 4)).toEqual(
            tile.subarray(row * TILE_SIZE * 4, (row + 1) * TILE_SIZE * 4),
          );
        }
      }
    }
  });
});
