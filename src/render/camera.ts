/**
 * The camera of the world view (step 1.2): where the observer looks and how close (GDD §1.3,
 * §10.1). Pure arithmetic without the browser: which part of the world is on screen, screen ↔
 * world, keeping inside the edges of the map, zooming to the point under the cursor.
 *
 * Units: the screen is in device pixels — the canvas is as large as the physical screen, so a
 * fractional devicePixelRatio (Windows 125 %) does not stretch it into pixels of different
 * widths; the world is in world pixels (a tile is 16).
 *
 * Zoom steps (GDD §10.1): ×0.5 «край», ×1 «город», ×2 «улица», ×4 «портрет». A step becomes a
 * whole number of device pixels per world pixel or, at ×0.5, every second world pixel — so the
 * picture stays crisp at every step. Steps switch at once; only movement is smooth.
 *
 * The camera is a state of the drawing, never of the world: it is not saved and does not change
 * history (docs/ARCHITECTURE.md, rule 1).
 */
import type { PixelRect } from './mapRenderer.ts';

/** Zoom steps, from the farthest to the closest (GDD §10.1). */
export const ZOOMS = [0.5, 1, 2, 4] as const;
export type Zoom = (typeof ZOOMS)[number];

export interface Camera {
  /** The world point in the middle of the screen, world pixels (fractional while moving). */
  x: number;
  y: number;
  zoom: Zoom;
}

/** The screen: its size in device pixels and how many device pixels make a CSS pixel. */
export interface ScreenSize {
  width: number;
  height: number;
  pixelRatio: number;
}

/** Size of the world, world pixels. */
export interface WorldSize {
  width: number;
  height: number;
}

/** Where the picture of the world lies on the screen. */
export interface CameraLayout {
  /** Device pixels per world pixel: 0.5 (every second world pixel) or a whole number. */
  scale: number;
  /** Screen position of the world's top-left corner, whole device pixels (often negative). */
  offsetX: number;
  offsetY: number;
  /** The part of the world in sight, world pixels; at scale 0.5 its corner is even. */
  view: PixelRect;
}

export function isZoom(value: number): value is Zoom {
  return (ZOOMS as readonly number[]).includes(value);
}

/**
 * Device pixels per world pixel at zoom `zoom`. The step is counted in CSS pixels and rounded to
 * a whole number of device pixels: a whole devicePixelRatio (2 — retina) doubles it, a fractional
 * one (1.25, 1.5) is rounded (1.25 → ×1, 1.5 → ×2) — pixels of one width are worth more than
 * the exact size. ×0.5 on an ordinary screen is every second world pixel.
 */
export function pixelScale(zoom: Zoom, pixelRatio: number): number {
  const device = Math.max(1, Math.round(pixelRatio));
  const scale = zoom * device;
  return scale < 1 ? 0.5 : Math.floor(scale);
}

/** The step `by` steps closer (positive) or farther (negative) than `zoom`, within the steps. */
export function zoomStep(zoom: Zoom, by: number): Zoom {
  const index = ZOOMS.indexOf(zoom) + by;
  return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, index))]!;
}

/**
 * The zoom a view opens with when none is asked for: the closest of ×1, ×2, ×4 at which the
 * whole world fits on the screen; ×1 if even it does not fit (then a part is seen — ×0.5 is the
 * observer's choice, too far to see people).
 */
export function fitZoom(screen: ScreenSize, world: WorldSize): Zoom {
  let best: Zoom = 1;
  for (const zoom of ZOOMS) {
    if (zoom < 1) continue;
    const scale = pixelScale(zoom, screen.pixelRatio);
    if (world.width * scale <= screen.width && world.height * scale <= screen.height) best = zoom;
  }
  return best;
}

/** One axis of `clampCamera`: centred if the world fits, otherwise no strip beyond its edges. */
function clampAxis(at: number, screen: number, world: number, scale: number): number {
  const half = screen / 2 / scale;
  if (world <= 2 * half) return world / 2;
  return Math.min(world - half, Math.max(half, at));
}

/**
 * The camera kept inside the world: where the world is larger than the screen the view never
 * goes beyond its edge; where it is smaller (the whole map at ×0.5) it stays in the middle.
 */
export function clampCamera(camera: Camera, screen: ScreenSize, world: WorldSize): Camera {
  const scale = pixelScale(camera.zoom, screen.pixelRatio);
  return {
    x: clampAxis(camera.x, screen.width, world.width, scale),
    y: clampAxis(camera.y, screen.height, world.height, scale),
    zoom: camera.zoom,
  };
}

/** Where the world is drawn for `camera` (kept inside the edges first). */
export function cameraLayout(camera: Camera, screen: ScreenSize, world: WorldSize): CameraLayout {
  const { x, y, zoom } = clampCamera(camera, screen, world);
  const scale = pixelScale(zoom, screen.pixelRatio);
  // Whole device pixels: at scale ≥ 1 every world pixel lands on whole pixels; at 0.5 the
  // corner of the view is an even world pixel (below), so the same world pixels are shown
  // wherever the camera stands — the picture does not shimmer while it moves.
  const offsetX = Math.round(screen.width / 2 - x * scale);
  const offsetY = Math.round(screen.height / 2 - y * scale);
  const left = Math.max(0, Math.floor(-offsetX / scale));
  const top = Math.max(0, Math.floor(-offsetY / scale));
  const right = Math.min(world.width, Math.ceil((screen.width - offsetX) / scale));
  const bottom = Math.min(world.height, Math.ceil((screen.height - offsetY) / scale));
  return {
    scale,
    offsetX,
    offsetY,
    view: {
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    },
  };
}

/** The world point (world pixels) under screen point (`x`, `y`) (device pixels). */
export function screenToWorld(layout: CameraLayout, x: number, y: number) {
  return { x: (x - layout.offsetX) / layout.scale, y: (y - layout.offsetY) / layout.scale };
}

/** The screen point (device pixels) of world point (`x`, `y`) (world pixels). */
export function worldToScreen(layout: CameraLayout, x: number, y: number) {
  return { x: layout.offsetX + x * layout.scale, y: layout.offsetY + y * layout.scale };
}

/**
 * The camera moved by (`dx`, `dy`) device pixels of the screen (positive — the view goes right
 * and down, the picture left and up), kept inside the edges. Dragging the picture by the pointer
 * is a move by minus the pointer's way: the world point under it stays under it.
 */
export function moveCamera(
  camera: Camera,
  dx: number,
  dy: number,
  screen: ScreenSize,
  world: WorldSize,
): Camera {
  const from = clampCamera(camera, screen, world);
  const scale = pixelScale(from.zoom, screen.pixelRatio);
  return clampCamera(
    { x: from.x + dx / scale, y: from.y + dy / scale, zoom: from.zoom },
    screen,
    world,
  );
}

/**
 * The camera at zoom `zoom` with the world point under screen point `at` (device pixels) still
 * under it — to half a screen pixel — unless the edges of the world do not let it (zooming out
 * by an edge): then the camera keeps inside the edges.
 */
export function zoomCameraAt(
  camera: Camera,
  zoom: Zoom,
  at: { x: number; y: number },
  screen: ScreenSize,
  world: WorldSize,
): Camera {
  // The point as it is drawn now (after rounding), not as the fractional centre says.
  const point = screenToWorld(cameraLayout(camera, screen, world), at.x, at.y);
  const scale = pixelScale(zoom, screen.pixelRatio);
  return clampCamera(
    {
      x: point.x + (screen.width / 2 - at.x) / scale,
      y: point.y + (screen.height / 2 - at.y) / scale,
      zoom,
    },
    screen,
    world,
  );
}

/**
 * Put a picture of the world drawn one canvas pixel per world pixel (`buffer`; its top-left
 * corner is world point (view.x, view.y)) on the screen at the layout's scale, without
 * smoothing. At scale 0.5 the source is shifted by half a pixel, so each screen pixel takes the
 * middle of one world pixel: an exact 2:1 shrink samples on the border between two, and a
 * browser may take either. So the buffer must be one pixel larger than the view.
 */
export function drawPicture(
  ctx: CanvasRenderingContext2D,
  buffer: CanvasImageSource,
  layout: CameraLayout,
): void {
  const { scale, offsetX, offsetY, view } = layout;
  if (view.width === 0 || view.height === 0) return;
  const shift = scale < 1 ? 0.5 : 0;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    buffer,
    shift,
    shift,
    view.width,
    view.height,
    offsetX + view.x * scale,
    offsetY + view.y * scale,
    view.width * scale,
    view.height * scale,
  );
}
