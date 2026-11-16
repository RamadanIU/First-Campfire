import type { LaunchParams } from './params.ts';

/**
 * A scene owns the whole screen: the game itself, the title, the sprite gallery,
 * debug sandboxes. Scenes are picked with ?scene=<name>, which is also how the
 * screenshot tool reaches every state of the game.
 */
export interface Scene {
  /** Draw animation frame `frame` (0, 1, 2…). Must be a pure function of `frame`. */
  render(frame: number): void;
  /** Called when the window size changes. */
  resize(width: number, height: number): void;
}

export interface SceneContext {
  canvas: HTMLCanvasElement;
  ui: HTMLElement;
  params: LaunchParams;
}

export type SceneFactory = (context: SceneContext) => Scene;
