/**
 * Sprite description format: graphics as code (ADR-003, docs/ART.md).
 *
 * A sprite is a text file: its frames are grids of characters, one character per pixel, and a
 * legend maps characters to palette colours. `.` is always transparent. Example:
 *
 *   defineSprite({
 *     name: 'stone', title: 'Камень', kind: 'object',
 *     width: 4, height: 3, anchor: { x: 2, y: 3 },
 *     legend: { o: 'bark.0', m: 'bark.2' },
 *     animations: { idle: { frames: [`
 *       .oo.
 *       ommo
 *       oooo
 *     `] } },
 *   })
 *
 * Grid lines are trimmed, so they can be indented freely; blank lines before the first and after
 * the last row are ignored. Rows and columns in error messages are counted from 1.
 */
import {
  type ColorName,
  type Palette,
  type PaletteSwap,
  parseColorName,
  validateSwap,
} from './palette.ts';

/** The character for a transparent pixel. Cannot be redefined in a legend. */
export const TRANSPARENT = '.';

/** Map tile size, px (GDD §10.1). Every `tile` sprite is exactly this size. */
export const TILE_SIZE = 16;

/** Largest allowed sprite side, px. Anything bigger is surely a mistake. */
export const MAX_SPRITE_SIZE = 256;

/** How long a frame is shown when an animation does not say, ms (10 frames per second). */
export const DEFAULT_FRAME_MS = 100;

/**
 * - `tile` — a 16×16 map tile, anchored at its top-left corner; the gallery shows it tiled 3×3.
 * - `object` — anything standing on the map: trees, bushes, buildings, items.
 * - `character` — people and animals.
 */
export type SpriteKind = 'tile' | 'object' | 'character';

export interface AnimationDef {
  /** Frames as text grids. To hold a pose longer, give it a longer `frameMs` or repeat it. */
  readonly frames: readonly string[];
  /**
   * How long each frame is shown, ms: one number for every frame or one per frame.
   * Default 100. The presentation clock ticks 10 times a second, so multiples of 100 are exact.
   */
  readonly frameMs?: number | readonly number[];
}

export interface SpriteDef {
  /** snake_case id; equals the file name (`src/art/sprites/<name>.ts`). Data tables refer to it. */
  readonly name: string;
  /** Human name in Russian, for the gallery. */
  readonly title: string;
  readonly kind: SpriteKind;
  readonly width: number;
  readonly height: number;
  /**
   * The point placed at the object's position on the map, in sprite pixels from the top-left
   * corner; may lie on the right or bottom edge. A person or a tree stands on it (the feet, the
   * base of the trunk); a tile is anchored at 0, 0.
   */
  readonly anchor: { readonly x: number; readonly y: number };
  /** Character → palette colour. One character per entry; `.` is reserved for transparency. */
  readonly legend: Readonly<Record<string, ColorName>>;
  /** Animations by snake_case name; the first one is the default (e.g. `idle`). */
  readonly animations: Readonly<Record<string, AnimationDef>>;
  /** Named recolours shown in the gallery, e.g. skin tones: `{ dark: { skin_light: 'skin_dark' } }`. */
  readonly variants?: Readonly<Record<string, PaletteSwap>>;
}

/** Identity function: gives a sprite file type checking and editor hints. */
export function defineSprite(def: SpriteDef): SpriteDef {
  return def;
}

/** Grid text → rows. Each line is trimmed; blank lines at the start and end are dropped. */
export function parseGrid(text: string): string[] {
  const rows = text.split('\n').map((line) => line.trim());
  while (rows.length > 0 && rows[0] === '') rows.shift();
  while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  return rows;
}

/** Duration of every frame of an animation, ms. */
export function frameDurations(animation: AnimationDef): number[] {
  const { frames, frameMs = DEFAULT_FRAME_MS } = animation;
  return frames.map((_, index) =>
    typeof frameMs === 'number' ? frameMs : (frameMs[index] ?? DEFAULT_FRAME_MS),
  );
}

/** Which frame of a looping animation is on screen at `timeMs` (0, 1, 2…). */
export function frameAt(durations: readonly number[], timeMs: number): number {
  const total = durations.reduce((sum, ms) => sum + ms, 0);
  if (durations.length <= 1 || total <= 0) return 0;
  let t = ((timeMs % total) + total) % total;
  for (const [index, ms] of durations.entries()) {
    if (t < ms) return index;
    t -= ms;
  }
  return durations.length - 1;
}

/** The default (first) animation's name. */
export function defaultAnimation(def: SpriteDef): string {
  return Object.keys(def.animations)[0] ?? '';
}

/** Palette ramps the sprite's legend refers to. */
export function usedRamps(def: SpriteDef): Set<string> {
  const ramps = new Set<string>();
  for (const color of Object.values(def.legend)) {
    const parsed = parseColorName(color);
    if (parsed) ramps.add(parsed.ramp);
  }
  return ramps;
}

const ID = /^[a-z][a-z0-9_]*$/;
const KINDS: readonly SpriteKind[] = ['tile', 'object', 'character'];

function isWholeNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Everything wrong with a sprite, as messages that name the sprite, animation, frame, row and
 * column. An empty list means the sprite is valid. Never throws, even on malformed input.
 */
export function validateSprite(def: SpriteDef, palette: Palette): string[] {
  const problems: string[] = [];
  const add = (message: string) => problems.push(`спрайт «${def.name}»: ${message}`);

  if (!ID.test(def.name)) add('имя должно быть snake_case латиницей (a–z, 0–9, _)');
  if (typeof def.title !== 'string' || def.title.trim() === '') add('нет названия (title)');
  if (!KINDS.includes(def.kind)) {
    add(`неизвестный вид «${def.kind}» — допустимы ${KINDS.join(', ')}`);
  }

  const sizeOk =
    isWholeNumber(def.width, 1, MAX_SPRITE_SIZE) && isWholeNumber(def.height, 1, MAX_SPRITE_SIZE);
  if (!sizeOk) {
    add(`размер ${def.width}×${def.height} — нужны целые числа от 1 до ${MAX_SPRITE_SIZE}`);
  }
  if (def.kind === 'tile' && (def.width !== TILE_SIZE || def.height !== TILE_SIZE)) {
    add(`тайл должен быть ${TILE_SIZE}×${TILE_SIZE}, а не ${def.width}×${def.height}`);
  }
  const { x, y } = def.anchor ?? {};
  if (!isWholeNumber(x, 0, def.width) || !isWholeNumber(y, 0, def.height)) {
    add(
      `точка привязки (${x}, ${y}) вне спрайта — нужны целые x от 0 до ${def.width}, y от 0 до ${def.height}`,
    );
  } else if (def.kind === 'tile' && (x !== 0 || y !== 0)) {
    add('точка привязки тайла — его левый верхний угол (0, 0)');
  }

  // Legend: single characters, not the transparent one, colours that exist in the palette.
  const legend = new Map<string, string>();
  for (const [symbol, color] of Object.entries(def.legend ?? {})) {
    const where = `легенда, символ «${symbol}»`;
    if ([...symbol].length !== 1 || symbol.trim() === '') {
      add(`${where}: ключ легенды — ровно один видимый символ`);
      continue;
    }
    if (symbol === TRANSPARENT) {
      add(
        `${where}: «${TRANSPARENT}» всегда означает прозрачный пиксель, его нельзя переопределять`,
      );
      continue;
    }
    const parsed = parseColorName(color);
    const ramp = parsed && palette.ramps.get(parsed.ramp);
    if (!parsed) add(`${where}: «${color}» — цвет пишется как «ряд.номер», например grass.2`);
    else if (!ramp) add(`${where}: в палитре нет ряда «${parsed.ramp}» (цвет ${color})`);
    else if (parsed.shade >= ramp.length) {
      add(
        `${where}: в ряду «${parsed.ramp}» нет цвета ${parsed.shade} — есть 0…${ramp.length - 1}`,
      );
    }
    legend.set(symbol, color);
  }

  // Animations and frames.
  const animations = Object.entries(def.animations ?? {});
  if (animations.length === 0) add('нет ни одной анимации');
  const used = new Set<string>();
  for (const [name, animation] of animations) {
    const where = `анимация «${name}»`;
    if (!ID.test(name)) add(`${where}: имя должно быть snake_case латиницей`);
    const frames = animation.frames ?? [];
    if (frames.length === 0) add(`${where}: нет ни одного кадра`);
    const { frameMs } = animation;
    if (Array.isArray(frameMs) && frameMs.length !== frames.length) {
      add(`${where}: длительностей кадров ${frameMs.length}, а кадров ${frames.length}`);
    }
    const durations = typeof frameMs === 'number' ? [frameMs] : (frameMs ?? []);
    for (const ms of durations) {
      if (!isWholeNumber(ms, 10, 60_000)) {
        add(`${where}: длительность кадра ${ms} мс — нужно целое число от 10 до 60000`);
      }
    }
    frames.forEach((grid, index) => {
      const frame = `${where}, кадр ${index + 1}`;
      if (typeof grid !== 'string') {
        add(`${frame}: кадр должен быть текстом`);
        return;
      }
      const rows = parseGrid(grid);
      if (sizeOk && rows.length !== def.height) {
        add(`${frame}: строк ${rows.length}, ожидалось ${def.height} (высота спрайта)`);
      }
      rows.forEach((row, r) => {
        const cells = [...row];
        if (sizeOk && cells.length !== def.width) {
          add(
            `${frame}, строка ${r + 1}: длина ${cells.length}, ожидалось ${def.width} (ширина спрайта) — «${row}»`,
          );
        }
        cells.forEach((symbol, c) => {
          if (symbol === TRANSPARENT) return;
          used.add(symbol);
          if (legend.has(symbol)) return;
          const hint = /\s/.test(symbol)
            ? ' — пробел внутри строки; прозрачный пиксель пишется «.»'
            : '';
          add(
            `${frame}, строка ${r + 1}, столбец ${c + 1}: символа «${symbol}» нет в легенде${hint}`,
          );
        });
      });
    });
  }
  for (const symbol of legend.keys()) {
    if (!used.has(symbol)) {
      add(`легенда, символ «${symbol}»: не встречается ни в одном кадре — уберите его`);
    }
  }

  // Variants: valid swaps that actually change something in this sprite.
  const ramps = usedRamps(def);
  for (const [name, swap] of Object.entries(def.variants ?? {})) {
    const where = `вариант «${name}»`;
    if (!ID.test(name)) add(`${where}: имя должно быть snake_case латиницей`);
    for (const problem of validateSwap(palette, swap)) add(`${where}: ${problem}`);
    const touched = Object.keys(swap).filter((ramp) => ramps.has(ramp));
    if (touched.length === 0) {
      add(
        `${where}: ни один из заменяемых рядов (${Object.keys(swap).join(', ') || 'нет'}) не используется в спрайте`,
      );
    }
  }
  return problems;
}

/** Problems of a whole set of sprites that single-sprite checks cannot see: duplicate names. */
export function validateSpriteSet(defs: readonly SpriteDef[]): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const def of defs) {
    if (seen.has(def.name)) problems.push(`спрайт «${def.name}»: имя уже занято другим спрайтом`);
    seen.add(def.name);
  }
  return problems;
}
