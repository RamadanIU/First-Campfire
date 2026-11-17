/**
 * The game's data, loaded and checked once when the module is first imported.
 *
 * The files are imported as JSON modules: the bundler (Vite) puts them into the build, and Node
 * reads them directly — the same code in the browser, in tests and in headless runs, with no
 * fetching and no file system. A broken table stops the start with a `DataError` naming the
 * file, record and field (main.ts shows it on the page).
 */
import balance from '../../data/balance.json' with { type: 'json' };
import objects from '../../data/objects.json' with { type: 'json' };
import resources from '../../data/resources.json' with { type: 'json' };
import terrain from '../../data/terrain.json' with { type: 'json' };
import { type GameData, loadTables, type RawTables } from './tables.ts';

/** The files exactly as written, before the check (tests corrupt copies of them). */
export const RAW_TABLES: RawTables = { balance, resources, terrain, objects };

export const DATA: GameData = loadTables(RAW_TABLES);
