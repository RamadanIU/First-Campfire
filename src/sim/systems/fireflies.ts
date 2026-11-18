/**
 * Fireflies — night insects over the meadows, a permanent part of nature (ADR-018: the owner's
 * decision; GDD §10.5 lists fireflies among the animals). Born in step 0.2 over an abstract
 * meadow; since step 1.5 they live on the map.
 *
 * When night falls swarms rise over the map: a few clusters (`SWARM.clusters`) around random
 * spots over grass, sand or the shallows — never over the forest or deep water. The total is a
 * normal deviate. Every firefly wanders by a random walk, turns back at the edge of the map and
 * before a tree or deep water, and blinks; at dawn they are gone. Both events name the phase
 * change that caused them.
 *
 * Coordinates are map tiles, fractional: (x, y) — the point under the firefly (tile ⌊x⌋, ⌊y⌋).
 * The renderer turns them into world pixels.
 */

import { emit, eventsThisTick } from '../events.ts';
import { groundAt, inside } from '../map.ts';
import { clamp } from '../math.ts';
import { defOf, objectAt } from '../objects.ts';
import { chance, floatRange, intRange, normal } from '../rng.ts';
import type { System, World } from '../world.ts';

/** How many fly in a night and in how many swarms. */
const SWARM = { mean: 40, deviation: 8, min: 16, max: 64, clusters: 6 } as const;
/** How far from the middle of its swarm a firefly rises, tiles. */
const SPREAD = 2.5;
/** Tries to find a spot for a swarm, and for a firefly near it. */
const SPOT_TRIES = 64;
const FLY_TRIES = 8;
/** Speed limit and the random change of speed per tick, tiles. */
const MAX_SPEED = 0.04;
const JITTER = 0.008;
/** Chance per tick that a firefly switches its light on or off. */
const BLINK = 0.07;
/** Ground they never fly over, and the objects of the forest (data/objects.json `place`). */
const DEEP_WATER = 'deep_water';
const FOREST = 'forest';

export interface Firefly {
  id: number;
  /** Where it is, map tiles (fractional). */
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

/** May a firefly be over the point (x, y), tiles: on the map, not over deep water or a tree? */
export function canFlyOver(world: World, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inside(world.map, tx, ty)) return false;
  if (groundAt(world.map, tx, ty) === DEEP_WATER) return false;
  const object = objectAt(world.map, world.objects, tx, ty);
  return object === undefined || defOf(object).place !== FOREST;
}

/** A random spot for a swarm, or null if none was found in a few tries. */
function swarmSpot(world: World): { x: number; y: number } | null {
  const rng = world.rng.fireflies;
  const { width, height } = world.map;
  for (let attempt = 0; attempt < SPOT_TRIES; attempt++) {
    const x = intRange(rng, 0, width - 1) + 0.5;
    const y = intRange(rng, 0, height - 1) + 0.5;
    if (canFlyOver(world, x, y)) return { x, y };
  }
  return null;
}

/** Fireflies of a new night around the swarm spots; returns how many rose. */
function rise(world: World): number {
  const state = world.fireflies;
  const rng = world.rng.fireflies;
  const wanted = clamp(Math.round(normal(rng, SWARM.mean, SWARM.deviation)), SWARM.min, SWARM.max);
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < SWARM.clusters; i++) {
    const spot = swarmSpot(world);
    if (spot) spots.push(spot);
  }
  if (spots.length === 0) return 0;
  for (let i = 0; i < wanted; i++) {
    const spot = spots[i % spots.length]!;
    for (let attempt = 0; attempt < FLY_TRIES; attempt++) {
      const x = spot.x + floatRange(rng, -SPREAD, SPREAD);
      const y = spot.y + floatRange(rng, -SPREAD, SPREAD);
      if (!canFlyOver(world, x, y)) continue;
      state.swarm.push({
        id: state.nextId++,
        x,
        y,
        prevX: x,
        prevY: y,
        vx: floatRange(rng, -MAX_SPEED, MAX_SPEED),
        vy: floatRange(rng, -MAX_SPEED, MAX_SPEED),
        lit: chance(rng, 0.5),
      });
      break;
    }
  }
  return state.swarm.length;
}

export const firefliesSystem: System = {
  id: 'fireflies',
  step(world) {
    const state = world.fireflies;
    const rng = world.rng.fireflies;

    for (const fly of state.swarm) {
      fly.prevX = fly.x;
      fly.prevY = fly.y;
      fly.vx = clamp(fly.vx + floatRange(rng, -JITTER, JITTER), -MAX_SPEED, MAX_SPEED);
      fly.vy = clamp(fly.vy + floatRange(rng, -JITTER, JITTER), -MAX_SPEED, MAX_SPEED);
      const x = fly.x + fly.vx;
      const y = fly.y + fly.vy;
      if (canFlyOver(world, x, y)) {
        fly.x = x;
        fly.y = y;
      } else {
        // The edge of the map, a tree or deep water ahead: turn back.
        fly.vx = -fly.vx;
        fly.vy = -fly.vy;
      }
      if (chance(rng, BLINK)) fly.lit = !fly.lit;
    }

    for (const phase of eventsThisTick(world, 'phase_started')) {
      if (phase.phase === 'night' && state.swarm.length === 0) {
        const count = rise(world);
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
