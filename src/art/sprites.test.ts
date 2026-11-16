/**
 * Checks every sprite of the game (src/art/sprites/*.ts). A mistake in a sprite file — a row of
 * the wrong length, a character missing from the legend, a colour outside the palette, a
 * duplicate name — fails here with a message naming the sprite, frame, row and column.
 */
import { describe, expect, it } from 'vitest';
import { buildAtlas } from './atlas.ts';
import { PALETTE, type PaletteSwap, parseColorName } from './palette.ts';
import { rasterizeSprite } from './raster.ts';
import { SPRITE_FILES, SPRITES } from './registry.ts';
import { TILE_SIZE, validateSprite, validateSpriteSet } from './sprite.ts';

describe('спрайты игры', () => {
  it('найдены все файлы папки sprites', () => {
    expect(SPRITE_FILES.length).toBeGreaterThanOrEqual(3);
  });

  it.each(SPRITE_FILES.map(({ file, sprite }) => [file, sprite] as const))(
    '%s: описание без ошибок',
    (_, sprite) => {
      expect(validateSprite(sprite, PALETTE)).toEqual([]);
    },
  );

  it.each(SPRITE_FILES.map(({ file, sprite }) => [file, sprite.name] as const))(
    'файл %s.ts называется так же, как спрайт',
    (file, name) => {
      expect(name).toBe(file);
    },
  );

  it('имена спрайтов не повторяются', () => {
    expect(validateSpriteSet(SPRITES)).toEqual([]);
  });

  it('все спрайты собираются в один атлас', () => {
    const atlas = buildAtlas(SPRITES, PALETTE);
    expect([...atlas.sprites.keys()].sort()).toEqual(SPRITES.map((s) => s.name).sort());
    const frames = SPRITES.reduce(
      (sum, sprite) =>
        sum + Object.values(sprite.animations).reduce((n, a) => n + a.frames.length, 0),
      0,
    );
    expect(atlas.frameCount).toBe(frames);
  });
});

describe('пробные спрайты шага 0.3', () => {
  const byName = new Map(SPRITES.map((sprite) => [sprite.name, sprite]));

  it('трава — тайл 16×16, дерево — объект, житель — персонаж 12×18 (GDD §10.1)', () => {
    expect(byName.get('grass')).toMatchObject({
      kind: 'tile',
      width: TILE_SIZE,
      height: TILE_SIZE,
    });
    expect(byName.get('tree')).toMatchObject({ kind: 'object' });
    expect(byName.get('villager')).toMatchObject({ kind: 'character', width: 12, height: 18 });
  });

  it('у травы нет контура: только цвета травы', () => {
    const ramps = new Set(
      Object.values(byName.get('grass')!.legend).map((c) => parseColorName(c)!.ramp),
    );
    expect([...ramps]).toEqual(['grass']);
  });

  it('житель в трёх тонах кожи: перекраска меняет только кожу, оттенок в оттенок', () => {
    const villager = byName.get('villager')!;
    const variants = Object.values(villager.variants ?? {});
    expect(variants).toEqual([{ skin_light: 'skin_tan' }, { skin_light: 'skin_dark' }]);

    const base = rasterizeSprite(villager, PALETTE);
    const skin = PALETTE.ramps.get('skin_light')!;
    for (const swap of variants as PaletteSwap[]) {
      const target = PALETTE.ramps.get(swap.skin_light!)!;
      const recoloured = rasterizeSprite(villager, PALETTE, swap);
      let skinPixels = 0;
      base.animations.forEach((animation, a) => {
        animation.frames.forEach((frame, f) => {
          const other = recoloured.animations[a]!.frames[f]!.pixels;
          for (let i = 0; i < frame.pixels.length; i += 4) {
            const rgb = [frame.pixels[i], frame.pixels[i + 1], frame.pixels[i + 2]];
            const shade = skin.findIndex((c) => c.every((v, k) => v === rgb[k]));
            const expected = shade >= 0 && frame.pixels[i + 3] === 255 ? target[shade]! : rgb;
            if (shade >= 0) skinPixels++;
            expect([other[i], other[i + 1], other[i + 2], other[i + 3]]).toEqual([
              ...expected,
              frame.pixels[i + 3],
            ]);
          }
        });
      });
      expect(skinPixels).toBeGreaterThan(20);
    }
  });
});
