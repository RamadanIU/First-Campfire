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
  /** Rows of the front head with the mouth open (a yawn, step 1.12), from row `y` of the head. */
  readonly yawnS: { readonly grid: string; readonly y: number };
  /** The same in profile (facing right). */
  readonly yawnE: { readonly grid: string; readonly y: number };
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

// ---- Actions (step 1.12): squatting, reaching, eating, drinking, the fire, cold, yawning. ----

/** An arm of a front or back action pose: its joints, whose ink (−1 lit, 1 shaded), its layer. */
interface Arm {
  readonly joints: readonly Joint[];
  readonly side: -1 | 1;
  /**
   * `under` — behind the body (from the back an arm reaching forward hides behind it), `body` —
   * over the body, under the head, `top` — over the head (a hand at the mouth; from the back —
   * over the body, under the head).
   */
  readonly on: 'under' | 'body' | 'top';
}

/** A front or back frame of an action (step 1.12). */
interface ActionFront {
  /** Body and head down, px (squatting, hunching). */
  readonly lower: number;
  readonly legs: string;
  readonly legsY: number;
  /** The legs in front of the body (knees of one squatting, seen from the front). */
  readonly legsOver?: boolean;
  /** Arms drawn from joints; `down` — the hanging arms, lowered with the body (and `reach` more). */
  readonly arms: readonly Arm[] | 'down';
  readonly reach?: number;
  /** With arms from joints: which of the hanging arms (as seen) stays down. */
  readonly hang?: 'left' | 'right';
  /** The head further down (a nod while chewing), px. */
  readonly nod?: number;
  readonly blink?: boolean;
  /** The mouth open (a yawn). */
  readonly mouth?: boolean;
  /** The whole figure aside, px (shivering). */
  readonly shift?: number;
}

/** Squatting seen from the front: the knees come forward over the belly, the feet flat. */
const SQUAT_KNEES = `
...oooo..oooo...
..oKkksooKkkso..
..oKkksooKkkso..
...oksso.oksso..
...oKso...oKso..
..oKkso..oKkso..
..ooooo..ooooo..
`;
/** Squatting seen from the back: the knees stick out to the sides, the feet flat. */
const SQUAT_LEGS = `
...oKko..okso...
..oKkkso.okkso..
.oKkkso...okkso.
.oKkso.....okso.
.ooooo.....oooo.
`;
/** Sitting cross-legged from the front: shins crossed before the body. */
const CROSSED_LEGS = `
...ooooooooooo..
..oKkkkoKkkkkso.
.oKkkkkkkkkkksso
.ooooooooooooooo
`;

function armLayer(parts: PersonParts, arm: Arm): Layer {
  return {
    grid: drawLimb(W, H, { joints: arm.joints, ink: arm.side < 0 ? NEAR : FAR, hand: true }),
    over: { o: parts.limbEdge },
  };
}

/** A whole frame moved `dx` px aside. */
function shifted(frame: string, dx: number): string {
  return dx === 0 ? frame : composeFrame(W, H, [{ grid: frame, x: dx }]);
}

function actionFront(parts: PersonParts, back: boolean, pose: ActionFront): string {
  const body = pose.lower;
  const headY = body + (pose.nod ?? 0);
  const arms = pose.arms === 'down' ? [] : pose.arms;
  const on = (layer: Arm['on']) => arms.filter((arm) => arm.on === layer);
  const layers: Layer[] = pose.legsOver ? [] : [{ grid: pose.legs, y: pose.legsY }];
  const hangY = 12 + body + (pose.reach ?? 0);
  if (pose.arms === 'down' || pose.hang === 'left') layers.push({ grid: ARM_LEFT, x: 1, y: hangY });
  if (pose.arms === 'down' || pose.hang === 'right') {
    layers.push({ grid: ARM_RIGHT, x: 11, y: hangY });
  }
  const before = back ? [...on('under'), ...on('body')] : on('under');
  for (const arm of before) layers.push(armLayer(parts, arm));
  layers.push({ grid: back ? parts.torsoN : parts.torsoS, y: 10 + body });
  if (parts.skirt) {
    layers.push({ grid: back ? parts.skirt.n : parts.skirt.s, y: parts.skirt.y + body });
  }
  if (pose.legsOver) layers.push({ grid: pose.legs, y: pose.legsY });
  for (const arm of back ? on('top') : on('body')) layers.push(armLayer(parts, arm));
  const shut = (grid: string) => (pose.blink || pose.mouth ? recolorGrid(grid, { e: 'K' }) : grid);
  layers.push({ grid: back ? parts.headN : shut(parts.headS), y: headY });
  if (!back && pose.mouth) layers.push({ grid: shut(parts.yawnS.grid), y: parts.yawnS.y + headY });
  if (!back) for (const arm of on('top')) layers.push(armLayer(parts, arm));
  return shifted(composeFrame(W, H, layers), pose.shift ?? 0);
}

/** A profile frame of an action, facing right (step 1.12). */
interface ActionSide {
  /** Body and head down, px; `lean` — forward. */
  readonly lower: number;
  readonly lean: number;
  /** The head further down (a nod), px. */
  readonly nod?: number;
  readonly legs: 'stand' | 'squat';
  /** Walking legs instead of standing ones (the hungry trudge). */
  readonly steps?: readonly [LegPose, LegPose];
  /** The near and the far arm by their joints; null — hanging. */
  readonly near: readonly Joint[] | null;
  readonly far: readonly Joint[] | null;
  /** The near arm over the head (a hand at the mouth). */
  readonly nearOnTop?: boolean;
  readonly blink?: boolean;
  readonly mouth?: boolean;
  /** Drawn in the hands (a fire drill), over everything but the near arm. */
  readonly prop?: string;
}

/** A squatting leg in profile: the thigh forward and up to the knee, the shin down to the foot. */
function squatLeg(hipX: number, hipY: number, ink: LimbInk): string {
  return drawLimb(W, H, {
    joints: [j(hipX, hipY), j(hipX + 4, hipY - 3), j(hipX + 3, 21)],
    ink,
    foot: { length: 3, dir: 1 },
  });
}

function actionSide(parts: PersonParts, pose: ActionSide): SideLayer[] {
  const { lower, lean } = pose;
  const headY = lower + (pose.nod ?? 0);
  const shoulderY = 12 + lower;
  const edge = { o: parts.limbEdge };
  const head = pose.blink || pose.mouth ? recolorGrid(parts.headE, { e: 'K' }) : parts.headE;
  const limb = (joints: readonly Joint[], ink: LimbInk) =>
    drawLimb(W, H, { joints, ink, hand: true });
  const layers: SideLayer[] = [
    { grid: pose.far ? limb(pose.far, FAR) : sideArm(7 + lean, shoulderY, -1, FAR) },
  ];
  if (pose.legs === 'squat') {
    layers.push({ grid: squatLeg(6 + lean, 16 + lower, FAR) });
  } else {
    const [nearLeg, farLeg] = pose.steps ?? [UNDER, UNDER];
    layers.push(
      { grid: leg(6, 17 + lower, farLeg, FAR) },
      { grid: leg(8, 17 + lower, nearLeg, NEAR), over: edge },
    );
  }
  layers.push({ grid: parts.bodyE, x: lean, y: 10 + lower });
  if (parts.skirt) layers.push({ grid: parts.skirt.e, x: lean, y: parts.skirt.y + lower });
  if (parts.backE) layers.push({ grid: parts.backE.grid, x: lean, y: parts.backE.y + headY });
  const near = pose.near ? limb(pose.near, NEAR) : sideArm(8 + lean, shoulderY, 0, NEAR);
  if (!pose.nearOnTop) layers.push({ grid: near, over: edge });
  // The near thigh of one squatting is in front of the belly and the arm, its outline kept dark.
  if (pose.legs === 'squat') layers.push({ grid: squatLeg(8 + lean, 16 + lower, NEAR) });
  if (parts.shoulderE) layers.push({ grid: parts.shoulderE, x: lean, y: 11 + lower });
  layers.push({ grid: head, x: lean, y: headY, head: true });
  if (pose.mouth) {
    const yawn = recolorGrid(parts.yawnE.grid, { e: 'K' });
    layers.push({ grid: yawn, x: lean, y: parts.yawnE.y + headY, head: true });
  }
  if (pose.prop) layers.push({ grid: pose.prop });
  if (pose.nearOnTop) layers.push({ grid: near, over: edge });
  return layers;
}

/** Joints from (x, y) pairs. */
const js = (...points: readonly (readonly [number, number])[]): Joint[] =>
  points.map(([x, y]) => j(x, y));

/** A fire drill held upright between the palms (profile, facing right). */
const DRILL = composeFrame(W, H, [
  {
    grid: `
      .o.
      .o.
      .o.
      .o.
      ogo
      ooo
    `,
    x: 12,
    y: 17,
  },
]);

/** Every action animation (step 1.12) in four directions: name → frames and their times. */
function actionAnimations(parts: PersonParts): Record<string, AnimationDef> {
  const right = (frames: readonly SideLayer[][]) => frames.map(facingRight);
  const left = (frames: readonly SideLayer[][]) => frames.map((f) => facingLeft(parts, f));
  const sides = (name: string, frames: SideLayer[][], frameMs: number | number[]) => ({
    [`${name}_e`]: { frames: right(frames), frameMs },
    [`${name}_w`]: { frames: left(frames), frameMs },
  });
  const fronts = (
    name: string,
    front: readonly ActionFront[],
    back: readonly ActionFront[],
    frameMs: number | number[],
  ) => ({
    [`${name}_s`]: { frames: front.map((pose) => actionFront(parts, false, pose)), frameMs },
    [`${name}_n`]: { frames: back.map((pose) => actionFront(parts, true, pose)), frameMs },
  });
  const stand = { lower: 0, legs: LEGS, legsY: 18 } as const;
  const squat = { lower: 4, legs: SQUAT_KNEES, legsY: 17, legsOver: true } as const;
  const squatBack = { lower: 4, legs: SQUAT_LEGS, legsY: 19 } as const;
  const squatSide = { lower: 4, lean: 1, legs: 'squat' } as const;
  const standSide = { lower: 0, lean: 0, legs: 'stand' } as const;

  // Squatting to the ground: picks up, puts down, takes from the pile — hands at the feet, busy.
  const crouchMs = [450, 450];
  const crouchE: SideLayer[][] = [
    actionSide(parts, {
      ...squatSide,
      near: js([9, 16], [11, 18], [12, 21]),
      far: js([8, 16], [10, 18], [10, 21]),
    }),
    actionSide(parts, {
      ...squatSide,
      near: js([9, 16], [11, 18], [13, 20]),
      far: js([8, 16], [10, 18], [11, 21]),
    }),
  ];
  const ground = (a: number, b: number, on: Arm['on']): Arm[] => [
    { joints: js([2, 16], [3, 19], [5, 21 + a]), side: -1, on },
    { joints: js([13, 16], [12, 19], [9, 21 + b]), side: 1, on },
  ];
  const crouchS: ActionFront[] = [
    { ...squat, arms: 'down', reach: 2 },
    { ...squat, arms: 'down', reach: 1 },
  ];
  const crouchN: ActionFront[] = [
    { ...squatBack, arms: ground(1, 0, 'under') },
    { ...squatBack, arms: ground(0, 1, 'under') },
  ];

  // Picking from a bush in front: the near hand reaches into it, pulls back, reaches higher.
  const gatherMs = [350, 250, 350];
  const reach = js([8, 12], [10, 12], [13, 11]);
  const pull = js([8, 12], [10, 14], [11, 13]);
  const reachHigh = js([8, 12], [10, 11], [13, 9]);
  const gatherE = [reach, pull, reachHigh].map((near) =>
    actionSide(parts, { ...standSide, near, far: null }),
  );
  const nearReach: Arm = { joints: js([2, 12], [2, 15], [5, 18]), side: -1, on: 'body' };
  const nearPull: Arm = { joints: js([2, 12], [2, 16], [5, 15]), side: -1, on: 'body' };
  const farReach: Arm = { joints: js([13, 12], [13, 15], [9, 18]), side: 1, on: 'body' };
  const gatherS: ActionFront[] = [
    { ...stand, arms: [nearReach], hang: 'right' },
    { ...stand, arms: [nearPull], hang: 'right' },
    { ...stand, arms: [farReach], hang: 'left' },
  ];
  const backReach = (hand: number): Arm[] => [
    { joints: js([2, 12], [1, 14 - hand], [4, 13]), side: -1, on: 'under' },
    { joints: js([13, 12], [14, 15], [11, 14]), side: 1, on: 'under' },
  ];
  const gatherN = [1, 0, 2].map((hand) => ({ ...stand, arms: backReach(hand) }));

  // Eating at a bush: reach, pull, the hand to the mouth, chew (the head nods).
  const eatMs = [300, 200, 350, 200, 200, 200];
  const toMouth = js([8, 12], [10, 15], [11, 9]);
  const eatE = [
    actionSide(parts, { ...standSide, near: reach, far: null }),
    actionSide(parts, { ...standSide, near: pull, far: null }),
    actionSide(parts, { ...standSide, near: toMouth, far: null, nearOnTop: true }),
    actionSide(parts, {
      ...standSide,
      lower: 1,
      near: js([8, 13], [10, 16], [11, 10]),
      far: null,
      nearOnTop: true,
    }),
    actionSide(parts, { ...standSide, near: toMouth, far: null, nearOnTop: true }),
    actionSide(parts, {
      ...standSide,
      lower: 1,
      near: js([8, 13], [10, 16], [11, 10]),
      far: null,
      nearOnTop: true,
    }),
  ];
  const mouthS = (body: number): Arm[] => [
    { joints: js([2, 12 + body], [2, 16 + body], [6, 9 + body]), side: -1, on: 'top' },
  ];
  const eatS: ActionFront[] = [
    { ...stand, arms: [nearReach], hang: 'right' },
    { ...stand, arms: [nearPull], hang: 'right' },
    { ...stand, arms: mouthS(0), hang: 'right' },
    { ...stand, lower: 1, arms: mouthS(1), hang: 'right' },
    { ...stand, arms: mouthS(0), hang: 'right' },
    { ...stand, lower: 1, arms: mouthS(1), hang: 'right' },
  ];
  const mouthN = (body: number): Arm[] => [
    { joints: js([2, 12 + body], [0, 14 + body], [4, 9 + body]), side: -1, on: 'under' },
  ];
  const eatN = [
    { ...stand, arms: backReach(1) },
    { ...stand, arms: backReach(0) },
    { ...stand, arms: mouthN(0) },
    { ...stand, lower: 1, arms: mouthN(1) },
    { ...stand, arms: mouthN(0) },
    { ...stand, lower: 1, arms: mouthN(1) },
  ];

  // Eating from the store at one's feet: squat, take a handful, eat it.
  const munchMs = [450, 350, 200, 200, 200];
  const squatMouth = js([9, 16], [11, 19], [12, 13]);
  const squatChew = js([9, 17], [11, 20], [12, 14]);
  const munchE = [
    crouchE[0]!,
    actionSide(parts, { ...squatSide, near: squatMouth, far: null, nearOnTop: true }),
    actionSide(parts, { ...squatSide, lower: 5, near: squatChew, far: null, nearOnTop: true }),
    actionSide(parts, { ...squatSide, near: squatMouth, far: null, nearOnTop: true }),
    actionSide(parts, { ...squatSide, lower: 5, near: squatChew, far: null, nearOnTop: true }),
  ];
  const squatMouthS = (body: number): Arm[] => [
    { joints: js([2, 16 + body], [2, 20 + body], [6, 13 + body]), side: -1, on: 'top' },
  ];
  const squatMouthN = (body: number): Arm[] => [
    { joints: js([2, 16 + body], [0, 18 + body], [4, 13 + body]), side: -1, on: 'under' },
  ];
  const munchS = [
    crouchS[0]!,
    { ...squat, arms: squatMouthS(0) },
    { ...squat, lower: 5, arms: squatMouthS(1) },
    { ...squat, arms: squatMouthS(0) },
    { ...squat, lower: 5, arms: squatMouthS(1) },
  ];
  const munchN = [
    crouchN[0]!,
    { ...squatBack, arms: squatMouthN(0) },
    { ...squatBack, lower: 5, arms: squatMouthN(1) },
    { ...squatBack, arms: squatMouthN(0) },
    { ...squatBack, lower: 5, arms: squatMouthN(1) },
  ];

  // Drinking at the water's edge: squat, scoop with both hands, lift them to the mouth, sip.
  const drinkMs = [350, 150, 450, 200];
  const drinkE = [
    actionSide(parts, {
      ...squatSide,
      lean: 2,
      near: js([10, 16], [12, 18], [14, 21]),
      far: js([9, 16], [11, 18], [13, 21]),
    }),
    actionSide(parts, {
      ...squatSide,
      near: js([9, 16], [11, 19], [13, 17]),
      far: js([8, 16], [10, 19], [12, 17]),
    }),
    actionSide(parts, {
      ...squatSide,
      near: squatMouth,
      far: js([8, 16], [10, 19], [11, 13]),
      nearOnTop: true,
    }),
    actionSide(parts, {
      ...squatSide,
      nod: -1,
      near: js([9, 16], [11, 19], [12, 12]),
      far: js([8, 16], [10, 19], [11, 12]),
      nearOnTop: true,
    }),
  ];
  const cup = (y: number, on: Arm['on']): Arm[] => [
    { joints: js([2, 16], [2, 19], [6, y]), side: -1, on },
    { joints: js([13, 16], [13, 19], [8, y]), side: 1, on },
  ];
  const drinkS = [
    { ...squat, arms: 'down', reach: 2 },
    { ...squat, arms: cup(18, 'body') },
    { ...squat, arms: cup(13, 'top') },
    { ...squat, nod: -1, arms: cup(12, 'top') },
  ] as const;
  const drinkN = [
    { ...squatBack, arms: 'down', reach: 2 },
    { ...squatBack, arms: cup(18, 'under') },
    { ...squatBack, arms: cup(13, 'under') },
    { ...squatBack, nod: -1, arms: cup(12, 'under') },
  ] as const;

  // Lighting the fire: squatting, the palms rub a drill to and fro.
  const kindleMs = 120;
  const kindleE = [0, 1, 0, -1].map((dx) =>
    actionSide(parts, {
      ...squatSide,
      near: js([9, 16], [11, 18], [12 + dx, 18]),
      far: js([8, 16], [10, 19], [12 - dx, 20]),
      prop: DRILL,
    }),
  );
  const rub = (dx: number, on: Arm['on']): Arm[] => [
    { joints: js([2, 16], [3, 20], [6 + dx, 19]), side: -1, on },
    { joints: js([13, 16], [12, 20], [8 + dx, 19]), side: 1, on },
  ];
  const kindleS = [0, 1, 0, -1].map((dx) => ({ ...squat, arms: rub(dx, 'body') }));
  const kindleN = [0, 1, 0, -1].map((dx) => ({ ...squatBack, arms: rub(dx, 'under'), shift: 0 }));

  // Feeding the fire: squatting, the near arm draws back and pushes the wood in.
  const stokeMs = [450, 350];
  const stokeE = [
    actionSide(parts, { ...squatSide, near: js([9, 16], [10, 19], [11, 18]), far: null }),
    actionSide(parts, { ...squatSide, lean: 2, near: js([10, 16], [12, 17], [14, 18]), far: null }),
  ];
  const push = (y: number, on: Arm['on']): Arm[] => [
    { joints: js([2, 16], [2, 19], [5, y]), side: -1, on },
  ];
  const stokeS = [
    { ...squat, arms: push(20, 'body') },
    { ...squat, arms: push(22, 'body') },
  ];
  const stokeN = [
    { ...squatBack, arms: push(19, 'under') },
    { ...squatBack, arms: push(21, 'under') },
  ];

  // Shivering with cold: hunched, the arms hugging the body, the whole figure trembling.
  const shiverMs = 90;
  const hug = (dx: number) =>
    actionSide(parts, {
      lower: 1,
      lean: dx,
      legs: 'stand',
      near: js([8 + dx, 13], [10 + dx, 16], [7 + dx, 15]),
      far: js([7 + dx, 13], [9 + dx, 16], [9 + dx, 15]),
    });
  const shiverE = [hug(0), hug(1), hug(0), hug(1)];
  const hugFront = (on: Arm['on']): Arm[] => [
    { joints: js([2, 13], [2, 17], [10, 15]), side: -1, on },
    { joints: js([13, 13], [13, 17], [6, 16]), side: 1, on },
  ];
  const shiverS = [0, 1, 0, 1].map((shift) => ({
    ...stand,
    lower: 1,
    arms: hugFront('body'),
    shift,
  }));
  const shiverN = [0, 1, 0, 1].map((shift) => ({
    ...stand,
    lower: 1,
    arms: hugFront('under'),
    shift,
  }));

  // Yawning: stands, stretches both arms up, the mouth wide open, the eyes shut; then stands.
  const yawnMs = [1300, 300, 900, 300, 1200];
  const stretchE = (high: boolean): SideLayer[] =>
    actionSide(parts, {
      ...standSide,
      nod: high ? -1 : 0,
      near: high ? js([8, 12], [6, 8], [7, 3]) : js([8, 12], [10, 10], [9, 7]),
      far: high ? js([7, 12], [5, 8], [6, 3]) : js([7, 12], [9, 10], [8, 7]),
      mouth: high,
    });
  const yawnE = [
    actionSide(parts, { ...standSide, near: null, far: null }),
    stretchE(false),
    stretchE(true),
    stretchE(false),
    actionSide(parts, { ...standSide, near: null, far: null, blink: true }),
  ];
  const upArms = (high: boolean, on: Arm['on']): Arm[] => [
    { joints: js([2, 12], [1, high ? 8 : 10], [2, high ? 3 : 7]), side: -1, on },
    { joints: js([13, 12], [14, high ? 8 : 10], [13, high ? 3 : 7]), side: 1, on },
  ];
  const yawnS = [
    { ...stand, arms: 'down' },
    { ...stand, arms: upArms(false, 'top') },
    { ...stand, nod: -1, arms: upArms(true, 'top'), mouth: true },
    { ...stand, arms: upArms(false, 'top') },
    { ...stand, arms: 'down', blink: true },
  ] as const;
  const yawnN = [
    { ...stand, arms: 'down' },
    { ...stand, arms: upArms(false, 'top') },
    { ...stand, nod: -1, arms: upArms(true, 'top') },
    { ...stand, arms: upArms(false, 'top') },
    { ...stand, arms: 'down' },
  ] as const;

  // Sitting facing the viewer or the fire beyond (from the back): cross-legged, hands on the knees.
  const sitMs = [900, 800, 100];
  const sitPose = (breath: number, blink: boolean, back: boolean): ActionFront => ({
    lower: 5 + breath,
    legs: CROSSED_LEGS,
    legsY: 20,
    legsOver: !back,
    arms: 'down',
    reach: -breath,
    blink,
  });
  const sitS = [sitPose(0, false, false), sitPose(1, false, false), sitPose(0, true, false)];
  const sitN = [sitPose(0, false, true), sitPose(1, false, true), sitPose(0, true, true)];

  // The hungry trudge (GDD, pillar 2): hunched, the head hanging forward, a hand on the belly;
  // the legs of the walk, the frame picked by the way walked like any walk.
  const trudgeE = SIDE_STEPS.map((steps, i) => {
    const b = BOB[i]!;
    return actionSide(parts, {
      lower: 1 + b,
      lean: 0,
      nod: 0,
      legs: 'stand',
      steps,
      near: js([8, 13 + b], [10, 16 + b], [11, 15 + b]),
      far: js([7, 13 + b], [7 + (SIDE_SWING[i]! > 0 ? 0 : 1), 16 + b], [7, 18 + b]),
    }).map((layer) => (layer.head ? { ...layer, x: (layer.x ?? 0) + 1 } : layer));
  });
  const belly = (b: number, on: Arm['on']): Arm[] => [
    { joints: js([2, 13 + b], [2, 17 + b], [7, 17 + b]), side: -1, on },
  ];
  const trudgeFront = (back: boolean) =>
    FRONT_STEPS.map(([legs], i) =>
      actionFront(parts, back, {
        lower: 1 + BOB[i]!,
        legs,
        legsY: 18,
        nod: 1,
        arms: belly(BOB[i]!, back ? 'under' : 'body'),
        hang: 'right',
      }),
    );

  return {
    trudge_s: { frames: trudgeFront(false), frameMs: WALK_FRAME_MS },
    trudge_n: { frames: trudgeFront(true), frameMs: WALK_FRAME_MS },
    trudge_e: { frames: right(trudgeE), frameMs: WALK_FRAME_MS },
    trudge_w: { frames: left(trudgeE), frameMs: WALK_FRAME_MS },
    ...sides('crouch', crouchE, crouchMs),
    ...fronts('crouch', crouchS, crouchN, crouchMs),
    ...sides('gather', gatherE, gatherMs),
    ...fronts('gather', gatherS, gatherN, gatherMs),
    ...sides('eat', eatE, eatMs),
    ...fronts('eat', eatS, eatN, eatMs),
    ...sides('munch', munchE, munchMs),
    ...fronts('munch', munchS, munchN, munchMs),
    ...sides('drink', drinkE, drinkMs),
    ...fronts('drink', drinkS, drinkN, drinkMs),
    ...sides('kindle', kindleE, kindleMs),
    ...fronts('kindle', kindleS, kindleN, kindleMs),
    ...sides('stoke', stokeE, stokeMs),
    ...fronts('stoke', stokeS, stokeN, stokeMs),
    ...sides('shiver', shiverE, shiverMs),
    ...fronts('shiver', shiverS, shiverN, shiverMs),
    ...sides('yawn', yawnE, yawnMs),
    ...fronts('yawn', yawnS, yawnN, yawnMs),
    ...fronts('sit', sitS, sitN, sitMs),
  };
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
    ...actionAnimations(parts),
  };
}
