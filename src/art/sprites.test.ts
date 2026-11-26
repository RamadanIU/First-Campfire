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

describe('набор графики эпохи 0 (шаг 0.4)', () => {
  const byName = new Map(SPRITES.map((sprite) => [sprite.name, sprite]));
  const get = (name: string) => {
    const sprite = byName.get(name);
    if (!sprite) throw new Error(`нет спрайта «${name}»`);
    return sprite;
  };
  const ramps = (name: string) =>
    new Set(Object.values(get(name).legend).map((c) => parseColorName(c)!.ramp));

  const TILES = ['grass', 'grass_2', 'grass_3', 'dirt', 'sand', 'water_shallow', 'water_deep'];
  const NATURE = [
    'tree',
    'tree_young',
    'birch',
    'stump',
    'berry_bush',
    'stone',
    'branches',
    'flowers',
    'grass_tuft',
  ];
  const CAMP = ['campfire', 'lean_to', 'branch_pile', 'bed'];
  const PEOPLE = ['man', 'woman'];
  const BUBBLES = [
    'bubble_food',
    'bubble_water',
    'bubble_sleep',
    'bubble_cold',
    'bubble_carry',
    'bubble_lost',
    'bubble_fire',
  ];

  it('есть всё из карточки: земля, природа, стоянка, мужчина и женщина, пузырьки', () => {
    for (const name of [...TILES, ...NATURE, ...CAMP, ...PEOPLE, ...BUBBLES]) get(name);
    for (const name of TILES) expect(get(name).kind, name).toBe('tile');
    for (const name of [...NATURE, ...CAMP]) expect(get(name).kind, name).toBe('object');
    for (const name of BUBBLES) expect(get(name).kind, name).toBe('icon');
  });

  it('земля — тайлы 16×16 без контура (GDD §10.1): ни контура, ни тени в легенде', () => {
    for (const name of TILES) {
      expect(get(name)).toMatchObject({ width: TILE_SIZE, height: TILE_SIZE });
      expect(ramps(name).has('ink'), name).toBe(false);
      expect(ramps(name).has('shadow'), name).toBe(false);
    }
  });

  it('вода рябит: 2–4 кадра одинаковой длительности', () => {
    for (const name of ['water_shallow', 'water_deep']) {
      const idle = Object.values(get(name).animations)[0]!;
      expect(idle.frames.length, name).toBeGreaterThanOrEqual(2);
      expect(idle.frames.length, name).toBeLessThanOrEqual(4);
      expect(typeof idle.frameMs, name).toBe('number');
    }
  });

  it('куст — с ягодами и без; костёр — горит (4 кадра) и потух', () => {
    expect(Object.keys(get('berry_bush').animations)).toEqual(['ripe', 'empty']);
    expect(Object.keys(get('campfire').animations)).toEqual(['burning', 'out']);
    expect(get('campfire').animations.burning!.frames).toHaveLength(4);
  });

  it('у людей и всех предметов выше травы есть тень; у значков и тайлов — нет', () => {
    for (const name of [
      ...PEOPLE,
      ...CAMP,
      ...NATURE.filter((n) => n !== 'flowers' && n !== 'grass_tuft'),
    ]) {
      expect(get(name).shadow, name).toBeDefined();
    }
    for (const name of [...TILES, ...BUBBLES]) expect(get(name).shadow, name).toBeUndefined();
  });

  describe.each(PEOPLE)('%s', (name) => {
    const person = get(name);
    const directions = ['s', 'n', 'e', 'w'];

    it('16×24 (ADR-033), точка привязки между ступнями', () => {
      expect(person).toMatchObject({
        kind: 'character',
        width: 16,
        height: 24,
        anchor: { x: 8, y: 24 },
      });
    });

    it('стоит (дышит, моргает), идёт (8 кадров), держит и несёт ношу над головой — в 4 направлениях; сидит у огня боком', () => {
      expect(Object.keys(person.animations)).toEqual([
        ...directions.map((d) => `idle_${d}`),
        ...directions.map((d) => `walk_${d}`),
        'sit_e',
        'sit_w',
        ...directions.map((d) => `hold_${d}`),
        ...directions.map((d) => `carry_${d}`),
        // Step 1.12: the hungry trudge, then the actions (profile first, then front and back).
        ...directions.map((d) => `trudge_${d}`),
        ...[
          'crouch',
          'gather',
          'eat',
          'munch',
          'drink',
          'kindle',
          'stoke',
          'shiver',
          'yawn',
        ].flatMap((action) => ['e', 'w', 's', 'n'].map((d) => `${action}_${d}`)),
        'sit_s',
        'sit_n',
      ]);
      for (const d of directions) {
        expect(person.animations[`trudge_${d}`]!.frames).toHaveLength(8);
        expect(person.animations[`yawn_${d}`]!.frames.length).toBeGreaterThanOrEqual(3);
      }
      for (const d of directions) {
        expect(person.animations[`idle_${d}`]!.frames.length).toBeGreaterThanOrEqual(4);
        expect(person.animations[`walk_${d}`]!.frames).toHaveLength(8);
        expect(person.animations[`hold_${d}`]!.frames).toHaveLength(2);
        expect(person.animations[`carry_${d}`]!.frames).toHaveLength(8);
      }
      expect(person.animations.sit_e!.frames.length).toBeGreaterThanOrEqual(2);
      expect(person.animations.sit_w!.frames).toHaveLength(person.animations.sit_e!.frames.length);
    });

    it.each(['s', 'n', 'e', 'w'])(
      'ходьба %s: все 8 кадров разные — тело, руки и ноги движутся',
      (d) => {
        const frames = person.animations[`walk_${d}`]!.frames;
        expect(new Set(frames).size).toBe(frames.length);
      },
    );

    it('стоя лицом к зрителю и боком моргает: в цикле есть кадр с закрытыми глазами', () => {
      for (const d of ['s', 'e']) {
        const frames = person.animations[`idle_${d}`]!.frames;
        const closed = frames.filter((frame) => !frame.includes('e'));
        expect(closed.length, d).toBeGreaterThan(0);
        expect(closed.length, d).toBeLessThan(frames.length);
      }
    });

    it.each([
      ['idle_e', 'idle_w'],
      ['walk_e', 'walk_w'],
      ['sit_e', 'sit_w'],
      ['hold_e', 'hold_w'],
      ['carry_e', 'carry_w'],
      ['trudge_e', 'trudge_w'],
      ...['crouch', 'gather', 'eat', 'munch', 'drink', 'kindle', 'stoke', 'shiver', 'yawn'].map(
        (action) => [`${action}_e`, `${action}_w`],
      ),
    ])(
      'влево — не зеркало вправо (%s): силуэт зеркальный, а свет остаётся слева-сверху',
      (right, left) => {
        const raster = rasterizeSprite(person, PALETTE);
        const frames = (animation: string) =>
          raster.animations.find((a) => a.name === animation)!.frames;
        frames(right).forEach((east, index) => {
          const west = frames(left)[index]!;
          let sameSilhouette = true;
          let differentColours = 0;
          for (let y = 0; y < person.height; y++) {
            for (let x = 0; x < person.width; x++) {
              const e = (y * person.width + (person.width - 1 - x)) * 4;
              const w = (y * person.width + x) * 4;
              if (east.pixels[e + 3] !== west.pixels[w + 3]) sameSilhouette = false;
              if (east.pixels.subarray(e, e + 3).join() !== west.pixels.subarray(w, w + 3).join()) {
                differentColours++;
              }
            }
          }
          expect(sameSilhouette, `${left}, кадр ${index + 1}`).toBe(true);
          expect(differentColours, `${left}, кадр ${index + 1}`).toBeGreaterThan(5);
        });
      },
    );

    it('6 тонов кожи и 5 цветов волос; перекраска меняет только свой ряд, оттенок в оттенок', () => {
      const variants = Object.values(person.variants ?? {});
      const skins = variants.filter((swap) => 'skin_light' in swap);
      const hair = variants.filter((swap) => 'hair_brown' in swap);
      expect(skins).toHaveLength(5);
      expect(hair).toHaveLength(4);
      const base = rasterizeSprite(person, PALETTE);
      for (const swap of variants as PaletteSwap[]) {
        const [[from, to]] = Object.entries(swap) as [[string, string]];
        const source = PALETTE.ramps.get(from)!;
        const target = PALETTE.ramps.get(to)!;
        const recoloured = rasterizeSprite(person, PALETTE, swap);
        let changed = 0;
        // Wrong pixels (one expect for all of them: hundreds of frames since step 1.12).
        const wrong: string[] = [];
        base.animations.forEach((animation, a) => {
          animation.frames.forEach((frame, f) => {
            const other = recoloured.animations[a]!.frames[f]!.pixels;
            for (let i = 0; i < frame.pixels.length; i += 4) {
              const rgb = [frame.pixels[i], frame.pixels[i + 1], frame.pixels[i + 2]];
              const shade = source.findIndex((c) => c.every((v, k) => v === rgb[k]));
              const opaque = frame.pixels[i + 3] === 255;
              const expected = shade >= 0 && opaque ? target[shade]! : rgb;
              if (shade >= 0 && opaque) changed++;
              const got = [other[i], other[i + 1], other[i + 2]].join();
              if (got !== expected.join()) wrong.push(`${animation.name}:${f}:${i / 4} ${got}`);
            }
          });
        });
        expect(wrong.slice(0, 5), `${name}: ${from} → ${to}`).toEqual([]);
        expect(changed, `${name}: ${from} → ${to}`).toBeGreaterThan(40);
      }
    });
  });
});
