/**
 * Debug overlay of the world (`debug=1`, step 1.3; `debug=needs`, step 1.4): where villagers are
 * going and how they are. Drawn into the
 * picture of the world at one canvas pixel per world pixel, over everything, so it is as crisp as
 * the sprites at every zoom step.
 *
 *   - A path — a line of whole pixels from the villager's feet through the tiles still ahead to
 *     the goal, bright with a dark edge below (reads on grass, sand and water alike). It goes
 *     over trees (so it is seen in the forest) but never over people: pixels inside a
 *     villager's sprite are left out.
 *   - The goal — the corners of its tile.
 *   - The chosen villager — a small arrow above the head.
 *   - A refused order — a red cross on the tile.
 *   - Needs (`debug=needs`): five bars over the head — satiety (berry red), thirst (water blue),
 *     sleep (bone white, step 1.5), health (leaf green); full bar — no need, empty — at zero.
 *
 * Colours are the palette's (src/art/palette.ts).
 */
import { PALETTE, resolveColor, toHex } from '../art/palette.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import type { PixelRect } from './mapRenderer.ts';
import { FEET } from './villagers.ts';

const color = (name: string) => toHex(resolveColor(PALETTE, name)!);
export const OVERLAY_COLORS = {
  line: color('fire.2'),
  edge: color('ink.0'),
  chosen: color('fire.3'),
  refused: color('berry.1'),
  food: color('berry.1'),
  water: color('water.3'),
  sleep: color('bone.2'),
  warmth: color('fire.1'),
  health: color('leaf.4'),
  empty: color('ui.1'),
} as const;

/** The bars of needs: inner width and the height of one bar, px. */
export const NEED_BARS = { width: 12, bar: 2 } as const;
/** Height of the whole box of bars with its dark frame and separators, px. */
export const NEED_BARS_HEIGHT = 5 * NEED_BARS.bar + 6;

/** Filled pixels of a bar for a value 0…100: never empty above zero, never full below 100. */
export function barFill(value: number, width: number = NEED_BARS.width): number {
  if (value <= 0) return 0;
  if (value >= 100) return width;
  return Math.min(width - 1, Math.max(1, Math.round((value / 100) * width)));
}

export interface Point {
  x: number;
  y: number;
}

/** Whole pixels of a line from (x0, y0) to (x1, y1), both ends included (Bresenham). */
export function linePixels(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1;
  const sy = y < ty ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    points.push({ x, y });
    if (x === tx && y === ty) return points;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/** The feet point of a tile, world pixels: where a villager standing on it has its anchor. */
export function feetOf(tile: Point): Point {
  return { x: tile.x * TILE_SIZE + FEET.x, y: tile.y * TILE_SIZE + FEET.y };
}

/** Pixels of a path: from `start` (world pixels) through the feet points of `tiles`. */
export function pathPixels(start: Point, tiles: readonly Point[]): Point[] {
  const pixels: Point[] = [];
  let from = start;
  for (const tile of tiles) {
    const to = feetOf(tile);
    const segment = linePixels(from.x, from.y, to.x, to.y);
    pixels.push(...(pixels.length > 0 ? segment.slice(1) : segment));
    from = to;
  }
  return pixels;
}

function dot(ctx: CanvasRenderingContext2D, view: PixelRect, x: number, y: number): void {
  ctx.fillRect(x - view.x, y - view.y, 1, 1);
}

/** Boxes the overlay keeps clear: where people are drawn, world pixels. */
export type Clear = readonly PixelRect[];

const inClear = (clear: Clear, x: number, y: number) =>
  clear.some((box) => x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height);

/** A villager's path: the line (kept off `clear`) and the corners of the goal tile. */
export function drawPath(
  ctx: CanvasRenderingContext2D,
  view: PixelRect,
  start: Point,
  tiles: readonly Point[],
  goal: Point,
  clear: Clear = [],
): void {
  const pixels = pathPixels(start, tiles);
  ctx.fillStyle = OVERLAY_COLORS.edge;
  for (const { x, y } of pixels) if (!inClear(clear, x, y + 1)) dot(ctx, view, x, y + 1);
  ctx.fillStyle = OVERLAY_COLORS.line;
  for (const { x, y } of pixels) if (!inClear(clear, x, y)) dot(ctx, view, x, y);
  // Corners of the goal tile: an L of 4 pixels at each, with the dark edge outside.
  const left = goal.x * TILE_SIZE;
  const top = goal.y * TILE_SIZE;
  const right = left + TILE_SIZE - 1;
  const bottom = top + TILE_SIZE - 1;
  for (const [cx, cy, sx, sy] of [
    [left, top, 1, 1],
    [right, top, -1, 1],
    [left, bottom, 1, -1],
    [right, bottom, -1, -1],
  ] as const) {
    ctx.fillStyle = OVERLAY_COLORS.edge;
    for (let i = -1; i < 4; i++) {
      dot(ctx, view, cx + i * sx, cy - sy);
      dot(ctx, view, cx - sx, cy + i * sy);
    }
    ctx.fillStyle = OVERLAY_COLORS.line;
    for (let i = 0; i < 4; i++) {
      dot(ctx, view, cx + i * sx, cy);
      dot(ctx, view, cx, cy + i * sy);
    }
  }
}

/** The arrow over the chosen villager's head (`top` — the top of its sprite, world pixels). */
export function drawChosen(
  ctx: CanvasRenderingContext2D,
  view: PixelRect,
  x: number,
  top: number,
): void {
  // ▼ 5 px wide, 3 high, 2 px above the head, with a dark outline.
  const rows = ['ooooooo', 'oyyyyyo', '.oyyyo.', '..oyo..', '...o...'];
  const left = Math.round(x) - 3;
  const y0 = Math.round(top) - 2 - rows.length;
  rows.forEach((row, dy) => {
    [...row].forEach((c, dx) => {
      if (c === '.') return;
      ctx.fillStyle = c === 'o' ? OVERLAY_COLORS.edge : OVERLAY_COLORS.chosen;
      dot(ctx, view, left + dx, y0 + dy);
    });
  });
}

/** A red cross on a tile: the order there was refused. */
export function drawRefused(ctx: CanvasRenderingContext2D, view: PixelRect, tile: Point): void {
  const cx = tile.x * TILE_SIZE + 8;
  const cy = tile.y * TILE_SIZE + 8;
  for (const [color, grow] of [
    [OVERLAY_COLORS.edge, 1],
    [OVERLAY_COLORS.refused, 0],
  ] as const) {
    ctx.fillStyle = color;
    for (let i = -4; i <= 4; i++) {
      for (let g = -grow; g <= grow; g++) {
        dot(ctx, view, cx + i, cy + i + g);
        dot(ctx, view, cx + i, cy - i + g);
      }
    }
  }
}

/**
 * Bars of needs over a villager's head (`debug=needs`): satiety, thirst, sleep, warmth (step 1.10), health, top to bottom,
 * in a dark frame whose lower edge is 2 px above `top` (the top of its sprite, world pixels).
 */
export function drawNeeds(
  ctx: CanvasRenderingContext2D,
  view: PixelRect,
  x: number,
  top: number,
  values: { food: number; water: number; sleep: number; warmth: number; health: number },
): void {
  const { width, bar } = NEED_BARS;
  const left = Math.round(x) - Math.floor(width / 2) - 1;
  const y0 = Math.round(top) - 2 - NEED_BARS_HEIGHT;
  ctx.fillStyle = OVERLAY_COLORS.edge;
  ctx.fillRect(left - view.x, y0 - view.y, width + 2, NEED_BARS_HEIGHT);
  const rows = [
    [values.food, OVERLAY_COLORS.food],
    [values.water, OVERLAY_COLORS.water],
    [values.sleep, OVERLAY_COLORS.sleep],
    [values.warmth, OVERLAY_COLORS.warmth],
    [values.health, OVERLAY_COLORS.health],
  ] as const;
  rows.forEach(([value, color], i) => {
    const y = y0 + 1 + i * (bar + 1) - view.y;
    const filled = barFill(value);
    ctx.fillStyle = color;
    ctx.fillRect(left + 1 - view.x, y, filled, bar);
    ctx.fillStyle = OVERLAY_COLORS.empty;
    ctx.fillRect(left + 1 + filled - view.x, y, width - filled, bar);
  });
}
