/**
 * Ground as the player sees it: tile variations, animated water and transitions between
 * types of ground (docs/ART.md, «Земля и переходы»).
 *
 * Transitions have no outline (GDD §10.1). Every type of ground has a layer; a higher layer
 * spills over a lower neighbour with a ragged edge a few pixels deep:
 *
 *   deep water < shallow water < sand < dirt < grass
 *
 * The edge is a function of WORLD pixel coordinates, not of the tile: a pixel belongs to the
 * higher neighbour if it lies closer to that neighbour's square than a noisy threshold. So the
 * same boundary is computed identically from both sides — no seams — and never repeats along a
 * long shore. Corners come out rounded: the distance to a diagonal neighbour is the distance to
 * its corner. Where land meets water, the land's outermost pixels take its `shore` colour (wet
 * sand) and the water's take its `foam` colour.
 *
 * Pure functions without the browser: the compositor returns RGBA pixels of one tile; caching
 * and drawing on a canvas belong to src/render.
 */
import { type ColorName, type Palette, type Rgb, resolveColor } from './palette.ts';
import { type Raster, rasterizeSprite, type SpriteRaster } from './raster.ts';
import { type SpriteDef, TILE_SIZE } from './sprite.ts';

export interface SpillDef {
  /** Mean depth of the edge inside the lower neighbour, px. */
  readonly depth: number;
  /** How far the edge wanders around the mean, ± px. */
  readonly jitter: number;
  /** Size of the noise cells, px: small — ragged tufts, large — smooth curves. */
  readonly grain: number;
  /**
   * Radius of the rounding where this ground wraps a lower one on two sides (an inner corner),
   * px. Without it, a lower neighbour keeps a square corner and a river looks like stairs.
   */
  readonly round: number;
}

export interface TerrainLook {
  /** snake_case id; types of ground in the data tables (step 0.5) refer to it. */
  readonly id: string;
  /** Russian name for debug screens. */
  readonly title: string;
  /** Tile sprites — variations of this ground, picked per tile by its position. */
  readonly tiles: readonly string[];
  /** Relative frequency of each variation; default — equal. */
  readonly weights?: readonly number[];
  /** Higher layers spill over lower neighbours. Unique for every type of ground. */
  readonly layer: number;
  /** Water and the like: foam forms where it touches land. */
  readonly liquid: boolean;
  readonly spill: SpillDef;
  /** Land only: colour of its pixels that touch water (wet sand at the waterline). */
  readonly shore?: ColorName;
  /** Liquids only: colour of its pixels that touch land (a broken line of foam). */
  readonly foam?: ColorName;
}

/** Share of the waterline covered with foam: the line is broken into patches. */
export const FOAM_SHARE = 0.7;

/** Looks of the ground of epoch 0 (deciduous forest, GDD §3.3), from the lowest layer up. */
export const TERRAIN_LOOKS: readonly TerrainLook[] = [
  {
    id: 'deep_water',
    title: 'глубокая вода',
    tiles: ['water_deep'],
    layer: 0,
    liquid: true,
    spill: { depth: 0, jitter: 0, grain: 4, round: 0 },
    foam: 'water.3',
  },
  {
    id: 'shallow_water',
    title: 'мелкая вода',
    tiles: ['water_shallow'],
    layer: 1,
    liquid: true,
    spill: { depth: 4, jitter: 2, grain: 6, round: 6 },
    foam: 'water.4',
  },
  {
    id: 'sand',
    title: 'песок',
    tiles: ['sand'],
    layer: 2,
    liquid: false,
    spill: { depth: 3, jitter: 1.5, grain: 5, round: 6 },
    shore: 'sand.0',
  },
  {
    id: 'dirt',
    title: 'земля',
    tiles: ['dirt'],
    layer: 3,
    liquid: false,
    spill: { depth: 3, jitter: 2, grain: 4, round: 5 },
    shore: 'dirt.0',
  },
  {
    id: 'grass',
    title: 'трава',
    tiles: ['grass', 'grass_2', 'grass_3'],
    weights: [5, 3, 2],
    layer: 4,
    liquid: false,
    spill: { depth: 3, jitter: 2, grain: 3, round: 5 },
  },
];

/** Which type of ground lies at a tile. Callers decide what lies outside the map. */
export type TerrainAt = (x: number, y: number) => string;

/** A rectangular map given as rows of ids; outside the map the nearest edge tile repeats. */
export function terrainGrid(rows: readonly (readonly string[])[]): TerrainAt {
  const height = rows.length;
  return (x, y) => {
    const row = rows[Math.min(height - 1, Math.max(0, y))]!;
    return row[Math.min(row.length - 1, Math.max(0, x))]!;
  };
}

interface PreparedLook {
  readonly look: TerrainLook;
  readonly salt: number;
  readonly variations: readonly SpriteRaster[];
  /** Cumulative weights, last = total. */
  readonly cumulative: readonly number[];
  readonly frames: number;
  readonly frameMs: number;
  readonly shore: Rgb | null;
  readonly foam: Rgb | null;
}

/** Looks with their tile pixels, ready for composing. Build once with `prepareTerrain`. */
export interface TerrainArt {
  readonly looks: ReadonlyMap<string, PreparedLook>;
}

/** Problems with the looks and their tile sprites; an empty list means they are usable. */
export function validateTerrainLooks(
  looks: readonly TerrainLook[],
  sprites: readonly SpriteDef[],
  palette: Palette,
): string[] {
  const problems: string[] = [];
  const byName = new Map(sprites.map((sprite) => [sprite.name, sprite]));
  const ids = new Set<string>();
  const layers = new Map<number, string>();
  for (const look of looks) {
    const where = `земля «${look.id}»`;
    if (ids.has(look.id)) problems.push(`${where}: такой id уже есть`);
    ids.add(look.id);
    const other = layers.get(look.layer);
    if (other) problems.push(`${where}: слой ${look.layer} уже занят землёй «${other}»`);
    layers.set(look.layer, look.id);
    if (look.tiles.length === 0) problems.push(`${where}: нет ни одного тайла`);
    if (look.weights && look.weights.length !== look.tiles.length) {
      problems.push(`${where}: весов ${look.weights.length}, а тайлов ${look.tiles.length}`);
    }
    if (look.weights?.some((w) => !(w > 0))) problems.push(`${where}: веса должны быть больше 0`);
    const { depth, jitter, grain, round } = look.spill;
    if (!(depth >= 0 && jitter >= 0 && depth + jitter <= TILE_SIZE / 2 && grain >= 1)) {
      problems.push(
        `${where}: край ${depth} ± ${jitter} пикселей, зерно ${grain} — край должен помещаться в полтайла, зерно ≥ 1`,
      );
    }
    if (!(round >= 0 && depth + jitter + round <= (TILE_SIZE * 3) / 4)) {
      problems.push(`${where}: скругление ${round} — от 0, вместе с краем не больше ¾ тайла`);
    }
    if (look.shore && look.liquid)
      problems.push(`${where}: у воды не бывает кромки берега (shore)`);
    if (look.foam && !look.liquid) problems.push(`${where}: пена (foam) бывает только у воды`);
    for (const color of [look.shore, look.foam]) {
      if (color && !resolveColor(palette, color)) {
        problems.push(`${where}: цвета ${color} нет в палитре`);
      }
    }
    let timing: string | null = null;
    for (const name of look.tiles) {
      const sprite = byName.get(name);
      if (!sprite) {
        problems.push(`${where}: нет спрайта «${name}»`);
        continue;
      }
      if (sprite.kind !== 'tile') problems.push(`${where}: спрайт «${name}» — не тайл`);
      const animation = Object.values(sprite.animations)[0];
      const frameMs = animation?.frameMs ?? 100;
      if (typeof frameMs !== 'number') {
        problems.push(
          `${where}: у тайла «${name}» кадры разной длительности — для земли нужна одна frameMs`,
        );
        continue;
      }
      const thisTiming = `${animation?.frames.length ?? 0} × ${frameMs} мс`;
      if (timing && thisTiming !== timing) {
        problems.push(`${where}: вариации анимированы по-разному (${timing} и ${thisTiming})`);
      }
      timing = thisTiming;
    }
  }
  return problems;
}

/** Deterministic hash of three integers → [0, 1). Presentation only. */
function hash3(a: number, b: number, c: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function stringSalt(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}

/** Smooth value noise in [0, 1) at a world pixel; `grain` — cell size in pixels. */
export function edgeNoise(x: number, y: number, grain: number, salt: number): number {
  const gx = (x + 0.5) / grain;
  const gy = (y + 0.5) / grain;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash3(x0, y0, salt) * (1 - sx) + hash3(x0 + 1, y0, salt) * sx;
  const bottom = hash3(x0, y0 + 1, salt) * (1 - sx) + hash3(x0 + 1, y0 + 1, salt) * sx;
  return top * (1 - sy) + bottom * sy;
}

/** Rasterize the tile sprites of every look. Throws if the looks are invalid. */
export function prepareTerrain(
  looks: readonly TerrainLook[],
  sprites: readonly SpriteDef[],
  palette: Palette,
): TerrainArt {
  const problems = validateTerrainLooks(looks, sprites, palette);
  if (problems.length > 0) throw new Error(`Земля с ошибками:\n${problems.join('\n')}`);
  const byName = new Map(sprites.map((sprite) => [sprite.name, sprite]));
  const prepared = new Map<string, PreparedLook>();
  for (const look of looks) {
    const variations = look.tiles.map((name) => rasterizeSprite(byName.get(name)!, palette));
    const first = variations[0]!.animations[0]!;
    let sum = 0;
    const cumulative = look.tiles.map((_, i) => {
      sum += look.weights?.[i] ?? 1;
      return sum;
    });
    prepared.set(look.id, {
      look,
      salt: stringSalt(look.id),
      variations,
      cumulative,
      frames: first.frames.length,
      frameMs: first.durations[0]!,
      shore: look.shore ? resolveColor(palette, look.shore) : null,
      foam: look.foam ? resolveColor(palette, look.foam) : null,
    });
  }
  return { looks: prepared };
}

function lookOf(art: TerrainArt, id: string): PreparedLook {
  const look = art.looks.get(id);
  if (!look) throw new Error(`Нет вида земли «${id}». Есть: ${[...art.looks.keys()].join(', ')}`);
  return look;
}

/** Does this ground move (several frames, like the water's ripple)? */
export function isAnimatedLook(art: TerrainArt, id: string): boolean {
  return lookOf(art, id).frames > 1;
}

/** Which variation of its ground a tile shows (index into `tiles`). */
export function variationAt(art: TerrainArt, id: string, x: number, y: number): number {
  const look = lookOf(art, id);
  const total = look.cumulative[look.cumulative.length - 1]!;
  const roll = hash3(x, y, look.salt ^ 0x5bd1e995) * total;
  return look.cumulative.findIndex((edge) => roll < edge);
}

/** Animation frame of a tile at `timeMs`: neighbouring tiles start at different frames. */
export function terrainFrameAt(art: TerrainArt, id: string, x: number, y: number, timeMs: number) {
  const look = lookOf(art, id);
  if (look.frames <= 1) return 0;
  const step = Math.floor(timeMs / look.frameMs);
  const phase = Math.floor(hash3(x, y, look.salt ^ 0x27d4eb2f) * look.frames);
  return (((step + phase) % look.frames) + look.frames) % look.frames;
}

/**
 * A key that changes exactly when some animated ground shows another frame: composed tiles
 * can be cached by it (the picture of the ground has only a few distinct states).
 */
export function terrainStateKey(art: TerrainArt, timeMs: number): string {
  const parts: number[] = [];
  for (const look of art.looks.values()) {
    if (look.frames > 1) parts.push(Math.floor(timeMs / look.frameMs) % look.frames);
  }
  return parts.join('.');
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * One presentation time for every distinct state of the ground (every combination of ripple
 * frames), so that a renderer can compose them all in advance instead of stuttering when a new
 * state first shows up. Without animated ground — just [0].
 */
export function terrainStateTimes(art: TerrainArt): number[] {
  let step = 0;
  let cycle = 1;
  for (const look of art.looks.values()) {
    if (look.frames <= 1) continue;
    step = gcd(step, look.frameMs);
    const own = look.frames * look.frameMs;
    cycle = (cycle / gcd(cycle, own)) * own;
  }
  if (step === 0) return [0];
  const times: number[] = [];
  const seen = new Set<string>();
  for (let t = 0; t < cycle; t += step) {
    const key = terrainStateKey(art, t);
    if (!seen.has(key)) {
      seen.add(key);
      times.push(t);
    }
  }
  return times;
}

/** The ground visible at a world pixel and the tile whose texture shows there. */
interface Visible {
  look: PreparedLook;
  tileX: number;
  tileY: number;
}

/** The four inner corners: pairs of side neighbours as [dx1, dy1, dx2, dy2]. */
const CORNERS = [
  [0, -1, 1, 0],
  [1, 0, 0, 1],
  [0, 1, -1, 0],
  [-1, 0, 0, -1],
] as const;

function visibleAt(art: TerrainArt, at: TerrainAt, px: number, py: number): Visible {
  const tileX = Math.floor(px / TILE_SIZE);
  const tileY = Math.floor(py / TILE_SIZE);
  const own = lookOf(art, at(tileX, tileY));
  let best: Visible = { look: own, tileX, tileY };
  let bestLayer = own.look.layer;
  let bestDistance = 0;
  const cx = px + 0.5;
  const cy = py + 0.5;
  const left = tileX * TILE_SIZE;
  const top = tileY * TILE_SIZE;

  /** Distance from the pixel centre into the own tile, from its side towards (dx, dy). */
  const inset = (dx: number, dy: number) =>
    dx < 0 ? cx - left : dx > 0 ? left + TILE_SIZE - cx : dy < 0 ? cy - top : top + TILE_SIZE - cy;
  const reachOf = (look: PreparedLook) => {
    const { depth, jitter, grain } = look.look.spill;
    return depth + jitter * (2 * edgeNoise(px, py, grain, look.salt) - 1);
  };
  const consider = (look: PreparedLook, distance: number, nx: number, ny: number) => {
    const layer = look.look.layer;
    if (layer > bestLayer || (layer === bestLayer && distance < bestDistance)) {
      best = { look, tileX: nx, tileY: ny };
      bestLayer = layer;
      bestDistance = distance;
    }
  };

  // Edges and outer corners: closer to a higher neighbour's square than its noisy reach.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const look = lookOf(art, at(tileX + dx, tileY + dy));
      if (look.look.layer <= own.look.layer || look.look.layer < bestLayer) continue;
      const ox = dx === 0 ? 0 : inset(dx, 0);
      const oy = dy === 0 ? 0 : inset(0, dy);
      const distance = Math.sqrt(ox * ox + oy * oy);
      if (distance < reachOf(look)) consider(look, distance, tileX + dx, tileY + dy);
    }
  }

  // Inner corners: the same higher ground on two sides fills the corner with a round fillet.
  for (const [ax, ay, bx, by] of CORNERS) {
    const id = at(tileX + ax, tileY + ay);
    if (id !== at(tileX + bx, tileY + by)) continue;
    const look = lookOf(art, id);
    const radius = look.look.spill.round;
    if (look.look.layer <= own.look.layer || look.look.layer < bestLayer || radius <= 0) continue;
    const reach = reachOf(look);
    const a = inset(ax, ay) - reach;
    const b = inset(bx, by) - reach;
    if (
      a < radius &&
      b < radius &&
      (a - radius) * (a - radius) + (b - radius) * (b - radius) > radius * radius
    ) {
      const nearA = inset(ax, ay) <= inset(bx, by);
      consider(
        look,
        Math.min(inset(ax, ay), inset(bx, by)),
        tileX + (nearA ? ax : bx),
        tileY + (nearA ? ay : by),
      );
    }
  }
  return best;
}

/** Byte offset of a world pixel inside a tile image (tiles repeat every TILE_SIZE pixels). */
function texelOffset(px: number, py: number): number {
  const lx = ((px % TILE_SIZE) + TILE_SIZE) % TILE_SIZE;
  const ly = ((py % TILE_SIZE) + TILE_SIZE) % TILE_SIZE;
  return (ly * TILE_SIZE + lx) * 4;
}

/**
 * The picture of tile (x, y) at presentation time `timeMs`: its own variation and frame, the
 * higher neighbours' ragged edges spilling in, wet shore and foam where land meets water.
 */
export function composeTerrainTile(
  art: TerrainArt,
  at: TerrainAt,
  x: number,
  y: number,
  timeMs: number,
): Raster {
  const size = TILE_SIZE;
  const left = x * size;
  const top = y * size;

  // Fast path — most of a map: the same ground all around, nothing to blend.
  const id = at(x, y);
  let uniform = true;
  for (let dy = -1; dy <= 1 && uniform; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (at(x + dx, y + dy) !== id) {
        uniform = false;
        break;
      }
    }
  }
  if (uniform) {
    const look = lookOf(art, id);
    const raster = look.variations[variationAt(art, id, x, y)]!;
    const frame = raster.animations[0]!.frames[terrainFrameAt(art, id, x, y, timeMs)]!;
    return { width: size, height: size, pixels: new Uint8ClampedArray(frame.pixels) };
  }

  const pixels = new Uint8ClampedArray(size * size * 4);

  // Visible ground on the tile plus a one-pixel ring around it (for shore and foam).
  const span = size + 2;
  const visible: Visible[] = new Array(span * span);
  for (let j = 0; j < span; j++) {
    for (let i = 0; i < span; i++) {
      visible[j * span + i] = visibleAt(art, at, left + i - 1, top + j - 1);
    }
  }

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const here = visible[(j + 1) * span + i + 1]!;
      const px = left + i;
      const py = top + j;
      let color: Rgb | null = null;
      const special = here.look.look.liquid ? here.look.foam : here.look.shore;
      if (special) {
        const around = [
          visible[j * span + i + 1]!,
          visible[(j + 2) * span + i + 1]!,
          visible[(j + 1) * span + i]!,
          visible[(j + 1) * span + i + 2]!,
        ];
        const touches = around.some((other) => other.look.look.liquid !== here.look.look.liquid);
        // Foam is broken into patches; the wet shore is a continuous line.
        const patch = !here.look.look.liquid || edgeNoise(px, py, 2, here.look.salt) < FOAM_SHARE;
        if (touches && patch) color = special;
      }
      const at4 = (j * size + i) * 4;
      if (color) {
        pixels[at4] = color[0];
        pixels[at4 + 1] = color[1];
        pixels[at4 + 2] = color[2];
        pixels[at4 + 3] = 255;
        continue;
      }
      const { look, tileX, tileY } = here;
      const id = look.look.id;
      const raster = look.variations[variationAt(art, id, tileX, tileY)]!;
      const frame = raster.animations[0]!.frames[terrainFrameAt(art, id, tileX, tileY, timeMs)]!;
      const from = texelOffset(px, py);
      pixels.set(frame.pixels.subarray(from, from + 4), at4);
    }
  }
  return { width: size, height: size, pixels };
}
