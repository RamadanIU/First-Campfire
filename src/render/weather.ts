/**
 * The weather on the map (step 1.10, GDD §10.1 «Погода и свет»): the light under clouds and the
 * particles of rain and snow.
 *
 *   - `weatherTint` — the light of the sky is dimmer and greyer under clouds, darker and bluer in
 *     the rain, soft and pale in the snow: it multiplies the light of the time of day
 *     (./lighting.ts), so a rainy night is darker than a clear one.
 *   - `drawRain` — slanting streaks of rain; `drawSnow` — flakes that drift down and sway (two layers:
 *     small and slow, big and faster). The drops are drawn once into a tile (`WEATHER_TILE`, drops at
 *     hashed places), and the tile repeats over the view in world space, its grid moving with the
 *     presentation time: cheap at every zoom, still when the camera moves, the same picture for the
 *     same time (`frame=` gives the same screenshot). They are drawn before the light of the time of
 *     day: at night the rain is dark too.
 *
 * Presentation only: reads the weather of the world, changes nothing.
 */
import { PALETTE } from '../art/palette.ts';
import type { WeatherKind } from '../sim/weather.ts';
import type { Light } from './lighting.ts';

/** How the light of the sky changes with the weather (multipliers of red, green, blue). */
const TINTS: Readonly<Record<WeatherKind, Light>> = {
  clear: [1, 1, 1],
  cloudy: [0.84, 0.86, 0.9],
  rain: [0.68, 0.72, 0.8],
  snow: [0.9, 0.92, 0.98],
};

/** The light of the time of day under this weather. */
export function weatherTint(light: Light, kind: WeatherKind): Light {
  const [r, g, b] = TINTS[kind];
  return [light[0] * r, light[1] * g, light[2] * b];
}

/** A side of the tile of particles, world px: drops are drawn once into it, the tile repeats. */
export const WEATHER_TILE = 128;
/** Drops of rain and flakes of snow in a tile. */
const DROPS = 80;
const FLAKES = 64;
/** How far a drop of rain falls in a second, world px, and how far it slants for each pixel down. */
const RAIN_SPEED = 220;
const RAIN_SLANT = 0.35;
const RAIN_LENGTH = 4;
/** How far a flake falls in a second, world px (the big ones; the small ones are slower). */
const SNOW_SPEED = 18;

/** Cheap deterministic hash → [0, 1). Presentation only; the simulation has its own RNG. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function css(name: string): string {
  const [ramp, shade] = name.split('.');
  const [r, g, b] = PALETTE.ramps.get(ramp!)![Number(shade)]!;
  return `rgb(${r},${g},${b})`;
}

const RAIN_COLOURS = ['water.4', 'stone.3'].map(css);
const SNOW_COLOURS = ['bone.2', 'snow.3'].map(css);

/** A pixel of a tile of particles and its colour (an index into the kind's colours). */
export interface TilePixel {
  readonly x: number;
  readonly y: number;
  readonly colour: number;
}

const wrap = (value: number) => ((value % WEATHER_TILE) + WEATHER_TILE) % WEATHER_TILE;

/** The pixels of the tile of rain: slanting streaks at hashed places, wrapping over the edges. */
export function rainPixels(): TilePixel[] {
  const pixels: TilePixel[] = [];
  for (let i = 0; i < DROPS; i++) {
    const x = Math.floor(hash(i, 1) * WEATHER_TILE);
    const y = Math.floor(hash(i, 2) * WEATHER_TILE);
    for (let k = 0; k < RAIN_LENGTH; k++) {
      pixels.push({ x: wrap(x - Math.floor(k * RAIN_SLANT)), y: wrap(y - k), colour: i % 2 });
    }
  }
  return pixels;
}

/** The pixels of a tile of snow: `big` — crosses of five pixels, else single flakes. */
export function snowPixels(big: boolean): TilePixel[] {
  const pixels: TilePixel[] = [];
  const count = big ? FLAKES / 4 : FLAKES;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash(i, big ? 3 : 4) * WEATHER_TILE);
    const y = Math.floor(hash(i, big ? 5 : 6) * WEATHER_TILE);
    const colour = i % 2;
    pixels.push({ x, y, colour });
    if (!big) continue;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      pixels.push({ x: wrap(x + dx), y: wrap(y + dy), colour });
    }
  }
  return pixels;
}

/**
 * Where the tiles of a layer stand at presentation time `timeMs`: the offset of the grid of tiles,
 * world px, 0…tile (whole pixels — crisp at every zoom).
 */
export function layerOffset(
  timeMs: number,
  speed: number,
  slant: number,
  sway = 0,
): { x: number; y: number } {
  const fall = (timeMs / 1000) * speed;
  return { x: wrap(Math.floor(-fall * slant + sway)), y: wrap(Math.floor(fall)) };
}

/** Tiles drawn once (canvases are made on first use). */
const tiles = new Map<string, HTMLCanvasElement>();

function tileOf(key: string, pixels: () => TilePixel[], colours: readonly string[]) {
  let canvas = tiles.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = WEATHER_TILE;
    canvas.height = WEATHER_TILE;
    const ctx = canvas.getContext('2d')!;
    for (const pixel of pixels()) {
      ctx.fillStyle = colours[pixel.colour]!;
      ctx.fillRect(pixel.x, pixel.y, 1, 1);
    }
    tiles.set(key, canvas);
  }
  return canvas;
}

interface View {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Repeat `tile` over the view, its grid shifted by `offset` (world space). */
function cover(
  ctx: CanvasRenderingContext2D,
  view: View,
  tile: HTMLCanvasElement,
  offset: { x: number; y: number },
): void {
  const left = Math.floor((view.x - offset.x) / WEATHER_TILE);
  const top = Math.floor((view.y - offset.y) / WEATHER_TILE);
  const right = Math.floor((view.x + view.width - offset.x) / WEATHER_TILE);
  const bottom = Math.floor((view.y + view.height - offset.y) / WEATHER_TILE);
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      ctx.drawImage(
        tile,
        tx * WEATHER_TILE + offset.x - view.x,
        ty * WEATHER_TILE + offset.y - view.y,
      );
    }
  }
}

/** Slanting streaks of rain over the view (world space), at presentation time `timeMs`. */
export function drawRain(ctx: CanvasRenderingContext2D, view: View, timeMs: number): void {
  const tile = tileOf('rain', rainPixels, RAIN_COLOURS);
  cover(ctx, view, tile, layerOffset(timeMs, RAIN_SPEED, RAIN_SLANT));
}

/** Flakes of snow drifting down and swaying over the view (world space), at `timeMs`. */
export function drawSnow(ctx: CanvasRenderingContext2D, view: View, timeMs: number): void {
  const seconds = timeMs / 1000;
  const small = tileOf('snow', () => snowPixels(false), SNOW_COLOURS);
  const big = tileOf('snow-big', () => snowPixels(true), SNOW_COLOURS);
  cover(ctx, view, small, layerOffset(timeMs, SNOW_SPEED * 0.7, 0, Math.sin(seconds * 1.3) * 1.5));
  cover(ctx, view, big, layerOffset(timeMs, SNOW_SPEED, 0, Math.sin(seconds * 1.7 + 2) * 2));
}

/** The particles of the weather `kind` over the view (rain or snow; none for clear and cloudy). */
export function drawWeather(
  ctx: CanvasRenderingContext2D,
  view: View,
  kind: WeatherKind,
  timeMs: number,
): void {
  if (kind === 'rain') drawRain(ctx, view, timeMs);
  else if (kind === 'snow') drawSnow(ctx, view, timeMs);
}
