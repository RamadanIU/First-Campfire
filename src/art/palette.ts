/**
 * The palette: every colour a sprite may use. Colours are grouped into ramps — rows of shades
 * of one material, from dark to light (shadow → base → highlight). A colour is named by its
 * ramp and shade: `grass.0` is the darkest grass, `grass.3` the lightest.
 *
 * Recolouring (skin tone, hair, season, dye) swaps whole ramps: `{ skin_light: 'skin_dark' }`
 * draws every `skin_light.N` pixel as `skin_dark.N`. Swapped ramps must have the same length.
 *
 * This is the master palette of GDD §10.1 (step 0.4): 69 colours of the world, one translucent
 * shadow colour and 3 service colours of debug screens. See docs/ART.md for what each ramp is for.
 */

export interface RampDef {
  /** snake_case id used in colour names: `grass` → `grass.0`, `grass.1`… */
  readonly name: string;
  /** What the ramp is for, in Russian (shown in the gallery and in docs). */
  readonly title: string;
  /** Hex colours `#rrggbb`, strictly from dark to light. */
  readonly colors: readonly string[];
  /**
   * Opacity 0…1 of every colour of the ramp; default 1 (opaque). Translucent ramps darken or
   * tint what lies under them — the soft shadow under objects is one (GDD §10.1).
   */
  readonly alpha?: number;
  /**
   * A seasonal shift (step 1.10, GDD §10.1: «сезонные сдвиги через таблицы подмены цветов»): the
   * ramp is never drawn by name, only swapped in for a ramp of the master palette in its season
   * (src/art/seasons.ts). Not counted among the ~64 colours of the master palette.
   */
  readonly season?: boolean;
}

export const RAMPS = [
  // Outline and shadow.
  { name: 'ink', title: 'контур персонажей и предметов, глаза', colors: ['#241820'] },
  {
    name: 'shadow',
    title: 'тень под объектами (полупрозрачная)',
    colors: ['#1a1830'],
    alpha: 0.32,
  },
  // Ground.
  { name: 'grass', title: 'трава', colors: ['#2e4d33', '#416d3b', '#5d8f41', '#8ab955'] },
  { name: 'dirt', title: 'земля, тропа', colors: ['#5e3d29', '#80573a', '#a37a50'] },
  { name: 'sand', title: 'песок, берег', colors: ['#b0915f', '#d2b47c', '#ead5a0'] },
  {
    name: 'water',
    title: 'вода: глубокая → мелкая → пена',
    colors: ['#1c3b5e', '#245b82', '#2f7c9f', '#4ea0ba', '#a8dde3'],
  },
  { name: 'stone', title: 'камень, галька', colors: ['#3c3c4b', '#5d5f70', '#878a99', '#b6b9c2'] },
  // Plants and wood.
  {
    name: 'leaf',
    title: 'листва деревьев и кустов',
    colors: ['#1c302c', '#2c4f37', '#427140', '#66984a', '#94bd5a'],
  },
  {
    name: 'bark',
    title: 'кора, древесина, ветки',
    colors: ['#2a1e1f', '#47332d', '#6a4f40', '#8e735c'],
  },
  { name: 'berry', title: 'ягоды', colors: ['#7c1f3a', '#c23b4e'] },
  // Fire.
  { name: 'fire', title: 'огонь, угли', colors: ['#b2361f', '#e8692c', '#f9aa3c', '#ffe48f'] },
  // People: six skin tones and five hair colours (rows of one length swap with each other).
  { name: 'skin_pale', title: 'кожа бледная', colors: ['#d4917a', '#efbfa2', '#fde3cc'] },
  { name: 'skin_light', title: 'кожа светлая', colors: ['#c47e5f', '#e8ac85', '#f7d3ac'] },
  { name: 'skin_tan', title: 'кожа смуглая', colors: ['#a96d47', '#cc9461', '#e6b882'] },
  { name: 'skin_olive', title: 'кожа оливковая', colors: ['#8c5a39', '#b07a4b', '#cf9c69'] },
  { name: 'skin_brown', title: 'кожа коричневая', colors: ['#6a3d2a', '#91593a', '#b47a52'] },
  { name: 'skin_dark', title: 'кожа тёмная', colors: ['#45281f', '#673d2c', '#8d5b40'] },
  { name: 'hair_black', title: 'волосы чёрные', colors: ['#2b2228', '#4a3b40', '#6e5d60'] },
  { name: 'hair_brown', title: 'волосы тёмно-русые', colors: ['#45291c', '#6a432f', '#946645'] },
  { name: 'hair_chestnut', title: 'волосы каштановые', colors: ['#6e3a22', '#9a5a36', '#c4804c'] },
  { name: 'hair_red', title: 'волосы рыжие', colors: ['#9a421f', '#cc6a30', '#ec9a4e'] },
  { name: 'hair_blond', title: 'волосы светлые', colors: ['#a8844a', '#d8b870', '#f2dc9e'] },
  // Clothes of epoch 0: hides and furs, bone and shell ornaments (GDD §10.3).
  { name: 'hide', title: 'сыромятная кожа, шкуры', colors: ['#5c4331', '#8a6a48', '#b39468'] },
  {
    name: 'bone',
    title: 'кость, ракушки, берёста, белое',
    colors: ['#8c8273', '#c7bea9', '#f0e9d6'],
  },
  // Seasonal shifts (step 1.10): swapped in for grass, sand and leaves by src/art/seasons.ts.
  {
    name: 'grass_spring',
    title: 'трава весной: свежая, светлая',
    colors: ['#3d6a3a', '#5a9446', '#84bd52', '#b5dc72'],
    season: true,
  },
  {
    name: 'grass_autumn',
    title: 'трава осенью: сухая, жёлтая',
    colors: ['#4a4a2c', '#6e6a36', '#97893f', '#c2ab5a'],
    season: true,
  },
  {
    name: 'snow',
    title: 'снег на траве зимой',
    colors: ['#7d8ba3', '#a9b8cc', '#cfdbe8', '#eef4fa'],
    season: true,
  },
  {
    name: 'snow_sand',
    title: 'снег на песке зимой',
    colors: ['#9aa6b8', '#c3cfdd', '#e3ebf3'],
    season: true,
  },
  {
    name: 'leaf_spring',
    title: 'листва весной: молодая',
    colors: ['#24402e', '#3b6e3c', '#5f9c46', '#8dc357', '#c2e27a'],
    season: true,
  },
  {
    name: 'leaf_autumn',
    title: 'листва осенью: рыжая, багряная',
    colors: ['#3a2420', '#6a3326', '#a4502c', '#d27f34', '#efb84a'],
    season: true,
  },
  {
    name: 'leaf_winter',
    title: 'листва зимой: тёмная хвоя под снегом',
    colors: ['#1f2a33', '#3a4a50', '#6e7f86', '#bccad6', '#f2f7fb'],
    season: true,
  },
  // Service colours of debug screens (gallery, palette): background and checker cells.
  {
    name: 'ui',
    title: 'служебные: фон и клетки отладочных экранов',
    colors: ['#15131b', '#45414f', '#504c5c'],
  },
] as const satisfies readonly RampDef[];

export type RampName = (typeof RAMPS)[number]['name'];

/** `ramp.shade`, e.g. `grass.2`. The shade index is checked at run time (validateSprite). */
export type ColorName = `${RampName}.${number}`;

/** Ramp → replacement ramp. Applied once, not transitively: `{a: 'b', b: 'a'}` swaps two ramps. */
export type PaletteSwap = Readonly<Partial<Record<RampName, RampName>>>;

export type Rgb = readonly [number, number, number];

export interface Palette {
  /** Ramps in definition order, colours dark → light. */
  readonly ramps: ReadonlyMap<string, readonly Rgb[]>;
  /** Opacity of each ramp's colours, 0…255 (255 — opaque). */
  readonly alphas: ReadonlyMap<string, number>;
  /** The definitions the palette was built from (names, titles, hex codes). */
  readonly defs: readonly RampDef[];
}

const RAMP_NAME = /^[a-z][a-z0-9_]*$/;
const HEX = /^#[0-9a-f]{6}$/;
const COLOR_NAME = /^([a-z][a-z0-9_]*)\.(\d+)$/;

export function parseHex(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function toHex([r, g, b]: Rgb): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Perceived brightness 0…255 (Rec. 601 luma). Used to check that ramps go dark → light. */
export function luma([r, g, b]: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Problems in ramp definitions; an empty list means the palette is valid. */
export function validatePalette(defs: readonly RampDef[]): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  const owners = new Map<string, string>();
  for (const ramp of defs) {
    const where = `палитра, ряд «${ramp.name}»`;
    if (!RAMP_NAME.test(ramp.name)) {
      problems.push(`${where}: имя должно быть snake_case латиницей (a–z, 0–9, _)`);
    }
    if (names.has(ramp.name)) problems.push(`${where}: такое имя ряда уже есть`);
    names.add(ramp.name);
    if (ramp.colors.length === 0) problems.push(`${where}: ряд пуст`);
    if (
      ramp.alpha !== undefined &&
      !(typeof ramp.alpha === 'number' && ramp.alpha > 0 && ramp.alpha < 1)
    ) {
      problems.push(
        `${where}: прозрачность ${ramp.alpha} — нужно число больше 0 и меньше 1 (или не указывать)`,
      );
    }
    ramp.colors.forEach((hex, shade) => {
      const color = `${ramp.name}.${shade}`;
      if (!HEX.test(hex)) {
        problems.push(`${where}: цвет ${color} = «${hex}» — нужен вид #rrggbb строчными буквами`);
        return;
      }
      const owner = owners.get(hex);
      if (owner) problems.push(`${where}: цвет ${color} ${hex} повторяет ${owner}`);
      else owners.set(hex, color);
      const previous = ramp.colors[shade - 1];
      if (previous !== undefined && HEX.test(previous)) {
        if (luma(parseHex(hex)) <= luma(parseHex(previous))) {
          problems.push(
            `${where}: ${color} ${hex} не светлее предыдущего ${previous} — ряд идёт от тёмного к светлому`,
          );
        }
      }
    });
  }
  return problems;
}

/** Build a palette; throws with every problem listed if the definitions are invalid. */
export function createPalette(defs: readonly RampDef[]): Palette {
  const problems = validatePalette(defs);
  if (problems.length > 0) throw new Error(`Палитра с ошибками:\n${problems.join('\n')}`);
  return {
    ramps: new Map(defs.map((ramp) => [ramp.name, ramp.colors.map(parseHex)])),
    alphas: new Map(defs.map((ramp) => [ramp.name, Math.round((ramp.alpha ?? 1) * 255)])),
    defs,
  };
}

/** Split `grass.2` into ramp and shade; null if the name is malformed. */
export function parseColorName(name: string): { ramp: string; shade: number } | null {
  const match = COLOR_NAME.exec(name);
  return match ? { ramp: match[1]!, shade: Number(match[2]) } : null;
}

/** The colour for a name after applying `swap`, or null if there is no such colour. */
export function resolveColor(palette: Palette, name: string, swap: PaletteSwap = {}): Rgb | null {
  const parsed = parseColorName(name);
  if (!parsed) return null;
  const ramp = (swap as Record<string, string | undefined>)[parsed.ramp] ?? parsed.ramp;
  return palette.ramps.get(ramp)?.[parsed.shade] ?? null;
}

/** Opacity 0…255 of a named colour after applying `swap`, or null if there is no such colour. */
export function resolveAlpha(
  palette: Palette,
  name: string,
  swap: PaletteSwap = {},
): number | null {
  if (resolveColor(palette, name, swap) === null) return null;
  const { ramp } = parseColorName(name)!;
  return palette.alphas.get((swap as Record<string, string | undefined>)[ramp] ?? ramp) ?? null;
}

/** Problems with a swap: unknown ramps, ramps of different length. */
export function validateSwap(palette: Palette, swap: PaletteSwap): string[] {
  const problems: string[] = [];
  for (const [from, to] of Object.entries(swap)) {
    if (to === undefined) continue;
    const source = palette.ramps.get(from);
    const target = palette.ramps.get(to);
    if (!source) problems.push(`подмена «${from} → ${to}»: в палитре нет ряда «${from}»`);
    if (!target) problems.push(`подмена «${from} → ${to}»: в палитре нет ряда «${to}»`);
    if (source && target && source.length !== target.length) {
      problems.push(
        `подмена «${from} → ${to}»: в рядах разное число цветов (${source.length} и ${target.length})`,
      );
    }
  }
  return problems;
}

/**
 * A stable text key for a swap, ignoring entries that change nothing or touch ramps outside
 * `relevant` (e.g. the ramps a sprite actually uses). Empty string — no change at all.
 */
export function swapKey(swap: PaletteSwap, relevant?: ReadonlySet<string>): string {
  return Object.entries(swap)
    .filter(([from, to]) => to !== undefined && to !== from && (!relevant || relevant.has(from)))
    .map(([from, to]) => `${from}>${to}`)
    .sort()
    .join(',');
}

/** The game's palette. */
export const PALETTE: Palette = createPalette(RAMPS);
