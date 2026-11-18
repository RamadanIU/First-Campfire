import { PALETTE } from '../art/palette.ts';
import { brightness, daylightAt, lit, skyAt } from '../render/lighting.ts';
import { calendarAt, DAY_PHASES, PHASE_START, TIME } from '../sim/calendar.ts';
import { type Cause, findEvent } from '../sim/events.ts';
import { createWorld, runTicks, stepWorld, type World } from '../sim/world.ts';
import {
  CLOCK,
  capitalize,
  dateText,
  describeCause,
  describeEvent,
  HUD,
  PHASE_NAME,
  speedName,
} from '../ui/texts.ts';
import { bindSpeedKeys } from './controls.ts';
import { createGameLoop, type GameLoop } from './loop.ts';
import type { Scene, SceneContext } from './scene.ts';

/**
 * Debug scene `clock` (step 0.2): shows the simulation core at work.
 * The sky follows the time of day, the HUD shows date, time, tick and speed, fireflies (the night
 * swarm, ADR-018) fly at night, and the last journal entries show events with causes.
 *
 *   ?scene=clock&seed=1&ticks=3130&speed=5   Space — pause, 1–4 — ×1 ×2 ×5 ×20
 *
 * The same view shows the saved world of the scene `world` (step 0.7) until the map of stage 1
 * replaces it: `createClockView(context, world)`.
 *
 * Colours are the palette's lit by the world's light of the time of day (src/render/lighting.ts,
 * step 1.5): the sky, the land, the sun and the moon.
 */
const VIEW_W = 240;
const VIEW_H = 135;
/** Horizon height as a share of the view height. */
const HORIZON_SHARE = 0.71;
/** Clock hour at which dawn begins — presentation only, the simulation counts ticks. */
const DAWN_HOUR = 5;
const JOURNAL_LINES = 7;

type Rgb = readonly [number, number, number];

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function css([r, g, b]: Rgb, alpha = 1): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}

/** A colour of the palette by name. */
function paletteRgb(name: string): Rgb {
  const [ramp, shade] = name.split('.');
  return PALETTE.ramps.get(ramp!)![Number(shade)]!;
}

/** Colours of the picture by day — the palette; the light of the moment tints them. */
const COLORS = {
  forest: paletteRgb('leaf.1'),
  meadow: paletteRgb('grass.2'),
  tuft: paletteRgb('grass.3'),
  sun: paletteRgb('fire.3'),
  lowSun: paletteRgb('fire.2'),
  moon: paletteRgb('bone.2'),
  moonShade: paletteRgb('bone.1'),
  star: paletteRgb('bone.2'),
  dimStar: paletteRgb('stone.3'),
  firefly: paletteRgb('fire.3'),
  glow: paletteRgb('leaf.4'),
  dark: paletteRgb('leaf.0'),
} as const;

/** Daylight, 0 (night) … 1 (day), smooth through dawn and dusk — of the world's light. */
function daylight(tickOfDay: number): number {
  return brightness(daylightAt(tickOfDay));
}

/** Cheap deterministic hash → [0, 1). Presentation only; the sim has its own RNG. */
function hash(a: number, b = 0): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function clockTime(dayProgress: number): string {
  const minutes = Math.floor((DAWN_HOUR * 60 + dayProgress * 24 * 60) % (24 * 60));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function causeOf(world: World, cause: Cause): string {
  const source = cause.kind === 'event' ? findEvent(world, cause.event) : undefined;
  return describeCause(cause, source ? describeEvent(source) : null);
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}

export function createClockScene(context: SceneContext): Scene {
  const world = createWorld(context.params.seed);
  runTicks(world, context.params.ticks);
  return createClockView(context, world).scene;
}

/** A running world, drawn as the sky over a meadow with the HUD and the journal. */
export interface ClockView {
  scene: Scene;
  loop: GameLoop;
}

export function createClockView({ canvas, ui, params }: SceneContext, world: World): ClockView {
  const screen = canvas.getContext('2d')!;
  const buffer = document.createElement('canvas');
  const ctx = buffer.getContext('2d')!;

  const loop: GameLoop = createGameLoop(() => stepWorld(world), {
    ticksPerSecond: TIME.ticksPerSecond,
    speed: params.speed,
  });
  bindSpeedKeys(loop, window);

  const hud = params.ui ? createHud(ui) : null;

  // The low-resolution view keeps about VIEW_H pixels of height; its width follows the window,
  // so a phone in portrait sees the whole scene instead of a cropped middle.
  let scale = 1;
  let viewW = VIEW_W;
  let viewH = VIEW_H;
  let horizon = Math.round(VIEW_H * HORIZON_SHARE);

  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };

  /** A filled pixel circle (sun, moon, glow). */
  const disc = (cx: number, cy: number, radius: number, color: string) => {
    ctx.fillStyle = color;
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    for (let dy = -radius; dy <= radius; dy++) {
      const half = Math.floor(Math.sqrt((radius + 0.5) * (radius + 0.5) - dy * dy));
      ctx.fillRect(x0 - half, y0 + dy, half * 2 + 1, 1);
    }
  };

  function drawSky(time: number, frame: number) {
    const { zenith, horizon: low } = skyAt(time);
    const bands = 12;
    const bandH = Math.ceil(horizon / bands);
    for (let i = 0; i < bands; i++)
      px(0, i * bandH, viewW, bandH, css(mixRgb(zenith, low, i / (bands - 1))));

    const starAlpha = 1 - Math.min(1, daylight(time) * 3);
    if (starAlpha > 0) {
      const stars = Math.round((viewW * horizon) / 260);
      for (let i = 0; i < stars; i++) {
        const x = Math.floor(hash(i, params.seed) * viewW);
        const y = Math.floor(hash(i, params.seed + 1) * (horizon - 20));
        if (hash(i, Math.floor(frame / 6) + i) < 0.2) continue; // twinkle
        px(x, y, 1, 1, css(hash(i, 7) > 0.8 ? COLORS.star : COLORS.dimStar, starAlpha));
      }
    }
  }

  function drawSunAndMoon(time: number) {
    const { night } = PHASE_START;
    const peak = Math.round(horizon * 0.35);
    const arc = (progress: number) => ({
      x: 12 + progress * (viewW - 24),
      y: horizon + 4 - Math.sin(Math.PI * progress) * (horizon + 4 - peak),
    });
    if (time < night) {
      const progress = time / night;
      const { x, y } = arc(progress);
      // Low sun is bigger-looking and redder: rosy dawn, golden hour.
      const low = 1 - Math.min(1, Math.sin(Math.PI * progress) * 2.5);
      const sun = mixRgb(COLORS.sun, COLORS.lowSun, low);
      disc(x, y, 9, css(sun, 0.12));
      disc(x, y, 6, css(sun, 0.3));
      disc(x, y, 4, css(mixRgb(COLORS.sun, sun, 0.6)));
    } else {
      const { x, y } = arc((time - night) / (TIME.ticksPerDay - night));
      disc(x, y, 7, css(COLORS.moon, 0.1));
      disc(x, y, 4, css(COLORS.moon));
      px(x - 2, y - 2, 2, 2, css(COLORS.moonShade));
      px(x + 1, y + 1, 2, 1, css(COLORS.moonShade));
      px(x - 1, y + 2, 1, 1, css(COLORS.moonShade));
    }
  }

  function drawLand(time: number) {
    const light = daylightAt(time);
    const forest = css(lit(COLORS.forest, light));
    for (let x = 0; x < viewW; x += 5) {
      const h = 9 + Math.floor(hash(x, params.seed + 2) * 15);
      for (let row = 0; row < h; row++) {
        const half = Math.max(1, Math.floor(((row + 2) * 4) / h));
        px(x + 2 - half, horizon - h + row, half * 2 + 1, 1, forest);
      }
    }
    px(0, horizon, viewW, viewH - horizon, css(lit(COLORS.meadow, light)));
    const tuft = css(lit(COLORS.tuft, light));
    const tufts = Math.round((viewW * (viewH - horizon)) / 40);
    for (let i = 0; i < tufts; i++) {
      const x = Math.floor(hash(i, 11) * viewW);
      const y = horizon + 2 + Math.floor(hash(i, 12) * (viewH - horizon - 3));
      px(x, y, 1, 2, tuft);
    }
  }

  function drawFireflies(alpha: number) {
    const left = 4;
    const top = horizon - 24;
    const width = viewW - 8;
    const height = viewH - 6 - top;
    for (const fly of world.fireflies.swarm) {
      const fx = fly.prevX + (fly.x - fly.prevX) * alpha;
      const fy = fly.prevY + (fly.y - fly.prevY) * alpha;
      // The map squeezed into the strip of meadow (the fireflies live on the map, step 1.5).
      const x = Math.round(left + (fx / world.map.width) * width);
      const y = Math.round(top + (fy / world.map.height) * height);
      if (fly.lit) {
        disc(x, y, 2, css(COLORS.glow, 0.12));
        px(x - 1, y, 3, 1, css(COLORS.glow, 0.35));
        px(x, y - 1, 1, 3, css(COLORS.glow, 0.35));
        px(x, y, 1, 1, css(COLORS.firefly));
      } else {
        px(x, y, 1, 1, css(COLORS.dark, 0.5));
      }
    }
  }

  const scene: Scene = {
    update(elapsedMs) {
      loop.advance(elapsedMs);
    },
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      scale = Math.max(1, Math.round(height / VIEW_H));
      viewW = Math.ceil(width / scale);
      viewH = Math.ceil(height / scale);
      horizon = Math.round(viewH * HORIZON_SHARE);
      buffer.width = viewW;
      buffer.height = viewH;
    },
    render(frame) {
      // Interpolate between the previous and the current tick (see GameLoop.alpha).
      const alpha = loop.alpha;
      const shown = Math.max(0, world.tick - 1 + alpha);
      const time = shown % TIME.ticksPerDay;
      drawSky(time, frame);
      drawSunAndMoon(time);
      drawLand(time);
      drawFireflies(alpha);
      screen.imageSmoothingEnabled = false;
      screen.drawImage(buffer, 0, 0, viewW * scale, viewH * scale);
      hud?.update(world, loop);
    },
  };
  return { scene, loop };
}

/** DOM overlay: date and time, speed, a bar of the day's phases and the event journal. */
function createHud(ui: HTMLElement) {
  ui.innerHTML = `
    <div class="hud">
      <div class="hud-date"></div>
      <div class="hud-time"></div>
      <div class="phasebar">${DAY_PHASES.map(
        (phase) =>
          `<span class="phase phase-${phase}" style="width:${TIME.phasePercent[phase]}%"></span>`,
      ).join('')}<i class="phasebar-marker"></i></div>
      <div class="phase-legend">${DAY_PHASES.map(
        (phase) => `<span><i class="phase phase-${phase}"></i>${PHASE_NAME[phase]}</span>`,
      ).join('')}</div>
      <div class="hud-meta"></div>
      <div class="hud-speed"></div>
      <div class="hud-keys">${CLOCK.keys}</div>
    </div>
    <div class="journal">
      <div class="journal-title">${CLOCK.journal}</div>
      <ol class="journal-list"></ol>
    </div>`;
  const date = ui.querySelector<HTMLElement>('.hud-date')!;
  const time = ui.querySelector<HTMLElement>('.hud-time')!;
  const marker = ui.querySelector<HTMLElement>('.phasebar-marker')!;
  const meta = ui.querySelector<HTMLElement>('.hud-meta')!;
  const speed = ui.querySelector<HTMLElement>('.hud-speed')!;
  const journal = ui.querySelector<HTMLElement>('.journal-list')!;
  let shownTick = -1;
  let shownSpeed = '';
  let shownEvents = -1;

  return {
    update(world: World, loop: GameLoop) {
      if (world.tick !== shownTick) {
        shownTick = world.tick;
        const now = calendarAt(world.tick);
        date.textContent = capitalize(dateText(now, TIME.daysPerSeason));
        time.innerHTML = `<b>${clockTime(now.dayProgress)}</b> · ${PHASE_NAME[now.phase]}`;
        marker.style.left = `${(now.dayProgress * 100).toFixed(2)}%`;
        meta.textContent = CLOCK.meta(world.tick, now.day, world.seed);
      }
      const speedText =
        speedName(loop.speed) + (loop.speed !== 0 && loop.lagging ? ` (${HUD.lagging})` : '');
      if (speedText !== shownSpeed) {
        shownSpeed = speedText;
        speed.innerHTML = `${CLOCK.speed}: <b>${speedText}</b>`;
      }
      if (world.events.nextId !== shownEvents) {
        shownEvents = world.events.nextId;
        journal.innerHTML = world.events.list
          .slice(-JOURNAL_LINES)
          .reverse()
          .map(
            (event) =>
              `<li><span class="journal-meta">${CLOCK.journalMeta(event.id, event.tick)}</span> ${escapeHtml(describeEvent(event))} <span class="journal-cause">← ${escapeHtml(causeOf(world, event.cause))}</span></li>`,
          )
          .join('');
      }
    },
  };
}
