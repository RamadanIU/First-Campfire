import { PALETTE, type Palette, type PaletteSwap, toHex } from '../art/palette.ts';
import { SPRITE_FILES } from '../art/registry.ts';
import {
  defaultAnimation,
  frameDurations,
  type SpriteDef,
  type SpriteKind,
  usedRamps,
  validateSprite,
  validateSpriteSet,
} from '../art/sprite.ts';
import { createSpriteSheet, type SpriteSheet } from '../render/spriteSheet.ts';
import { PRESENTATION_FPS, type Scene, type SceneContext } from './scene.ts';

/**
 * Debug scene `gallery` (step 0.3): every sprite of the game on a checkered background, large
 * and at natural size, with captions; animations play.
 *
 *   ?scene=gallery                  all sprites: ×4, ×2, ×1, recoloured variants, the atlas
 *   ?scene=gallery&sprite=villager  one sprite large: every frame, variants, legend, anchor
 *   &frame=N                        a fixed moment of the animations (screenshots); &ui=0 — no captions
 *
 * The gallery is HTML with one small canvas per picture: it scrolls when there are many sprites
 * and lays out on a phone. Each canvas is exactly the size of its picture, so the browser never
 * rescales it and pixels stay crisp.
 */

const KIND_TITLE: Record<SpriteKind, string> = {
  tile: 'Тайлы',
  object: 'Объекты',
  character: 'Персонажи',
  icon: 'Значки',
};

const KIND_NAME: Record<SpriteKind, string> = {
  tile: 'тайл',
  object: 'объект',
  character: 'персонаж',
  icon: 'значок',
};

/** Overview: how a tile is repeated to check its seams. */
const TILE_REPEAT = 3;

interface View {
  draw(timeMs: number): void;
}

interface ViewOptions {
  scale: number;
  animation?: string;
  /** Fixed frame index; otherwise the animation plays. */
  frame?: number;
  swap?: PaletteSwap;
  /** Repeat a tile n×n. */
  repeat?: number;
  /** Mark the anchor point. */
  anchor?: boolean;
}

function color(palette: Palette, ramp: string, shade: number): string {
  return toHex(palette.ramps.get(ramp)![shade]!);
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  html = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} с`;
}

function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

/** Caption lines for a recolour: `skin_light →` / `skin_dark`. */
function describeSwap(swap: PaletteSwap): string {
  return Object.entries(swap)
    .map(([from, to]) => `${escapeHtml(from)} →<br>${escapeHtml(to ?? '')}`)
    .join('<br>');
}

export function createGalleryScene({ canvas, ui, params }: SceneContext): Scene {
  const palette = PALETTE;
  const background = color(palette, 'ui', 0);
  const checkerDark = color(palette, 'ui', 1);
  const checkerLight = color(palette, 'ui', 2);
  const marker = color(palette, 'ui', 3);

  // Validate everything first: problems go to the console (the screenshot tool fails on them)
  // and onto the page; broken sprites are left out so the rest can still be inspected.
  const problems: string[] = [...validateSpriteSet(SPRITE_FILES.map(({ sprite }) => sprite))];
  const sprites: SpriteDef[] = [];
  for (const { file, sprite } of SPRITE_FILES) {
    const own = validateSprite(sprite, palette);
    if (file !== sprite.name) {
      own.push(
        `спрайт «${sprite.name}»: лежит в файле ${file}.ts — имя файла должно совпадать с именем`,
      );
    }
    problems.push(...own);
    if (own.length === 0 && !sprites.some((s) => s.name === sprite.name)) sprites.push(sprite);
  }
  const startedAt = performance.now();
  const sheet: SpriteSheet = createSpriteSheet(sprites, palette);
  const buildMs = performance.now() - startedAt;

  let single =
    params.sprite === null ? null : (sprites.find((s) => s.name === params.sprite) ?? null);
  if (params.sprite !== null && !single) {
    problems.push(
      `Нет спрайта «${params.sprite}». Есть: ${sprites.map((s) => s.name).join(', ') || 'ни одного'}`,
    );
    single = null;
  }
  for (const problem of problems) console.error(problem);

  const checkerTiles = new Map<number, HTMLCanvasElement>();
  /** A 2×2-cell checker tile for a repeating pattern. */
  function checkerTile(cell: number): HTMLCanvasElement {
    let tile = checkerTiles.get(cell);
    if (!tile) {
      tile = document.createElement('canvas');
      tile.width = cell * 2;
      tile.height = cell * 2;
      const ctx = tile.getContext('2d')!;
      ctx.fillStyle = checkerDark;
      ctx.fillRect(0, 0, cell * 2, cell * 2);
      ctx.fillStyle = checkerLight;
      ctx.fillRect(0, 0, cell, cell);
      ctx.fillRect(cell, cell, cell, cell);
      checkerTiles.set(cell, tile);
    }
    return tile;
  }

  let views: View[] = [];

  /** A picture of one sprite: a canvas exactly as large as the picture, with a caption. */
  function figure(def: SpriteDef, options: ViewOptions, caption: string): HTMLElement {
    const { scale, repeat = 1 } = options;
    const pad = scale; // one sprite pixel of checker around the picture
    const node = element('figure', 'sprite-figure');
    const view = element('canvas');
    view.width = def.width * repeat * scale + pad * 2;
    view.height = def.height * repeat * scale + pad * 2;
    const ctx = view.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    // Checker cells are one sprite pixel at ×4 and more, never smaller than 4 screen pixels.
    const pattern = ctx.createPattern(checkerTile(Math.max(4, scale)), 'repeat')!;
    node.append(view);
    if (caption) node.append(element('figcaption', '', caption));

    views.push({
      draw(timeMs) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, view.width, view.height);
        for (let row = 0; row < repeat; row++) {
          for (let col = 0; col < repeat; col++) {
            sheet.draw(
              ctx,
              def.name,
              pad + (col * def.width + def.anchor.x) * scale,
              pad + (row * def.height + def.anchor.y) * scale,
              {
                ...(options.animation === undefined ? {} : { animation: options.animation }),
                ...(options.frame === undefined ? { timeMs } : { frame: options.frame }),
                ...(options.swap === undefined ? {} : { swap: options.swap }),
                scale,
              },
            );
          }
        }
        if (options.anchor) {
          // A thin crosshair on the anchor point, with a dark edge to stand out on any colour.
          const x = pad + def.anchor.x * scale;
          const y = pad + def.anchor.y * scale;
          const arm = Math.max(3, Math.round(scale * 1.5));
          const thick = Math.max(1, Math.floor(scale / 6));
          const half = Math.floor(thick / 2);
          ctx.fillStyle = background;
          ctx.fillRect(x - arm - 1, y - half - 1, arm * 2 + 2, thick + 2);
          ctx.fillRect(x - half - 1, y - arm - 1, thick + 2, arm * 2 + 2);
          ctx.fillStyle = marker;
          ctx.fillRect(x - arm, y - half, arm * 2, thick);
          ctx.fillRect(x - half, y - arm, thick, arm * 2);
        }
      },
    });
    return node;
  }

  function animationSummary(def: SpriteDef): string {
    return Object.entries(def.animations)
      .map(([name, animation]) => {
        const count = animation.frames.length;
        const total = frameDurations(animation).reduce((sum, ms) => sum + ms, 0);
        return count === 1
          ? `${name}: 1 кадр`
          : `${name}: ${count} ${plural(count, 'кадр', 'кадра', 'кадров')}, цикл ${seconds(total)}`;
      })
      .join(' · ');
  }

  function card(def: SpriteDef): HTMLElement {
    const node = element('article', 'sprite-card');
    node.append(
      element(
        'header',
        '',
        `<b>${escapeHtml(def.title)}</b> <span>${def.name} · ${def.width}×${def.height}</span>`,
      ),
    );
    const row = element('div', 'figures');
    row.append(
      figure(def, { scale: 4 }, '×4'),
      figure(def, { scale: 2 }, '×2'),
      figure(def, { scale: 1 }, '×1'),
    );
    if (def.kind === 'tile') {
      row.append(
        figure(def, { scale: 2, repeat: TILE_REPEAT }, `${TILE_REPEAT}×${TILE_REPEAT}, ×2`),
      );
    }
    for (const [name, swap] of Object.entries(def.variants ?? {})) {
      row.append(figure(def, { scale: 4, swap }, `${escapeHtml(name)}, ×4`));
    }
    node.append(row, element('p', 'meta', escapeHtml(animationSummary(def))));
    return node;
  }

  function atlasFigure(): HTMLElement {
    const node = element('section', 'atlas');
    const scale = 2;
    const view = element('canvas');
    view.width = sheet.canvas.width * scale;
    view.height = sheet.canvas.height * scale;
    const ctx = view.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = ctx.createPattern(checkerTile(4), 'repeat')!;
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.drawImage(sheet.canvas, 0, 0, view.width, view.height);
    node.append(
      element(
        'h2',
        '',
        `Атлас: ${sheet.atlas.width}×${sheet.atlas.height}, ${sheet.atlas.frameCount} ${plural(sheet.atlas.frameCount, 'кадр', 'кадра', 'кадров')} всех спрайтов на одном холсте, ×2`,
      ),
      view,
    );
    return node;
  }

  function overview(root: HTMLElement) {
    const kinds = element('div', 'kinds');
    root.append(kinds);
    for (const kind of Object.keys(KIND_TITLE) as SpriteKind[]) {
      const ofKind = sprites.filter((def) => def.kind === kind);
      if (ofKind.length === 0) continue;
      const section = element('section', 'kind');
      section.append(element('h2', '', KIND_TITLE[kind]));
      const grid = element('div', 'cards');
      grid.append(...ofKind.map(card));
      section.append(grid);
      kinds.append(section);
    }
    root.append(atlasFigure());
  }

  function details(root: HTMLElement, def: SpriteDef, width: number, height: number) {
    const ramps = [...usedRamps(def)].join(', ');
    root.append(
      element(
        'p',
        'meta',
        `${def.name} · ${KIND_NAME[def.kind]} · ${def.width}×${def.height} · привязка (${def.anchor.x}, ${def.anchor.y}) · ряды палитры: ${ramps}`,
      ),
    );

    // The largest whole scale that fits about half of the screen.
    const big = Math.max(
      4,
      Math.min(
        16,
        Math.floor(Math.min((width - 48) / (def.width + 2), (height * 0.5) / (def.height + 2))),
      ),
    );
    const main = element('div', 'figures');
    main.append(
      figure(def, { scale: big, anchor: true }, `×${big}, крестик — точка привязки`),
      figure(def, { scale: 4 }, '×4'),
      figure(def, { scale: 2 }, '×2'),
      figure(def, { scale: 1 }, '×1'),
    );
    if (def.kind === 'tile') {
      main.append(
        figure(def, { scale: 4, repeat: TILE_REPEAT }, `${TILE_REPEAT}×${TILE_REPEAT}, ×4`),
      );
    }
    root.append(main);

    for (const [name, animation] of Object.entries(def.animations)) {
      const durations = frameDurations(animation);
      const total = durations.reduce((sum, ms) => sum + ms, 0);
      const count = animation.frames.length;
      const isDefault = name === defaultAnimation(def) ? ', по умолчанию' : '';
      const timing =
        count === 1
          ? '1 кадр, неподвижный'
          : `${count} ${plural(count, 'кадр', 'кадра', 'кадров')}, цикл ${seconds(total)}`;
      root.append(element('h2', '', `Анимация «${escapeHtml(name)}»${isDefault}: ${timing}`));
      const strip = element('div', 'figures');
      durations.forEach((ms, index) => {
        strip.append(
          figure(def, { scale: 4, animation: name, frame: index }, `${index + 1} · ${ms} мс`),
        );
      });
      if (count > 1) strip.append(figure(def, { scale: 4, animation: name }, 'вместе'));
      root.append(strip);
    }

    const variants = Object.entries(def.variants ?? {});
    if (variants.length > 0) {
      root.append(element('h2', '', 'Перекраска (подмена рядов палитры)'));
      const row = element('div', 'figures top');
      row.append(figure(def, { scale: 4 }, 'основной'));
      for (const [name, swap] of variants) {
        row.append(
          figure(
            def,
            { scale: 4, swap },
            `${escapeHtml(name)}<br><small>${describeSwap(swap)}</small>`,
          ),
        );
      }
      root.append(row);
    }

    root.append(element('h2', '', 'Легенда'));
    const rows = Object.entries(def.legend).map(([symbol, name]) => {
      const [ramp = '', shade = '0'] = name.split('.');
      const rgb = palette.ramps.get(ramp)?.[Number(shade)];
      const hex = rgb ? toHex(rgb) : '?';
      const title = palette.defs.find((r) => r.name === ramp)?.title ?? '';
      return `<tr><td class="symbol">${escapeHtml(symbol)}</td><td><i class="swatch" style="background:${hex}"></i></td><td>${name}</td><td>${hex}</td><td>${escapeHtml(title)}</td></tr>`;
    });
    root.append(element('table', 'legend', `<tbody>${rows.join('')}</tbody>`));
  }

  let lastFrame = -1;
  let builtFor = '';

  function build(width: number, height: number) {
    views = [];
    lastFrame = -1;
    const root = element('div', `gallery${params.ui ? '' : ' bare'}`);
    root.style.background = background;
    const count = sprites.length;
    root.append(
      element(
        'header',
        'gallery-head',
        single
          ? `<h1>${escapeHtml(single.title)}</h1>`
          : `<h1>Галерея спрайтов</h1><p>${count} ${plural(count, 'спрайт', 'спрайта', 'спрайтов')} · атлас ${sheet.atlas.width}×${sheet.atlas.height} собран за ${buildMs.toFixed(1)} мс · ?scene=gallery&amp;sprite=имя — один спрайт крупно</p>`,
      ),
    );
    if (problems.length > 0) {
      root.append(
        element(
          'pre',
          'problems',
          `Ошибки в спрайтах:\n${problems.map((problem) => escapeHtml(problem)).join('\n')}`,
        ),
      );
    }
    if (single) details(root, single, width, height);
    else overview(root);
    ui.replaceChildren(root);
  }

  return {
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      // The big picture of one sprite depends on the window size; the overview does not.
      const key = single ? `${width}×${height}` : 'overview';
      if (key !== builtFor) {
        builtFor = key;
        build(width, height);
      }
    },
    render(frame) {
      if (frame === lastFrame) return;
      lastFrame = frame;
      const timeMs = (frame * 1000) / PRESENTATION_FPS;
      for (const view of views) view.draw(timeMs);
    },
  };
}
