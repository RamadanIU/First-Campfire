/**
 * Leaves falling from the trees in autumn (ADR-033, GDD §10.5 «осенью летят листья»): every now and
 * then a leaf comes off a crown, flutters down with the wind — tumbling: now flat, now on its edge —
 * and lands at the foot of the tree. Presentation only: a pure function of the tree and the time,
 * so a picture with `frame=` is the same every time; the simulation knows nothing of it.
 *
 * A leaf is two pixels of the autumn leaf colours (birch: the autumn grass, like its crown). They
 * are drawn after the objects, before the light of the time of day — so they darken at night.
 */
import { PALETTE, type Rgb } from '../art/palette.ts';

/** Where leaves come off a crown, relative to the tree's anchor (the foot of the trunk), px. */
interface Crown {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  /** Autumn colours of its leaves: [ramp, shades]. */
  readonly colours: readonly Rgb[];
}

const ramp = (name: string, shades: readonly number[]): Rgb[] =>
  shades.map((shade) => PALETTE.ramps.get(name)![shade]!);

/** Trees that shed leaves, by sprite. */
export const SHEDDING: Readonly<Record<string, Crown>> = {
  tree: { left: -18, right: 18, top: -46, bottom: -20, colours: ramp('leaf_autumn', [2, 3, 4]) },
  tree_young: {
    left: -9,
    right: 9,
    top: -26,
    bottom: -14,
    colours: ramp('leaf_autumn', [2, 3, 4]),
  },
  birch: { left: -10, right: 10, top: -48, bottom: -24, colours: ramp('grass_autumn', [2, 3]) },
};

/** Leaves in the air at once per tree, at most; how long a leaf falls and how often one comes off. */
export const LEAF = { slots: 2, fallMs: 2600, everyMs: [5000, 9000] } as const;

export interface FallingLeaf {
  /** World pixels, whole. */
  readonly x: number;
  readonly y: number;
  readonly colour: Rgb;
  /** Flat (2×1) or on its edge (1×2) this moment. */
  readonly flat: boolean;
}

/** Cheap deterministic hash → [0, 1). */
function hash(a: number, b: number, c = 0): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The leaves of tree `id` (sprite `sprite`, anchor at x, y — world pixels) in the air at `timeMs`.
 * Each slot drops a leaf once in its own period, at its own moment; a leaf starts at a point of the
 * crown's lower part, drifts right with the wind, sways, and lands near the trunk.
 */
export function fallingLeaves(
  id: number,
  sprite: string,
  x: number,
  y: number,
  timeMs: number,
): FallingLeaf[] {
  const crown = SHEDDING[sprite];
  if (!crown) return [];
  const leaves: FallingLeaf[] = [];
  for (let slot = 0; slot < LEAF.slots; slot++) {
    const [shortest, longest] = LEAF.everyMs;
    const period = shortest + Math.floor(hash(id, slot, 1) * (longest - shortest));
    const offset = Math.floor(hash(id, slot, 2) * period);
    const local = (((timeMs + offset) % period) + period) % period;
    if (local >= LEAF.fallMs) continue;
    // Which fall this is: every one starts from a new point of the crown.
    const round = Math.floor((timeMs + offset) / period);
    const t = local / LEAF.fallMs;
    const startX = crown.left + hash(id, slot, round * 3 + 3) * (crown.right - crown.left);
    const startY = crown.top + hash(id, slot, round * 3 + 4) * (crown.bottom - crown.top);
    const landY = -1 - Math.floor(hash(id, slot, round * 3 + 5) * 5);
    const drift = 6 + hash(id, slot, 6) * 8;
    const sway = Math.sin(t * Math.PI * 4 + slot) * 2.5;
    // It falls faster at first, then floats: an easing of the way down.
    const fall = 1 - (1 - t) ** 1.6;
    const colour = crown.colours[Math.floor(hash(id, slot, round + 7) * crown.colours.length)]!;
    leaves.push({
      x: Math.round(x + startX + drift * t + sway),
      y: Math.round(y + startY + (landY - startY) * fall),
      colour,
      flat: Math.floor(local / 200) % 2 === 0,
    });
  }
  return leaves;
}

/** Draw leaves over the part `view` of the world (its corner at (0, 0) of `ctx`). */
export function drawLeaves(
  ctx: CanvasRenderingContext2D,
  leaves: readonly FallingLeaf[],
  viewX: number,
  viewY: number,
): void {
  for (const leaf of leaves) {
    const [r, g, b] = leaf.colour;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(leaf.x - viewX, leaf.y - viewY, leaf.flat ? 2 : 1, leaf.flat ? 1 : 2);
  }
}
