/**
 * Thought bubbles over the villagers (step 1.12, GDD §10.6): without a single number, what each one
 * wants. A pure function of the villager and the tick — the same picture for the same address.
 *
 *   - Asleep — the bubble of sleep (step 1.5), always.
 *   - Talking (step 2.2) — a speech bubble over the one whose turn it is to speak (they take turns,
 *     ../sim/social.ts `isSpeaking`); at ×1 and nearer.
 *   - A pressing need — its bubble for as long as it presses: hunger (the trudge,
 *     `movement.hungryPoints`), thirst, cold (shivering, `needs.warmth.shiverPoints`), sleepiness;
 *     the most pressing one if several.
 *   - A new intention — for `INTENT_TICKS` after the plan was chosen (`plan.since`): to eat, to
 *     drink, to sleep, to warm up, to carry wood, to pick food to store, to light or feed the fire,
 *     to scout («не знаю, куда идти»). Resting, sitting by the fire, an order — no bubble.
 *   - Far out they do not clutter the screen: at ×0,5 none, at ×1 only needs and sleep (no
 *     intentions) — `bubbleOf(…, zoom)`. The observer turns them off (key B, the menu «Мир»).
 */
import { DATA } from '../data/index.ts';
import type { Activity } from '../sim/minds.ts';
import { isShivering } from '../sim/needs.ts';
import { isSpeaking } from '../sim/social.ts';
import { isTrudging, type Villager } from '../sim/villagers.ts';

export type Thought =
  | 'food'
  | 'water'
  | 'sleep'
  | 'cold'
  | 'carry'
  | 'lost'
  | 'fire'
  | 'talk'
  | 'talk_left';

/** The sprite of each thought (src/art/sprites/bubble_*.ts). */
export const BUBBLE_SPRITE: Readonly<Record<Thought, string>> = {
  food: 'bubble_food',
  water: 'bubble_water',
  sleep: 'bubble_sleep',
  cold: 'bubble_cold',
  carry: 'bubble_carry',
  lost: 'bubble_lost',
  fire: 'bubble_fire',
  talk: 'bubble_talk',
  talk_left: 'bubble_talk_left',
};

/** How long a new intention shows over the head, ticks (5 s at ×1). */
export const INTENT_TICKS = 50;
/** Below these points thirst and sleep press (hunger — `movement.hungryPoints`, cold — shivering). */
export const PRESSING = { water: 20, sleep: 15 } as const;

/** The thought of an intention: what the plan is for. */
const INTENT: Readonly<Partial<Record<Activity, Thought>>> = {
  eat: 'food',
  drink: 'water',
  sleep: 'sleep',
  warm: 'cold',
  haul: 'carry',
  store: 'carry',
  kindle: 'fire',
  stoke: 'fire',
  scout: 'lost',
};

/** The most pressing need of an awake villager, as a thought; null — nothing presses. */
export function pressingOf(villager: Villager): Thought | null {
  const { needs } = villager;
  // Each need's share of its own threshold: the lowest presses most.
  const pressing: [Thought, number][] = [];
  if (isTrudging(villager)) {
    pressing.push(['food', needs.food / DATA.balance.movement.hungryPoints]);
  }
  if (needs.water < PRESSING.water) pressing.push(['water', needs.water / PRESSING.water]);
  if (isShivering(needs.warmth)) {
    pressing.push(['cold', needs.warmth / DATA.balance.needs.warmth.shiverPoints]);
  }
  if (needs.sleep < PRESSING.sleep) pressing.push(['sleep', needs.sleep / PRESSING.sleep]);
  let best: [Thought, number] | null = null;
  for (const entry of pressing) if (!best || entry[1] < best[1]) best = entry;
  return best ? best[0] : null;
}

/** The thought of a plan chosen less than `INTENT_TICKS` ago; null — none. */
export function intentOf(villager: Villager, tick: number): Thought | null {
  if (tick - villager.plan.since >= INTENT_TICKS) return null;
  return INTENT[villager.plan.activity] ?? null;
}

/**
 * The bubble over a villager at `tick` seen at zoom step `zoom` (src/render/camera.ts); `asleep` —
 * lying asleep (./villagers.ts). Null — no bubble.
 */
export function bubbleOf(
  villager: Villager,
  tick: number,
  asleep: boolean,
  zoom: number,
): Thought | null {
  if (zoom < 1) return null;
  if (asleep) return 'sleep';
  // Talking (step 2.2): the one whose turn it is to speak.
  // It reaches away from the one spoken to: to the left of one facing right.
  if (isSpeaking(villager, tick)) return villager.facing === 'e' ? 'talk_left' : 'talk';
  const pressing = pressingOf(villager);
  if (pressing) return pressing;
  return zoom >= 2 ? intentOf(villager, tick) : null;
}
