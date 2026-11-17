import { PALETTE } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { prepareTerrain, TERRAIN_LOOKS, terrainGrid } from '../art/terrain.ts';
import { createScenery, type Placement } from '../render/scenery.ts';
import { createSpriteSheet } from '../render/spriteSheet.ts';
import { createTerrainLayer } from '../render/terrainLayer.ts';
import { PRESENTATION_FPS, type Scene, type SceneContext } from './scene.ts';
import { createTitleMenu } from './titleMenu.ts';

/**
 * Title screen: two people at a campfire at night, drawn with the game's sprites (step 0.4).
 * The picture is small (VIEW_W×VIEW_H) and scaled up by a whole factor to cover the window, so
 * pixels stay square and crisp. Night is a light filter over the picture: everything is dimmed
 * to blue, and around the fire lies a warm circle of light in stepped rings — pixel-art
 * lighting (GDD §10.1: «ночью — круги тёплого света»). The flames are their own light and are
 * drawn after the filter. Real day and night of the world arrive in stage 1 (1.5, 1.9).
 *
 * Over the picture — the menu (./titleMenu.ts, step 0.7): continue the saved world, start a new
 * one, load one from a file. `ui=0` hides all of it: the picture alone.
 */
const VIEW_W = 240;
const VIEW_H = 135;

/** The clearing, 15×9 tiles: g grass, d dirt. */
const MAP = [
  'ggggggggggggggg',
  'ggggggggggggggg',
  'ggggggggggggggg',
  'gggggdddddggggg',
  'ggggdddddddgggg',
  'ggggdddddddgggg',
  'gggggdddddggggg',
  'ggggggggggggggg',
  'ggggggggggggggg',
];
const FIRE = { x: 120, y: 98 };

const STILL: Placement[] = [
  // The edge of the forest around the clearing.
  { sprite: 'tree', x: 18, y: 40, phase: 0 },
  { sprite: 'tree', x: 52, y: 26, phase: 800 },
  { sprite: 'birch', x: 84, y: 30, phase: 300 },
  { sprite: 'tree', x: 150, y: 22, phase: 1200 },
  { sprite: 'tree_young', x: 178, y: 36, phase: 500 },
  { sprite: 'tree', x: 212, y: 38, phase: 1700 },
  { sprite: 'birch', x: 236, y: 70, phase: 900 },
  { sprite: 'tree', x: 10, y: 96, phase: 400 },
  { sprite: 'tree_young', x: 226, y: 120, phase: 1400 },
  { sprite: 'tree', x: 26, y: 146, phase: 600 },
  { sprite: 'birch', x: 196, y: 148, phase: 200 },
  { sprite: 'berry_bush', x: 44, y: 116, animation: 'ripe' },
  { sprite: 'berry_bush', x: 204, y: 98, animation: 'empty' },
  { sprite: 'grass_tuft', x: 64, y: 128 },
  { sprite: 'grass_tuft', x: 176, y: 128, phase: 600 },
  // The camp.
  { sprite: 'lean_to', x: 88, y: 82 },
  { sprite: 'branch_pile', x: 152, y: 86 },
  { sprite: 'bed', x: 142, y: 120 },
  { sprite: 'man', x: 103, y: 100, animation: 'idle_e' },
  {
    sprite: 'woman',
    x: 137,
    y: 100,
    animation: 'idle_w',
    swap: { skin_light: 'skin_tan', hair_brown: 'hair_black' },
    phase: 500,
  },
];
const FLAMES: Placement = { sprite: 'campfire', x: FIRE.x, y: FIRE.y, animation: 'burning' };

/** Night: every colour is multiplied by this (dim and blue). */
const NIGHT = [0.26, 0.31, 0.52] as const;
/** Firelight at full strength (warm, a little brighter than day). */
const FIRELIGHT = [1.18, 0.98, 0.74] as const;
/** Radius of the light around the fire, px, and how much it flickers. */
const LIGHT_RADIUS = 62;
const FLICKER = 4;
/** Light comes in this many stepped rings — pixel-art lighting, no smooth gradient. */
const LIGHT_STEPS = 4;

/** Cheap deterministic hash → [0, 1). Presentation only; the simulation has its own RNG. */
function hash(a: number, b = 0): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Strength of the firelight 0…1 at a pixel, in LIGHT_STEPS steps. */
export function firelight(x: number, y: number, radius: number): number {
  const dx = x + 0.5 - FIRE.x;
  // The light lies on the ground: the circle is squashed in depth (¾ view).
  const dy = (y + 0.5 - (FIRE.y - 6)) * 1.5;
  const near = 1 - Math.sqrt(dx * dx + dy * dy) / radius;
  return near <= 0 ? 0 : Math.ceil(near * LIGHT_STEPS) / LIGHT_STEPS;
}

export function createTitleScene({ canvas, ui, params }: SceneContext): Scene {
  const screen = canvas.getContext('2d')!;
  const buffer = document.createElement('canvas');
  buffer.width = VIEW_W;
  buffer.height = VIEW_H;
  const ctx = buffer.getContext('2d', { willReadFrequently: true })!;
  const sheet = createSpriteSheet(SPRITES, PALETTE);
  const ground = createTerrainLayer(
    prepareTerrain(TERRAIN_LOOKS, SPRITES, PALETTE),
    terrainGrid(MAP.map((row) => [...row].map((c) => (c === 'd' ? 'dirt' : 'grass')))),
    MAP[0]!.length,
    MAP.length,
  );
  ground.composeAll();
  const scenery = createScenery(sheet, VIEW_W, MAP.length * TILE_SIZE);
  const sparkColours = ['fire.3', 'fire.2', 'fire.1'].map((name) => {
    const [ramp, shade] = name.split('.');
    const [r, g, b] = PALETTE.ramps.get(ramp!)![Number(shade)]!;
    return `rgb(${r},${g},${b})`;
  });

  if (params.ui) {
    ui.innerHTML = `
      <div class="title-screen">
        <div class="title">
          <h1>ПЕРВЫЙ КОСТЁР</h1>
          <p>симулятор эволюции цивилизации</p>
        </div>
      </div>
      <div class="build">v${__APP_VERSION__}</div>`;
    createTitleMenu(ui.querySelector<HTMLElement>('.title-screen')!, params);
  }

  /** Multiply the picture by the night and the firelight. */
  function light(frame: number) {
    const radius = LIGHT_RADIUS + Math.floor(hash(Math.floor(frame / 2), 3) * FLICKER);
    const image = ctx.getImageData(0, 0, VIEW_W, VIEW_H);
    const px = image.data;
    for (let y = 0; y < VIEW_H; y++) {
      for (let x = 0; x < VIEW_W; x++) {
        const level = firelight(x, y, radius);
        const at = (y * VIEW_W + x) * 4;
        for (let c = 0; c < 3; c++) {
          const gain = NIGHT[c]! + (FIRELIGHT[c]! - NIGHT[c]!) * level;
          px[at + c] = px[at + c]! * gain;
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  /** Sparks rising from the fire — after the filter: they glow. */
  function sparks(frame: number) {
    for (let i = 0; i < 7; i++) {
      const life = (frame + i * 13) % 40;
      if (life >= 30) continue;
      const cycle = Math.floor((frame + i * 13) / 40);
      const x = FIRE.x + Math.round((hash(i, cycle) - 0.5) * 10 + Math.sin(life / 4 + i) * 1.5);
      const y = FIRE.y - 14 - Math.floor(life * 0.9);
      ctx.fillStyle = sparkColours[Math.min(2, Math.floor(life / 10))]!;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  return {
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      // Cover the window with a whole-number scale; overflow is cropped evenly.
      scale = Math.max(1, Math.ceil(Math.max(width / VIEW_W, height / VIEW_H)));
      offsetX = Math.floor((width - VIEW_W * scale) / 2);
      offsetY = Math.floor((height - VIEW_H * scale) / 2);
    },
    render(frame) {
      const timeMs = (frame * 1000) / PRESENTATION_FPS;
      scenery.draw(ctx, ground.canvasAt(timeMs), STILL, timeMs);
      light(frame);
      // The fire is its own light: drawn after the night filter, with its shadowless stones.
      sheet.draw(ctx, FLAMES.sprite, FLAMES.x, FLAMES.y, { animation: 'burning', timeMs });
      sparks(frame);
      screen.imageSmoothingEnabled = false;
      screen.drawImage(buffer, offsetX, offsetY, VIEW_W * scale, VIEW_H * scale);
    },
  };
}
