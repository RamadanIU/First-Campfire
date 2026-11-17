import { PALETTE, toHex } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { prepareTerrain, TERRAIN_LOOKS } from '../art/terrain.ts';
import { drawPicture, pixelScale, screenToWorld, ZOOMS } from '../render/camera.ts';
import { createMapRenderer } from '../render/mapRenderer.ts';
import { createSpriteSheet } from '../render/spriteSheet.ts';
import { TIME } from '../sim/calendar.ts';
import { findCampSite } from '../sim/mapgen.ts';
import { stepWorld, type World } from '../sim/world.ts';
import { bindCameraInput, type CameraControl, createCameraControl } from './cameraControl.ts';
import { bindSpeedKeys } from './controls.ts';
import { createGameLoop, type GameLoop } from './loop.ts';
import { PRESENTATION_FPS, type Scene, type SceneContext } from './scene.ts';

/**
 * The view of a running world: its map (src/render/mapRenderer.ts, step 1.1) seen through the
 * observer's camera (./cameraControl.ts, src/render/camera.ts, step 1.2) — dragged by the mouse
 * or a finger, zoomed by the wheel, a pinch or +/−, moved by WASD / arrows; four zoom steps
 * ×0.5…×4, never beyond the edges of the map.
 *
 *   `cam=x,y` — where the camera looks (tiles, may be fractional; by default — the camp site,
 *   src/sim/mapgen.ts `findCampSite`, where life will happen); `zoom=` — the step (by default the
 *   closest at which the whole map fits, at least ×1).
 *
 * Only what is in sight is drawn: the part of the world under the camera, one canvas pixel per
 * world pixel, then put on the screen at the zoom's scale. The world runs in a fixed-step game
 * loop (./loop.ts); Space — pause, 1–4 — speed.
 */
export interface MapView {
  scene: Scene;
  loop: GameLoop;
  camera: CameraControl;
}

/** What the view tells automated checks about its camera (`window.__fc.camera`). */
export interface CameraInfo {
  /** Zoom step and device pixels per world pixel. */
  readonly zoom: number;
  readonly scale: number;
  /** The world point in the middle of the screen, world pixels. */
  readonly x: number;
  readonly y: number;
  /** Size of the canvas, device pixels, and device pixels per CSS pixel. */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  /** Screen position of the world's top-left corner, device pixels. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** The part of the world in sight, world pixels. */
  readonly view: { x: number; y: number; width: number; height: number };
  /** The world point (world pixels) under a point of the page (CSS pixels). */
  worldAt(x: number, y: number): { x: number; y: number };
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
  const size = { width: renderer.width, height: renderer.height };
  const camp = findCampSite(world.map, world.objects);
  const focus = params.cam
    ? { x: params.cam.x * TILE_SIZE, y: params.cam.y * TILE_SIZE }
    : camp
      ? { x: (camp.x + 0.5) * TILE_SIZE, y: (camp.y + 0.5) * TILE_SIZE }
      : { x: size.width / 2, y: size.height / 2 };
  const camera = createCameraControl(size, focus, params.zoom);
  bindCameraInput(canvas, window, camera);

  // The part of the world in sight, drawn 1:1. One pixel larger than the view (src/render/
  // camera.ts, drawPicture); grows to the largest view of the screen and stays.
  const buffer = document.createElement('canvas');
  const ctx = buffer.getContext('2d')!;
  const background = toHex(PALETTE.ramps.get('ui')![0]!);

  const info: CameraInfo = {
    get zoom() {
      return camera.camera.zoom;
    },
    get scale() {
      return camera.layout.scale;
    },
    get x() {
      return camera.camera.x;
    },
    get y() {
      return camera.camera.y;
    },
    get width() {
      return camera.screen.width;
    },
    get height() {
      return camera.screen.height;
    },
    get pixelRatio() {
      return camera.screen.pixelRatio;
    },
    get offsetX() {
      return camera.layout.offsetX;
    },
    get offsetY() {
      return camera.layout.offsetY;
    },
    get view() {
      return { ...camera.layout.view };
    },
    worldAt(x, y) {
      const box = canvas.getBoundingClientRect();
      return screenToWorld(
        camera.layout,
        (x - box.left) * (canvas.width / Math.max(1, box.width)),
        (y - box.top) * (canvas.height / Math.max(1, box.height)),
      );
    },
  };
  window.__fc.camera = info;

  const scene: Scene = {
    update(elapsedMs) {
      camera.update(elapsedMs);
      loop.advance(elapsedMs);
    },
    resize(width, height, pixelRatio) {
      canvas.width = width;
      canvas.height = height;
      camera.resize({ width, height, pixelRatio });
      // The largest view this screen can have (at the farthest step): no reallocation later.
      const scale = pixelScale(ZOOMS[0], pixelRatio);
      const most = (screenSize: number, worldSize: number) =>
        Math.min(worldSize, Math.ceil(screenSize / scale) + 2) + 1;
      buffer.width = Math.max(buffer.width, most(width, size.width));
      buffer.height = Math.max(buffer.height, most(height, size.height));
    },
    render(frame) {
      const timeMs = (frame * 1000) / PRESENTATION_FPS;
      const { layout } = camera;
      if (layout.view.width > 0 && layout.view.height > 0) renderer.draw(ctx, timeMs, layout.view);
      screen.fillStyle = background;
      screen.fillRect(0, 0, canvas.width, canvas.height);
      drawPicture(screen, buffer, layout);
    },
  };
  return { scene, loop, camera };
}
