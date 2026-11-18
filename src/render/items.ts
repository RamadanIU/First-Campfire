/**
 * How items look on the map (step 1.7): pure functions of an item or a load (docs/ART.md,
 * «Предметы»).
 *
 *   - Loose on the ground: the resource's sprite (data/resources.json `sprite`) on its tile, where
 *     an object's anchor would be, shifted a pixel or two by the tile so stacks do not lie in rows.
 *   - In the pile at the camp: the resource's pile sprite (`pile`) by how full the stack is — its
 *     steps of size are the animations `small`, `medium`, `idle` (full); a resource without a
 *     pile sprite — its icon laid one per third of a stack, each a little apart. No shift: the
 *     tiles of the pile join into one heap.
 *   - In the hands (`loadLook`): the resource's carried look (`carry` — e.g. a bundle held over the
 *     head with raised arms, recoloured to the carrier's skin; its anchor on the line of the
 *     shoulders), or else its icon over the head; bobbing with the steps (./villagers.ts).
 *
 * Depth: like an object's (the anchor's y): a villager on the same tile is drawn in front. Only the
 * heaps of the pile cast a shadow; a stack or an icon lying on the ground is flat.
 */
import { TILE_SIZE } from '../art/sprite.ts';
import { DATA } from '../data/index.ts';
import type { Item } from '../sim/items.ts';

/** Steps of size of a pile sprite, from a few to a full stack (docs/ART.md, «Предметы»). */
export const PILE_STEPS = ['small', 'medium', 'idle'] as const;

/**
 * Where a load is drawn, its anchor's height over the carrier's feet, px: a carried look stands on
 * the line of the shoulders (row 8 of the 18 of a villager); an icon lies on the head.
 */
export const LOAD = { shoulders: -10, head: -17 } as const;

/** How a load is drawn over its carrier: the sprite, its height, recoloured to the skin or not. */
export interface LoadLook {
  readonly sprite: string;
  readonly y: number;
  readonly skin: boolean;
}

/** Where on its tile an item lies: as an object's anchor (./mapRenderer.ts). */
const ANCHOR = { x: TILE_SIZE / 2, y: TILE_SIZE - 3 } as const;
/** How far a loose stack may lie from the middle of its tile, px (by the tile). */
const SHIFT = { x: 2, y: 1 } as const;
/** Icons of a stack without a pile sprite: where the 2nd and the 3rd lie from the 1st, px. */
const FOLD: readonly (readonly [number, number])[] = [
  [0, 0],
  [3, -2],
  [-3, -1],
];

export interface ItemPose {
  /** Id of the item (several poses of one item — icons laid in a stack — share it). */
  readonly id: number;
  readonly sprite: string;
  readonly animation: string | undefined;
  /** The sprite's anchor, whole world pixels. */
  readonly x: number;
  readonly y: number;
  /** Drawing order among objects and villagers (compare with their anchor y). */
  readonly depth: number;
  /** Casts a shadow: a heap of the pile does; a stack lying loose is flat (docs/ART.md, «Предметы»). */
  readonly shadow: boolean;
}

/** Cheap deterministic hash → [0, 1) of a tile. Presentation only. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The step of size of a pile stack: `count` of `stack` → index into PILE_STEPS. */
export function pileStep(count: number, stack: number): number {
  const steps = PILE_STEPS.length;
  return Math.min(steps - 1, Math.max(0, Math.ceil((count / stack) * steps) - 1));
}

/** How one item is drawn: one sprite, or a few icons laid together (a pile without a sprite). */
export function itemPoses(item: Item): ItemPose[] {
  const resource = DATA.resources.get(item.resource);
  const baseX = item.x * TILE_SIZE + ANCHOR.x;
  const baseY = item.y * TILE_SIZE + ANCHOR.y;
  if (item.place === 'ground') {
    const x = baseX + Math.floor(hash(item.x, item.y) * (2 * SHIFT.x + 1)) - SHIFT.x;
    const y = baseY + Math.floor(hash(item.y, item.x) * (2 * SHIFT.y + 1)) - SHIFT.y;
    return [
      { id: item.id, sprite: resource.sprite, animation: undefined, x, y, depth: y, shadow: false },
    ];
  }
  const step = pileStep(item.count, resource.stack);
  if (resource.pile !== null) {
    return [
      {
        id: item.id,
        sprite: resource.pile,
        animation: PILE_STEPS[step],
        x: baseX,
        y: baseY,
        depth: baseY,
        shadow: true,
      },
    ];
  }
  return FOLD.slice(0, step + 1).map(([dx, dy]) => ({
    id: item.id,
    sprite: resource.sprite,
    animation: undefined,
    x: baseX + dx,
    y: baseY + dy,
    depth: baseY,
    shadow: false,
  }));
}

/** How a load of `resource` is drawn in the hands (data/resources.json `carry`, else `sprite`). */
export function loadLook(resource: string): LoadLook {
  const { carry, sprite } = DATA.resources.get(resource);
  return carry !== null
    ? { sprite: carry, y: LOAD.shoulders, skin: true }
    : { sprite, y: LOAD.head, skin: false };
}
