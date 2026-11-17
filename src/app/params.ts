import { isZoom, type Zoom } from '../render/camera.ts';
import { isSpeed, type Speed } from './loop.ts';

/**
 * Debug presets for the autosave slot (`slot=`), put there before the scene starts — so that
 * every state of the menu and of loading is reachable by URL (screenshots, checks):
 * - `world` — the world of `seed=` / `ticks=`, as if the player had played it;
 * - `broken` — a save cut short; `alien` — a file of another program; `newer` — a save of a
 *   newer version of the game;
 * - `empty` — no save (first start).
 */
export const SLOT_PRESETS = ['world', 'broken', 'alien', 'newer', 'empty'] as const;
export type SlotPreset = (typeof SLOT_PRESETS)[number];

/**
 * Launch parameters read from the page URL (?seed=42&scene=clock&ticks=3000&speed=5&frame=10&ui=0).
 * Scene-specific ones: `sprite=` (the gallery shows one sprite large), `zoom=` (zoom step of
 * pictures of the world: the camera of the world, the style sheet), `cam=` (where the camera of
 * the world looks), `slot=` (debug: a prepared autosave).
 * They make every screen reproducible: the screenshot tool and bug reports
 * use the same URL to get the same picture.
 */
export interface LaunchParams {
  /** World seed. One seed — one history. */
  seed: number;
  /** The address names a seed (`seed=`): «New world» on the title screen offers it. */
  seedGiven: boolean;
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
  /**
   * Zoom step of the world on screen: 0.5, 1, 2 or 4 (GDD §10.1, src/render/camera.ts); null —
   * the scene picks one that fits.
   */
  zoom: Zoom | null;
  /**
   * Where the camera of the world looks: the point in the middle of the screen, in tiles (may be
   * fractional: `cam=20.5,31`); null — the scene's own choice (the camp site).
   */
  cam: { x: number; y: number } | null;
  /** Debug: put this prepared save into the autosave slot before the scene starts. */
  slot: SlotPreset | null;
  /**
   * The world is given by the address (`seed=` or `ticks=`, without `slot=`): the world scene
   * shows exactly that world and neither reads nor writes the autosave.
   */
  worldFromUrl: boolean;
}

export const DEFAULT_PARAMS: LaunchParams = {
  seed: 1,
  seedGiven: false,
  scene: 'title',
  frame: null,
  ui: true,
  ticks: 0,
  speed: 1,
  sprite: null,
  zoom: null,
  cam: null,
  slot: null,
  worldFromUrl: false,
};

function parseInteger(raw: string | null, min: number): number | null {
  if (raw === null || !/^-?\d+$/.test(raw.trim())) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= min ? value : null;
}

function parseSpeed(raw: string | null): Speed | null {
  const value = parseInteger(raw, 0);
  return value !== null && isSpeed(value) ? value : null;
}

/** A plain decimal number (`12`, `0.5`, `-3.25`), or null. */
function parseDecimal(raw: string): number | null {
  const text = raw.trim();
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function parseZoom(raw: string | null): Zoom | null {
  const value = raw === null ? null : parseDecimal(raw);
  return value !== null && isZoom(value) ? value : null;
}

/** `x,y` — two numbers (tiles), or null. */
function parseCam(raw: string | null): { x: number; y: number } | null {
  const parts = raw?.split(',') ?? [];
  if (parts.length !== 2) return null;
  const [x, y] = parts.map(parseDecimal);
  return x == null || y == null ? null : { x, y };
}

function parseSlot(raw: string | null): SlotPreset | null {
  const value = raw?.trim() ?? '';
  return (SLOT_PRESETS as readonly string[]).includes(value) ? (value as SlotPreset) : null;
}

export function parseParams(search: string): LaunchParams {
  const query = new URLSearchParams(search);
  const scene = query.get('scene')?.trim();
  const sprite = query.get('sprite')?.trim();
  const seed = parseInteger(query.get('seed'), 0);
  const ticks = parseInteger(query.get('ticks'), 0);
  const slot = parseSlot(query.get('slot'));
  return {
    seed: seed ?? DEFAULT_PARAMS.seed,
    seedGiven: seed !== null,
    scene: scene ? scene : DEFAULT_PARAMS.scene,
    frame: parseInteger(query.get('frame'), 0),
    ui: query.get('ui') !== '0',
    ticks: ticks ?? DEFAULT_PARAMS.ticks,
    speed: parseSpeed(query.get('speed')) ?? DEFAULT_PARAMS.speed,
    sprite: sprite ? sprite : DEFAULT_PARAMS.sprite,
    zoom: parseZoom(query.get('zoom')),
    cam: parseCam(query.get('cam')),
    slot,
    worldFromUrl: (seed !== null || ticks !== null) && slot === null,
  };
}
