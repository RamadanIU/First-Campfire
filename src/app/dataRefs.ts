import { SPRITES } from '../art/registry.ts';
import { TERRAIN_LOOKS } from '../art/terrain.ts';
import { checkExternalRefs, type DataIssue } from '../data/schema.ts';
import { EXTERNAL_KINDS, type GameData } from '../data/tables.ts';

/**
 * Names the data tables may refer to outside src/data, by kind: sprites (src/art/sprites/) and
 * looks of the ground (TERRAIN_LOOKS). src/data cannot import src/art, so the check lives here,
 * where both are known; tests/data.test.ts and the start of the game (main.ts) use it.
 */
export const DATA_CATALOGS: Readonly<Record<string, readonly string[]>> = {
  [EXTERNAL_KINDS.sprite]: SPRITES.map((sprite) => sprite.name),
  [EXTERNAL_KINDS.terrainLook]: TERRAIN_LOOKS.map((look) => look.id),
};

/** References from the tables to sprites and looks of the ground that do not exist. */
export function checkDataRefs(data: GameData): DataIssue[] {
  return checkExternalRefs(data.external, DATA_CATALOGS);
}
