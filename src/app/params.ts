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
 * the world looks), `slot=` (debug: a prepared autosave), `debug=` (debug overlays of the world),
 * `go=` (debug: send the first villager to a tile), `select=` (the chosen villager), `menu=1` (the
 * menu «Мир» of the observer's panel open), `light=0` (the world without the light of the
 * time of day).
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
  /**
   * Light of the time of day over the world (step 1.5); `light=0` — the picture as drawn, as by
   * day, at any hour (comparing frames pixel for pixel, looking at the art).
   */
  light: boolean;
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
   * Debug overlays of the world (`debug=1`; several — `debug=1,needs`): `1` — paths of villagers
   * as lines, a click sends the chosen villager to a tile (step 1.3); `needs` — bars of satiety,
   * thirst and health over the heads and what each one is doing (step 1.4); `mind` — the plan
   * and the journal of decisions of the chosen villager (step 1.8); `memory` — what the chosen
   * villager knows: the land it has not explored veiled, the food it saw marked (step 1.11b). Any
   * word turns on the paths
   * and the click. Empty — none.
   */
  debug: readonly string[];
  /**
   * Debug: the first villager of a world given by the address is sent to this tile before the
   * world runs `ticks=` — a walk (and its path with `debug=1`) reproducible by URL.
   */
  go: { x: number; y: number } | null;
  /**
   * Debug (step 1.8): `food=15@870` — at tick 870 of a world given by the address (on the way to
   * `ticks=`) the first villager's satiety becomes 15: hunger breaks off its work, reproducible by
   * URL (the hysteresis of the mind, `debug=mind`).
   */
  food: { value: number; tick: number } | null;
  /**
   * Debug (step 1.9): `douse=1130` — at tick 1130 of a world given by the address (on the way to
   * `ticks=`) the wood in the campfire is gone: it goes out on the next tick, reproducible by URL
   * (a dead fire at night, lighting it again in the morning).
   */
  douse: number | null;
  /** The villager chosen at the start (step 1.6: its frame and card); null — none. */
  select: number | null;
  /** The menu «Мир» of the observer's panel is open at the start (step 1.6). */
  menu: boolean;
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
  light: true,
  ticks: 0,
  speed: 1,
  sprite: null,
  zoom: null,
  cam: null,
  slot: null,
  debug: [],
  go: null,
  food: null,
  douse: null,
  select: null,
  menu: false,
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

/** `value@tick` — satiety 0…100 at a tick ≥ 0, or null. */
function parseFood(raw: string | null): { value: number; tick: number } | null {
  const parts = raw?.split('@') ?? [];
  if (parts.length !== 2) return null;
  const value = parseDecimal(parts[0]!);
  const tick = parseInteger(parts[1]!, 0);
  return value === null || tick === null || value < 0 || value > 100 ? null : { value, tick };
}

/** `x,y` — two whole numbers ≥ 0 (a tile), or null. */
function parseTile(raw: string | null): { x: number; y: number } | null {
  const parts = raw?.split(',') ?? [];
  if (parts.length !== 2) return null;
  const [x, y] = parts.map((part) => parseInteger(part, 0));
  return x == null || y == null ? null : { x, y };
}

/** `1`, `1,needs` — words of debug overlays; `0` or nothing — none. */
function parseDebug(raw: string | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((word) => word.trim())
    .filter((word) => word !== '' && word !== '0');
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
    light: query.get('light') !== '0',
    ticks: ticks ?? DEFAULT_PARAMS.ticks,
    speed: parseSpeed(query.get('speed')) ?? DEFAULT_PARAMS.speed,
    sprite: sprite ? sprite : DEFAULT_PARAMS.sprite,
    zoom: parseZoom(query.get('zoom')),
    cam: parseCam(query.get('cam')),
    slot,
    debug: parseDebug(query.get('debug')),
    go: parseTile(query.get('go')),
    food: parseFood(query.get('food')),
    douse: parseInteger(query.get('douse'), 0),
    select: parseInteger(query.get('select'), 1),
    menu: query.get('menu') === '1',
    worldFromUrl: (seed !== null || ticks !== null) && slot === null,
  };
}
