/**
 * How the campfire looks on the map (step 1.9, GDD §10.1 «ночью — круги тёплого света», §10.6 —
 * particles): the hearth itself is an object of the map (./mapRenderer.ts draws its sprite
 * `campfire`, `burning` or `out`); here — what a burning fire adds over it.
 *
 *   - Light: a warm circle of stepped rings around the flames (./lighting.ts `LightSource`), as
 *     strong as the night is dark — none by day, full at night; it flickers a little.
 *   - Flames: the burning sprite again over the light of the time of day — fire is its own light.
 *   - Sparks rising from the flames (after the light: they glow) and wisps of smoke drifting up and
 *     away (before the light: smoke is lit like everything else).
 *
 * Pure presentation: everything moves by the presentation clock (`timeMs`), the same for every
 * frame drawn at that moment — frozen frames (`frame=`) are repeatable. Only reads the world.
 */
import { PALETTE } from '../art/palette.ts';
import { hearthOf, isBurning } from '../sim/fire.ts';
import type { World } from '../sim/world.ts';
import { brightness, type Light, type LightSource } from './lighting.ts';
import { placementOf } from './mapRenderer.ts';
import type { SpriteSheet } from './spriteSheet.ts';

/** Radius of the firelight, world px (three and a half tiles), and how much it flickers. */
export const FIRE_LIGHT_RADIUS = 56;
const FLICKER = 3;
/** The light's centre: over the flames, above the anchor of the hearth. */
const FLAME_HEIGHT = 6;
/** Sparks and wisps of smoke in the air at once. */
const SPARKS = 6;
const WISPS = 4;

/** Cheap deterministic hash → [0, 1). Presentation only; the simulation has its own RNG. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function css(name: string, alpha = 1): string {
  const [ramp, shade] = name.split('.');
  const [r, g, b] = PALETTE.ramps.get(ramp!)![Number(shade)]!;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

const SPARK_COLOURS = ['fire.3', 'fire.2', 'fire.1'].map((name) => css(name));
const SMOKE_COLOURS = ['stone.3', 'stone.2'].map((name) => css(name));

/** Where a burning campfire stands (its sprite's anchor, world px); null — none burns. */
export function burningFire(world: World): { x: number; y: number } | null {
  const hearth = hearthOf(world);
  if (!hearth || !isBurning(world)) return null;
  const { x, y } = placementOf(hearth);
  return { x, y };
}

/**
 * The warm light of a burning fire at `at` (world px) in the ambient `light`, placed in a view whose
 * top-left corner is (`viewX`, `viewY`): as strong as the night is dark (none by day). Null — no
 * light to cast.
 */
export function fireLight(
  at: { x: number; y: number },
  light: Light,
  viewX: number,
  viewY: number,
  timeMs: number,
): LightSource | null {
  const strength = 1 - brightness(light);
  if (strength <= 0.02) return null;
  const flicker = Math.floor(hash(Math.floor(timeMs / 200), 7) * (FLICKER + 1));
  return {
    x: at.x - viewX,
    y: at.y - FLAME_HEIGHT - viewY,
    radius: FIRE_LIGHT_RADIUS + flicker,
    strength,
  };
}

/** The flames over the light of the time of day: the burning sprite drawn again, unlit. */
export function drawFlames(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  at: { x: number; y: number },
  viewX: number,
  viewY: number,
  timeMs: number,
): void {
  sheet.draw(ctx, 'campfire', at.x - viewX, at.y - viewY, { animation: 'burning', timeMs });
}

/** Sparks rising from the flames and fading: yellow, then orange, then red. */
export function drawSparks(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  viewX: number,
  viewY: number,
  timeMs: number,
): void {
  const frame = Math.floor(timeMs / 100);
  for (let i = 0; i < SPARKS; i++) {
    const age = (frame + i * 7) % 36;
    if (age >= 24) continue;
    const cycle = Math.floor((frame + i * 7) / 36);
    const drift = (hash(i, cycle) - 0.5) * 10 + Math.sin(age / 4 + i) * 1.5;
    const x = Math.round(at.x + drift) - viewX;
    const y = at.y - 14 - Math.floor(age * 0.9) - viewY;
    ctx.fillStyle = SPARK_COLOURS[Math.min(2, Math.floor(age / 8))]!;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Wisps of smoke: grey puffs that rise, drift with the wind and thin out. */
export function drawSmoke(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  viewX: number,
  viewY: number,
  timeMs: number,
): void {
  const period = 3600;
  ctx.save();
  for (let i = 0; i < WISPS; i++) {
    const t = (timeMs + (i * period) / WISPS) % period;
    const life = t / period;
    const cycle = Math.floor((timeMs + (i * period) / WISPS) / period);
    const sway = Math.sin(life * 5 + i * 2) * 1.5 + (hash(i, cycle) - 0.5) * 4;
    const x = Math.round(at.x + life * 10 + sway) - viewX;
    const y = Math.round(at.y - 16 - life * 26) - viewY;
    const size = life < 0.35 ? 2 : life < 0.75 ? 3 : 2;
    ctx.globalAlpha = 0.55 * (1 - life);
    ctx.fillStyle = SMOKE_COLOURS[life < 0.5 ? 0 : 1]!;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}
