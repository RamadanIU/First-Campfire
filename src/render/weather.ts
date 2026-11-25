/**
 * The weather on the map (step 1.10, GDD §10.1 «Погода и свет»): the light under clouds and the
 * particles of rain and snow.
 *
 *   - `weatherTint` — the light of the sky is dimmer and greyer under clouds, darker and bluer in
 *     the rain, soft and pale in the snow: it multiplies the light of the time of day
 *     (./lighting.ts), so a rainy night is darker than a clear one.
 *   - `drawRain` — slanting streaks of rain; `drawSnow` — flakes that drift down and sway. Both lie in
 *     world space on a grid of cells (a few drops per cell, placed by a hash of the cell), so they
 *     stay put when the camera moves and the picture of a frame is the same for the same presentation
 *     time (`frame=` gives the same screenshot). They are drawn before the light of the time of day:
 *     at night the rain is dark too.
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

/** A side of a cell of the particle grid, world px. */
const CELL = 32;
/** Drops of rain and flakes of snow per cell. */
const DROPS = 5;
const FLAKES = 4;
/** How far a drop of rain falls in a second, world px, and how far it slants for each pixel down. */
const RAIN_SPEED = 220;
const RAIN_SLANT = 0.35;
const RAIN_LENGTH = 4;
/** How far a flake falls in a second, world px. */
const SNOW_SPEED = 18;

/** Cheap deterministic hash → [0, 1). Presentation only; the simulation has its own RNG. */
function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)) | 0;
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

interface View {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Every cell of the grid that touches the view (with a cell of margin), in order. */
function* cells(view: View): Generator<[number, number]> {
  const left = Math.floor(view.x / CELL) - 1;
  const top = Math.floor(view.y / CELL) - 1;
  const right = Math.floor((view.x + view.width) / CELL) + 1;
  const bottom = Math.floor((view.y + view.height) / CELL) + 1;
  for (let cy = top; cy <= bottom; cy++) {
    for (let cx = left; cx <= right; cx++) yield [cx, cy];
  }
}

/** Slanting streaks of rain over the view (world space), at presentation time `timeMs`. */
export function drawRain(ctx: CanvasRenderingContext2D, view: View, timeMs: number): void {
  const fall = (timeMs / 1000) * RAIN_SPEED;
  for (const [cx, cy] of cells(view)) {
    for (let i = 0; i < DROPS; i++) {
      const offset = hash(cx, cy, i) * CELL;
      const along = (hash(cx, cy, i + 101) * CELL + fall) % CELL;
      const y = cy * CELL + Math.floor(along);
      const x = cx * CELL + Math.floor(offset - along * RAIN_SLANT);
      ctx.fillStyle = RAIN_COLOURS[i % 2]!;
      for (let k = 0; k < RAIN_LENGTH; k++) {
        ctx.fillRect(x - view.x - Math.floor(k * RAIN_SLANT), y - view.y - k, 1, 1);
      }
    }
  }
}

/** Flakes of snow drifting down over the view (world space), at presentation time `timeMs`. */
export function drawSnow(ctx: CanvasRenderingContext2D, view: View, timeMs: number): void {
  const seconds = timeMs / 1000;
  for (const [cx, cy] of cells(view)) {
    for (let i = 0; i < FLAKES; i++) {
      const offset = hash(cx, cy, i) * CELL;
      const speed = SNOW_SPEED * (0.7 + 0.6 * hash(cx, cy, i + 57));
      const along = (hash(cx, cy, i + 101) * CELL + seconds * speed) % CELL;
      const sway = Math.round(Math.sin(seconds * 1.5 + i * 2.1 + cx) * 1.5);
      const x = cx * CELL + Math.floor(offset) + sway - view.x;
      const y = cy * CELL + Math.floor(along) - view.y;
      ctx.fillStyle = SNOW_COLOURS[i % 2]!;
      // Every third flake is bigger: a cross of five pixels.
      if (i % 3 === 0) {
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      } else {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
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
