/**
 * Fireflies — night insects over the meadow, a permanent part of nature (ADR-018: the owner's
 * decision; GDD §10.5 lists fireflies among the animals). Born in step 0.2 as a test system, they
 * are still the only randomness in a tick, so the determinism, save and stats tests lean on them.
 * Step 1.5 moves the swarm from the abstract meadow below onto the map.
 *
 * When night falls a swarm rises over the meadow (its size is a normal deviate), every firefly
 * wanders by a random walk and blinks; at dawn the swarm is gone. Both events name the phase
 * change that caused them.
 *
 * Coordinates are abstract meadow units: x in [0, FIELD.width], y in [0, FIELD.height]
 * (0 — high above the grass, FIELD.height — at the grass). The renderer maps them to the screen.
 */

import { emit, eventsThisTick } from '../events.ts';
import { clamp } from '../math.ts';
import { chance, floatRange, normal } from '../rng.ts';
import type { System } from '../world.ts';

export const FIELD = { width: 100, height: 30 } as const;

const SWARM = { mean: 14, deviation: 3, min: 6, max: 24 } as const;
const MAX_SPEED_X = 0.35;
const MAX_SPEED_Y = 0.2;
const JITTER = 0.06;
/** Chance per tick that a firefly switches its light on or off. */
const BLINK = 0.07;

export interface Firefly {
  id: number;
  x: number;
  y: number;
  /** Position at the previous tick — the renderer interpolates between the two. */
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  lit: boolean;
}

export interface Fireflies {
  swarm: Firefly[];
  nextId: number;
}

export function createFireflies(): Fireflies {
  return { swarm: [], nextId: 1 };
}

/** Move along one axis and bounce off the edges of [0, size]. */
function bounce(position: number, velocity: number, size: number): [number, number] {
  const next = position + velocity;
  if (next < 0) return [-next, -velocity];
  if (next > size) return [2 * size - next, -velocity];
  return [next, velocity];
}

export const firefliesSystem: System = {
  id: 'fireflies',
  step(world) {
    const state = world.fireflies;
    const rng = world.rng.fireflies;

    for (const fly of state.swarm) {
      fly.prevX = fly.x;
      fly.prevY = fly.y;
      fly.vx = clamp(fly.vx + floatRange(rng, -JITTER, JITTER), -MAX_SPEED_X, MAX_SPEED_X);
      fly.vy = clamp(fly.vy + floatRange(rng, -JITTER, JITTER), -MAX_SPEED_Y, MAX_SPEED_Y);
      [fly.x, fly.vx] = bounce(fly.x, fly.vx, FIELD.width);
      [fly.y, fly.vy] = bounce(fly.y, fly.vy, FIELD.height);
      if (chance(rng, BLINK)) fly.lit = !fly.lit;
    }

    for (const phase of eventsThisTick(world, 'phase_started')) {
      if (phase.phase === 'night' && state.swarm.length === 0) {
        const count = clamp(
          Math.round(normal(rng, SWARM.mean, SWARM.deviation)),
          SWARM.min,
          SWARM.max,
        );
        for (let i = 0; i < count; i++) {
          const x = floatRange(rng, 0, FIELD.width);
          const y = floatRange(rng, FIELD.height * 0.3, FIELD.height);
          state.swarm.push({
            id: state.nextId++,
            x,
            y,
            prevX: x,
            prevY: y,
            vx: floatRange(rng, -MAX_SPEED_X, MAX_SPEED_X),
            vy: floatRange(rng, -MAX_SPEED_Y, MAX_SPEED_Y),
            lit: chance(rng, 0.5),
          });
        }
        emit(world, { type: 'fireflies_rose', count }, { kind: 'event', event: phase.id });
      }
      if (phase.phase === 'dawn' && state.swarm.length > 0) {
        const count = state.swarm.length;
        state.swarm = [];
        emit(world, { type: 'fireflies_gone', count }, { kind: 'event', event: phase.id });
      }
    }
  },
};
