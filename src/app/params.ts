import { isSpeed, type Speed } from './loop.ts';

/**
 * Launch parameters read from the page URL (?seed=42&scene=clock&ticks=3000&speed=5&frame=10&ui=0).
 * Scene-specific ones: `sprite=` (the gallery shows one sprite large), `zoom=` (whole-number scale
 * of pictures of the world, e.g. the style sheet).
 * They make every screen reproducible: the screenshot tool and bug reports
 * use the same URL to get the same picture.
 */
export interface LaunchParams {
  /** World seed. One seed — one history. */
  seed: number;
  /** Which scene to open. Scenes are registered in src/app/scenes.ts. */
  scene: string;
  /** If set, render exactly this animation frame and stop (deterministic screenshots). */
  frame: number | null;
  /** Show the DOM interface layer. */
  ui: boolean;
  /** Fast-forward the world to this tick before the first frame. */
  ticks: number;
  /** Initial game speed: 0 (pause), 1, 2, 5 or 20. */
  speed: Speed;
  /** Gallery: show this one sprite large (by name) instead of all sprites. */
  sprite: string | null;
  /** Scale of the world on screen: 1, 2, 3 or 4 (GDD §10.1); null — the scene picks one that fits. */
  zoom: number | null;
}

export const DEFAULT_PARAMS: LaunchParams = {
  seed: 1,
  scene: 'title',
  frame: null,
  ui: true,
  ticks: 0,
  speed: 1,
  sprite: null,
  zoom: null,
};

/** Whole-number scales of the world picture (GDD §10.1: ×1 city, ×2 street, ×4 portrait). */
export const ZOOMS = [1, 2, 3, 4] as const;

function parseInteger(raw: string | null, min: number): number | null {
  if (raw === null || !/^-?\d+$/.test(raw.trim())) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= min ? value : null;
}

function parseSpeed(raw: string | null): Speed | null {
  const value = parseInteger(raw, 0);
  return value !== null && isSpeed(value) ? value : null;
}

function parseZoom(raw: string | null): number | null {
  const value = parseInteger(raw, 1);
  return value !== null && (ZOOMS as readonly number[]).includes(value) ? value : null;
}

export function parseParams(search: string): LaunchParams {
  const query = new URLSearchParams(search);
  const scene = query.get('scene')?.trim();
  const sprite = query.get('sprite')?.trim();
  return {
    seed: parseInteger(query.get('seed'), 0) ?? DEFAULT_PARAMS.seed,
    scene: scene ? scene : DEFAULT_PARAMS.scene,
    frame: parseInteger(query.get('frame'), 0),
    ui: query.get('ui') !== '0',
    ticks: parseInteger(query.get('ticks'), 0) ?? DEFAULT_PARAMS.ticks,
    speed: parseSpeed(query.get('speed')) ?? DEFAULT_PARAMS.speed,
    sprite: sprite ? sprite : DEFAULT_PARAMS.sprite,
    zoom: parseZoom(query.get('zoom')),
  };
}
