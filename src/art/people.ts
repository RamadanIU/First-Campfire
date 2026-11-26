/**
 * People are put together like paper dolls (GDD §10.2, ADR-033): every person sprite gives its
 * hand-drawn parts — heads, bodies, clothes, hair — and this module assembles all the animations
 * from them, the same for everyone: standing (breathing, blinking, glancing aside), walking
 * (eight frames: the body bobs, the head follows a frame late, arms swing against the legs, a
 * skirt sways), sitting on the ground, holding a load overhead and carrying it. Arms and legs that
 * move a lot are drawn from joints (./rig.ts); legs seen from the front and the back are small
 * hand-drawn grids shared by everyone.
 *
 * The frame is 16×24 (ADR-033 over GDD §10.1's 12×18), the feet at the bottom middle; light falls
 * from the upper left, so facing left is the mirror of facing right with the light and the shade
 * of each material swapped back (docs/ART.md). Characters every part must use for this to work:
 * `o` outline, `e` the upper pixel of an eye (closed in a blink), `K k s` skin from light to shade;
 * the person's own legend maps the rest (hair `J j h`, clothes, ornaments).
 */
import { drawLimb, type Joint, type LimbInk } from './rig.ts';
import { type AnimationDef, composeFrame, type Layer, mirrorFrame, recolorGrid } from './sprite.ts';

export const PERSON_WIDTH = 16;
export const PERSON_HEIGHT = 24;
/** Between the feet on the bottom edge. */
export const PERSON_ANCHOR = { x: 8, y: 24 } as const;

/** Directions, as in the sprite's animation names: towards the viewer, away, right, left. */
export const DIRECTIONS = ['s', 'n', 'e', 'w'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Frames of the walking cycle: contact, down, passing, up — on one foot, then the other. */
export const WALK_FRAMES = 8;
/** How long a walking frame lasts at ×1, ms (the frame is picked by distance on the map). */
export const WALK_FRAME_MS = 100;

/** The hand-drawn parts of one person. Grids are 16 wide unless said otherwise. */
export interface PersonParts {
  /** Head from the front, from the top of the hair down (rows 0…); may hang locks over the shoulders. */
  readonly headS: string;
  /** Rows 6–7 of the front head with the eyes looking aside (a glance while standing). */
  readonly glanceS: string;
  readonly headN: string;
  /** Head in profile, facing right. */
  readonly headE: string;
  /** Front and back body from the neck (row 10): shoulders, chest, clothes; arms are separate. */
  readonly torsoS: string;
  readonly torsoN: string;
  /** Profile body from the neck (row 10), facing right, without arms and legs. */
  readonly bodyE: string;
  /** Drawn over the near arm in profile from row 11 (a fur cape on the shoulder); optional. */
  readonly shoulderE?: string;
  /** Drawn over the body but under the near arm in profile, from row `y` (hair down the back). */
  readonly backE?: { readonly grid: string; readonly y: number };
  /** A skirt that sways with the steps, from row `y`; front, back and profile. */
  readonly skirt?: {
    readonly s: string;
    readonly n: string;
    readonly e: string;
    readonly y: number;
  };
  /** Sitting in profile: drawn over the thighs (a skirt on the lap), from row `y`; optional. */
  readonly lapE?: { readonly grid: string; readonly y: number };
  /** What a limb's outline turns into where it crosses the body (e.g. `s`, a line of shade). */
  readonly limbEdge: string;
  /**
   * Swapped back after mirroring a profile (light stays upper left): pairs of a material's light
   * and dark characters, e.g. `{ J: 'h', G: 'f' }`; the skin's `K`/`s` is always swapped.
   */
  readonly mirrorSwap: Readonly<Record<string, string>>;
  /** Characters of the hair: on a head turned left only these swap light and shade. */
  readonly hairShades: string;
}

const W = PERSON_WIDTH;
const H = PERSON_HEIGHT;
const j = (x: number, y: number): Joint => ({ x, y });

/** Body bob over the walk, px down: low on the contact and the step after it. */
const BOB = [1, 1, 0, 0, 1, 1, 0, 0] as const;
/** How far the body (and what the hands hold overhead) is down on walking frame `frame`, px. */
export function walkBob(frame: number): number {
  return BOB[((frame % WALK_FRAMES) + WALK_FRAMES) % WALK_FRAMES]!;
}
/** The head follows the body a frame late — the neck squashes and stretches a little. */
const headBob = (i: number) => BOB[(i + WALK_FRAMES - 1) % WALK_FRAMES]!;
/** The skirt follows the hips: a pixel aside after each step. */
const SKIRT_SWAY = [0, 1, 1, 0, 0, -1, -1, 0] as const;

// ---- Front and back: arms and legs are small hand-drawn grids shared by everyone. ----

const ARM_LEFT = `
oKko
oKko
oKko
oKko
oKKo
.oo.
`;
const ARM_RIGHT = `
okso
okso
okso
okso
okko
.oo.
`;
const LEGS = `
....oKkookso....
....oKkookso....
....oKkookso....
....oKkookso....
...oKkkookkso...
...oooo..oooo...
`;
/** The left leg (as seen) lifted a pixel, then two, the right one standing. */
const LEGS_LIFT_1 = `
....oKkookso....
....oKkookso....
....oKkookso....
...oKkkookso....
...oooo.okkso...
.........oooo...
`;
const LEGS_LIFT_2 = `
....oKkookso....
....oKkookso....
...oKkkookso....
...oooo.okso....
........okkso...
.........oooo...
`;
const LIGHT_SWAP = { K: 's' } as const;
/**
 * Legs of the walk from the front: [legs, which arm is swung (foreshortened): −1 left, 1 right,
 * 0 none] — an arm swings furthest on the contact, hangs straight while the leg passes.
 */
const FRONT_STEPS: readonly (readonly [string, -1 | 0 | 1])[] = [
  [LEGS, 1],
  [LEGS_LIFT_1, 1],
  [LEGS_LIFT_2, 0],
  [LEGS_LIFT_1, -1],
  [LEGS, -1],
  [mirrorFrame(LEGS_LIFT_1, LIGHT_SWAP), -1],
  [mirrorFrame(LEGS_LIFT_2, LIGHT_SWAP), 0],
  [mirrorFrame(LEGS_LIFT_1, LIGHT_SWAP), 1],
];

const NEAR: LimbInk = { light: 'K', shade: 'k', outline: 'o' };
const FAR: LimbInk = { light: 'k', shade: 's', outline: 'o' };

/** A front or back frame. `arms` — 'down' (swinging by `swing`) or 'up' (holding a load overhead). */
interface FrontPose {
  readonly legs: string;
  readonly body: number;
  readonly head: number;
  readonly swing: -1 | 0 | 1;
  readonly arms: 'down' | 'up';
  readonly eyes: 'open' | 'blink' | 'glance';
  readonly sway: number;
  /** Raised hands: px down (they follow the walk's bob, not the breath). */
  readonly hands: number;
}

function raisedArm(side: -1 | 1, body: number): string {
  const x = side < 0 ? 2 : 12;
  const out = side < 0 ? -1 : 1;
  return drawLimb(W, H, {
    joints: [j(x, 13 + body), j(x + out, 9 + body), j(x + out, 4 + body)],
    ink: side < 0 ? NEAR : FAR,
    hand: true,
  });
}

function frontFrame(parts: PersonParts, back: boolean, pose: FrontPose): string {
  const head = back
    ? parts.headN
    : pose.eyes === 'blink'
      ? recolorGrid(parts.headS, { e: 'K' })
      : parts.headS;
  const layers: Layer[] = [{ grid: pose.legs, y: 18 }];
  if (pose.arms === 'down') {
    // A swinging arm is foreshortened: a pixel shorter, drawn further up under the shoulder.
    layers.push(
      { grid: ARM_LEFT, x: 1, y: 12 + pose.body - (pose.swing < 0 ? 1 : 0) },
      { grid: ARM_RIGHT, x: 11, y: 12 + pose.body - (pose.swing > 0 ? 1 : 0) },
    );
  }
  layers.push({ grid: back ? parts.torsoN : parts.torsoS, y: 10 + pose.body });
  if (parts.skirt) {
    layers.push({
      grid: back ? parts.skirt.n : parts.skirt.s,
      x: pose.sway,
      y: parts.skirt.y + pose.body,
    });
  }
  // Raised hands hold the load where the walk carries it (`hands`), whatever the breath does.
  if (pose.arms === 'up' && back) {
    layers.push(
      { grid: raisedArm(-1, pose.hands), over: { o: parts.limbEdge } },
      { grid: raisedArm(1, pose.hands), over: { o: parts.limbEdge } },
    );
  }
  layers.push({ grid: head, y: pose.head });
  if (!back && pose.eyes === 'glance') layers.push({ grid: parts.glanceS, y: 6 + pose.head });
  if (pose.arms === 'up' && !back) {
    layers.push(
      { grid: raisedArm(-1, pose.hands), over: { o: parts.limbEdge } },
      { grid: raisedArm(1, pose.hands), over: { o: parts.limbEdge } },
    );
  }
  return composeFrame(W, H, layers);
}

// ---- Profile: limbs from joints. ----

/** Where a leg's knee and ankle are relative to its hip (hip at x 7, y 17); lifted — toes down. */
type LegPose = readonly [knee: Joint, ankle: Joint, lifted: boolean];
const FWD: LegPose = [j(8, 19), j(9, 21), false];
const FWD_BENT: LegPose = [j(8, 19), j(8, 21), false];
const UNDER: LegPose = [j(7, 19), j(7, 21), false];
const BACK: LegPose = [j(6, 19), j(5, 21), false];
const BACK_LIFT: LegPose = [j(5, 19), j(4, 20), true];
const PASS_LIFT: LegPose = [j(7, 19), j(6, 20), true];
const FWD_LIFT: LegPose = [j(8, 18), j(9, 20), true];
/** [near leg, far leg] over the walk. */
const SIDE_STEPS: readonly (readonly [LegPose, LegPose])[] = [
  [FWD, BACK],
  [FWD_BENT, BACK_LIFT],
  [UNDER, PASS_LIFT],
  [BACK, FWD_LIFT],
  [BACK, FWD],
  [BACK_LIFT, FWD_BENT],
  [PASS_LIFT, UNDER],
  [FWD_LIFT, BACK],
];
/** The near hand's way forward of the shoulder over the walk, px (against the near leg). */
const SIDE_SWING = [-2, -2, -1, 1, 2, 2, 1, -1] as const;

interface SidePose {
  readonly legs: readonly [LegPose, LegPose];
  readonly body: number;
  readonly head: number;
  readonly swing: number;
  readonly arms: 'down' | 'up';
  readonly blink: boolean;
  readonly sway: number;
  readonly hands: number;
}

function leg(hipX: number, hipY: number, pose: LegPose, ink: LimbInk): string {
  const [knee, ankle, lifted] = pose;
  const dx = hipX - 7;
  return drawLimb(W, H, {
    joints: [
      j(hipX, hipY),
      j(knee.x + dx, Math.max(knee.y + hipY - 17, hipY + 1)),
      j(ankle.x + dx, ankle.y),
    ],
    ink,
    foot: { length: 3, dir: 1, lift: lifted },
  });
}

/** An arm hanging from the shoulder, its hand `swing` px forward (negative — back). */
function sideArm(shoulderX: number, shoulderY: number, swing: number, ink: LimbInk): string {
  const elbow = j(shoulderX + Math.sign(swing), shoulderY + 2);
  const hand = j(shoulderX + swing, shoulderY + 5 - (Math.abs(swing) > 1 ? 1 : 0));
  return drawLimb(W, H, { joints: [j(shoulderX, shoulderY), elbow, hand], ink, hand: true });
}

/** An arm raised to hold a load over the head (profile): up past the back of the head, the hand on top. */
function sideArmUp(shoulderX: number, shoulderY: number, ink: LimbInk): string {
  return drawLimb(W, H, {
    joints: [
      j(shoulderX, shoulderY),
      j(shoulderX - 2, shoulderY - 4),
      j(shoulderX - 1, shoulderY - 9),
    ],
    ink,
    hand: true,
  });
}

/** A layer of a profile frame; `head` — mirrored without swapping the skin (see `mirrorSide`). */
type SideLayer = Layer & { readonly head?: boolean };

function sideFrame(parts: PersonParts, pose: SidePose): SideLayer[] {
  const [near, far] = pose.legs;
  const hipY = 17 + pose.body;
  const shoulderY = 12 + pose.body;
  const handsY = 12 + pose.hands;
  const head = pose.blink ? recolorGrid(parts.headE, { e: 'K' }) : parts.headE;
  const edge = { o: parts.limbEdge };
  const layers: SideLayer[] = [
    {
      grid:
        pose.arms === 'up'
          ? sideArmUp(6, handsY, FAR)
          : sideArm(7, shoulderY, -pose.swing - 1, FAR),
    },
    { grid: leg(6, hipY, far, FAR) },
    { grid: leg(8, hipY, near, NEAR), over: { o: parts.limbEdge } },
    { grid: parts.bodyE, y: 10 + pose.body },
  ];
  if (parts.skirt) {
    layers.push({ grid: parts.skirt.e, x: pose.sway, y: parts.skirt.y + pose.body });
  }
  if (parts.backE) layers.push({ grid: parts.backE.grid, y: parts.backE.y + pose.head });
  if (pose.arms === 'down')
    layers.push({ grid: sideArm(8, shoulderY, pose.swing, NEAR), over: edge });
  if (parts.shoulderE) layers.push({ grid: parts.shoulderE, y: 11 + pose.body });
  layers.push({ grid: head, y: pose.head, head: true });
  // The near arm raised over the back of the head (not the face): the hold reads at a glance.
  if (pose.arms === 'up') layers.push({ grid: sideArmUp(8, handsY, NEAR) });
  return layers;
}

/** Legs of a person sitting on the ground in profile: knees up, bare feet forward. */
const SIT_LEGS = `
  ..........ooo...
  .........oKkko..
  ........oKkskso.
  .......oKkookso.
  ......oKkkookso.
  .....oKkkkooKkko
  .....oooooo.oooo
`;

/** Sitting on the ground in profile (by the fire): knees up, the near hand on the knee. */
function sitFrame(parts: PersonParts, exhale: number, blink: boolean): SideLayer[] {
  const lift = 5;
  const head = blink ? recolorGrid(parts.headE, { e: 'K' }) : parts.headE;
  const edge = { o: parts.limbEdge };
  const layers: SideLayer[] = [
    { grid: SIT_LEGS, y: 17 },
    { grid: parts.bodyE, y: 10 + lift },
  ];
  if (parts.lapE) layers.push({ grid: parts.lapE.grid, y: parts.lapE.y });
  if (parts.backE) layers.push({ grid: parts.backE.grid, y: parts.backE.y + lift + exhale });
  layers.push({
    grid: drawLimb(W, H, {
      joints: [j(8, 17 + exhale), j(9, 19), j(11, 18)],
      ink: NEAR,
      hand: true,
    }),
    over: edge,
  });
  if (parts.shoulderE) layers.push({ grid: parts.shoulderE, y: 11 + lift + exhale });
  layers.push({ grid: head, y: lift + exhale, head: true });
  return layers;
}

/** A profile frame facing right. */
function facingRight(layers: readonly SideLayer[]): string {
  return composeFrame(W, H, layers);
}

/**
 * The same frame facing left: every part mirrored, and the light and the shade of its materials
 * swapped back so that light still falls from the upper left — except the skin of the head: the
 * face turned left looks into the light and keeps its colours (only the hair swaps).
 */
function facingLeft(parts: PersonParts, layers: readonly SideLayer[]): string {
  const body = { ...LIGHT_SWAP, ...parts.mirrorSwap };
  const head = Object.fromEntries(
    Object.entries(parts.mirrorSwap).filter(
      ([a, b]) => parts.hairShades.includes(a) || parts.hairShades.includes(b),
    ),
  );
  return composeFrame(
    W,
    H,
    layers.map((layer) => {
      const grid = mirrorFrame(layer.grid, layer.head ? head : body);
      const width = grid.indexOf('\n') < 0 ? grid.length : grid.indexOf('\n');
      return { ...layer, grid, x: W - (layer.x ?? 0) - width };
    }),
  );
}

/**
 * Every animation of a person, in the order the game and the gallery expect: standing, walking,
 * sitting, holding overhead, carrying — each in the four directions where it has them.
 */
export function personAnimations(parts: PersonParts): Record<string, AnimationDef> {
  const still = { legs: LEGS, swing: 0, arms: 'down', sway: 0, hands: 0 } as const;
  // Standing: breathe out (all but the legs sink a pixel), blink, glance aside.
  const idleS = [
    frontFrame(parts, false, { ...still, body: 0, head: 0, eyes: 'open' }),
    frontFrame(parts, false, { ...still, body: 1, head: 1, eyes: 'open' }),
    frontFrame(parts, false, { ...still, body: 0, head: 0, eyes: 'open' }),
    frontFrame(parts, false, { ...still, body: 0, head: 0, eyes: 'blink' }),
    frontFrame(parts, false, { ...still, body: 0, head: 0, eyes: 'open' }),
    frontFrame(parts, false, { ...still, body: 1, head: 1, eyes: 'open' }),
    frontFrame(parts, false, { ...still, body: 0, head: 0, eyes: 'glance' }),
  ];
  const idleMs = [800, 700, 600, 100, 500, 800, 900];
  const idleN = [0, 1, 0, 0, 0, 1, 0].map((sink) =>
    frontFrame(parts, true, { ...still, body: sink, head: sink, eyes: 'open' }),
  );
  const sideStill = { legs: [UNDER, UNDER], swing: 0, arms: 'down', sway: 0, hands: 0 } as const;
  const idleE = [0, 1, 0, -1, 0, 1, 0].map((sink) =>
    sideFrame(parts, {
      ...sideStill,
      body: Math.max(sink, 0),
      head: Math.max(sink, 0),
      blink: sink < 0,
    }),
  );

  const walk = (back: boolean, arms: 'down' | 'up') =>
    FRONT_STEPS.map(([legs, swing], i) =>
      frontFrame(parts, back, {
        legs,
        body: BOB[i]!,
        head: headBob(i),
        swing: arms === 'down' ? swing : 0,
        arms,
        eyes: 'open',
        sway: SKIRT_SWAY[i]!,
        hands: BOB[i]!,
      }),
    );
  const walkSide = (arms: 'down' | 'up') =>
    SIDE_STEPS.map((legs, i) =>
      sideFrame(parts, {
        legs,
        body: BOB[i]!,
        head: headBob(i),
        swing: SIDE_SWING[i]!,
        arms,
        blink: false,
        sway: -Math.abs(SKIRT_SWAY[i]!),
        hands: BOB[i]!,
      }),
    );
  const walkE = walkSide('down');
  const sitE = [sitFrame(parts, 0, false), sitFrame(parts, 1, false), sitFrame(parts, 0, true)];
  const right = (frames: readonly SideLayer[][]) => frames.map(facingRight);
  const left = (frames: readonly SideLayer[][]) => frames.map((f) => facingLeft(parts, f));
  const sitMs = [900, 800, 100];

  // Holding a load overhead: arms up, breathing; carrying: the same arms on the walk.
  const holdS = [0, 1].map((sink) =>
    frontFrame(parts, false, { ...still, arms: 'up', body: sink, head: sink, eyes: 'open' }),
  );
  const holdN = [0, 1].map((sink) =>
    frontFrame(parts, true, { ...still, arms: 'up', body: sink, head: sink, eyes: 'open' }),
  );
  const holdE = [0, 1].map((sink) =>
    sideFrame(parts, { ...sideStill, arms: 'up', body: sink, head: sink, blink: false }),
  );
  const holdMs = [900, 700];
  const carryE = walkSide('up');

  return {
    idle_s: { frames: idleS, frameMs: idleMs },
    idle_n: { frames: idleN, frameMs: idleMs },
    idle_e: { frames: right(idleE), frameMs: idleMs },
    idle_w: { frames: left(idleE), frameMs: idleMs },
    walk_s: { frames: walk(false, 'down'), frameMs: WALK_FRAME_MS },
    walk_n: { frames: walk(true, 'down'), frameMs: WALK_FRAME_MS },
    walk_e: { frames: right(walkE), frameMs: WALK_FRAME_MS },
    walk_w: { frames: left(walkE), frameMs: WALK_FRAME_MS },
    sit_e: { frames: right(sitE), frameMs: sitMs },
    sit_w: { frames: left(sitE), frameMs: sitMs },
    hold_s: { frames: holdS, frameMs: holdMs },
    hold_n: { frames: holdN, frameMs: holdMs },
    hold_e: { frames: right(holdE), frameMs: holdMs },
    hold_w: { frames: left(holdE), frameMs: holdMs },
    carry_s: { frames: walk(false, 'up'), frameMs: WALK_FRAME_MS },
    carry_n: { frames: walk(true, 'up'), frameMs: WALK_FRAME_MS },
    carry_e: { frames: right(carryE), frameMs: WALK_FRAME_MS },
    carry_w: { frames: left(carryE), frameMs: WALK_FRAME_MS },
  };
}
