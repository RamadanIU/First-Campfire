/**
 * Launch parameters read from the page URL (?seed=42&scene=title&frame=10&ui=0).
 * They make every screen reproducible: the screenshot tool and bug reports
 * use the same URL to get the same picture.
 */
export interface LaunchParams {
  /** World seed. One seed — one history. */
  seed: number;
  /** Which scene to open. Scenes are registered in src/app/scenes.ts. */
  scene: string;
  /** If set, render exactly this animation frame and stop (deterministic screenshots). */
  frame: number | null;
  /** Show the DOM interface layer. */
  ui: boolean;
}

export const DEFAULT_PARAMS: LaunchParams = {
  seed: 1,
  scene: 'title',
  frame: null,
  ui: true,
};

function parseInteger(raw: string | null, min: number): number | null {
  if (raw === null || !/^-?\d+$/.test(raw.trim())) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= min ? value : null;
}

export function parseParams(search: string): LaunchParams {
  const query = new URLSearchParams(search);
  const scene = query.get('scene')?.trim();
  return {
    seed: parseInteger(query.get('seed'), 0) ?? DEFAULT_PARAMS.seed,
    scene: scene ? scene : DEFAULT_PARAMS.scene,
    frame: parseInteger(query.get('frame'), 0),
    ui: query.get('ui') !== '0',
  };
}
