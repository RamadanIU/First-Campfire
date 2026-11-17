import { PALETTE, toHex } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { prepareTerrain, TERRAIN_LOOKS, terrainGrid } from '../art/terrain.ts';
import { createScenery, type Placement } from '../render/scenery.ts';
import { createSpriteSheet } from '../render/spriteSheet.ts';
import { createTerrainLayer } from '../render/terrainLayer.ts';
import { PRESENTATION_FPS, type Scene, type SceneContext } from './scene.ts';

/**
 * Debug scene `stylesheet` (step 0.4): the style reference of epoch 0 (ADR-004). A small camp
 * by a river, put together by hand from the game's sprites — every type of ground with its
 * transitions, the forest, a glade, the camp, two people. Everything else is drawn to match it.
 *
 *   ?scene=stylesheet            the whole picture at the largest whole scale that fits
 *   &zoom=2 | &zoom=4            a fixed scale; if the picture does not fit, the camp is centred
 *   &frame=N                     a fixed moment (screenshots); &ui=0 — no caption
 *
 * Nothing here is simulated: the woman's walk to the river is a presentation loop.
 */

/** The map, 30×18 tiles: g grass, d dirt, s sand, w shallow water, D deep water. */
export const MAP = [
  'gggggggggggggggggsswDDDwgggggg',
  'gggggggggggggggggswwDDwwgggggg',
  'ggggggggggggggggsswDDDwggggggg',
  'gggggggggggggggsswDDDwwggggggg',
  'gggggggggggggggsswDDDwgggggggg',
  'gggggggggggggggswwDDwwgggggggg',
  'ggggggggggggggsswDDDwwgggggggg',
  'ggggggggdddddgsswDDDwwgggggggg',
  'gggggggdddddddsswDDDwwgggggggg',
  'gggggggddddddddswwDDwwgggggggg',
  'ggggggggdddddggsswDDDwgggggggg',
  'gggggggggggggggsswDDDwwggggggg',
  'ggggggggggggggggsswDDDwggggggg',
  'gggggggggggggggggswwDDwwgggggg',
  'gggggggggggggggggsswDDDwgggggg',
  'ggggggggggggggggggsswDDDwggggg',
  'gggggggggggggggggggswwDDwwgggg',
  'gggggggggggggggggggsswDDDwgggg',
];
export const GROUND: Record<string, string> = {
  g: 'grass',
  d: 'dirt',
  s: 'sand',
  w: 'shallow_water',
  D: 'deep_water',
};
const WIDTH = MAP[0]!.length * TILE_SIZE;
const HEIGHT = MAP.length * TILE_SIZE;
/** Where the ×4 close-up looks when the picture does not fit: the campfire. */
const FOCUS = { x: 168, y: 140 };

/** Everything that stands still. Trees get different phases so they do not sway in step. */
export const STILL: Placement[] = [
  // Forest in the north-west.
  { sprite: 'tree', x: 26, y: 46, phase: 0 },
  { sprite: 'tree', x: 70, y: 34, phase: 900 },
  { sprite: 'birch', x: 106, y: 44, phase: 300 },
  { sprite: 'tree', x: 44, y: 92, phase: 1500 },
  { sprite: 'tree_young', x: 88, y: 80, phase: 600 },
  { sprite: 'birch', x: 12, y: 128, phase: 1200 },
  { sprite: 'tree', x: 150, y: 40, phase: 400 },
  { sprite: 'tree_young', x: 196, y: 56, phase: 1100 },
  { sprite: 'stump', x: 126, y: 94 },
  { sprite: 'branches', x: 146, y: 102 },
  // Berry bushes at the edge of the forest.
  { sprite: 'berry_bush', x: 58, y: 150, animation: 'ripe' },
  { sprite: 'berry_bush', x: 82, y: 166, animation: 'ripe' },
  { sprite: 'berry_bush', x: 42, y: 178, animation: 'empty' },
  { sprite: 'berry_bush', x: 92, y: 198, animation: 'ripe' },
  // The south-west.
  { sprite: 'tree', x: 30, y: 240, phase: 700 },
  { sprite: 'tree_young', x: 14, y: 196, phase: 200 },
  { sprite: 'birch', x: 62, y: 286, phase: 1700 },
  { sprite: 'tree', x: 112, y: 286, phase: 1300 },
  { sprite: 'tree_young', x: 170, y: 282, phase: 500 },
  { sprite: 'tree', x: 262, y: 232, phase: 1600 },
  { sprite: 'berry_bush', x: 214, y: 262, animation: 'empty' },
  { sprite: 'tree_young', x: 232, y: 44, phase: 900 },
  // The camp.
  { sprite: 'lean_to', x: 128, y: 130 },
  { sprite: 'bed', x: 98, y: 136 },
  { sprite: 'branch_pile', x: 198, y: 136 },
  { sprite: 'campfire', x: 168, y: 154, animation: 'burning' },
  // The river banks.
  { sprite: 'stone', x: 238, y: 104 },
  { sprite: 'stone', x: 318, y: 282 },
  { sprite: 'stone', x: 382, y: 120 },
  // The far bank.
  { sprite: 'tree', x: 430, y: 50, phase: 200 },
  { sprite: 'tree_young', x: 470, y: 98, phase: 800 },
  { sprite: 'birch', x: 420, y: 156, phase: 1400 },
  { sprite: 'tree', x: 462, y: 206, phase: 1000 },
  { sprite: 'tree_young', x: 402, y: 236, phase: 300 },
  { sprite: 'birch', x: 452, y: 286, phase: 600 },
  { sprite: 'berry_bush', x: 432, y: 258, animation: 'ripe' },
  // Flowers and tall grass on the glades.
  { sprite: 'flowers', x: 206, y: 222 },
  { sprite: 'flowers', x: 150, y: 214 },
  { sprite: 'flowers', x: 60, y: 118 },
  { sprite: 'flowers', x: 436, y: 214 },
  { sprite: 'flowers', x: 246, y: 30 },
  { sprite: 'grass_tuft', x: 226, y: 182, phase: 300 },
  { sprite: 'grass_tuft', x: 120, y: 232, phase: 900 },
  { sprite: 'grass_tuft', x: 182, y: 96, phase: 0 },
  { sprite: 'grass_tuft', x: 410, y: 40, phase: 500 },
  { sprite: 'grass_tuft', x: 446, y: 122, phase: 1200 },
  { sprite: 'grass_tuft', x: 20, y: 62, phase: 700 },
  { sprite: 'grass_tuft', x: 250, y: 250, phase: 200 },
];

export const MAN: Placement = { sprite: 'man', x: 148, y: 152, animation: 'idle_e' };
export const MAN_THINKS: Placement = { sprite: 'bubble_food', x: 151, y: 131, over: true };
/** The woman: dark hair, tanned skin — the palette swaps of the same sprite. */
const WOMAN_LOOK = { skin_light: 'skin_tan', hair_brown: 'hair_black' } as const;

/** The woman's errand, ms: to the river (thirsty) — drinks — back — rests by the fire. */
const ERRAND = { go: 1500, drink: 2000, back: 1500, rest: 2000 };
export const ERRAND_MS = ERRAND.go + ERRAND.drink + ERRAND.back + ERRAND.rest;
const CAMP_X = 192;
const RIVER_X = 252;
const PATH_Y = 158;

/** Where the woman is and what she does at presentation time `timeMs`. */
export function womanAt(timeMs: number): Placement[] {
  const t = ((timeMs % ERRAND_MS) + ERRAND_MS) % ERRAND_MS;
  const base = { sprite: 'woman', swap: WOMAN_LOOK, y: PATH_Y } as const;
  if (t < ERRAND.go) {
    const x = Math.round(CAMP_X + ((RIVER_X - CAMP_X) * t) / ERRAND.go);
    return [
      { ...base, x, animation: 'walk_e' },
      { sprite: 'bubble_water', x: x + 3, y: PATH_Y - 21, over: true },
    ];
  }
  if (t < ERRAND.go + ERRAND.drink) return [{ ...base, x: RIVER_X, animation: 'idle_e' }];
  const back = t - ERRAND.go - ERRAND.drink;
  if (back < ERRAND.back) {
    const x = Math.round(RIVER_X - ((RIVER_X - CAMP_X) * back) / ERRAND.back);
    return [{ ...base, x, animation: 'walk_w' }];
  }
  return [{ ...base, x: CAMP_X, animation: 'idle_w' }];
}

export function createStylesheetScene({ canvas, ui, params }: SceneContext): Scene {
  const screen = canvas.getContext('2d')!;
  const sheet = createSpriteSheet(SPRITES, PALETTE);
  const art = prepareTerrain(TERRAIN_LOOKS, SPRITES, PALETTE);
  const ground = createTerrainLayer(
    art,
    terrainGrid(MAP.map((row) => [...row].map((c) => GROUND[c]!))),
    MAP[0]!.length,
    MAP.length,
  );
  const buffer = document.createElement('canvas');
  buffer.width = WIDTH;
  buffer.height = HEIGHT;
  const ctx = buffer.getContext('2d')!;
  const scenery = createScenery(sheet, WIDTH, HEIGHT);
  const background = toHex(PALETTE.ramps.get('ui')![0]!);

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let caption: HTMLElement | null = null;

  return {
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      const fits = Math.max(1, Math.min(4, Math.floor(Math.min(width / WIDTH, height / HEIGHT))));
      scale = params.zoom ?? fits;
      // Centre the picture; if it is larger than the window, centre the camp instead.
      const centre = (screenSize: number, worldSize: number, focus: number) =>
        worldSize * scale <= screenSize
          ? Math.floor((screenSize - worldSize * scale) / 2)
          : Math.round(
              Math.min(0, Math.max(screenSize - worldSize * scale, screenSize / 2 - focus * scale)),
            );
      offsetX = centre(width, WIDTH, FOCUS.x);
      offsetY = centre(height, HEIGHT, FOCUS.y);
      if (params.ui) {
        caption ??= ui.appendChild(document.createElement('div'));
        caption.className = 'scene-caption';
        caption.textContent = `Лист стиля · эпоха 0 · стоянка у реки · ×${scale}`;
      }
    },
    render(frame) {
      const timeMs = (frame * 1000) / PRESENTATION_FPS;
      scenery.draw(
        ctx,
        ground.canvasAt(timeMs),
        [...STILL, MAN, MAN_THINKS, ...womanAt(timeMs)],
        timeMs,
      );
      screen.imageSmoothingEnabled = false;
      screen.fillStyle = background;
      screen.fillRect(0, 0, canvas.width, canvas.height);
      screen.drawImage(buffer, offsetX, offsetY, WIDTH * scale, HEIGHT * scale);
    },
  };
}
