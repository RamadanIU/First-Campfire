import { PALETTE, toHex } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { prepareTerrain, TERRAIN_LOOKS } from '../art/terrain.ts';
import { DATA } from '../data/index.ts';
import { drawPicture, pixelScale, screenToWorld, ZOOMS } from '../render/camera.ts';
import {
  drawChosen,
  drawNeeds,
  drawPath,
  drawRefused,
  NEED_BARS_HEIGHT,
} from '../render/debugOverlay.ts';
import { drawFireflies } from '../render/fireflies.ts';
import { daylightAt, hazeAt, shadeRect } from '../render/lighting.ts';
import { createMapRenderer } from '../render/mapRenderer.ts';
import { drawPlaceMark, drawSelection, PLACE_MARK_MS } from '../render/selection.ts';
import { createSpriteSheet } from '../render/spriteSheet.ts';
import type { VillagerPose } from '../render/villagers.ts';
import { TIME } from '../sim/calendar.ts';
import { findCampSite } from '../sim/mapgen.ts';
import type { Tile } from '../sim/path.ts';
import { findVillager, orderWalk } from '../sim/villagers.ts';
import { stepWorld, type World } from '../sim/world.ts';
import { DEBUG, deathNote, needsLine, villagerName } from '../ui/texts.ts';
import { bindCameraInput, type CameraControl, createCameraControl } from './cameraControl.ts';
import { bindSpeedKeys } from './controls.ts';
import { createGameLoop, type GameLoop } from './loop.ts';
import { PRESENTATION_FPS, type Scene, type SceneContext } from './scene.ts';

/** The name of a resource for the words of the panel (data/resources.json). */
const resourceName = (id: string): string => DATA.resources.get(id).name;

/**
 * The view of a running world: its map (src/render/mapRenderer.ts, step 1.1) seen through the
 * observer's camera (./cameraControl.ts, src/render/camera.ts, step 1.2) — dragged by the mouse
 * or a finger, zoomed by the wheel, a pinch or +/− (the zoom glides between the steps), moved by
 * WASD / arrows; four zoom steps ×0.5…×4, never beyond the edges of the map.
 *
 *   `cam=x,y` — where the camera looks (tiles, may be fractional; by default — the camp site,
 *   src/sim/mapgen.ts `findCampSite`, where life will happen); `zoom=` — the step (by default
 *   ×2 «улица», ADR-022).
 *
 * Only what is in sight is drawn: the part of the world under the camera, one canvas pixel per
 * world pixel, then put on the screen at the zoom's scale. The world runs in a fixed-step game
 * loop (./loop.ts); Space — pause, 1–4 — speed. Villagers move smoothly between ticks
 * (loop.alpha); a frozen frame (`frame=`) shows them exactly at the tick of `ticks=`.
 *
 * The light of the time of day (step 1.5, src/render/lighting.ts) lies over the drawn world — rosy
 * dawn, day as drawn, golden dusk, blue night (`light=0` — always as drawn); fireflies glow over it
 * at night, bubbles of sleep float over the sleepers.
 *
 *   `debug=1` (step 1.3) — paths of the villagers are drawn as lines; a click on a villager
 *   chooses it, a click on a tile sends the chosen one there (the first by default). A refused
 *   order is marked with a red cross for a moment; the panel of the world says why.
 *   `debug=needs` (step 1.4) — besides, bars of satiety, thirst and health over every head, and
 *   for the panel a line per villager: what it is doing, its scales; the dead — of what they died.
 */
export interface MapView {
  scene: Scene;
  loop: GameLoop;
  camera: CameraControl;
  /** The chosen villager (its id; it may have died since), or null — none (step 1.6). */
  selected(): number | null;
  /** Choose a villager (null — none); `select=` in the address chooses one at the start. */
  select(id: number | null): void;
  /** Fly the camera to a tile and mark the place for a few seconds (a click on the event feed). */
  flyToTile(tile: Tile): void;
  /** Fly the camera to a living villager; false — there is no such villager any more. */
  flyToVillager(id: number): boolean;
  /** Debug mode: what the last click did, for the panel (null — debug is off). */
  debugNote(): string | null;
  /** `debug=needs`: a line per villager for the panel — doing what, how fed (null — off). */
  needsNotes(): string[] | null;
}

/** How long a refused order stays marked, ms of presentation time. */
const REFUSED_MS = 2500;

/** What the view tells automated checks about its camera (`window.__fc.camera`). */
export interface CameraInfo {
  /** Zoom step (while a zoom glides — the step it comes to). */
  readonly zoom: number;
  /** Device pixels per world pixel as drawn now (fractional while a zoom glides). */
  readonly scale: number;
  /** Is a zoom gliding between steps now? */
  readonly zooming: boolean;
  /** Is the camera flying to a point now (step 1.6)? */
  readonly flying: boolean;
  /** Where the camera stands (the world point in the middle of the screen at rest), world px. */
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
  const frozen = params.frame !== null;
  /** Where between the last two ticks the world is drawn (frozen — exactly at the tick). */
  const tickAlpha = () => (frozen ? 1 : loop.alpha);

  // Debug: the chosen villager, the last refused order, what the last click did.
  const debug = params.debug.length > 0;
  const needsMode = params.debug.includes('needs');
  /** The chosen villager; with debug the first one by default (the one a click sends). */
  let selected: number | null = params.select ?? (debug ? 1 : null);
  /** The villager a debug click sends: the chosen one, else the first. */
  const chosenId = () => selected ?? 1;
  /** The place the camera last flew to, marked for a while (presentation time, ms). */
  let placeMark: { tile: Tile; sinceMs: number | null } | null = null;
  let refused: { tile: Tile; untilMs: number } | null = null;
  /** What the last click did; null — no click yet (then the panel tells how to click). */
  let note: string | null = null;
  const defaultNote = () => {
    const villager = findVillager(world, chosenId());
    const order = villager?.action.kind === 'walk' && villager.action.purpose === 'order';
    const goal = order && villager?.action.kind === 'walk' ? villager.action.goal : null;
    return goal
      ? `${DEBUG.goes(describe(chosenId()), goal.x, goal.y)} · ${DEBUG.howToShort}`
      : DEBUG.howTo;
  };
  let nowMs = 0;
  const describe = (id: number) => villagerName(findVillager(world, id)?.sex, id);
  /** The villager whose sprite is under world point (x, y), the front one first. */
  const villagerAt = (x: number, y: number): VillagerPose | undefined =>
    renderer
      .villagers(tickAlpha())
      .reverse()
      .find((pose) => {
        const entry = sheet.entry(pose.sprite);
        const left = pose.x - entry.anchor.x;
        const top = pose.y - entry.anchor.y;
        return x >= left && x < left + entry.width && y >= top && y < top + entry.height;
      });
  /** Where villager `id` is drawn now (undefined — it is not: dead). */
  const poseOf = (id: number, alpha: number): VillagerPose | undefined =>
    renderer.villagers(alpha).find((pose) => pose.id === id);
  /** The box of a villager's sprite as drawn, world pixels. */
  const boxOf = (pose: VillagerPose) => {
    const entry = sheet.entry(pose.sprite);
    return {
      x: pose.x - entry.anchor.x,
      y: pose.y - entry.anchor.y,
      width: entry.width,
      height: entry.height,
    };
  };
  // A click on a villager chooses it (step 1.6); on the map — with debug sends the chosen one
  // there (step 1.3), without — lets the choice go.
  const onTap = (x: number, y: number) => {
    const point = screenToWorld(camera.layout, x, y);
    const hit = villagerAt(point.x, point.y);
    if (hit) {
      selected = hit.id;
      if (debug) note = DEBUG.chosen(findVillager(world, hit.id)?.sex, hit.id);
      return;
    }
    if (!debug) {
      selected = null;
      return;
    }
    const tile = { x: Math.floor(point.x / TILE_SIZE), y: Math.floor(point.y / TILE_SIZE) };
    const villager = findVillager(world, chosenId());
    if (
      !villager ||
      tile.x < 0 ||
      tile.y < 0 ||
      tile.x >= world.map.width ||
      tile.y >= world.map.height
    )
      return;
    const result = orderWalk(world, villager, tile);
    if (result.ok) {
      refused = null;
      note = DEBUG.goesSteps(describe(chosenId()), tile.x, tile.y, result.path.length);
    } else {
      refused = { tile, untilMs: nowMs + REFUSED_MS };
      note = DEBUG.refused(tile.x, tile.y, DEBUG.why[result.reason]);
    }
  };
  bindCameraInput(canvas, window, camera, onTap);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') selected = null;
  });

  /** Paths of the walking villagers, the chosen one's arrow, a refused order. */
  const drawDebug = (
    ctx: CanvasRenderingContext2D,
    view: { x: number; y: number; width: number; height: number },
  ) => {
    const poses = renderer.villagers(tickAlpha());
    const people = poses.map((pose) => {
      const entry = sheet.entry(pose.sprite);
      // Down to the dark edge under the feet point, where a path starts.
      return {
        x: pose.x - entry.anchor.x,
        y: pose.y - entry.anchor.y,
        width: entry.width,
        height: entry.height + 2,
      };
    });
    for (const pose of poses) {
      const villager = findVillager(world, pose.id);
      if (villager?.action.kind !== 'walk') continue;
      // The step under way, then the tiles still ahead.
      const ahead =
        villager.toX !== villager.x || villager.toY !== villager.y
          ? [{ x: villager.toX, y: villager.toY }, ...villager.action.path]
          : villager.action.path;
      drawPath(ctx, view, pose, ahead, villager.action.goal, people);
    }
    if (needsMode) {
      for (const pose of poses) {
        const villager = findVillager(world, pose.id);
        if (!villager) continue;
        const top = pose.y - sheet.entry(pose.sprite).anchor.y;
        drawNeeds(ctx, view, pose.x, top, { ...villager.needs, health: villager.health });
      }
    }
    const mark = poses.find((pose) => pose.id === chosenId());
    if (mark) {
      // Over the bars of needs, if they are shown.
      const top =
        mark.y - sheet.entry(mark.sprite).anchor.y - (needsMode ? NEED_BARS_HEIGHT + 1 : 0);
      drawChosen(ctx, view, mark.x, top);
    }
    if (refused && nowMs < refused.untilMs) drawRefused(ctx, view, refused.tile);
  };

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
    get zooming() {
      return camera.zooming;
    },
    get flying() {
      return camera.flying;
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
      nowMs = timeMs;
      const { layout } = camera;
      if (layout.view.width > 0 && layout.view.height > 0) {
        const alpha = tickAlpha();
        renderer.draw(ctx, timeMs, layout.view, alpha);
        // The light of the moment shown (between the last two ticks), over world pixels: crisp at
        // every zoom. Fireflies and signs shine over it, the debug overlay stays readable.
        if (params.light) {
          const shown = Math.max(0, world.tick - 1 + alpha);
          const time = shown % TIME.ticksPerDay;
          const { width, height } = layout.view;
          shadeRect(ctx, width, height, daylightAt(time), [], hazeAt(time));
        }
        drawFireflies(ctx, layout.view, world.fireflies.swarm, alpha);
        renderer.drawSigns(ctx, timeMs, layout.view, alpha);
        if (placeMark) {
          // The mark counts from the first frame drawn after the flight was asked for.
          placeMark.sinceMs ??= timeMs;
          const age = timeMs - placeMark.sinceMs;
          if (age >= PLACE_MARK_MS) placeMark = null;
          else drawPlaceMark(ctx, layout.view, placeMark.tile, age);
        }
        // The chosen one: a frame (debug marks it with its own arrow).
        const chosen = !debug && selected !== null ? poseOf(selected, alpha) : undefined;
        if (chosen) drawSelection(ctx, layout.view, boxOf(chosen), timeMs);
        if (debug) drawDebug(ctx, layout.view);
      }
      screen.fillStyle = background;
      screen.fillRect(0, 0, canvas.width, canvas.height);
      drawPicture(screen, buffer, layout);
    },
  };
  const needsNotes = (): string[] => {
    const lines = world.villagers.list.map((villager) => needsLine(villager, resourceName));
    for (const event of world.events.list) {
      if (event.type !== 'villager_died') continue;
      const day = Math.floor(event.tick / TIME.ticksPerDay) + 1;
      lines.push(
        `${villagerName(event.sex, event.villager)}: ${deathNote(event.sex, day, event.reason)}`,
      );
    }
    return lines;
  };
  const flyToTile = (tile: Tile) => {
    camera.flyTo({ x: (tile.x + 0.5) * TILE_SIZE, y: (tile.y + 0.5) * TILE_SIZE });
    placeMark = { tile, sinceMs: null };
  };
  return {
    scene,
    loop,
    camera,
    selected: () => selected,
    select(id) {
      selected = id;
    },
    flyToTile,
    flyToVillager(id) {
      const villager = findVillager(world, id);
      if (!villager) return false;
      camera.flyTo({ x: (villager.toX + 0.5) * TILE_SIZE, y: (villager.toY + 0.5) * TILE_SIZE });
      return true;
    },
    debugNote: () => (debug ? (note ?? defaultNote()) : null),
    needsNotes: () => (needsMode ? needsNotes() : null),
  };
}
