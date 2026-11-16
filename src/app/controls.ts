import type { GameLoop, Speed } from './loop.ts';

/**
 * Keyboard control of the game speed: Space — pause/resume, 1–4 — ×1, ×2, ×5, ×20.
 * The same keys will drive the main world scene.
 */
const SPEED_BY_KEY: Readonly<Record<string, Speed>> = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 5,
  Digit4: 20,
  Numpad1: 1,
  Numpad2: 2,
  Numpad3: 5,
  Numpad4: 20,
};

export type SpeedCommand = { kind: 'pause' } | { kind: 'speed'; speed: Speed };

/** What a key (KeyboardEvent.code) does to the speed, or null if nothing. */
export function speedCommand(code: string): SpeedCommand | null {
  if (code === 'Space') return { kind: 'pause' };
  const speed = SPEED_BY_KEY[code];
  return speed === undefined ? null : { kind: 'speed', speed };
}

export function applySpeedCommand(loop: GameLoop, command: SpeedCommand): void {
  if (command.kind === 'pause') loop.togglePause();
  else loop.setSpeed(command.speed);
}

/** Listen for speed keys on `target`; returns a function that stops listening. */
export function bindSpeedKeys(loop: GameLoop, target: Window): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const command = speedCommand(event.code);
    if (!command) return;
    event.preventDefault();
    applySpeedCommand(loop, command);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
