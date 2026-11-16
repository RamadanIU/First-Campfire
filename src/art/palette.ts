/**
 * The palette: every colour a sprite may use. Colours are grouped into ramps — rows of shades
 * of one material, from dark to light (shadow → base → highlight). A colour is named by its
 * ramp and shade: `grass.0` is the darkest grass, `grass.3` the lightest.
 *
 * Recolouring (skin tone, hair, season, dye) swaps whole ramps: `{ skin_light: 'skin_dark' }`
 * draws every `skin_light.N` pixel as `skin_dark.N`. Swapped ramps must have the same length.
 *
 * This is the DRAFT palette of step 0.3 (32 colours: enough for the three trial sprites).
 * Step 0.4 replaces it with the ~64-colour master palette of GDD §10.1. See docs/ART.md.
 */

export interface RampDef {
  /** snake_case id used in colour names: `grass` → `grass.0`, `grass.1`… */
  readonly name: string;
  /** What the ramp is for, in Russian (shown in the gallery and in docs). */
  readonly title: string;
  /** Hex colours `#rrggbb`, strictly from dark to light. */
  readonly colors: readonly string[];
}

export const RAMPS = [
  { name: 'grass', title: 'трава', colors: ['#2e4d33', '#416d3b', '#5d8f41', '#8ab955'] },
  { name: 'leaf', title: 'листва', colors: ['#1c302c', '#2c4f37', '#427140', '#66984a'] },
  { name: 'bark', title: 'кора и дерево', colors: ['#2b1d1b', '#4b3127', '#6e4c35', '#957250'] },
  { name: 'skin_light', title: 'кожа светлая', colors: ['#c47e5f', '#e8ac85', '#f7d3ac'] },
  { name: 'skin_tan', title: 'кожа смуглая', colors: ['#9a5d3e', '#c58a5c', '#e0ae7c'] },
  { name: 'skin_dark', title: 'кожа тёмная', colors: ['#4f2d22', '#77452f', '#9c6446'] },
  { name: 'hair', title: 'волосы тёмно-русые', colors: ['#3b241b', '#5c3926', '#82553a'] },
  { name: 'hide', title: 'шкура, кожа одежды', colors: ['#5a4030', '#8a6a48', '#b89a6c'] },
  { name: 'ink', title: 'контур персонажей, глаза', colors: ['#241820'] },
  {
    name: 'ui',
    title: 'служебные: фон, клетки галереи, метки',
    colors: ['#15131b', '#45414f', '#504c5c', '#f0e2c2'],
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
