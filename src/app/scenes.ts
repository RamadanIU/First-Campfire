import { createClockScene } from './clockScene.ts';
import { createGalleryScene } from './galleryScene.ts';
import type { SceneFactory } from './scene.ts';
import { createStylesheetScene } from './stylesheetScene.ts';
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
  /** Debug: every sprite large and at natural size; &sprite=<name> — one sprite in detail (step 0.3). */
  gallery: createGalleryScene,
  /** Debug: the style reference — a camp by a river made of the sprites of epoch 0 (step 0.4). */
  stylesheet: createStylesheetScene,
};

export const DEFAULT_SCENE = 'title';
