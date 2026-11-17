import type { LaunchParams } from './params.ts';

/**
 * Presentation clock: `render(frame)` receives frame numbers counted at this rate
 * (frame 10 = one second after start). Animations convert it to time: frame × 1000 / rate ms.
 */
export const PRESENTATION_FPS = 10;

/**
 * A scene owns the whole screen: the game itself, the title, the sprite gallery,
 * debug sandboxes. Scenes are picked with ?scene=<name>, which is also how the
 * screenshot tool reaches every state of the game.
 */
export interface Scene {
  /**
   * Draw animation frame `frame` (0, 1, 2…). Must depend only on `frame` and the scene's own
   * state (e.g. its world), so that a URL with `frame=` always gives the same picture.
   */
  render(frame: number): void;
  /**
   * Account for `elapsedMs` of real time since the previous frame: scenes with a world run
   * their game loop here. Not called in frozen mode (`frame=`).
   */
  update?(elapsedMs: number): void;
  /**
   * Called when the window size changes. `width` × `height` — the canvas in device pixels (the
   * physical screen: a fractional devicePixelRatio, Windows 125 %, would otherwise stretch the
   * canvas into pixels of different widths); `pixelRatio` — device pixels per CSS pixel.
   */
  resize(width: number, height: number, pixelRatio: number): void;
}

export interface SceneContext {
  canvas: HTMLCanvasElement;
  ui: HTMLElement;
  params: LaunchParams;
}

export type SceneFactory = (context: SceneContext) => Scene;
