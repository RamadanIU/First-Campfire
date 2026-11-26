/**
 * The rig of a character (GDD §10.2 «конструктор жителя»): limbs drawn from joints into text
 * grids. A pose is a handful of points — hip, knee, ankle; shoulder, elbow, hand — so a walk of
 * eight frames or a new action is a table of numbers instead of eight hand-drawn pictures.
 * Heads, bodies and clothes stay hand-drawn grids (./sprite.ts `composeFrame` puts them together);
 * the rig adds what moves a lot: arms and legs.
 *
 * A limb is a polyline two pixels thick — a light and a darker stroke, since light falls from
 * the upper left (docs/ART.md) — with an outline of its own around it, so an arm in front of the
 * body stands out from it, as in a hand-drawn sprite. A leg ends in a foot pointing where the
 * character faces; an arm ends in a hand of the light shade. Pure functions on strings: the
 * sprite files call them at import, the result is checked like any grid (src/art/sprite.ts).
 */
import { TRANSPARENT } from './sprite.ts';

export interface Joint {
  readonly x: number;
  readonly y: number;
}

/** Characters a limb is drawn with: the lit and the shaded stroke, the outline. */
export interface LimbInk {
  readonly light: string;
  readonly shade: string;
  readonly outline: string;
}

export interface LimbDef {
  /** From the body outwards: hip → knee → ankle, or shoulder → elbow → hand. */
  readonly joints: readonly Joint[];
  readonly ink: LimbInk;
  /** A foot at the last joint: its length forward, px, and which way it points (1 right, −1 left). */
  readonly foot?: { readonly length: number; readonly dir: 1 | -1; readonly lift?: boolean };
  /** A hand at the last joint: the last pixels are drawn in the light shade. */
  readonly hand?: boolean;
}

/** Pixels of a straight segment, ends included (Bresenham). */
export function segment(a: Joint, b: Joint): Joint[] {
  const points: Joint[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    points.push({ x, y });
    if (x === b.x && y === b.y) return points;
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

/** A grid of characters being drawn on. */
class Cells {
  readonly width: number;
  readonly height: number;
  readonly rows: string[][];
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.rows = Array.from({ length: height }, () => Array<string>(width).fill(TRANSPARENT));
  }
  get(x: number, y: number): string {
    return this.rows[y]?.[x] ?? TRANSPARENT;
  }
  set(x: number, y: number, symbol: string): void {
    const row = this.rows[y];
    if (row && x >= 0 && x < this.width) row[x] = symbol;
  }
  toString(): string {
    return this.rows.map((row) => row.join('')).join('\n');
  }
}

/**
 * One limb as a `width`×`height` grid (transparent elsewhere), outlined: every empty pixel beside
 * the limb takes the outline.
 */
export function drawLimb(width: number, height: number, limb: LimbDef): string {
  const cells = new Cells(width, height);
  const { light, shade, outline } = limb.ink;
  const joints = limb.joints;
  for (let i = 0; i + 1 < joints.length; i++) {
    const a = joints[i]!;
    const b = joints[i + 1]!;
    const flat = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
    for (const p of segment(a, b)) {
      // Thick by a second stroke: below a flat segment, to the right of a steep one.
      if (flat) {
        cells.set(p.x, p.y, light);
        cells.set(p.x, p.y + 1, shade);
      } else {
        cells.set(p.x, p.y, light);
        cells.set(p.x + 1, p.y, shade);
      }
    }
  }
  const end = joints[joints.length - 1]!;
  if (limb.foot) {
    const { length, dir, lift = false } = limb.foot;
    // The sole: a row under the ankle running forward; a lifted foot points its toes down.
    const left = dir === 1 ? end.x : end.x + 1 - length;
    for (let i = 0; i < length; i++) {
      const x = left + i;
      const heel = dir === 1 ? i === 0 : i === length - 1;
      cells.set(x, end.y + 1, heel ? light : shade);
    }
    if (lift) cells.set(dir === 1 ? left + length : left - 1, end.y + 2, shade);
  }
  if (limb.hand) {
    cells.set(end.x, end.y, light);
    cells.set(end.x + 1, end.y, light);
  }
  // The outline: the side neighbours of the limb — one pixel thick, corners left open, as a
  // pixel artist rounds them.
  const filled = (x: number, y: number) => cells.get(x, y) !== TRANSPARENT;
  const ring: Joint[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        ring.push({ x, y });
      }
    }
  }
  for (const p of ring) cells.set(p.x, p.y, outline);
  return cells.toString();
}
