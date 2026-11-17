import { PALETTE, type PaletteSwap, parseColorName, toHex } from '../art/palette.ts';
import { SPRITES } from '../art/registry.ts';
import { SHADOW_COLOR } from '../art/sprite.ts';
import { createSpriteSheet } from '../render/spriteSheet.ts';
import type { Scene, SceneContext } from './scene.ts';

/**
 * Debug scene `palette` (step 0.4): the master palette (GDD §10.1). Every ramp with its name,
 * purpose and colours (name `ramp.N`, hex code, how many sprites use the colour), and the
 * recolouring of people: six skin tones × five hair colours from one drawing.
 *
 *   ?scene=palette         &ui=0 — no explanations
 */

/** Ramps that are not colours of the world: they are counted separately. */
const SERVICE = new Set(['shadow', 'ui']);
const SCALE = 3;

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}

/**
 * How many sprites use each colour `ramp.N`: in their legend, through a recolouring variant
 * (other skin tones and hair colours) or as the colour of their shadow.
 */
function usage(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sprite of SPRITES) {
    const colors = new Set<string>(Object.values(sprite.legend));
    for (const swap of Object.values(sprite.variants ?? {})) {
      for (const color of Object.values(sprite.legend)) {
        const parsed = parseColorName(color)!;
        const target = (swap as Record<string, string | undefined>)[parsed.ramp];
        if (target) colors.add(`${target}.${parsed.shade}`);
      }
    }
    if (sprite.shadow) colors.add(SHADOW_COLOR);
    for (const color of colors) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return counts;
}

export function createPaletteScene({ canvas, ui, params }: SceneContext): Scene {
  const used = usage();
  const background = toHex(PALETTE.ramps.get('ui')![0]!);
  const total = PALETTE.defs.reduce((n, ramp) => n + ramp.colors.length, 0);
  const service = PALETTE.defs
    .filter((ramp) => SERVICE.has(ramp.name))
    .reduce((n, ramp) => n + ramp.colors.length, 0);

  const root = document.createElement('div');
  root.className = `gallery palette${params.ui ? '' : ' bare'}`;
  root.style.background = background;
  root.innerHTML = `<header class="gallery-head"><h1>Мастер-палитра</h1><p>${total - service} цветов мира + цвет тени + служебные · ${PALETTE.defs.length} рядов, в каждом цвета идут от тёмного к светлому · под образцом — имя цвета, код и сколько спрайтов его используют</p></header>`;

  const table = document.createElement('div');
  table.className = 'ramps';
  for (const ramp of PALETTE.defs) {
    const row = document.createElement('div');
    row.className = 'ramp';
    const alpha =
      ramp.alpha === undefined ? '' : ` · прозрачность ${Math.round(ramp.alpha * 100)} %`;
    const swatches = ramp.colors
      .map((hex, shade) => {
        const name = `${ramp.name}.${shade}`;
        const count = used.get(name) ?? 0;
        const note = SERVICE.has(ramp.name) && ramp.name === 'ui' ? 'экраны' : String(count);
        return `<figure class="swatch-card${count === 0 && ramp.name !== 'ui' ? ' unused' : ''}"><i style="background:${hex}${ramp.alpha === undefined ? '' : `;opacity:${ramp.alpha}`}"></i><figcaption>.${shade}<br>${hex}<br><b>${note}</b></figcaption></figure>`;
      })
      .join('');
    row.innerHTML = `<div class="ramp-name"><b>${ramp.name}</b><span>${escapeHtml(ramp.title)}${alpha}</span></div><div class="swatches">${swatches}</div>`;
    table.append(row);
  }
  root.append(table);

  // Recolouring: one drawing of a man and a woman, every skin tone × every hair colour.
  const skins = [...PALETTE.ramps.keys()].filter((name) => name.startsWith('skin_'));
  const hairs = [...PALETTE.ramps.keys()].filter((name) => name.startsWith('hair_'));
  const sheet = createSpriteSheet(
    SPRITES.filter((sprite) => sprite.name === 'man' || sprite.name === 'woman'),
    PALETTE,
  );
  const people = document.createElement('section');
  people.className = 'recolour';
  people.innerHTML = `<h2>Перекраска жителей: ${skins.length} тонов кожи × ${hairs.length} цветов волос — один рисунок, подмена рядов палитры</h2>`;
  const grid = document.createElement('table');
  /** Short Russian name of a ramp: «волосы рыжие» → «рыжие». */
  const short = (ramp: string) =>
    escapeHtml(PALETTE.defs.find((def) => def.name === ramp)!.title.replace(/^(кожа|волосы) /, ''));
  grid.innerHTML = `<thead><tr><th></th>${hairs.map((hair) => `<th>${short(hair)}</th>`).join('')}</tr></thead>`;
  const body = document.createElement('tbody');
  for (const skin of skins) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<th>${short(skin)}</th>`;
    for (const hair of hairs) {
      const td = document.createElement('td');
      const view = document.createElement('canvas');
      view.width = 28 * SCALE;
      view.height = 20 * SCALE;
      const ctx = view.getContext('2d')!;
      const swap = { skin_light: skin, hair_brown: hair } as PaletteSwap;
      sheet.draw(ctx, 'man', 7 * SCALE, 19 * SCALE, { swap, scale: SCALE, frame: 0 });
      sheet.draw(ctx, 'woman', 21 * SCALE, 19 * SCALE, { swap, scale: SCALE, frame: 0 });
      td.append(view);
      tr.append(td);
    }
    body.append(tr);
  }
  grid.append(body);
  people.append(grid);
  root.append(people);
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
