import { checkDataRefs } from './app/dataRefs.ts';
import type { CameraInfo } from './app/mapView.ts';
import { parseParams } from './app/params.ts';
import { PRESENTATION_FPS } from './app/scene.ts';
import { formatIssue } from './data/schema.ts';

/**
 * Hook for automated checks (tools/screenshot.ts, tools/e2e.ts): `ready` flips to true once the
 * requested frame is on screen, `errors` collects everything that went wrong, `world` — the
 * world the scene `world` runs, `camera` — its camera (so checks need not read them off the
 * screen).
 */
interface DebugHook {
  ready: boolean;
  scene: string;
  frame: number;
  errors: string[];
  world?: WorldInfo;
  camera?: CameraInfo;
  /**
   * How long drawing each of the last frames took, ms (live mode only, up to RENDER_SAMPLES):
   * `npm run shot -- --frame-time` reports it.
   */
  renderMs: number[];
  /** How long the very first live frame took, ms: it pays for setting up. */
  firstRenderMs: number | null;
}

/** How many of the last frames keep their drawing time in the hook. */
const RENDER_SAMPLES = 600;

/** What the scene `world` tells automated checks about its world. */
export interface WorldInfo {
  seed: number;
  tick: number;
  /** Fingerprint of the world state (src/sim/hash.ts) — computed on request, it is not free. */
  hash: () => string;
  /** Where the world came from: the autosave slot, the address, or new. */
  origin: 'saved' | 'url' | 'new';
  /** Tick of the last autosave; null — none. */
  savedTick: number | null;
  /**
   * The world as the scene opened it, before any tick ran: the world goes on at once, so a check
   * of «the same world after a reload» compares with this, not with the running one.
   */
  opened: { tick: number; hash: string };
  /** The villagers now (step 1.3): where they stand, step to, and where they are going. */
  villagers: () => VillagerInfo[];
}

/** A villager as automated checks see it. */
export interface VillagerInfo {
  id: number;
  sex: string;
  /** Tile it stands on and the tile of its current step. */
  x: number;
  y: number;
  toX: number;
  toY: number;
  action: string;
  /** Where it walks (null — it stands). */
  goal: { x: number; y: number } | null;
  walked: number;
}

declare global {
  interface Window {
    __fc: DebugHook;
  }
}

/** A problem that stops or spoils the start (a broken data table): shown over the page. */
function showProblem(ui: HTMLElement, title: string, text: string): void {
  const box = document.createElement('div');
  box.className = 'start-problem';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const details = document.createElement('pre');
  details.textContent = text;
  box.append(heading, details);
  ui.append(box);
}

async function start() {
  const params = parseParams(window.location.search);
  const hook: DebugHook = {
    ready: false,
    scene: params.scene,
    frame: 0,
    errors: [],
    renderMs: [],
    firstRenderMs: null,
  };
  window.__fc = hook;
  window.addEventListener('error', (event) => hook.errors.push(String(event.message)));
  window.addEventListener('unhandledrejection', (event) => hook.errors.push(String(event.reason)));

  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const ui = document.querySelector<HTMLElement>('#ui')!;

  // The game is loaded after the hook is in place: the data tables are checked when they load,
  // and a broken table must show up on the page (and in hook.errors), not as a blank screen.
  let game: [typeof import('./app/scenes.ts'), typeof import('./data/index.ts')];
  try {
    game = await Promise.all([import('./app/scenes.ts'), import('./data/index.ts')]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    hook.errors.push(message);
    showProblem(ui, 'Игра не запустилась', message);
    hook.ready = true;
    return;
  }
  const [{ DEFAULT_SCENE, SCENES }, { DATA }] = game;
  const brokenRefs = checkDataRefs(DATA).map(formatIssue);
  hook.errors.push(...brokenRefs);
  const factory = SCENES[params.scene];
  if (!factory) {
    hook.errors.push(`Unknown scene "${params.scene}". Known: ${Object.keys(SCENES).join(', ')}`);
  }
  const scene = (factory ?? SCENES[DEFAULT_SCENE]!)({ canvas, ui, params });
  // References from the tables to sprites and looks of the ground: a broken one is shown on top.
  if (brokenRefs.length > 0)
    showProblem(ui, 'Битые ссылки в таблицах данных', brokenRefs.join('\n'));

  // The canvas is as large as the physical screen (device pixels): with a fractional
  // devicePixelRatio (Windows 125 %) a canvas of CSS pixels would be stretched by the browser into
  // pixels of different widths. Scenes get the size in device pixels and pick whole scales of it.
  let shown = { width: 0, height: 0, pixelRatio: 0 };
  /** Resize the scene if the screen changed; true if it did (the canvas is cleared then). */
  const resize = (next: { width: number; height: number; pixelRatio: number }): boolean => {
    if (
      next.width === shown.width &&
      next.height === shown.height &&
      next.pixelRatio === shown.pixelRatio
    )
      return false;
    shown = next;
    scene.resize(next.width, next.height, next.pixelRatio);
    return true;
  };
  const measured = () => {
    const pixelRatio = window.devicePixelRatio || 1;
    return {
      width: Math.max(1, Math.round(window.innerWidth * pixelRatio)),
      height: Math.max(1, Math.round(window.innerHeight * pixelRatio)),
      pixelRatio,
    };
  };
  resize(measured());
  // The window size times the ratio may be off by a pixel of rounding: the browser knows the
  // canvas's exact size in device pixels, and tells when it or the ratio changes (window, browser
  // zoom, another monitor). Its answer is taken only if it agrees with the rounded one — under
  // an emulated ratio (Chromium in tests, `npm run shot -- --scale 1.25`) it reports CSS pixels.
  const observer = new ResizeObserver((entries) => {
    const rounded = measured();
    const box = entries[0]?.devicePixelContentBoxSize?.[0];
    const exact =
      box !== undefined &&
      Math.abs(box.inlineSize - rounded.width) <= 2 &&
      Math.abs(box.blockSize - rounded.height) <= 2;
    const next = exact
      ? { width: box.inlineSize, height: box.blockSize, pixelRatio: rounded.pixelRatio }
      : rounded;
    // Resizing clears the canvas: draw the frame again at once, before the screen shows it.
    if (resize(next)) scene.render(hook.frame);
  });
  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(canvas);
  }

  if (params.frame !== null) {
    // Frozen mode: one exact frame, for reproducible screenshots.
    hook.frame = params.frame;
    scene.render(params.frame);
    hook.ready = true;
    return;
  }

  const startedAt = performance.now();
  let previous: number | null = null;
  const loop = (now: number) => {
    // Real time since the previous frame drives the scene's simulation (fixed-step game loop).
    scene.update?.(previous === null ? 0 : now - previous);
    previous = now;
    hook.frame = Math.floor(((now - startedAt) / 1000) * PRESENTATION_FPS);
    const drawStart = performance.now();
    scene.render(hook.frame);
    const drawMs = performance.now() - drawStart;
    if (hook.firstRenderMs === null) hook.firstRenderMs = drawMs;
    else hook.renderMs.push(drawMs);
    if (hook.renderMs.length > RENDER_SAMPLES) hook.renderMs.shift();
    hook.ready = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void start();
