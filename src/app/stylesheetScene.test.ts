/**
 * The style sheet is the reference picture of epoch 0: it must show every type of ground and
 * every sprite of the set, and nothing may stand in water.
 */
import { describe, expect, it } from 'vitest';
import { SPRITES } from '../art/registry.ts';
import { TILE_SIZE } from '../art/sprite.ts';
import { TERRAIN_LOOKS } from '../art/terrain.ts';
import type { Placement } from '../render/scenery.ts';
import { ERRAND_MS, GROUND, MAN, MAN_THINKS, MAP, STILL, womanAt } from './stylesheetScene.ts';

const byName = new Map(SPRITES.map((sprite) => [sprite.name, sprite]));
const groundAt = (x: number, y: number) =>
  GROUND[MAP[Math.floor((y - 1) / TILE_SIZE)]![Math.floor(x / TILE_SIZE)]!]!;
const moments = Array.from({ length: ERRAND_MS / 100 }, (_, i) => i * 100);
const everything: Placement[] = [...STILL, MAN, MAN_THINKS, ...moments.flatMap((t) => womanAt(t))];

describe('лист стиля', () => {
  it('карта прямоугольная, из известных видов земли, и в ней есть все виды земли', () => {
    expect(new Set(MAP.map((row) => row.length)).size).toBe(1);
    const used = new Set(MAP.flatMap((row) => [...row].map((c) => GROUND[c])));
    expect([...used].sort()).toEqual(TERRAIN_LOOKS.map((look) => look.id).sort());
  });

  it('все спрайты и анимации существуют', () => {
    for (const item of everything) {
      const sprite = byName.get(item.sprite);
      expect(sprite, item.sprite).toBeDefined();
      if (item.animation) expect(Object.keys(sprite!.animations)).toContain(item.animation);
    }
  });

  it('на картинке есть каждый предмет и житель набора, и все состояния куста', () => {
    const shown = new Set(everything.map((item) => item.sprite));
    for (const sprite of SPRITES) {
      if (sprite.kind === 'object' || sprite.kind === 'character') {
        expect(shown.has(sprite.name), sprite.name).toBe(true);
      }
    }
    const bushes = new Set(STILL.filter((i) => i.sprite === 'berry_bush').map((i) => i.animation));
    expect([...bushes].sort()).toEqual(['empty', 'ripe']);
  });

  it('ничего не стоит в воде; женщина ходит по суше', () => {
    for (const item of everything) {
      if (item.over) continue;
      const ground = groundAt(item.x, item.y);
      expect(ground.endsWith('water'), `${item.sprite} (${item.x}, ${item.y}) — ${ground}`).toBe(
        false,
      );
    }
  });

  it('прогулка к реке — цикл: в начале и в конце цикла женщина в одном месте', () => {
    expect(womanAt(0)[0]!.x).toBe(womanAt(ERRAND_MS)[0]!.x);
    expect(womanAt(0).some((item) => item.sprite === 'bubble_water')).toBe(true);
  });
});
