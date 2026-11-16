import type { SceneFactory } from './scene.ts';
import { createTitleScene } from './titleScene.ts';

/**
 * Registry of scenes reachable through ?scene=<name>.
 * Every new screen of the game (world, sprite gallery, debug sandboxes) is added here,
 * which automatically makes it available to the screenshot tool.
 */
export const SCENES: Record<string, SceneFactory> = {
  title: createTitleScene,
};

export const DEFAULT_SCENE = 'title';
