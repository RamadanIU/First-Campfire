import { PALETTE, toHex } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { TERRAIN_LOOKS } from '../art/terrain.ts';
import { DATA } from '../data/index.ts';
import { type Field, formatIssue, formatNumber } from '../data/schema.ts';
import {
  type GameData,
  type ObjectPlace,
  RESOURCE_CATEGORIES,
  type ResourceCategory,
  TABLES,
} from '../data/tables.ts';
import { createSpriteSheet, type SpriteSheet } from '../render/spriteSheet.ts';
import { DAYS_PER_YEAR, TICKS_PER_SEASON, TICKS_PER_YEAR } from '../sim/calendar.ts';
import { DATA_SCENE, FORMS, plural } from '../ui/texts.ts';
import { checkDataRefs } from './dataRefs.ts';
import type { Scene, SceneContext } from './scene.ts';

/**
 * Debug scene `data` (step 0.5): the data tables as the game loaded them — every resource with
 * its icon and numbers, every type of ground, every number of the balance with its meaning.
 * Nothing here is written by hand: a new record in data/resources.json appears on this page by
 * itself. References from the tables to sprites and looks of the ground are checked; broken
 * ones are listed in red (and go to the console, so the screenshot tool fails on them).
 *
 *   ?scene=data
 */

const SCALE = 3;
/** Resources are shown lying on a tile of grass, as they will lie in the world. */
const GROUND = 'grass';

const CATEGORY_TITLE: Record<ResourceCategory, string> = DATA_SCENE.categories;

/** «400 тиков», «2 года», «10 %», «×1,1». */
export function withUnit(value: number, unit: string | null): string {
  if (unit === null) return formatNumber(value);
  if (unit === '×') return `×${formatNumber(value)}`;
  const forms = DATA_SCENE.units[unit];
  return `${formatNumber(value)} ${forms ? plural(value, forms) : unit}`;
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}

// ── What the page shows (pure: tested without a browser) ──────────────────────────────────

export interface ResourceRow {
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** «2 рациона» for food, «10 шт.» for the rest. */
  readonly stack: string;
  /** «3 сут» or «не портится». */
  readonly spoils: string;
  readonly era: string;
}

export interface ResourceGroup {
  readonly category: ResourceCategory;
  readonly title: string;
  readonly rows: readonly ResourceRow[];
}

/** Resources grouped by category, in the order of the file. */
export function resourceGroups(data: GameData): ResourceGroup[] {
  return RESOURCE_CATEGORIES.map((category) => ({
    category,
    title: CATEGORY_TITLE[category],
    rows: data.resources.records
      .filter((resource) => resource.category === category)
      .map((resource) => ({
        id: resource.id,
        name: resource.name,
        sprite: resource.sprite,
        stack:
          category === 'food'
            ? `${resource.stack} ${plural(resource.stack, FORMS.ration)}`
            : DATA_SCENE.pieces(resource.stack),
        spoils:
          resource.spoilDays === null
            ? DATA_SCENE.spoilsNever
            : DATA_SCENE.spoilsDays(formatNumber(resource.spoilDays)),
        era: String(resource.era),
      })),
  })).filter((group) => group.rows.length > 0);
}

export interface TerrainRow {
  readonly id: string;
  readonly name: string;
  readonly look: string;
  readonly walkable: string;
  readonly speed: string;
  /** Ticks to cross one tile: walkTicksPerTile / speed. */
  readonly ticksPerTile: string;
}

export function terrainRows(data: GameData): TerrainRow[] {
  const walk = data.balance.movement.walkTicksPerTile;
  return data.terrain.records.map((terrain) => ({
    id: terrain.id,
    name: terrain.name,
    look: terrain.look,
    walkable: terrain.walkable ? DATA_SCENE.yes : DATA_SCENE.no,
    speed: terrain.speed === null ? DATA_SCENE.none : withUnit(terrain.speed, '×'),
    ticksPerTile:
      terrain.speed === null
        ? DATA_SCENE.none
        : withUnit(Math.round((walk / terrain.speed) * 10) / 10, DATA_SCENE.unitTicks),
  }));
}

export interface ObjectRow {
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  readonly walkable: string;
  /** «ripe → empty»: the first one is where the object starts. */
  readonly states: string;
  /** «лес · 56» — where the map generator puts it and how often. */
  readonly place: string;
  /** «Ягоды · 4 рациона → empty» — food gathered from it and its state once picked clean. */
  readonly harvest: string;
}

const PLACE_NAME: Readonly<Record<ObjectPlace, string>> = DATA_SCENE.places;

/** Objects of the map (data/objects.json), in the order of the file. */
export function objectRows(data: GameData): ObjectRow[] {
  return data.objects.records.map((def) => ({
    id: def.id,
    name: def.name,
    sprite: def.sprite,
    walkable: def.walkable ? DATA_SCENE.yes : DATA_SCENE.no,
    states: def.states.join(' → '),
    place:
      def.place === null ? DATA_SCENE.none : DATA_SCENE.weight(PLACE_NAME[def.place], def.weight),
    harvest:
      def.harvest === null
        ? DATA_SCENE.none
        : `${data.resources.get(def.harvest.food).name} · ${withUnit(def.harvest.rations, DATA_SCENE.unitRations)} → ${def.harvest.empty}`,
  }));
}

export interface BalanceRow {
  /** Path of the number in balance.json: `time.ticksPerDay`. */
  readonly key: string;
  readonly doc: string;
  readonly value: string;
}

export interface BalanceGroup {
  readonly title: string;
  readonly rows: readonly BalanceRow[];
}

/** One value of the balance as text; a nested object — its parts in one line. */
function describeValue(field: Field<unknown>, value: unknown): string {
  if (field.fields !== null && typeof value === 'object' && value !== null) {
    const parts = Object.entries(field.fields).map(([key, inner]) => {
      const text = describeValue(inner, (value as Record<string, unknown>)[key]);
      return inner.doc === null ? text : `${inner.doc.toLowerCase()} ${text}`;
    });
    return parts.join(' · ');
  }
  return typeof value === 'number' ? withUnit(value, field.unit) : String(value);
}

/** Every number of balance.json with its meaning, by section; documented by the schema. */
export function balanceGroups(data: GameData): BalanceGroup[] {
  const sections = TABLES.balance.schema.fields!;
  return Object.entries(sections).map(([section, schema]) => {
    const values = data.balance[section as keyof GameData['balance']] as Record<string, unknown>;
    return {
      title: schema.doc ?? section,
      rows: Object.entries(schema.fields!).map(([key, field]) => ({
        key: `${section}.${key}`,
        doc: field.doc ?? key,
        value: describeValue(field, values[key]),
      })),
    };
  });
}

// ── The page ───────────────────────────────────────────────────────────────────────────────

function tileCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE * SCALE;
  canvas.height = TILE_SIZE * SCALE;
  return canvas;
}

/** A resource as it lies on a tile of grass. */
function itemIcon(sheet: SpriteSheet, sprite: string): HTMLCanvasElement {
  const canvas = tileCanvas();
  const ctx = canvas.getContext('2d')!;
  sheet.draw(ctx, GROUND, 0, 0, { scale: SCALE, frame: 0 });
  const def = SPRITES.find((s) => s.name === sprite);
  if (def) {
    const left = Math.floor((TILE_SIZE - def.width) / 2);
    const top = Math.floor((TILE_SIZE - def.height) / 2);
    sheet.draw(ctx, sprite, (left + def.anchor.x) * SCALE, (top + def.anchor.y) * SCALE, {
      scale: SCALE,
      frame: 0,
    });
  }
  return canvas;
}

/** A tile of a look of the ground. */
function groundTile(sheet: SpriteSheet, look: string): HTMLCanvasElement {
  const canvas = tileCanvas();
  const tile = TERRAIN_LOOKS.find((l) => l.id === look)?.tiles[0];
  if (tile) sheet.draw(canvas.getContext('2d')!, tile, 0, 0, { scale: SCALE, frame: 0 });
  return canvas;
}

/** An object of the map standing on grass, at a smaller scale (a tree is two tiles tall). */
function objectPicture(sheet: SpriteSheet, sprite: string, animation: string): HTMLCanvasElement {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = 2 * TILE_SIZE * scale;
  canvas.height = 3 * TILE_SIZE * scale;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 2; x++) {
      sheet.draw(ctx, GROUND, x * TILE_SIZE * scale, y * TILE_SIZE * scale, { scale, frame: 0 });
    }
  }
  if (sheet.has(sprite)) {
    const entry = sheet.entry(sprite);
    const x = TILE_SIZE * scale;
    const y = (3 * TILE_SIZE - 3) * scale;
    sheet.drawShadow(ctx, sprite, x, y, { scale });
    sheet.draw(ctx, sprite, x, y, {
      scale,
      frame: 0,
      animation: entry.animations.has(animation) ? animation : entry.defaultAnimation,
    });
  }
  return canvas;
}

function cell(tag: 'td' | 'th', content: string | Node, className = ''): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (typeof content === 'string') element.textContent = content;
  else element.append(content);
  return element;
}

/** A name for the player with its id under it. */
function named(name: string, id: string): HTMLElement {
  const element = document.createElement('span');
  element.className = 'named';
  const title = document.createElement('b');
  title.textContent = name;
  const code = document.createElement('small');
  code.textContent = id;
  element.append(title, code);
  return element;
}

/** A table; `classes` — a CSS class per column (`id` for identifiers, `picture` for canvases). */
function table(
  headers: readonly string[],
  rows: readonly (readonly (string | Node)[])[],
  classes: readonly string[] = [],
): HTMLElement {
  const element = document.createElement('table');
  element.className = 'data-table';
  const head = document.createElement('tr');
  for (const header of headers) head.append(cell('th', header, 'head'));
  element.createTHead().append(head);
  const body = element.createTBody();
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.append(...row.map((content, index) => cell('td', content, classes[index] ?? '')));
    body.append(tr);
  }
  return element;
}

export function createDataScene({ canvas, ui, params }: SceneContext): Scene {
  const refProblems = checkDataRefs(DATA).map(formatIssue);
  for (const problem of refProblems) console.error(problem);
  const sheet = createSpriteSheet(SPRITES, PALETTE);
  const known = new Set(SPRITES.map((s) => s.name));

  const root = document.createElement('div');
  root.className = `gallery data${params.ui ? '' : ' bare'}`;
  root.style.background = toHex(PALETTE.ramps.get('ui')![0]!);

  const groups = resourceGroups(DATA);
  const terrain = terrainRows(DATA);
  const objects = objectRows(DATA);
  const balance = balanceGroups(DATA);
  const numbers = balance.reduce((n, group) => n + group.rows.length, 0);
  root.innerHTML = `<header class="gallery-head"><h1>${DATA_SCENE.title}</h1><p>${DATA_SCENE.intro(Object.keys(TABLES).length, DATA.resources.records.length, terrain.length, objects.length, numbers, refProblems.length === 0)}</p></header>`;

  if (refProblems.length > 0) {
    const box = document.createElement('div');
    box.className = 'problems';
    box.textContent = DATA_SCENE.brokenRefs(refProblems.length, refProblems.join('\n'));
    root.append(box);
  }

  // Resources.
  const resources = document.createElement('section');
  resources.innerHTML = `<h2>${DATA_SCENE.resources(TABLES.resources.file)}</h2><p class="meta">${DATA_SCENE.resourcesMeta}</p>`;
  const columns = document.createElement('div');
  columns.className = 'data-columns';
  for (const group of groups) {
    const block = document.createElement('div');
    block.innerHTML = `<h3>${escapeHtml(group.title)} · ${group.rows.length}</h3>`;
    block.append(
      table(
        DATA_SCENE.resourceHeads,
        group.rows.map((row) => [
          known.has(row.sprite) ? itemIcon(sheet, row.sprite) : '?',
          named(row.name, `${row.id} · ${row.era}`),
          row.stack,
          row.spoils,
        ]),
        ['picture', 'name', 'number', 'number'],
      ),
    );
    columns.append(block);
  }
  resources.append(columns);
  root.append(resources);

  // Ground.
  const ground = document.createElement('section');
  ground.innerHTML = `<h2>${DATA_SCENE.ground(TABLES.terrain.file)}</h2><p class="meta">${DATA_SCENE.groundMeta(withUnit(DATA.balance.movement.walkTicksPerTile, DATA_SCENE.unitTicks))}</p>`;
  ground.append(
    table(
      DATA_SCENE.groundHeads,
      terrain.map((row) => [
        groundTile(sheet, row.look),
        named(row.name, row.id),
        row.walkable,
        row.speed,
        row.ticksPerTile,
        row.look,
      ]),
      ['picture', 'name', '', 'number', 'number', 'id'],
    ),
  );
  root.append(ground);

  // Objects of the map.
  const things = document.createElement('section');
  things.innerHTML = `<h2>${DATA_SCENE.objects(TABLES.objects.file)}</h2><p class="meta">${DATA_SCENE.objectsMeta}</p>`;
  things.append(
    table(
      DATA_SCENE.objectHeads,
      objects.map((row) => [
        objectPicture(sheet, row.sprite, row.states.split(' → ')[0]!),
        named(row.name, row.id),
        row.walkable,
        row.states,
        row.place,
        row.harvest,
        row.sprite,
      ]),
      ['picture', 'name', '', 'id', '', '', 'id'],
    ),
  );
  root.append(things);

  // Balance.
  const numbersSection = document.createElement('section');
  numbersSection.innerHTML = `<h2>${DATA_SCENE.balance(TABLES.balance.file)}</h2><p class="meta">${DATA_SCENE.balanceMeta(withUnit(TICKS_PER_SEASON, DATA_SCENE.unitTicks), withUnit(TICKS_PER_YEAR, DATA_SCENE.unitTicks), DAYS_PER_YEAR, formatNumber(TICKS_PER_YEAR / DATA.balance.time.ticksPerSecond / 60))}</p>`;
  const balanceColumns = document.createElement('div');
  balanceColumns.className = 'data-columns';
  for (const group of balance) {
    const block = document.createElement('div');
    block.innerHTML = `<h3>${escapeHtml(group.title)}</h3>`;
    block.append(
      table(
        DATA_SCENE.balanceHeads,
        group.rows.map((row) => [row.doc, row.value, row.key]),
        ['', '', 'id'],
      ),
    );
    balanceColumns.append(block);
  }
  numbersSection.append(balanceColumns);
  root.append(numbersSection);

  const howTo = document.createElement('p');
  howTo.className = 'meta how-to';
  howTo.textContent = DATA_SCENE.howTo;
  root.append(howTo);
  ui.replaceChildren(root);

  return {
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
    },
    render() {
      // Static page: everything is drawn once, when the scene is created.
    },
  };
}
