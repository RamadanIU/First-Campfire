import { parseParams } from './app/params.ts';
import { PRESENTATION_FPS } from './app/scene.ts';
import { DEFAULT_SCENE, SCENES } from './app/scenes.ts';

/**
 * Hook for automated checks (tools/screenshot.ts): `ready` flips to true once the
 * requested frame is on screen, `errors` collects everything that went wrong.
 */
interface DebugHook {
  ready: boolean;
  scene: string;
  frame: number;
  errors: string[];
}

declare global {
  interface Window {
    __fc: DebugHook;
  }
}

function start() {
  const params = parseParams(window.location.search);
  const hook: DebugHook = { ready: false, scene: params.scene, frame: 0, errors: [] };
  window.__fc = hook;
  window.addEventListener('error', (event) => hook.errors.push(String(event.message)));
  window.addEventListener('unhandledrejection', (event) => hook.errors.push(String(event.reason)));

  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const ui = document.querySelector<HTMLElement>('#ui')!;
  const factory = SCENES[params.scene];
  if (!factory) {
    hook.errors.push(`Unknown scene "${params.scene}". Known: ${Object.keys(SCENES).join(', ')}`);
  }
  const scene = (factory ?? SCENES[DEFAULT_SCENE]!)({ canvas, ui, params });

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
    scene.render(hook.frame);
    hook.ready = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

start();
