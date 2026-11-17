import { createClockScene } from './clockScene.ts';
import { createDataScene } from './dataScene.ts';
import { createGalleryScene } from './galleryScene.ts';
import { createPaletteScene } from './paletteScene.ts';
import type { SceneFactory } from './scene.ts';
import { createStylesheetScene } from './stylesheetScene.ts';
import { createTitleScene } from './titleScene.ts';
import { createWorldScene } from './worldScene.ts';

/**
 * Registry of scenes reachable through ?scene=<name>.
 * Every new screen of the game (world, sprite gallery, debug sandboxes) is added here,
 * which automatically makes it available to the screenshot tool.
 */
export const SCENES: Record<string, SceneFactory> = {
  /** Title screen with the menu: continue, new world, load from file (steps 0.4, 0.7). */
  title: createTitleScene,
  /** The player's world: from the autosave slot, saved once a year and on leaving (step 0.7). */
  world: createWorldScene,
  /** Debug: simulation core — calendar, sky by time of day, speed, event journal (step 0.2). */
  clock: createClockScene,
  /** Debug: every sprite large and at natural size; &sprite=<name> — one sprite in detail (step 0.3). */
  gallery: createGalleryScene,
  /** Debug: the master palette — ramps, colour names, usage; recolouring of people (step 0.4). */
  palette: createPaletteScene,
  /** Debug: the style reference — a camp by a river made of the sprites of epoch 0 (step 0.4). */
  stylesheet: createStylesheetScene,
  /** Debug: the data tables — resources with icons, types of ground, numbers of the balance (step 0.5). */
  data: createDataScene,
};

export const DEFAULT_SCENE = 'title';
