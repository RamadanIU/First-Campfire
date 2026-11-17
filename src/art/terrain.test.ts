/**
 * The ground compositor: tile variations, transitions without seams or outline, wet shore and
 * foam, rounded inner corners, water that does not pulse in step. docs/ART.md, «Земля».
 */
import { describe, expect, it } from 'vitest';
import { PALETTE, resolveColor } from './palette.ts';
import { rasterizeSprite } from './raster.ts';
import { SPRITES } from './registry.ts';
import { TILE_SIZE } from './sprite.ts';
import {
  composeTerrainTile,
  FOAM_SHARE,
  prepareTerrain,
  TERRAIN_LOOKS,
  type TerrainLook,
  terrainFrameAt,
  terrainGrid,
  terrainStateKey,
  validateTerrainLooks,
  variationAt,
} from './terrain.ts';

const ART = prepareTerrain(TERRAIN_LOOKS, SPRITES, PALETTE);
const byName = new Map(SPRITES.map((sprite) => [sprite.name, sprite]));
const lookOf = (id: string) => TERRAIN_LOOKS.find((look) => look.id === id)!;

/** Rows of single letters → a map: g grass, d dirt, s sand, w shallow, D deep water. */
const LETTERS: Record<string, string> = {
  g: 'grass',
  d: 'dirt',
  s: 'sand',
  w: 'shallow_water',
  D: 'deep_water',
};
function map(...rows: string[]) {
  return terrainGrid(rows.map((row) => [...row].map((c) => LETTERS[c]!)));
}

/** Every pixel of the tile's own texture (its variation, its frame) — the no-transition picture. */
function ownTexture(id: string, x: number, y: number, timeMs = 0) {
  const look = lookOf(id);
  const sprite = byName.get(look.tiles[variationAt(ART, id, x, y)]!)!;
  return rasterizeSprite(sprite, PALETTE).animations[0]!.frames[
    terrainFrameAt(ART, id, x, y, timeMs)
  ]!.pixels;
}

function rgb(pixels: Uint8ClampedArray, x: number, y: number): string {
  const at = (y * TILE_SIZE + x) * 4;
  return [...pixels.subarray(at, at + 3)].join(',');
}

/** Colours of a ramp as "r,g,b" strings. */
function rampColours(ramp: string): Set<string> {
  return new Set(PALETTE.ramps.get(ramp)!.map((c) => c.join(',')));
}

describe('виды земли', () => {
  it('описаны без ошибок, тайлы существуют', () => {
    expect(validateTerrainLooks(TERRAIN_LOOKS, SPRITES, PALETTE)).toEqual([]);
  });

  it('слои: глубокая вода < мелкая < песок < земля < трава', () => {
    const order = [...TERRAIN_LOOKS].sort((a, b) => a.layer - b.layer).map((look) => look.id);
    expect(order).toEqual(['deep_water', 'shallow_water', 'sand', 'dirt', 'grass']);
  });

  it('у травы три вариации, и все встречаются примерно по весам', () => {
    expect(lookOf('grass').tiles).toHaveLength(3);
    const counts = [0, 0, 0];
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) counts[variationAt(ART, 'grass', x, y)]!++;
    const weights = lookOf('grass').weights!;
    const total = weights.reduce((a, b) => a + b, 0);
    counts.forEach((count, i) => {
      expect(count / 1600).toBeGreaterThan((weights[i]! / total) * 0.75);
      expect(count / 1600).toBeLessThan((weights[i]! / total) * 1.25);
    });
  });

  it('ошибки называют вид земли: повтор id и слоя, нет тайла, не тайл, край шире полтайла', () => {
    const grass = lookOf('grass');
    const bad: TerrainLook[] = [
      grass,
      { ...grass, tiles: ['nope'], weights: [1] },
      {
        ...lookOf('sand'),
        id: 'rock',
        tiles: ['stone'],
        spill: { depth: 7, jitter: 3, grain: 2, round: 0 },
      },
    ];
    expect(validateTerrainLooks(bad, SPRITES, PALETTE)).toEqual([
      'земля «grass»: такой id уже есть',
      'земля «grass»: слой 4 уже занят землёй «grass»',
      'земля «grass»: нет спрайта «nope»',
      'земля «rock»: край 7 ± 3 пикселей, зерно 2 — край должен помещаться в полтайла, зерно ≥ 1',
      'земля «rock»: спрайт «stone» — не тайл',
    ]);
  });
});

describe('сборка тайла', () => {
  it('тайл среди такой же земли — ровно его вариация и кадр', () => {
    const at = map('ggg', 'ggg', 'ggg');
    expect(composeTerrainTile(ART, at, 1, 1, 0).pixels).toEqual(ownTexture('grass', 1, 1));
    const lake = map('DDD', 'DDD', 'DDD');
    expect(composeTerrainTile(ART, lake, 1, 1, 900).pixels).toEqual(
      ownTexture('deep_water', 1, 1, 900),
    );
  });

  it('одинаковый вход — одинаковые пиксели; все пиксели непрозрачны и из палитры', () => {
    const at = map('gws', 'dDg', 'sgw');
    const a = composeTerrainTile(ART, at, 1, 1, 300);
    const b = composeTerrainTile(ART, at, 1, 1, 300);
    expect(a.pixels).toEqual(b.pixels);
    const palette = new Set([...PALETTE.ramps.values()].flat().map((c) => c.join(',')));
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        expect(a.pixels[(y * TILE_SIZE + x) * 4 + 3]).toBe(255);
        expect(palette.has(rgb(a.pixels, x, y))).toBe(true);
      }
    }
  });

  it('высокая земля заходит на низкую неровным краем, низкая на высокую — никогда', () => {
    const at = map('g', 'd');
    const grassTile = composeTerrainTile(ART, at, 0, 0, 0).pixels;
    expect(grassTile).toEqual(ownTexture('grass', 0, 0));
    const dirt = composeTerrainTile(ART, at, 0, 1, 0).pixels;
    const grass = rampColours('grass');
    const { depth, jitter } = lookOf('grass').spill;
    const depths: number[] = [];
    for (let x = 0; x < TILE_SIZE; x++) {
      let d = 0;
      while (d < TILE_SIZE && grass.has(rgb(dirt, x, d))) d++;
      depths.push(d);
    }
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(Math.floor(depth - jitter));
    expect(Math.max(...depths)).toBeLessThanOrEqual(Math.ceil(depth + jitter));
    expect(new Set(depths).size).toBeGreaterThan(1); // ragged, not a ruler line
    for (let y = Math.ceil(depth + jitter) + 1; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) expect(grass.has(rgb(dirt, x, y))).toBe(false);
    }
  });

  it('без швов: край непрерывен через границы тайлов', () => {
    const width = 8;
    const at = map('g'.repeat(width), 's'.repeat(width));
    const sand = rampColours('sand');
    const depths: number[] = [];
    for (let tx = 0; tx < width; tx++) {
      const tile = composeTerrainTile(ART, at, tx, 1, 0).pixels;
      for (let x = 0; x < TILE_SIZE; x++) {
        let d = 0;
        while (d < TILE_SIZE && !sand.has(rgb(tile, x, d))) d++;
        depths.push(d);
      }
    }
    for (let i = 1; i < depths.length; i++) {
      expect(Math.abs(depths[i]! - depths[i - 1]!), `столбец ${i}`).toBeLessThanOrEqual(2);
    }
    // …and does not repeat every tile.
    expect(depths.slice(0, TILE_SIZE)).not.toEqual(depths.slice(TILE_SIZE, TILE_SIZE * 2));
  });

  it('берег: мокрая кромка песка у воды и прерывистая пена на воде', () => {
    const at = map('sss', 'sss', 'www', 'www');
    const wet = resolveColor(PALETTE, lookOf('sand').shore!)!.join(',');
    const foam = resolveColor(PALETTE, lookOf('shallow_water').foam!)!.join(',');
    let wetPixels = 0;
    let foamPixels = 0;
    for (let tx = 0; tx < 3; tx++) {
      // Sand spills over the water, so the whole waterline lies inside the water tiles.
      const tile = composeTerrainTile(ART, at, tx, 2, 0).pixels;
      const own = ownTexture('shallow_water', tx, 2);
      for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x++) {
          if (rgb(tile, x, y) === wet) wetPixels++;
          if (rgb(tile, x, y) === foam && rgb(own, x, y) !== foam) foamPixels++;
        }
      }
      // Far from the waterline nothing changes.
      expect(composeTerrainTile(ART, at, tx, 0, 0).pixels).toEqual(ownTexture('sand', tx, 0));
      expect(composeTerrainTile(ART, at, tx, 3, 0).pixels).toEqual(
        ownTexture('shallow_water', tx, 3),
      );
    }
    const shoreline = 3 * TILE_SIZE;
    expect(wetPixels).toBeGreaterThanOrEqual(shoreline);
    expect(foamPixels).toBeGreaterThan(shoreline * FOAM_SHARE * 0.5);
    expect(foamPixels).toBeLessThan(shoreline * 1.6);
  });

  it('внутренний угол скруглён: та же земля с двух сторон закрывает угол дугой', () => {
    const at = map('ww', 'Dw');
    const rounded = prepareTerrain(TERRAIN_LOOKS, SPRITES, PALETTE);
    const square = prepareTerrain(
      TERRAIN_LOOKS.map((look) => ({ ...look, spill: { ...look.spill, round: 0 } })),
      SPRITES,
      PALETTE,
    );
    // Deep water shows only its own two colours; anything else is shallow water spilling in.
    const deep = new Set(['water.0', 'water.1'].map((c) => resolveColor(PALETTE, c)!.join(',')));
    const covered = (art: typeof ART) => {
      const tile = composeTerrainTile(art, at, 0, 1, 0).pixels;
      let n = 0;
      for (let y = 0; y < 8; y++) {
        for (let x = 8; x < TILE_SIZE; x++) if (!deep.has(rgb(tile, x, y))) n++;
      }
      return n;
    };
    expect(covered(rounded)).toBeGreaterThan(covered(square) + 3);
  });
});

describe('анимация воды', () => {
  it('соседние тайлы начинают с разных кадров — озеро не «мигает» целиком', () => {
    const frames = new Set<number>();
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) frames.add(terrainFrameAt(ART, 'deep_water', x, y, 0));
    expect(frames.size).toBeGreaterThan(1);
  });

  it('кадр сменяется раз в frameMs; ключ состояния меняется вместе с ним', () => {
    const ms = byName.get('water_deep')!.animations.idle!.frameMs as number;
    const a = terrainFrameAt(ART, 'deep_water', 3, 5, 0);
    expect(terrainFrameAt(ART, 'deep_water', 3, 5, ms - 1)).toBe(a);
    expect(terrainFrameAt(ART, 'deep_water', 3, 5, ms)).not.toBe(a);
    expect(terrainStateKey(ART, 0)).toBe(terrainStateKey(ART, ms - 1));
    expect(terrainStateKey(ART, 0)).not.toBe(terrainStateKey(ART, ms));
    expect(terrainFrameAt(ART, 'grass', 3, 5, 12345)).toBe(0);
  });
});
