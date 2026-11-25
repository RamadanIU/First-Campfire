/**
 * How a villager looks on the map (step 1.3): which sprite, recoloured how, where its feet are,
 * which animation and frame — pure functions of the villager, the interpolation `alpha` and the
 * presentation time (docs/ART.md, «Жители»).
 *
 *   - Sprite `man` or `woman` (12×18); skin and hair — palette swaps of `skin_light` and
 *     `hair_brown` by the villager's indices (GDD §10.2: 6 tones, 5 colours).
 *   - Position: between the previous and the current tick by `alpha` (GameLoop.alpha), so the
 *     walk is smooth whatever the frame rate; the feet stand where an object's anchor would
 *     (the middle of the tile, 3 px above its lower edge), in whole pixels.
 *   - Walking: the frame is picked by the distance walked, not by the clock: one frame per
 *     `strideTiles` (half a tile — at the pace of the sprite's 200 ms frames at ×1), so at ×20
 *     the legs keep pace with the ground and on pause they stop mid-stride (BACKLOG, 0.4).
 *   - Standing: the breathing `idle_*`, each villager with its own phase.
 *   - Sitting by the fire (step 1.9): `sit_e` / `sit_w`, facing it, breathing.
 *   - Asleep (step 1.5): `man_asleep` / `woman_asleep` — lying on the ground, breathing slowly; the
 *     same swaps. A bubble of sleep floats over the head (./mapRenderer.ts, `drawSigns`).
 *   - Carrying (step 1.7): the load's look over the villager (./items.ts `loadLook` — a bundle held
 *     up in raised arms, with the villager's skin); walking, it sinks a pixel with the body on the
 *     strides (frames 0 and 2), so the bundle bobs with the steps.
 *   - Depth: like an object's (anchor y), a little in front of the low flowers and grass of its
 *     own tile (they stand up to 2 px lower), never in front of anything of the row below.
 */
import type { PaletteSwap } from '../art/palette.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import type { Villager } from '../sim/villagers.ts';
import { positionOf } from '../sim/villagers.ts';
import type { LoadLook } from './items.ts';

/** Skin tones by the villager's `skin` index; the first is the sprite's own colours. */
export const SKIN_RAMPS = [
  'skin_light',
  'skin_pale',
  'skin_tan',
  'skin_olive',
  'skin_brown',
  'skin_dark',
] as const;
/** Hair colours by the villager's `hair` index; the first is the sprite's own colours. */
export const HAIR_RAMPS = [
  'hair_brown',
  'hair_black',
  'hair_chestnut',
  'hair_red',
  'hair_blond',
] as const;

/** Where on its tile a villager's feet are: as an object's anchor (./mapRenderer.ts). */
export const FEET = { x: TILE_SIZE / 2, y: TILE_SIZE - 3 } as const;
/** Depth in front of the low decorations of the villager's own tile (shifted ≤ 2 px down). */
const DEPTH_AHEAD = 2.5;
/** Frames of the walking cycle (docs/ART.md: stride, passing, other stride, passing). */
const WALK_FRAMES = 4;

/** Sprites of a villager: standing and walking, or asleep on the ground (step 1.5). */
export type VillagerSprite = 'man' | 'woman' | 'man_asleep' | 'woman_asleep';

export interface VillagerPose {
  readonly id: number;
  readonly sprite: VillagerSprite;
  readonly swap: PaletteSwap;
  /** The feet (sprite anchor), whole world pixels. */
  readonly x: number;
  readonly y: number;
  readonly animation: string;
  /** Walking: the frame by distance; standing: null — the animation runs by time. */
  readonly frame: number | null;
  /** Standing: shift of the breathing clock, ms. */
  readonly phase: number;
  /** Drawing order among the objects (compare with their anchor y). */
  readonly depth: number;
  readonly walking: boolean;
  /** Asleep (step 1.5): lying, with a bubble of sleep over the head. */
  readonly asleep: boolean;
  /** What it carries (step 1.7): the load's sprite, its anchor and swap; or null. */
  readonly load: {
    readonly sprite: string;
    readonly x: number;
    readonly y: number;
    readonly swap: PaletteSwap;
  } | null;
}

export function spriteOf(villager: Villager): 'man' | 'woman' {
  return villager.sex === 'male' ? 'man' : 'woman';
}

/** The palette swap for the villager's skin and hair (none for the sprite's own colours). */
export function swapOf(villager: Villager): PaletteSwap {
  const swap: Record<string, string> = {};
  const skin = SKIN_RAMPS[villager.skin] ?? SKIN_RAMPS[0];
  const hair = HAIR_RAMPS[villager.hair] ?? HAIR_RAMPS[0];
  if (skin !== SKIN_RAMPS[0]) swap[SKIN_RAMPS[0]] = skin;
  if (hair !== HAIR_RAMPS[0]) swap[HAIR_RAMPS[0]] = hair;
  return swap;
}

/** Frame of the walking cycle after `walked` tiles, one frame per `strideTiles`. */
export function walkFrame(walked: number, strideTiles: number): number {
  return Math.floor(walked / strideTiles + 1e-9) % WALK_FRAMES;
}

/**
 * How far one frame of walking carries a villager, tiles: the sprite's walking frame lasts
 * `frameMs` at ×1, and a tile takes `walkTicksPerTile` ticks of `1000 / ticksPerSecond` ms.
 */
export function strideOf(
  frameMs: number,
  walkTicksPerTile: number,
  ticksPerSecond: number,
): number {
  return (frameMs * ticksPerSecond) / (walkTicksPerTile * 1000);
}

/**
 * The animation of an awake villager: walking, sitting by the fire sideways (step 1.9), standing.
 */
function animationOf(villager: Villager, walking: boolean): string {
  if (walking) return `walk_${villager.facing}`;
  const sideways = villager.facing === 'e' || villager.facing === 'w';
  if (villager.action.kind === 'sit' && sideways) return `sit_${villager.facing}`;
  return `idle_${villager.facing}`;
}

/**
 * Where (between the last two ticks, by `alpha`) and how a villager is drawn; `load` — how what it
 * carries looks (./items.ts `loadLook`), if anything.
 */
export function villagerPose(
  villager: Villager,
  alpha: number,
  strideTiles: number,
  load: LoadLook | null = null,
): VillagerPose {
  const now = positionOf(villager);
  const x = villager.prevX + (now.x - villager.prevX) * alpha;
  const y = villager.prevY + (now.y - villager.prevY) * alpha;
  const walking = now.x !== villager.prevX || now.y !== villager.prevY;
  const asleep = villager.action.kind === 'sleep' && !walking;
  const feetY = Math.round(y * TILE_SIZE + FEET.y);
  // The distance at the drawn moment: the last tick's way is covered by alpha.
  const lastStep = Math.hypot(now.x - villager.prevX, now.y - villager.prevY);
  const walked = Math.max(0, villager.walked - (1 - alpha) * lastStep);
  const frame = walking ? walkFrame(walked, strideTiles) : null;
  const feetX = Math.round(x * TILE_SIZE + FEET.x);
  // On a stride (frames 0 and 2) the body is a pixel lower, and the load with it.
  const bob = frame !== null && frame % 2 === 0 ? 1 : 0;
  return {
    id: villager.id,
    sprite: asleep ? `${spriteOf(villager)}_asleep` : spriteOf(villager),
    swap: swapOf(villager),
    x: feetX,
    y: feetY,
    animation: asleep ? 'idle' : animationOf(villager, walking),
    frame,
    phase: (villager.id * 617) % 1600,
    depth: feetY + DEPTH_AHEAD,
    walking,
    asleep,
    load:
      load === null || asleep
        ? null
        : {
            sprite: load.sprite,
            x: feetX,
            y: feetY + load.y + bob,
            swap: load.skin ? swapOf(villager) : {},
          },
  };
}
