/**
 * Crowns of trees and bushes built from leafy clumps (ADR-033): a crown is a list of clumps —
 * rough balls of leaves — drawn back to front over a hand-drawn trunk. Each clump is lit like a
 * ball from the upper left (docs/ART.md), its leaves are clusters of a few pixels a shade lighter
 * or darker, and a clump in front casts a shade on the clumps behind it to its lower right; the
 * silhouette gets the dark outline of the crown. The result is a text grid like any sprite frame.
 *
 * Wind: frame by frame every clump shifts aside by whole pixels — the higher, the further and the
 * later (a wave runs up the crown), the clumps at the bottom stay — and the sunlit leaves glint as
 * they turn. Everything is a pure function of the description and the frame number: the same
 * tree is the same picture everywhere (game, gallery, tests).
 */
import { parseGrid, TRANSPARENT } from './sprite.ts';

export interface Clump {
  /** Centre, px from the frame's top-left corner. */
  readonly x: number;
  readonly y: number;
  /** Radius, px. */
  readonly r: number;
}

export interface CrownDef {
  readonly width: number;
  readonly height: number;
  /** The trunk and branches (a full-size grid), drawn under the crown. */
  readonly trunk: string;
  /** Back to front: the later a clump, the nearer the viewer. */
  readonly clumps: readonly Clump[];
  /** The crown's characters: the outline and the shades from dark to light (≥ 3). */
  readonly outline: string;
  readonly shades: readonly string[];
  /** Varies the leaves of trees drawn from the same clumps. */
  readonly seed: number;
  /**
   * Wind: how far the top of the crown swings, px, and between which rows the swing grows from
   * nothing (`base`, the lowest leaves) to full (`top`).
   */
  readonly sway: { readonly amplitude: number; readonly base: number; readonly top: number };
  /** Branches drawn over the crown (twigs poking out of it); optional full-size grid. */
  readonly over?: string;
  /**
   * Fruit hanging in the crown — berries, nuts: small grids with their top-left corner at x, y;
   * each moves in the wind with the clump nearest to it.
   */
  readonly fruit?: readonly Fruit[];
}

export interface Fruit {
  readonly x: number;
  readonly y: number;
  readonly grid: string;
}

/** A hash of integers → [0, 1). Deterministic; presentation only (the simulation has its RNG). */
export function noise(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

/** The light: from the upper left and the viewer's side. */
const LIGHT = (() => {
  const [x, y, z] = [-0.55, -0.7, 0.45];
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
})();

/** Size of a cluster of leaves, px: the texture of a clump is in clusters, not single pixels. */
const LEAF = 2;

/** How far clump `c` is pushed by the wind on frame `frame` of `frames`. */
function windShift(def: CrownDef, clump: Clump, frame: number, frames: number): number {
  const { amplitude, base, top } = def.sway;
  const h = Math.min(1, Math.max(0, (base - clump.y) / Math.max(1, base - top)));
  const angle = (2 * Math.PI * frame) / frames - h * 1.1;
  return Math.round(amplitude * h ** 1.3 * Math.sin(angle));
}

/**
 * One frame of the crown over the trunk. `frame` of `frames` — the moment of the wind's swing;
 * `glint` — whether sunlit leaves turn and flash (off for a still picture).
 */
export function crownFrame(def: CrownDef, frame = 0, frames = 1, glint = true): string {
  const { width, height, clumps, shades, seed } = def;
  const top = shades.length - 1;
  const cells = parseGrid(def.trunk).map((row) => [...row]);
  /** Which clump covers each pixel (−1 — none) and its shade index. */
  const owner = Array.from({ length: height }, () => Array<number>(width).fill(-1));
  const shade = Array.from({ length: height }, () => Array<number>(width).fill(0));

  // The crown is darker towards its bottom: less sky reaches the lower leaves.
  const crownTop = Math.min(...clumps.map((c) => c.y - c.r));
  const crownBottom = Math.max(...clumps.map((c) => c.y + c.r));
  clumps.forEach((clump, index) => {
    const dx = windShift(def, clump, frame, frames);
    const cx = clump.x + dx;
    const reach = Math.ceil(clump.r * 1.2) + 1;
    for (let y = Math.max(0, clump.y - reach); y < Math.min(height, clump.y + reach + 1); y++) {
      for (let x = Math.max(0, cx - reach); x < Math.min(width, cx + reach + 1); x++) {
        const lx = (x + 0.5 - cx - 0.5) / clump.r;
        const ly = (y + 0.5 - clump.y - 0.5) / clump.r;
        // A leafy edge: the radius wobbles with the angle (fixed to the clump, moves with it).
        const angle = Math.atan2(ly, lx);
        const lobe = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 9);
        const wobble = 1 + 0.24 * (noise(seed, index, lobe) - 0.5) + 0.06 * Math.sin(angle * 5);
        const d2 = lx * lx + ly * ly;
        if (d2 > wobble * wobble) continue;
        const nz = Math.sqrt(Math.max(0, 1 - d2));
        let light = lx * LIGHT.x + ly * LIGHT.y + nz * LIGHT.z;
        light += 0.3 - 0.75 * Math.min(1, Math.max(0, (y - crownTop) / (crownBottom - crownTop)));
        // Leaves in clusters: each LEAF×LEAF cell of the clump a little lighter or darker.
        const ux = Math.floor((x - cx + 64) / LEAF);
        const uy = Math.floor((y - clump.y + 64 + (ux % 2)) / LEAF);
        light += (noise(seed, index, ux, uy) - 0.5) * 0.6;
        light += (noise(seed + 7, index, x - cx, y) - 0.5) * 0.12;
        // Sunlit leaves glint as the wind turns them (top of the crown, one cluster in a few).
        if (glint && frames > 1 && light > 0.55 && noise(seed, index, ux, uy, frame) < 0.18) {
          light -= 0.35;
        }
        const level = light < -0.2 ? 0 : light < 0.2 ? 1 : light < 0.55 ? 2 : 3;
        owner[y]![x] = index;
        shade[y]![x] = Math.min(top, Math.round((level * top) / 3));
      }
    }
  });

  // Creases: a clump behind is dark just over the rim of a clump in front of it, and a shade
  // darker on its lower right (light from the upper left) — so every clump stands out as a ball.
  const at = (x: number, y: number) => owner[y]?.[x] ?? -1;
  const crease: [number, number, number][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const me = at(x, y);
      if (me < 0) continue;
      if (at(x, y + 1) > me || at(x + 1, y + 1) > me) crease.push([x, y, 0]);
      else if (at(x, y - 1) > me || at(x - 1, y) > me) crease.push([x, y, shade[y]![x]! - 1]);
    }
  }
  for (const [x, y, level] of crease) shade[y]![x] = Math.max(0, level);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (owner[y]![x]! >= 0) cells[y]![x] = shades[shade[y]![x]!]!;
    }
  }
  // The outline around the crown (not over the trunk).
  const leafy = (x: number, y: number) => (owner[y]?.[x] ?? -1) >= 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (leafy(x, y) || cells[y]![x] !== TRANSPARENT) continue;
      if (leafy(x - 1, y) || leafy(x + 1, y) || leafy(x, y - 1) || leafy(x, y + 1)) {
        cells[y]![x] = def.outline;
      }
    }
  }
  for (const fruit of def.fruit ?? []) {
    const nearest = clumps.reduce((best, clump) =>
      Math.hypot(clump.x - fruit.x, clump.y - fruit.y) <
      Math.hypot(best.x - fruit.x, best.y - fruit.y)
        ? clump
        : best,
    );
    const dx = windShift(def, nearest, frame, frames);
    parseGrid(fruit.grid).forEach((row, r) => {
      [...row].forEach((symbol, c) => {
        const line = cells[fruit.y + r];
        const x = fruit.x + c + dx;
        if (symbol !== TRANSPARENT && line && x >= 0 && x < width) line[x] = symbol;
      });
    });
  }
  if (def.over) {
    parseGrid(def.over).forEach((row, y) => {
      [...row].forEach((symbol, x) => {
        if (symbol !== TRANSPARENT && cells[y]) cells[y]![x] = symbol;
      });
    });
  }
  return cells.map((row) => row.join('')).join('\n');
}

/** The frames of a crown swaying in the wind: `frames` moments of one swing. */
export function swayFrames(def: CrownDef, frames: number): string[] {
  return Array.from({ length: frames }, (_, frame) => crownFrame(def, frame, frames));
}

/**
 * Frames of a small plant bending in the wind (grass, flowers): every row shifts aside by whole
 * pixels — the tips by up to `amplitude`, the base not at all — over one swing of `frames`.
 */
export function bendFrames(text: string, frames: number, amplitude: number): string[] {
  const rows = parseGrid(text);
  const width = rows[0]?.length ?? 0;
  const last = Math.max(1, rows.length - 1);
  return Array.from({ length: frames }, (_, frame) => {
    const swing = Math.sin((2 * Math.PI * frame) / frames);
    return rows
      .map((row, r) => {
        const shift = Math.round(amplitude * ((last - r) / last) ** 1.5 * swing);
        const moved = shift >= 0 ? '.'.repeat(shift) + row : row.slice(-shift);
        return moved.padEnd(width, '.').slice(0, width);
      })
      .join('\n');
  });
}
