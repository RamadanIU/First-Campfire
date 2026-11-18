/**
 * Light of the time of day (step 1.5, GDD §10.5: «розовый рассвет, золотой час, синяя ночь»).
 *
 * Light is a colour correction of the finished picture, not new colours: every pixel of the world
 * is multiplied by the light of the moment — an RGB triple of gains, 1 — as drawn. Day is the
 * picture as drawn (gains 1); dawn — rosy, dusk — golden, night — dim and blue. Between the
 * moments the gains glide smoothly (a key every few dozen ticks, see DAYLIGHT).
 *
 * Warm light «holes» (the campfire, step 1.9; the title screen since step 0.4) are circles of
 * stepped rings — pixel-art lighting, no smooth gradient: `ringLevel` is the strength 0…1 at a
 * point, `lightGain` mixes the ambient light with the warm one by it.
 *
 *   - The map (src/app/mapView.ts) lays the light over its 1:1 buffer — world pixels, so the rings
 *     stay crisp at every zoom — with `shadeRect`: a «multiply» fill (light ≤ 1), optionally
 *     through a light map with holes (`lights`).
 *   - The title screen multiplies its small picture pixel by pixel (its firelight is brighter
 *     than day — above 1).
 *   - The debug scene `clock` takes the colours of its sky from the palette lit by the same rule
 *     (`skyAt`).
 *
 * The numbers are art direction, not balance: they live here, next to the code that uses them.
 */
import { PALETTE, type Rgb } from '../art/palette.ts';
import { PHASE_START, TIME } from '../sim/calendar.ts';

/** Gains of the three channels: 1 — the colour as drawn. */
export type Light = readonly [number, number, number];

/** Day: the picture as drawn. */
export const DAY_LIGHT: Light = [1, 1, 1];
/** Night: every colour dim and blue (the title screen's night of step 0.4). */
export const NIGHT_LIGHT: Light = [0.26, 0.31, 0.52];
/** Rosy dawn and golden dusk at their deepest. */
export const DAWN_LIGHT: Light = [0.86, 0.7, 0.84];
export const DUSK_LIGHT: Light = [1, 0.74, 0.46];
/** Firelight at full strength: warm, a little brighter than day (the title screen). */
export const FIRELIGHT: Light = [1.18, 0.98, 0.74];
/** Light of a fire comes in this many stepped rings. */
export const LIGHT_STEPS = 4;

/**
 * The light through a day: [tick of the day, light]. A day starts with dawn (ADR-010): the night
 * before it ends at tick 0, so dawn starts from the night's light; tick `ticksPerDay` repeats 0.
 */
const DAYLIGHT: readonly (readonly [number, Light])[] = (() => {
  const { day, dusk, night } = PHASE_START;
  const dawnLength = day;
  const duskLength = night - dusk;
  return [
    [0, NIGHT_LIGHT],
    [Math.round(dawnLength * 0.55), DAWN_LIGHT],
    [day, [1, 0.92, 0.88]],
    [day + Math.round(dawnLength * 0.75), DAY_LIGHT],
    [dusk - Math.round(duskLength * 0.5), DAY_LIGHT],
    [dusk + Math.round(duskLength * 0.45), DUSK_LIGHT],
    [night, [0.56, 0.46, 0.58]],
    [night + Math.round(duskLength * 0.75), NIGHT_LIGHT],
    [TIME.ticksPerDay, NIGHT_LIGHT],
  ];
})();

function mix(a: Light, b: Light, t: number): Light {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Smooth start and end of a glide between two keys. */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/** The light at a moment of the day: `tickOfDay` 0 … ticksPerDay (fractional — between ticks). */
export function daylightAt(tickOfDay: number): Light {
  const day = TIME.ticksPerDay;
  const t = ((tickOfDay % day) + day) % day;
  for (let i = 1; i < DAYLIGHT.length; i++) {
    const [toTick, to] = DAYLIGHT[i]!;
    if (t <= toTick) {
      const [fromTick, from] = DAYLIGHT[i - 1]!;
      return mix(from, to, ease((t - fromTick) / (toTick - fromTick)));
    }
  }
  return NIGHT_LIGHT;
}

/** A thin veil of colour over the lit picture: a multiply cannot add pink to green grass. */
export interface Haze {
  readonly color: Rgb;
  /** 0 — none. */
  readonly alpha: number;
}

/** A colour of the palette by name (`water.3`). */
function paletteColor(name: string): Rgb {
  const [ramp, shade] = name.split('.');
  const color = PALETTE.ramps.get(ramp!)?.[Number(shade)];
  if (!color) throw new Error(`Нет цвета палитры «${name}»`);
  return color;
}

/** Rosy haze of dawn and golden haze of dusk at their deepest (palette colours). */
const DAWN_HAZE: Haze = { color: paletteColor('berry.1'), alpha: 0.13 };
const DUSK_HAZE: Haze = { color: paletteColor('fire.2'), alpha: 0.07 };

/** Hazes: [tick of the deepest moment, haze, half width in ticks]. */
const HAZES: readonly (readonly [number, Haze, number])[] = (() => {
  const keyOf = (light: Light) => DAYLIGHT.find(([, value]) => value === light)![0];
  const { day, dusk, night } = PHASE_START;
  return [
    [keyOf(DAWN_LIGHT), DAWN_HAZE, day * 0.6],
    [keyOf(DUSK_LIGHT), DUSK_HAZE, (night - dusk) * 0.8],
  ];
})();

/**
 * The haze at a moment of the day: it swells and fades around the deepest moment of dawn and of
 * dusk (the keys of DAWN_LIGHT and DUSK_LIGHT in DAYLIGHT), none by day and at night.
 */
export function hazeAt(tickOfDay: number): Haze {
  const day = TIME.ticksPerDay;
  const t = ((tickOfDay % day) + day) % day;
  for (const [peak, haze, width] of HAZES) {
    const near = 1 - Math.abs(t - peak) / width;
    if (near > 0) return { color: haze.color, alpha: haze.alpha * ease(near) };
  }
  return { color: DAWN_HAZE.color, alpha: 0 };
}

/** How bright the moment is, 0 (night) … 1 (day): stars fade, fireflies glow. */
export function brightness(light: Light): number {
  const night = NIGHT_LIGHT[0] + NIGHT_LIGHT[1] + NIGHT_LIGHT[2];
  const value = (light[0] + light[1] + light[2] - night) / (3 - night);
  return Math.min(1, Math.max(0, value));
}

/**
 * Strength 0…1 of a warm light at offset (dx, dy) from its centre, px, in LIGHT_STEPS stepped
 * rings. The light lies on the ground: the circle is squashed in depth (¾ view).
 */
export function ringLevel(dx: number, dy: number, radius: number): number {
  const sy = dy * 1.5;
  const near = 1 - Math.sqrt(dx * dx + sy * sy) / radius;
  return near <= 0 ? 0 : Math.ceil(near * LIGHT_STEPS) / LIGHT_STEPS;
}

/** The gains at a point lit by a warm light of strength `level` over the ambient `light`. */
export function lightGain(light: Light, level: number, warm: Light = FIRELIGHT): Light {
  return level <= 0 ? light : mix(light, warm, level);
}

/** A colour lit: each channel multiplied by its gain (rounded, clamped to 0…255). */
export function lit(color: Rgb, light: Light): Rgb {
  return [
    Math.min(255, Math.round(color[0] * light[0])),
    Math.min(255, Math.round(color[1] * light[1])),
    Math.min(255, Math.round(color[2] * light[2])),
  ];
}

/** CSS colour of a light used as a «multiply» fill: gains ≤ 1 become 0…255. */
export function lightCss(light: Light): string {
  const [r, g, b] = lit([255, 255, 255], light);
  return `rgb(${r},${g},${b})`;
}

/** Is the light the drawn picture itself (day: nothing to do)? */
export function isDaylight(light: Light): boolean {
  return light[0] >= 1 && light[1] >= 1 && light[2] >= 1;
}

/** A warm light «hole» in the night: centre and radius, px of the lit rectangle (step 1.9). */
export interface LightSource {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** A canvas for the light map, reused from frame to frame (it only grows). */
let lightMap: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

function lightMapOf(width: number, height: number) {
  if (!lightMap || lightMap.canvas.width < width || lightMap.canvas.height < height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(width, lightMap?.canvas.width ?? 0);
    canvas.height = Math.max(height, lightMap?.canvas.height ?? 0);
    lightMap = { canvas, ctx: canvas.getContext('2d')! };
  }
  return lightMap;
}

/**
 * Light the rectangle `width`×`height` at (0, 0) of `ctx` with the ambient `light`: a «multiply»
 * fill, then a thin veil of `haze` over it (rosy dawn, golden dusk). With `lights` — through a light map where each source cuts stepped rings of warm light
 * (capped at the drawn colour: a multiply cannot brighten). Day without sources costs nothing.
 */
export function shadeRect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  light: Light,
  lights: readonly LightSource[] = [],
  haze?: Haze,
): void {
  if (width <= 0 || height <= 0) return;
  if (lights.length > 0 || !isDaylight(light)) multiply(ctx, width, height, light, lights);
  if (haze && haze.alpha > 0) {
    ctx.save();
    const [r, g, b] = haze.color;
    ctx.fillStyle = `rgba(${r},${g},${b},${haze.alpha})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/** The «multiply» part of `shadeRect`: the ambient light, with holes of warm light. */
function multiply(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  light: Light,
  lights: readonly LightSource[],
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  if (lights.length === 0) {
    ctx.fillStyle = lightCss(light);
    ctx.fillRect(0, 0, width, height);
  } else {
    const map = lightMapOf(width, height);
    map.ctx.fillStyle = lightCss(light);
    map.ctx.fillRect(0, 0, width, height);
    for (const source of lights) {
      // Ring by ring from the outside in: each ring is a squashed disc of its own light.
      for (let step = 1; step <= LIGHT_STEPS; step++) {
        const level = step / LIGHT_STEPS;
        const ring = source.radius * (1 - (step - 1) / LIGHT_STEPS);
        map.ctx.fillStyle = lightCss(lightGain(light, level));
        map.ctx.beginPath();
        map.ctx.ellipse(source.x, source.y, ring, ring / 1.5, 0, 0, Math.PI * 2);
        map.ctx.fill();
      }
    }
    ctx.drawImage(map.canvas, 0, 0, width, height, 0, 0, width, height);
  }
  ctx.restore();
}

/** The sky by day — palette colours: the zenith and the horizon. */
const SKY = { zenith: paletteColor('water.2'), horizon: paletteColor('water.4') } as const;
/** The horizon glows at dawn and dusk: a little extra light low over the land. */
const HORIZON_GLOW: Light = [1.25, 1.05, 0.95];

/** Colours of the sky (the debug scene `clock`): the day sky of the palette in the light of now. */
export function skyAt(tickOfDay: number): { zenith: Rgb; horizon: Rgb } {
  const light = daylightAt(tickOfDay);
  // The glow is strongest when the light is neither day nor night.
  const glow = 1 - Math.abs(brightness(light) - 0.5) * 2;
  const low = lightGain(light, glow * 0.6, [
    light[0] * HORIZON_GLOW[0],
    light[1] * HORIZON_GLOW[1],
    light[2] * HORIZON_GLOW[2],
  ]);
  return { zenith: lit(SKY.zenith, light), horizon: lit(SKY.horizon, low) };
}
