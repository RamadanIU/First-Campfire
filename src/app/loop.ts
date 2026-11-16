/**
 * Game loop with a fixed simulation step.
 *
 * Real time between animation frames is turned into whole simulation ticks: 10 ticks per second
 * at ×1, 200 at ×20, none on pause. The number of ticks depends only on elapsed time, not on the
 * frame rate, so a 30 fps laptop and a 144 fps monitor see the same history.
 *
 * Protection against the "spiral of death" (a slow frame demands more ticks, which makes the next
 * frame even slower): a single frame never counts for more than `maxFrameMs` of real time, and
 * stepping stops once it has used `budgetMs` of the frame. Ticks that did not fit are dropped —
 * the world slows down instead of freezing the page — and `lagging` turns on.
 *
 * `alpha` (0 … 1) is how far real time has gone towards the next tick: the renderer interpolates
 * between the previous and the current tick with it for smooth motion.
 */

/** Available speeds: pause, ×1, ×2, ×5, ×20. */
export const SPEEDS = [0, 1, 2, 5, 20] as const;
export type Speed = (typeof SPEEDS)[number];

export interface LoopOptions {
  /** Ticks per real second at ×1 (GDD §2.1: 10). */
  ticksPerSecond: number;
  speed?: Speed;
  /** Longest real time one frame may count for, ms (a background tab, a debugger pause). */
  maxFrameMs?: number;
  /** Most real time one frame may spend on simulation, ms. */
  budgetMs?: number;
  /** Clock for the budget, ms. Injected by tests. */
  now?: () => number;
}

export interface GameLoop {
  readonly speed: Speed;
  /** How far towards the next tick, [0, 1). */
  readonly alpha: number;
  /** True if the last frame could not run all the ticks it owed. */
  readonly lagging: boolean;
  /** Ticks run since the loop was created. */
  readonly ticksRun: number;
  setSpeed(speed: Speed): void;
  /** Pause, or resume at the speed before the pause. */
  togglePause(): void;
  /** Account for `elapsedMs` of real time; runs due ticks and returns how many ran. */
  advance(elapsedMs: number): number;
}

/** Ticks closer to due than this (in ms of simulated time) count as due: float sums wobble. */
const EPSILON_MS = 1e-6;

export function isSpeed(value: number): value is Speed {
  return (SPEEDS as readonly number[]).includes(value);
}

export function createGameLoop(step: () => void, options: LoopOptions): GameLoop {
  const tickMs = 1000 / options.ticksPerSecond;
  const maxFrameMs = options.maxFrameMs ?? 250;
  const budgetMs = options.budgetMs ?? 30;
  const now = options.now ?? (() => performance.now());

  let speed: Speed = options.speed ?? 1;
  let resumeSpeed: Speed = speed === 0 ? 1 : speed;
  /** Simulated time owed to the world, ms. */
  let owed = 0;
  let lagging = false;
  let ticksRun = 0;

  return {
    get speed() {
      return speed;
    },
    get alpha() {
      return Math.min(Math.max(owed / tickMs, 0), 1 - Number.EPSILON);
    },
    get lagging() {
      return lagging;
    },
    get ticksRun() {
      return ticksRun;
    },
    setSpeed(next) {
      speed = next;
      if (next !== 0) resumeSpeed = next;
    },
    togglePause() {
      if (speed === 0) speed = resumeSpeed;
      else {
        resumeSpeed = speed;
        speed = 0;
      }
    },
    advance(elapsedMs) {
      const real = Number.isFinite(elapsedMs) ? Math.min(Math.max(elapsedMs, 0), maxFrameMs) : 0;
      owed += real * speed;
      let ran = 0;
      lagging = false;
      const started = now();
      while (owed >= tickMs - EPSILON_MS) {
        step();
        owed -= tickMs;
        ran++;
        if (owed >= tickMs - EPSILON_MS && now() - started >= budgetMs) {
          // Out of time: drop the ticks still owed, keep the fraction for smooth interpolation.
          owed %= tickMs;
          lagging = true;
          break;
        }
      }
      ticksRun += ran;
      return ran;
    },
  };
}
