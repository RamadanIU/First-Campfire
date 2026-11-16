/**
 * Rasterizer: sprite description + palette → pixels (RGBA bytes).
 *
 * A pure function without the browser: the same code fills the game's atlas and runs in tests
 * under Node. Recolouring is a parameter: pass a ramp swap and every pixel of the swapped ramps
 * takes the colour of the same shade in the replacement ramp.
 */
import { type Palette, type PaletteSwap, resolveColor, validateSwap } from './palette.ts';
import {
  frameDurations,
  parseGrid,
  type SpriteDef,
  TRANSPARENT,
  validateSprite,
} from './sprite.ts';

/** An RGBA image: 4 bytes per pixel, rows top to bottom. Transparent pixels are all zeros. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

export interface RasterAnimation {
  readonly name: string;
  readonly frames: readonly Raster[];
  /** How long each frame is shown, ms. */
  readonly durations: readonly number[];
}

export interface SpriteRaster {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly anchor: { readonly x: number; readonly y: number };
  /** In the sprite's order; the first one is the default. */
  readonly animations: readonly RasterAnimation[];
}

/**
 * Rasterize every frame of every animation. Throws with all problems listed if the sprite is
 * invalid — the tests (src/art/sprites.test.ts) make sure that never happens in the game.
 */
export function rasterizeSprite(
  def: SpriteDef,
  palette: Palette,
  swap: PaletteSwap = {},
): SpriteRaster {
  const problems = validateSprite(def, palette);
  if (problems.length > 0) throw new Error(`Спрайт с ошибками:\n${problems.join('\n')}`);
  const swapProblems = validateSwap(palette, swap);
  if (swapProblems.length > 0) {
    throw new Error(`Спрайт «${def.name}», подмена с ошибками:\n${swapProblems.join('\n')}`);
  }

  // Resolve the legend once: character → RGB after the swap.
  const colors = new Map<string, readonly [number, number, number]>();
  for (const [symbol, name] of Object.entries(def.legend)) {
    colors.set(symbol, resolveColor(palette, name, swap)!);
  }

  const animations = Object.entries(def.animations).map(([name, animation]) => ({
    name,
    durations: frameDurations(animation),
    frames: animation.frames.map((grid) => {
      const pixels = new Uint8ClampedArray(def.width * def.height * 4);
      parseGrid(grid).forEach((row, y) => {
        [...row].forEach((symbol, x) => {
          if (symbol === TRANSPARENT) return;
          const [r, g, b] = colors.get(symbol)!;
          const at = (y * def.width + x) * 4;
          pixels[at] = r;
          pixels[at + 1] = g;
          pixels[at + 2] = b;
          pixels[at + 3] = 255;
        });
      });
      return { width: def.width, height: def.height, pixels };
    }),
  }));
  return { name: def.name, width: def.width, height: def.height, anchor: def.anchor, animations };
}
