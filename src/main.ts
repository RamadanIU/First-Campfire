import { checkDataRefs } from './app/dataRefs.ts';
import { parseParams } from './app/params.ts';
import { PRESENTATION_FPS } from './app/scene.ts';
import { formatIssue } from './data/schema.ts';

/**
 * Hook for automated checks (tools/screenshot.ts, tools/e2e.ts): `ready` flips to true once the
 * requested frame is on screen, `errors` collects everything that went wrong, `world` — the
 * world the scene `world` runs (so checks need not read it off the screen).
 */
interface DebugHook {
  ready: boolean;
  scene: string;
  frame: number;
  errors: string[];
  world?: WorldInfo;
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

  const resize = () => scene.resize(window.innerWidth, window.innerHeight);
  resize();

  if (params.frame !== null) {
    // Frozen mode: one exact frame, for reproducible screenshots.
    const frozen = params.frame;
    window.addEventListener('resize', () => {
      resize();
      scene.render(frozen);
    });
    scene.render(frozen);
    hook.frame = frozen;
    hook.ready = true;
    return;
  }

  window.addEventListener('resize', resize);
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
