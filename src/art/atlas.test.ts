import { describe, expect, it } from 'vitest';
import { type AtlasRect, buildAtlas, packRects } from './atlas.ts';
import { createPalette, type PaletteSwap } from './palette.ts';
import { rasterizeSprite } from './raster.ts';
import type { SpriteDef } from './sprite.ts';

const TEST = createPalette([
  { name: 'red', title: '', colors: ['#400000', '#ff0000'] },
  { name: 'blue', title: '', colors: ['#000040', '#0000ff'] },
]);

function solid(name: string, width: number, height: number, frames = 1): SpriteDef {
  // Frame i marks one row with `b` (a 1-pixel sprite alternates `b` and `a`): frames differ,
  // so a mix-up between them would show.
  const grids = Array.from({ length: frames }, (_, i) =>
    Array.from({ length: height }, (_, y) =>
      (height === 1 ? i % 2 === 0 : y === i % height) ? 'b'.repeat(width) : 'a'.repeat(width),
    ).join('\n'),
  );
  const legend: Record<string, string> = {};
  if (grids.some((grid) => grid.includes('a'))) legend.a = 'red.0';
  if (grids.some((grid) => grid.includes('b'))) legend.b = 'red.1';
  return {
    name,
    title: name,
    kind: 'object',
    width,
    height,
    anchor: { x: 0, y: height },
    legend: legend as SpriteDef['legend'],
    animations: { idle: { frames: grids } },
  };
}

function overlaps(a: AtlasRect, b: AtlasRect, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  );
}

describe('упаковка атласа', () => {
  const sizes = [
    { w: 16, h: 16 },
    { w: 32, h: 36 },
    { w: 12, h: 18 },
    { w: 12, h: 18 },
    { w: 5, h: 40 },
    { w: 64, h: 3 },
    { w: 1, h: 1 },
  ];

  it('прямоугольники внутри атласа, не пересекаются и разделены зазором', () => {
    const { width, height, rects } = packRects(sizes, 1);
    expect(rects).toHaveLength(sizes.length);
    rects.forEach((rect, i) => {
      expect(rect.w).toBe(sizes[i]!.w);
      expect(rect.h).toBe(sizes[i]!.h);
      expect(rect.x).toBeGreaterThanOrEqual(1);
      expect(rect.y).toBeGreaterThanOrEqual(1);
      expect(rect.x + rect.w).toBeLessThanOrEqual(width - 1);
      expect(rect.y + rect.h).toBeLessThanOrEqual(height - 1);
      for (let j = 0; j < i; j++) expect(overlaps(rect, rects[j]!, 1), `${i} и ${j}`).toBe(false);
    });
  });

  it('детерминирована: одинаковые размеры — одинаковая раскладка', () => {
    expect(packRects(sizes)).toEqual(packRects(sizes));
  });

  it('ширина — степень двойки, вмещает самый широкий кадр', () => {
    const { width } = packRects([{ w: 200, h: 2 }]);
    expect(width).toBe(256);
    expect(packRects([]).height).toBe(0);
  });
});

describe('сборка атласа', () => {
  const defs = [solid('tall', 3, 7, 2), solid('wide', 9, 2), solid('dot', 1, 1, 3)];

  it('каждый кадр лежит в атласе пиксель в пиксель', () => {
    const atlas = buildAtlas(defs, TEST);
    expect(atlas.frameCount).toBe(6);
    for (const def of defs) {
      const raster = rasterizeSprite(def, TEST);
      const entry = atlas.sprites.get(def.name)!;
      expect(entry.anchor).toEqual(def.anchor);
      expect(entry.defaultAnimation).toBe('idle');
      const animation = entry.animations.get('idle')!;
      expect(animation.durations).toEqual(raster.animations[0]!.durations);
      animation.frames.forEach((rect, index) => {
        const frame = raster.animations[0]!.frames[index]!;
        for (let y = 0; y < rect.h; y++) {
          for (let x = 0; x < rect.w; x++) {
            const from = (y * frame.width + x) * 4;
            const to = ((rect.y + y) * atlas.width + rect.x + x) * 4;
            expect([...atlas.pixels.subarray(to, to + 4)]).toEqual([
              ...frame.pixels.subarray(from, from + 4),
            ]);
          }
        }
      });
    }
  });

  it('вне кадров атлас прозрачен', () => {
    const atlas = buildAtlas(defs, TEST);
    const rects = [...atlas.sprites.values()].flatMap((entry) =>
      [...entry.animations.values()].flatMap((animation) => animation.frames),
    );
    let opaqueOutside = 0;
    for (let y = 0; y < atlas.height; y++) {
      for (let x = 0; x < atlas.width; x++) {
        const inside = rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
        if (!inside && atlas.pixels[(y * atlas.width + x) * 4 + 3] !== 0) opaqueOutside++;
      }
    }
    expect(opaqueOutside).toBe(0);
  });

  it('атлас с подменой рядов перекрашен', () => {
    const atlas = buildAtlas([solid('dot', 1, 1)], TEST, { red: 'blue' } as PaletteSwap);
    const rect = atlas.sprites.get('dot')!.animations.get('idle')!.frames[0]!;
    const at = (rect.y * atlas.width + rect.x) * 4;
    expect([...atlas.pixels.subarray(at, at + 4)]).toEqual([0, 0, 255, 255]);
  });
});

describe('тени в атласе', () => {
  const GLASS = createPalette([
    { name: 'red', title: '', colors: ['#400000', '#ff0000'] },
    { name: 'shadow', title: '', colors: ['#101020'], alpha: 0.5 },
  ]);

  it('тень лежит в том же атласе отдельной картинкой и не считается кадром', () => {
    const post = { ...solid('post', 2, 3), shadow: { width: 6, height: 2 } };
    const atlas = buildAtlas([post, solid('other', 3, 1)], GLASS);
    expect(atlas.frameCount).toBe(2);
    const entry = atlas.sprites.get('post')!;
    expect(entry.shadow).toMatchObject({ anchor: { x: 3, y: 1 }, alpha: 128 });
    const { rect } = entry.shadow!;
    expect([rect.w, rect.h]).toEqual([6, 2]);
    const frame = entry.animations.get('idle')!.frames[0]!;
    expect(overlaps(rect, frame, 0)).toBe(false);
    const at = ((rect.y + 1) * atlas.width + rect.x) * 4;
    expect([...atlas.pixels.subarray(at, at + 4)]).toEqual([16, 16, 32, 255]);
    expect(atlas.sprites.get('other')!.shadow).toBeNull();
  });
});
