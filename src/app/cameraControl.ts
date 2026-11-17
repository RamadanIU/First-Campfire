/**
 * Control of the camera (step 1.2): the mouse drags the map and its wheel zooms; fingers drag
 * and pinch; WASD / arrows move the view, +/− zoom (GDD §1.3: the observer's camera).
 *
 *   - Dragging moves the picture with the pointer one to one: the world point under it stays
 *     under it. Let go while moving — the picture glides on and slows down.
 *   - Held keys speed the view up to a steady pace and let it slow down when released: the
 *     movement is smooth and does not depend on the frame rate.
 *   - Zoom switches steps at once (src/render/camera.ts): the point under the cursor (under the
 *     fingers; the middle of the screen for keys) stays where it was.
 *   - The view never leaves the map.
 *   - A tap — a press and release that moved less than `TAP_SLOP` — does not move the map: it is a
 *     click on the world (step 1.3: the debug order «go there»; step 1.6 — choosing a villager).
 *
 * What a key, a wheel turn or a gesture means and how the view moves are functions without the
 * browser (tested in Node); `bindCameraInput` connects them to the page's events.
 */
import {
  type Camera,
  type CameraLayout,
  cameraLayout,
  clampCamera,
  fitZoom,
  moveCamera,
  type ScreenSize,
  type WorldSize,
  type Zoom,
  zoomCameraAt,
  zoomStep,
} from '../render/camera.ts';

/** Speed of the view moved by keys, CSS pixels of the screen per second (at any zoom). */
export const KEY_PAN_SPEED = 720;
/** How fast held keys reach their speed: time constant, ms. */
const KEY_ACCELERATION_MS = 60;
/** How fast the view slows down after keys or a drag let go: time constant, ms. */
const GLIDE_MS = 180;
/** Below this speed (CSS px/s) the view stops. */
const STOP_SPEED = 8;
/** The fastest glide after a drag, CSS px/s. */
const MAX_GLIDE_SPEED = 4000;
/** Longest frame the motion accounts for, ms: a background tab must not throw the view away. */
const MAX_STEP_MS = 100;

/** Wheel: how much scrolling (CSS px) makes one zoom step. */
export const WHEEL_STEP_PX = 40;
/** Wheel: after a step, scrolling is ignored this long, ms — a touchpad swipe is one step. */
export const WHEEL_QUIET_MS = 120;
/** Wheel: scrolling older than this is forgotten, ms. */
const WHEEL_FORGET_MS = 400;
/** Wheel events counted in lines (deltaMode 1) and pages (2): CSS pixels per unit. */
const WHEEL_LINE_PX = 20;
const WHEEL_PAGE_PX = 400;

/** Pinch: the fingers part (or close) this many times — one zoom step. */
export const PINCH_STEP = 1.4;
/**
 * A pointer that moved less than this from where it was pressed (CSS px) is a tap, not a drag:
 * the map does not move until the pointer goes farther (then it catches up at once).
 */
export const TAP_SLOP = 6;
/** Drag: the pointer's speed at release is measured over this much of its way, ms. */
const RELEASE_WINDOW_MS = 100;
/** Drag: a pointer that stood still this long before release does not throw the view. */
const RELEASE_STILL_MS = 60;

export interface CameraControl {
  /** The camera now (inside the edges of the map). */
  readonly camera: Camera;
  /** Where the world is drawn now. */
  readonly layout: CameraLayout;
  readonly screen: ScreenSize;
  /** The screen changed (device pixels). The first call picks the zoom if none was asked for. */
  resize(screen: ScreenSize): void;
  /** Smooth motion for `elapsedMs` of real time: held keys, a glide after a drag. */
  update(elapsedMs: number): void;
  /** The picture follows the pointer by (`dx`, `dy`) device pixels; a glide stops. */
  drag(dx: number, dy: number): void;
  /** The pointer let go moving at (`vx`, `vy`) device px/s: the picture glides on, slowing down. */
  release(vx: number, vy: number): void;
  /**
   * `by` steps closer (positive) or farther (negative); the world point under `at` (device
   * pixels; the middle of the screen if not given) stays under it.
   */
  zoomBy(by: number, at?: { x: number; y: number }): void;
  /** Keys held: the direction the view moves, −1…1 on each axis (0, 0 — none). */
  hold(direction: { x: number; y: number }): void;
}

/**
 * A camera for a world of `world` pixels, looking at `focus` (world pixels) at `zoom` (null — the
 * closest step at which the whole world fits, chosen at the first `resize`).
 */
export function createCameraControl(
  world: WorldSize,
  focus: { x: number; y: number },
  zoom: Zoom | null,
): CameraControl {
  let screen: ScreenSize = { width: 1, height: 1, pixelRatio: 1 };
  let camera: Camera = { x: focus.x, y: focus.y, zoom: zoom ?? 1 };
  let sized = false;
  let layout = cameraLayout(camera, screen, world);
  /** Velocity of the view, device px of the screen per second. */
  let vx = 0;
  let vy = 0;
  let held = { x: 0, y: 0 };

  const place = (next: Camera) => {
    camera = clampCamera(next, screen, world);
    layout = cameraLayout(camera, screen, world);
  };

  return {
    get camera() {
      return camera;
    },
    get layout() {
      return layout;
    },
    get screen() {
      return screen;
    },
    resize(next) {
      screen = next;
      if (!sized && zoom === null) camera = { ...camera, zoom: fitZoom(screen, world) };
      sized = true;
      place(camera);
    },
    update(elapsedMs) {
      const ms = Math.min(Math.max(elapsedMs, 0), MAX_STEP_MS);
      if (ms === 0) return;
      const holding = held.x !== 0 || held.y !== 0;
      if (!holding && vx === 0 && vy === 0) return;
      const ratio = screen.pixelRatio;
      let targetX = 0;
      let targetY = 0;
      if (holding) {
        const length = Math.hypot(held.x, held.y);
        targetX = (held.x / length) * KEY_PAN_SPEED * ratio;
        targetY = (held.y / length) * KEY_PAN_SPEED * ratio;
      }
      const ease = 1 - Math.exp(-ms / (holding ? KEY_ACCELERATION_MS : GLIDE_MS));
      vx += (targetX - vx) * ease;
      vy += (targetY - vy) * ease;
      if (!holding && Math.hypot(vx, vy) < STOP_SPEED * ratio) {
        vx = 0;
        vy = 0;
        return;
      }
      const dx = (vx * ms) / 1000;
      const dy = (vy * ms) / 1000;
      const before = camera;
      place(moveCamera(camera, dx, dy, screen, world));
      // An edge stops the movement along it (no speed piles up against the edge).
      const scale = layout.scale;
      if (Math.abs(camera.x - before.x - dx / scale) > 1e-6) vx = 0;
      if (Math.abs(camera.y - before.y - dy / scale) > 1e-6) vy = 0;
    },
    drag(dx, dy) {
      vx = 0;
      vy = 0;
      if (dx !== 0 || dy !== 0) place(moveCamera(camera, -dx, -dy, screen, world));
    },
    release(pointerVx, pointerVy) {
      const most = MAX_GLIDE_SPEED * screen.pixelRatio;
      const speed = Math.hypot(pointerVx, pointerVy);
      const cut = speed > most ? most / speed : 1;
      vx = -pointerVx * cut;
      vy = -pointerVy * cut;
    },
    zoomBy(by, at) {
      const next = zoomStep(camera.zoom, by);
      if (next === camera.zoom) return;
      const point = at ?? { x: screen.width / 2, y: screen.height / 2 };
      place(zoomCameraAt(camera, next, point, screen, world));
    },
    hold(direction) {
      held = { x: Math.sign(direction.x), y: Math.sign(direction.y) };
    },
  };
}

/** What a key does to the camera. */
export type CameraKey = { kind: 'move'; x: number; y: number } | { kind: 'zoom'; by: number };

/** Keys by KeyboardEvent.code: the place on the keyboard, so WASD works in any layout. */
const MOVE_KEYS: Readonly<Record<string, { x: number; y: number }>> = {
  KeyW: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 },
  KeyS: { x: 0, y: 1 },
  KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowRight: { x: 1, y: 0 },
};
const ZOOM_KEYS: Readonly<Record<string, number>> = {
  Equal: 1,
  NumpadAdd: 1,
  Minus: -1,
  NumpadSubtract: -1,
};

/**
 * What key `code` (KeyboardEvent.code; `key` — KeyboardEvent.key, for «+» and «−» on keyboards
 * where they sit elsewhere) does to the camera, or null.
 */
export function cameraKey(code: string, key = ''): CameraKey | null {
  const move = MOVE_KEYS[code];
  if (move) return { kind: 'move', ...move };
  const by = ZOOM_KEYS[code] ?? (key === '+' ? 1 : key === '-' || key === '−' ? -1 : undefined);
  return by === undefined ? null : { kind: 'zoom', by };
}

/** Direction of the view from the keys held (codes): −1…1 on each axis; opposite keys cancel. */
export function heldDirection(codes: Iterable<string>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const code of new Set(codes)) {
    const move = MOVE_KEYS[code];
    if (move) {
      x += move.x;
      y += move.y;
    }
  }
  return { x: Math.sign(x), y: Math.sign(y) };
}

/** Wheel scrolling in CSS pixels, whatever unit the event counts in (WheelEvent.deltaMode). */
export function wheelPixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * WHEEL_LINE_PX;
  if (deltaMode === 2) return delta * WHEEL_PAGE_PX;
  return delta;
}

/**
 * Wheel → zoom steps. A mouse notch (≈ 100 px) is one step; a touchpad sends many small scrolls
 * — they add up to a step, and after a step the rest of the swipe is ignored for a moment, so
 * one swipe does not fly through every step. Scrolling up (negative) — closer.
 * Returns a function: (scroll in CSS px, time ms) → steps to take: 1, −1 or 0.
 */
export function createWheelZoom(): (deltaPx: number, timeMs: number) => number {
  let sum = 0;
  let last = Number.NEGATIVE_INFINITY;
  let quietUntil = Number.NEGATIVE_INFINITY;
  return (deltaPx, timeMs) => {
    if (timeMs - last > WHEEL_FORGET_MS || Math.sign(deltaPx) !== Math.sign(sum)) sum = 0;
    last = timeMs;
    if (timeMs < quietUntil) return 0;
    sum += deltaPx;
    if (Math.abs(sum) < WHEEL_STEP_PX) return 0;
    const by = sum < 0 ? 1 : -1;
    sum = 0;
    quietUntil = timeMs + WHEEL_QUIET_MS;
    return by;
  };
}

/** What pointers (mouse, fingers, pen) ask of the camera — or of the world (a tap). */
export type GestureCommand =
  | { kind: 'drag'; dx: number; dy: number }
  | { kind: 'zoom'; by: number; x: number; y: number }
  | { kind: 'release'; vx: number; vy: number }
  /** A press and release in one place (device pixels): a click on the world. */
  | { kind: 'tap'; x: number; y: number };

export interface Gestures {
  /** Pointers on the screen now. */
  readonly count: number;
  has(id: number): boolean;
  down(id: number, x: number, y: number, timeMs: number): GestureCommand[];
  move(id: number, x: number, y: number, timeMs: number): GestureCommand[];
  up(id: number, timeMs: number): GestureCommand[];
}

/**
 * Pointers → camera commands (positions in device pixels, time in ms).
 *   - One pointer drags the picture. On release, its speed over the last 100 ms throws the
 *     picture on (none if it stood still before release).
 *   - A lone pointer that never went farther than `slop()` device pixels from where it was
 *     pressed is a tap: the picture does not move, the release says where it was. Once it goes
 *     farther, the picture catches up with the whole way at once (the point under it stays).
 *   - Two pointers (fingers): their midpoint drags, and when the distance between them grows
 *     (shrinks) `PINCH_STEP` times, the picture zooms a step in (out) at the midpoint.
 *   - Taking a pointer down or lifting one of several never throws the picture.
 */
export function createGestures(options: { slop?: () => number } = {}): Gestures {
  const slop = options.slop ?? (() => TAP_SLOP);
  const pointers = new Map<number, { x: number; y: number }>();
  /** Where a lone pointer was pressed while it may still be a tap; null — it is not. */
  let pressed: { x: number; y: number } | null = null;
  /** Recent positions of a lone pointer, for its speed at release. */
  let trail: { x: number; y: number; t: number }[] = [];
  /** Distance between two pointers at the last zoom step (or when the second came). */
  let pinchFrom = 0;

  const pair = () => {
    const [a, b] = [...pointers.values()];
    return {
      x: (a!.x + b!.x) / 2,
      y: (a!.y + b!.y) / 2,
      distance: Math.hypot(a!.x - b!.x, a!.y - b!.y),
    };
  };
  const restart = (timeMs: number) => {
    trail = [];
    if (pointers.size === 1) {
      const [only] = [...pointers.values()];
      trail = [{ ...only!, t: timeMs }];
    }
    if (pointers.size >= 2) pinchFrom = pair().distance;
  };

  return {
    get count() {
      return pointers.size;
    },
    has(id) {
      return pointers.has(id);
    },
    down(id, x, y, timeMs) {
      pointers.set(id, { x, y });
      // Only a gesture that starts with one pointer and never gets a second may be a tap.
      pressed = pointers.size === 1 ? { x, y } : null;
      restart(timeMs);
      // A touch stops a glide.
      return [{ kind: 'drag', dx: 0, dy: 0 }];
    },
    move(id, x, y, timeMs) {
      const pointer = pointers.get(id);
      if (!pointer) return [];
      if (pointers.size === 1) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        pointer.x = x;
        pointer.y = y;
        trail.push({ x, y, t: timeMs });
        while (trail.length > 2 && timeMs - trail[0]!.t > RELEASE_WINDOW_MS) trail.shift();
        if (pressed) {
          if (Math.hypot(x - pressed.x, y - pressed.y) <= slop()) return [];
          // Not a tap after all: the picture catches up with the whole way from the press.
          const from = pressed;
          pressed = null;
          return [{ kind: 'drag', dx: x - from.x, dy: y - from.y }];
        }
        return dx === 0 && dy === 0 ? [] : [{ kind: 'drag', dx, dy }];
      }
      const before = pair();
      pointer.x = x;
      pointer.y = y;
      const after = pair();
      const commands: GestureCommand[] = [];
      if (after.x !== before.x || after.y !== before.y)
        commands.push({ kind: 'drag', dx: after.x - before.x, dy: after.y - before.y });
      if (pinchFrom > 0) {
        const ratio = after.distance / pinchFrom;
        const by = ratio >= PINCH_STEP ? 1 : ratio <= 1 / PINCH_STEP ? -1 : 0;
        if (by !== 0) {
          commands.push({ kind: 'zoom', by, x: after.x, y: after.y });
          pinchFrom = after.distance;
        }
      } else {
        pinchFrom = after.distance;
      }
      return commands;
    },
    up(id, timeMs) {
      if (!pointers.delete(id)) return [];
      if (pointers.size > 0) {
        pressed = null;
        restart(timeMs);
        return [];
      }
      if (pressed) {
        const tap = pressed;
        pressed = null;
        trail = [];
        return [
          { kind: 'release', vx: 0, vy: 0 },
          { kind: 'tap', x: tap.x, y: tap.y },
        ];
      }
      const last = trail.at(-1);
      const first = trail.find(
        (point) => last !== undefined && last.t - point.t <= RELEASE_WINDOW_MS,
      );
      trail = [];
      if (!last || !first || timeMs - last.t > RELEASE_STILL_MS || last.t - first.t < 8)
        return [{ kind: 'release', vx: 0, vy: 0 }];
      const seconds = (last.t - first.t) / 1000;
      return [
        { kind: 'release', vx: (last.x - first.x) / seconds, vy: (last.y - first.y) / seconds },
      ];
    },
  };
}

/** Is the keyboard busy typing (a text field has focus)? Then keys are not the camera's. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Connect the camera to the page: pointers and the wheel over `canvas`, keys on `target`.
 * `onTap` hears taps (a click without dragging) at a point of the canvas, device pixels.
 * Returns a function that disconnects.
 */
export function bindCameraInput(
  canvas: HTMLCanvasElement,
  target: Window,
  control: CameraControl,
  onTap?: (x: number, y: number) => void,
): () => void {
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  const gestures = createGestures({ slop: () => TAP_SLOP * control.screen.pixelRatio });
  const wheel = createWheelZoom();
  const keys = new Set<string>();

  /** A point of the page (CSS px) on the canvas, device pixels. */
  const onCanvas = (event: { clientX: number; clientY: number }) => {
    const box = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * (canvas.width / Math.max(1, box.width)),
      y: (event.clientY - box.top) * (canvas.height / Math.max(1, box.height)),
    };
  };
  const run = (commands: GestureCommand[]) => {
    for (const command of commands) {
      if (command.kind === 'drag') control.drag(command.dx, command.dy);
      else if (command.kind === 'zoom') control.zoomBy(command.by, command);
      else if (command.kind === 'release') control.release(command.vx, command.vy);
      else onTap?.(command.x, command.y);
    }
  };

  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const at = onCanvas(event);
    run(gestures.down(event.pointerId, at.x, at.y, event.timeStamp));
    canvas.style.cursor = 'grabbing';
  };
  const onMove = (event: PointerEvent) => {
    if (!gestures.has(event.pointerId)) return;
    const at = onCanvas(event);
    run(gestures.move(event.pointerId, at.x, at.y, event.timeStamp));
  };
  const onUp = (event: PointerEvent) => {
    if (!gestures.has(event.pointerId)) return;
    run(gestures.up(event.pointerId, event.timeStamp));
    if (gestures.count === 0) canvas.style.cursor = 'grab';
  };
  const onWheel = (event: WheelEvent) => {
    // Also a touchpad pinch (the browser sends it as a wheel with Ctrl): not the page's zoom.
    event.preventDefault();
    const by = wheel(wheelPixels(event.deltaY, event.deltaMode), event.timeStamp);
    if (by !== 0) control.zoomBy(by, onCanvas(event));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
    const command = cameraKey(event.code, event.key);
    if (!command) return;
    event.preventDefault();
    if (command.kind === 'move') {
      keys.add(event.code);
      control.hold(heldDirection(keys));
    } else if (!event.repeat) {
      control.zoomBy(command.by);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (keys.delete(event.code)) control.hold(heldDirection(keys));
  };
  const onBlur = () => {
    keys.clear();
    control.hold({ x: 0, y: 0 });
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
  };
}
