/**
 * Sprite sheet: the atlas (src/art/atlas.ts) on a canvas, and drawing sprite frames by name.
 *
 * All sprites are rasterized and packed into one canvas when the sheet is created. Recoloured
 * variants (another skin tone, later seasons and dyes) are rasterized on first use and cached:
 * one small canvas per sprite and swap. Pixels stay crisp: integer scale, whole-pixel
 * positions, image smoothing off.
 */
import { type Atlas, type AtlasEntry, buildAtlas } from '../art/atlas.ts';
import { type Palette, type PaletteSwap, swapKey } from '../art/palette.ts';
import { frameAt, type SpriteDef, usedRamps } from '../art/sprite.ts';

export interface DrawOptions {
  /** Animation name; default — the sprite's first animation. */
  animation?: string;
  /** Frame index (wraps around). Takes priority over `timeMs`. */
  frame?: number;
  /** Presentation time, ms: picks the frame by the animation's durations. */
  timeMs?: number;
  /** Whole-number scale, default 1. */
  scale?: number;
  /** Recolour: ramp → ramp. */
  swap?: PaletteSwap;
}

export interface ShadowOptions {
  /** Whole-number scale, default 1. */
  scale?: number;
  /**
   * Draw the shape fully opaque. For a shadow layer: draw every shadow opaque into one canvas,
   * then put the layer on the ground once with `shadowOpacity` — overlapping shadows merge
   * instead of darkening twice.
   */
  opaque?: boolean;
}

export interface SpriteSheet {
  /** The base atlas (all sprites, original colours) and its canvas. */
  readonly atlas: Atlas;
  readonly canvas: HTMLCanvasElement;
  /** Recoloured variants built so far. */
  readonly variantCount: number;
  /** Opacity of shadows, 0…1 (the palette's shadow colour). */
  readonly shadowOpacity: number;
  has(name: string): boolean;
  entry(name: string): AtlasEntry;
  /**
   * Draw a frame so that the sprite's anchor lands on (x, y) of `ctx`.
   * Throws on an unknown sprite or animation: a typo must not go unnoticed.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    name: string,
    x: number,
    y: number,
    options?: DrawOptions,
  ): void;
  /**
   * Draw the sprite's soft shadow for an object whose anchor is at (x, y). Draw shadows before
   * objects. Returns false (and draws nothing) if the sprite has no shadow.
   */
  drawShadow(
    ctx: CanvasRenderingContext2D,
    name: string,
    x: number,
    y: number,
    options?: ShadowOptions,
  ): boolean;
}

function toCanvas(atlas: Atlas): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, atlas.width);
  canvas.height = Math.max(1, atlas.height);
  if (atlas.width > 0 && atlas.height > 0) {
    const image = new ImageData(new Uint8ClampedArray(atlas.pixels), atlas.width, atlas.height);
    canvas.getContext('2d')!.putImageData(image, 0, 0);
  }
  return canvas;
}

export function createSpriteSheet(defs: readonly SpriteDef[], palette: Palette): SpriteSheet {
  const atlas = buildAtlas(defs, palette);
  const canvas = toCanvas(atlas);
  const byName = new Map(defs.map((def) => [def.name, def]));
  const ramps = new Map(defs.map((def) => [def.name, usedRamps(def)]));
  const variants = new Map<string, { atlas: Atlas; canvas: HTMLCanvasElement }>();

  /** The atlas and canvas holding `name` recoloured by `swap`. */
  function source(name: string, swap: PaletteSwap | undefined) {
    const key = swap ? swapKey(swap, ramps.get(name)) : '';
    if (key === '') return { atlas, canvas };
    const cacheKey = `${name}|${key}`;
    let variant = variants.get(cacheKey);
    if (!variant) {
      const variantAtlas = buildAtlas([byName.get(name)!], palette, swap);
      variant = { atlas: variantAtlas, canvas: toCanvas(variantAtlas) };
      variants.set(cacheKey, variant);
    }
    return variant;
  }

  function entry(name: string): AtlasEntry {
    const found = atlas.sprites.get(name);
    if (!found) throw new Error(`Нет спрайта «${name}»`);
    return found;
  }

  let shadowOpacity = 1;
  for (const sprite of atlas.sprites.values()) {
    if (sprite.shadow) shadowOpacity = sprite.shadow.alpha / 255;
  }

  return {
    atlas,
    canvas,
    get variantCount() {
      return variants.size;
    },
    shadowOpacity,
    has: (name) => atlas.sprites.has(name),
    entry,
    draw(ctx, name, x, y, options = {}) {
      entry(name); // fail loudly on an unknown name
      const from = source(name, options.swap);
      const sprite = from.atlas.sprites.get(name)!;
      const animationName = options.animation ?? sprite.defaultAnimation;
      const animation = sprite.animations.get(animationName);
      if (!animation) throw new Error(`У спрайта «${name}» нет анимации «${animationName}»`);
      const count = animation.frames.length;
      const index =
        options.frame !== undefined
          ? ((Math.trunc(options.frame) % count) + count) % count
          : frameAt(animation.durations, options.timeMs ?? 0);
      const rect = animation.frames[index]!;
      const scale = Math.max(1, Math.round(options.scale ?? 1));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        from.canvas,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        Math.round(x - sprite.anchor.x * scale),
        Math.round(y - sprite.anchor.y * scale),
        rect.w * scale,
        rect.h * scale,
      );
    },
    drawShadow(ctx, name, x, y, options = {}) {
      const shadow = entry(name).shadow;
      if (!shadow) return false;
      const scale = Math.max(1, Math.round(options.scale ?? 1));
      const { rect } = shadow;
      const alpha = ctx.globalAlpha;
      if (!options.opaque) ctx.globalAlpha = alpha * (shadow.alpha / 255);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        canvas,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        Math.round(x - shadow.anchor.x * scale),
        Math.round(y - shadow.anchor.y * scale),
        rect.w * scale,
        rect.h * scale,
      );
      ctx.globalAlpha = alpha;
      return true;
    },
  };
}
