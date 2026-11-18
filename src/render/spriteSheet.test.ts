/**
 * The sprite sheet needs a canvas; under Node the test gives it a fake one that records what
 * would be drawn. Checked: drawing by name with anchor and scale, frame choice, recolour cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPalette, type PaletteSwap } from '../art/palette.ts';
import type { SpriteDef } from '../art/sprite.ts';
import { createSpriteSheet } from './spriteSheet.ts';

interface FakeCanvas {
  width: number;
  height: number;
  pixels: Uint8ClampedArray | null;
  getContext(): { putImageData(image: { data: Uint8ClampedArray }): void };
}

class FakeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

const canvases: FakeCanvas[] = [];

beforeEach(() => {
  canvases.length = 0;
  vi.stubGlobal('ImageData', FakeImageData);
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas: FakeCanvas = {
        width: 0,
        height: 0,
        pixels: null,
        getContext: () => ({
          putImageData: (image) => {
            canvas.pixels = image.data;
          },
        }),
      };
      canvases.push(canvas);
      return canvas;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TEST = createPalette([
  { name: 'red', title: '', colors: ['#400000', '#ff0000'] },
  { name: 'blue', title: '', colors: ['#000040', '#0000ff'] },
  { name: 'gray', title: '', colors: ['#202020', '#808080'] },
]);

const PERSON: SpriteDef = {
  name: 'person',
  title: 'Человечек',
  kind: 'character',
  width: 2,
  height: 3,
  anchor: { x: 1, y: 3 },
  legend: { r: 'red.1', g: 'gray.0' } as unknown as SpriteDef['legend'],
  animations: {
    idle: { frames: ['rr\ngg\ng.', 'rr\ngg\n.g'], frameMs: [600, 200] },
    wave: { frames: ['r.\ngg\ngg'] },
  },
};

const TREE: SpriteDef = {
  name: 'tree',
  title: 'Дерево',
  kind: 'object',
  width: 1,
  height: 2,
  anchor: { x: 0, y: 2 },
  legend: { g: 'gray.1' } as unknown as SpriteDef['legend'],
  animations: { idle: { frames: ['g\ng'] } },
};

function recorder() {
  const calls: number[][] = [];
  const sources: unknown[] = [];
  const alphas: number[] = [];
  const ctx = {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    drawImage: (source: unknown, ...args: number[]) => {
      sources.push(source);
      calls.push(args);
      alphas.push(ctx.globalAlpha);
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, sources, alphas, raw: ctx };
}

describe('лист спрайтов', () => {
  it('все кадры — на одном холсте атласа', () => {
    const sheet = createSpriteSheet([PERSON, TREE], TEST);
    expect(canvases).toHaveLength(1);
    expect(sheet.canvas).toBe(canvases[0]);
    expect(sheet.atlas.frameCount).toBe(4);
    expect(canvases[0]!.pixels).toEqual(sheet.atlas.pixels);
  });

  it('рисует кадр по имени так, что точка привязки встаёт в (x, y); масштаб целый, сглаживание выключено', () => {
    const sheet = createSpriteSheet([PERSON, TREE], TEST);
    const { ctx, calls, raw } = recorder();
    sheet.draw(ctx, 'person', 100, 50, { scale: 4 });
    const rect = sheet.entry('person').animations.get('idle')!.frames[0]!;
    expect(calls[0]).toEqual([rect.x, rect.y, 2, 3, 100 - 4, 50 - 12, 8, 12]);
    expect(raw.imageSmoothingEnabled).toBe(false);

    sheet.draw(ctx, 'person', 10.4, 20.6, { scale: 2.7 }); // rounds to whole pixels and scale 3
    expect(calls[1]!.slice(4)).toEqual([7, 12, 6, 9]);
  });

  it('кадр выбирается по номеру (по кругу) или по времени анимации', () => {
    const sheet = createSpriteSheet([PERSON], TEST);
    const frames = sheet.entry('person').animations.get('idle')!.frames;
    const { ctx, calls } = recorder();
    sheet.draw(ctx, 'person', 0, 0, { frame: 1 });
    sheet.draw(ctx, 'person', 0, 0, { frame: 3 });
    sheet.draw(ctx, 'person', 0, 0, { frame: -1 });
    sheet.draw(ctx, 'person', 0, 0, { timeMs: 599 });
    sheet.draw(ctx, 'person', 0, 0, { timeMs: 650 });
    sheet.draw(ctx, 'person', 0, 0, { timeMs: 800 });
    const picked = calls.map(([x, y]) => frames.findIndex((r) => r.x === x && r.y === y));
    expect(picked).toEqual([1, 1, 1, 0, 1, 0]);

    sheet.draw(ctx, 'person', 0, 0, { animation: 'wave' });
    const wave = sheet.entry('person').animations.get('wave')!.frames[0]!;
    expect(calls[6]!.slice(0, 2)).toEqual([wave.x, wave.y]);
  });

  it('перекрашенный вариант собирается один раз и берётся из кеша', () => {
    const sheet = createSpriteSheet([PERSON, TREE], TEST);
    const { ctx, sources } = recorder();
    const blue = { red: 'blue' } as PaletteSwap;
    sheet.draw(ctx, 'person', 0, 0, { swap: blue });
    sheet.draw(ctx, 'person', 0, 0, { swap: { red: 'blue' } as PaletteSwap });
    expect(sheet.variantCount).toBe(1);
    expect(sources[0]).toBe(sources[1]);
    expect(sources[0]).not.toBe(sheet.canvas);
    // The variant really is blue: red.1 → blue.1.
    const variant = canvases.at(-1)!;
    expect([...variant.pixels!].some((v, i) => i % 4 === 2 && v === 255)).toBe(true);
    expect([...variant.pixels!].some((v, i) => i % 4 === 0 && v === 255)).toBe(false);
  });

  it('подмена рядов, которых нет в спрайте, не создаёт варианта', () => {
    const sheet = createSpriteSheet([PERSON, TREE], TEST);
    const { ctx, sources } = recorder();
    sheet.draw(ctx, 'tree', 0, 0, { swap: { red: 'blue' } as PaletteSwap });
    expect(sheet.variantCount).toBe(0);
    expect(sources[0]).toBe(sheet.canvas);
  });

  it('опечатка в имени спрайта или анимации — сразу ошибка', () => {
    const sheet = createSpriteSheet([PERSON], TEST);
    const { ctx } = recorder();
    expect(() => sheet.draw(ctx, 'persn', 0, 0)).toThrow('No sprite "persn"');
    expect(() => sheet.draw(ctx, 'person', 0, 0, { animation: 'walk' })).toThrow(
      'Sprite "person" has no animation "walk"',
    );
  });

  it('тень: рисуется так, что точка привязки встаёт в (x, y); прозрачность — из палитры', () => {
    const glass = createPalette([
      { name: 'red', title: '', colors: ['#400000', '#ff0000'] },
      { name: 'gray', title: '', colors: ['#202020', '#808080'] },
      { name: 'shadow', title: '', colors: ['#101020'], alpha: 0.25 },
    ]);
    const sheet = createSpriteSheet(
      [{ ...PERSON, shadow: { width: 4, height: 2, x: 1 } }, TREE],
      glass,
    );
    expect(sheet.shadowOpacity).toBeCloseTo(64 / 255);
    const { ctx, calls, alphas, sources, raw } = recorder();
    expect(sheet.drawShadow(ctx, 'person', 100, 50, { scale: 2 })).toBe(true);
    const { rect } = sheet.entry('person').shadow!;
    // Origin of the 4×2 ellipse: anchor shifted by (1 − 2, 0 − 1) sprite pixels.
    expect(calls[0]).toEqual([rect.x, rect.y, 4, 2, 100 - 2, 50 - 2, 8, 4]);
    expect(sources[0]).toBe(sheet.canvas);
    expect(alphas[0]).toBeCloseTo(64 / 255);
    expect(raw.globalAlpha).toBe(1); // restored
    sheet.drawShadow(ctx, 'person', 0, 0, { opaque: true });
    expect(alphas[1]).toBe(1);
    expect(sheet.drawShadow(ctx, 'tree', 0, 0)).toBe(false);
    expect(calls).toHaveLength(2);
  });
});
