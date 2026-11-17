/**
 * All sprites of the game. Every file in src/art/sprites/ is picked up automatically
 * (Vite collects them at build time), so a new sprite is added with ONE new file:
 * `src/art/sprites/<name>.ts` with `export default defineSprite({ name: '<name>', … })`.
 *
 * Works under Vite and Vitest. Plain Node scripts (tools/) cannot use import.meta.glob;
 * they would have to list the folder themselves.
 */
import type { SpriteDef, SpriteKind } from './sprite.ts';

export interface SpriteFile {
  /** File name without folder and extension; must equal the sprite's name. */
  readonly file: string;
  readonly sprite: SpriteDef;
}

const modules = import.meta.glob<SpriteDef>(['./sprites/*.ts', '!./sprites/*.test.ts'], {
  eager: true,
  import: 'default',
});

const KIND_ORDER: readonly SpriteKind[] = ['tile', 'object', 'character', 'icon'];

/** Sprite files ordered for display: tiles, objects, characters, icons; by name within. */
export const SPRITE_FILES: readonly SpriteFile[] = Object.entries(modules)
  .map(([path, sprite]) => ({ file: path.replace(/^.*\//, '').replace(/\.ts$/, ''), sprite }))
  .sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.sprite.kind) - KIND_ORDER.indexOf(b.sprite.kind) ||
      (a.sprite.name < b.sprite.name ? -1 : a.sprite.name > b.sprite.name ? 1 : 0),
  );

export const SPRITES: readonly SpriteDef[] = SPRITE_FILES.map(({ sprite }) => sprite);
