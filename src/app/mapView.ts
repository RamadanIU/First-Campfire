import { PALETTE, toHex } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { prepareTerrain, TERRAIN_LOOKS } from '../art/terrain.ts';
import { createMapRenderer, type PixelRect } from '../render/mapRenderer.ts';
import { createSpriteSheet } from '../render/spriteSheet.ts';
import { TIME } from '../sim/calendar.ts';
import { findCampSite } from '../sim/mapgen.ts';
import { stepWorld, type World } from '../sim/world.ts';
import { bindSpeedKeys } from './controls.ts';
import { createGameLoop, type GameLoop } from './loop.ts';
import { ZOOMS } from './params.ts';
import { PRESENTATION_FPS, type Scene, type SceneContext } from './scene.ts';

/**
 * The view of a running world (step 1.1): its map, drawn by src/render/mapRenderer.ts, still
 * camera (step 1.2 brings panning and zoom). The map is centred in the window at the largest
 * whole scale that fits (`zoom=` sets it: 1–4). A map larger than the window is shown around
 * the camp site (src/sim/mapgen.ts, `findCampSite`) — where life will happen — not its corner.
 *
 * The world runs in a fixed-step game loop (./loop.ts); Space — pause, 1–4 — speed.
 */
export interface MapView {
  scene: Scene;
  loop: GameLoop;
}

/** Where the picture of the world lies on the screen. */
export interface ViewFit {
  /** Whole-number scale. */
  scale: number;
  /** Screen position of the world's top-left corner (may be negative: the world is larger). */
  offsetX: number;
  offsetY: number;
  /** The part of the world that is on screen, world pixels. */
  view: PixelRect;
}

/**
 * Fit a world of `worldW`×`worldH` pixels into a screen: centred if it fits at `scale`,
 * otherwise centred on `focus` (world pixels) and pressed to the edges of the world, so no empty
 * strip shows beyond the map. Positions are whole pixels: the picture stays crisp.
 */
export function fitView(
  screenW: number,
  screenH: number,
  worldW: number,
  worldH: number,
  zoom: number | null,
  focus: { x: number; y: number },
): ViewFit {
  const largest = ZOOMS[ZOOMS.length - 1]!;
  const fits = Math.floor(Math.min(screenW / worldW, screenH / worldH));
  const scale = zoom ?? Math.max(1, Math.min(largest, fits));
  const place = (screen: number, world: number, at: number) =>
    world * scale <= screen
      ? Math.floor((screen - world * scale) / 2)
      : Math.round(Math.min(0, Math.max(screen - world * scale, screen / 2 - at * scale)));
  const offsetX = place(screenW, worldW, focus.x);
  const offsetY = place(screenH, worldH, focus.y);
  const left = Math.max(0, Math.floor(-offsetX / scale));
  const top = Math.max(0, Math.floor(-offsetY / scale));
  const right = Math.min(worldW, Math.ceil((screenW - offsetX) / scale));
  const bottom = Math.min(worldH, Math.ceil((screenH - offsetY) / scale));
  return {
    scale,
    offsetX,
    offsetY,
    view: { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) },
  };
}

export function createMapView({ canvas, params }: SceneContext, world: World): MapView {
  const screen = canvas.getContext('2d')!;
  const loop = createGameLoop(() => stepWorld(world), {
    ticksPerSecond: TIME.ticksPerSecond,
    speed: params.speed,
  });
  bindSpeedKeys(loop, window);

  const sheet = createSpriteSheet(SPRITES, PALETTE);
  const art = prepareTerrain(TERRAIN_LOOKS, SPRITES, PALETTE);
  const renderer = createMapRenderer(sheet, art, world);
  renderer.prepare();
  const camp = findCampSite(world.map, world.objects);
  const focus = camp
    ? { x: (camp.x + 0.5) * TILE_SIZE, y: (camp.y + 0.5) * TILE_SIZE }
    : { x: renderer.width / 2, y: renderer.height / 2 };

  const buffer = document.createElement('canvas');
  const ctx = buffer.getContext('2d')!;
  const background = toHex(PALETTE.ramps.get('ui')![0]!);
  let fit = fitView(1, 1, renderer.width, renderer.height, params.zoom, focus);

  const scene: Scene = {
    update(elapsedMs) {
      loop.advance(elapsedMs);
    },
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      fit = fitView(width, height, renderer.width, renderer.height, params.zoom, focus);
      buffer.width = fit.view.width;
      buffer.height = fit.view.height;
    },
    render(frame) {
      const timeMs = (frame * 1000) / PRESENTATION_FPS;
      renderer.draw(ctx, timeMs, fit.view);
      const { scale, offsetX, offsetY, view } = fit;
      screen.imageSmoothingEnabled = false;
      screen.fillStyle = background;
      screen.fillRect(0, 0, canvas.width, canvas.height);
      screen.drawImage(
        buffer,
        offsetX + view.x * scale,
        offsetY + view.y * scale,
        view.width * scale,
        view.height * scale,
      );
    },
  };
  return { scene, loop };
}
