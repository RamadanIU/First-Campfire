import { PALETTE, toHex } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { prepareTerrain, TERRAIN_LOOKS } from '../art/terrain.ts';
import { drawPicture, pixelScale, screenToWorld, ZOOMS } from '../render/camera.ts';
import {
  drawChosen,
  drawNeeds,
  drawPath,
  drawRefused,
  NEED_BARS_HEIGHT,
} from '../render/debugOverlay.ts';
import { createMapRenderer } from '../render/mapRenderer.ts';
import { createSpriteSheet } from '../render/spriteSheet.ts';
import type { VillagerPose } from '../render/villagers.ts';
import { TIME } from '../sim/calendar.ts';
import { findCampSite } from '../sim/mapgen.ts';
import type { PathFailure, Tile } from '../sim/path.ts';
import { findVillager, orderWalk, type Villager } from '../sim/villagers.ts';
import { stepWorld, type World } from '../sim/world.ts';
import { bindCameraInput, type CameraControl, createCameraControl } from './cameraControl.ts';
import { bindSpeedKeys } from './controls.ts';
import { createGameLoop, type GameLoop } from './loop.ts';
import { PRESENTATION_FPS, type Scene, type SceneContext } from './scene.ts';

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
  /** Debug mode: what the last click did, for the panel (null — debug is off). */
  debugNote(): string | null;
  /** `debug=needs`: a line per villager for the panel — doing what, how fed (null — off). */
  needsNotes(): string[] | null;
}

/** How long a refused order stays marked, ms of presentation time. */
const REFUSED_MS = 2500;

const WHO = { male: 'мужчина', female: 'женщина' } as const;
const WALKS_TO = {
  wander: 'гуляет у стоянки',
  order: 'идёт, куда послали',
  eat: 'идёт к малине',
  drink: 'идёт к воде',
} as const;
const DIED_OF = { hunger: 'голод', thirst: 'жажда' } as const;

/** What a villager is doing, in words (`debug=needs`). */
export function doingOf(villager: Villager): string {
  const action = villager.action;
  switch (action.kind) {
    case 'idle':
      return 'отдыхает';
    case 'walk':
      return WALKS_TO[action.purpose];
    case 'eat':
      return 'ест ягоды';
    case 'drink':
      return 'пьёт';
    case 'sleep':
      return action.fainted ? 'лежит без сил' : 'спит';
  }
}

/** A line of the panel for a villager (`debug=needs`): doing what, its scales. */
export function needsLine(villager: Villager): string {
  const round = (value: number) => Math.round(value);
  return `${WHO[villager.sex]} (житель ${villager.id}): ${doingOf(villager)} · сытость ${round(villager.needs.food)} · жажда ${round(villager.needs.water)} · сон ${round(villager.needs.sleep)} · здоровье ${round(villager.health)}`;
}
const WHY: Record<PathFailure, string> = {
  blocked: 'туда нельзя встать — вода, дерево, куст или там другой житель',
  unreachable: 'туда не дойти — путь отрезан водой',
  too_far: 'слишком далеко — поиск пути сдался',
};

/** What the view tells automated checks about its camera (`window.__fc.camera`). */
export interface CameraInfo {
  /** Zoom step (while a zoom glides — the step it comes to). */
  readonly zoom: number;
  /** Device pixels per world pixel as drawn now (fractional while a zoom glides). */
  readonly scale: number;
  /** Is a zoom gliding between steps now? */
  readonly zooming: boolean;
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
  let chosen = 1;
  let refused: { tile: Tile; untilMs: number } | null = null;
  /** What the last click did; null — no click yet (then the panel tells how to click). */
  let note: string | null = null;
  const defaultNote = () => {
    const villager = findVillager(world, chosen);
    const order = villager?.action.kind === 'walk' && villager.action.purpose === 'order';
    const goal = order && villager?.action.kind === 'walk' ? villager.action.goal : null;
    return goal
      ? `${describe(chosen)} идёт к тайлу (${goal.x}, ${goal.y}) · щелчок по жителю — выбрать, по карте — отправить туда`
      : 'щелчок по жителю — выбрать, по карте — отправить его туда';
  };
  let nowMs = 0;
  const describe = (id: number) => {
    const villager = findVillager(world, id);
    return villager ? `${WHO[villager.sex]} (житель ${id})` : `житель ${id}`;
  };
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
  const onTap = (x: number, y: number) => {
    if (!debug) return;
    const point = screenToWorld(camera.layout, x, y);
    const hit = villagerAt(point.x, point.y);
    if (hit) {
      chosen = hit.id;
      note = `${findVillager(world, chosen)?.sex === 'female' ? 'выбрана' : 'выбран'} ${describe(chosen)}`;
      return;
    }
    const tile = { x: Math.floor(point.x / TILE_SIZE), y: Math.floor(point.y / TILE_SIZE) };
    const villager = findVillager(world, chosen);
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
      note = `${describe(chosen)} идёт к тайлу (${tile.x}, ${tile.y}): шагов ${result.path.length}`;
    } else {
      refused = { tile, untilMs: nowMs + REFUSED_MS };
      note = `тайл (${tile.x}, ${tile.y}): ${WHY[result.reason]}`;
    }
  };
  bindCameraInput(canvas, window, camera, onTap);

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
    const mark = poses.find((pose) => pose.id === chosen);
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
        renderer.draw(ctx, timeMs, layout.view, tickAlpha());
        if (debug) drawDebug(ctx, layout.view);
      }
      screen.fillStyle = background;
      screen.fillRect(0, 0, canvas.width, canvas.height);
      drawPicture(screen, buffer, layout);
    },
  };
  const needsNotes = (): string[] => {
    const lines = world.villagers.list.map(needsLine);
    for (const event of world.events.list) {
      if (event.type !== 'villager_died') continue;
      const day = Math.floor(event.tick / TIME.ticksPerDay) + 1;
      const died = event.sex === 'male' ? 'умер' : 'умерла';
      lines.push(
        `${WHO[event.sex]} (житель ${event.villager}): ${died} на ${day}-й день — ${DIED_OF[event.reason]}`,
      );
    }
    return lines;
  };
  return {
    scene,
    loop,
    camera,
    debugNote: () => (debug ? (note ?? defaultNote()) : null),
    needsNotes: () => (needsMode ? needsNotes() : null),
  };
}
