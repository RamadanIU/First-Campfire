import type { LaunchParams } from './params.ts';

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
  /** Called when the window size changes. */
  resize(width: number, height: number): void;
}

export interface SceneContext {
  canvas: HTMLCanvasElement;
  ui: HTMLElement;
  params: LaunchParams;
}

export type SceneFactory = (context: SceneContext) => Scene;
