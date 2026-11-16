import { createClockScene } from './clockScene.ts';
import type { SceneFactory } from './scene.ts';
import { createTitleScene } from './titleScene.ts';

/**
 * Registry of scenes reachable through ?scene=<name>.
 * Every new screen of the game (world, sprite gallery, debug sandboxes) is added here,
 * which automatically makes it available to the screenshot tool.
 */
export const SCENES: Record<string, SceneFactory> = {
  title: createTitleScene,
  /** Debug: simulation core — calendar, sky by time of day, speed, event journal (step 0.2). */
  clock: createClockScene,
};

export const DEFAULT_SCENE = 'title';
