import { describe, expect, it } from 'vitest';
import { applySpeedCommand, speedCommand } from './controls.ts';
import { createGameLoop } from './loop.ts';

describe('управление скоростью', () => {
  it('пробел — пауза, 1–4 — ×1, ×2, ×5, ×20, остальные клавиши — ничего', () => {
    expect(speedCommand('Space')).toEqual({ kind: 'pause' });
    expect(['Digit1', 'Digit2', 'Digit3', 'Digit4'].map((code) => speedCommand(code))).toEqual([
      { kind: 'speed', speed: 1 },
      { kind: 'speed', speed: 2 },
      { kind: 'speed', speed: 5 },
      { kind: 'speed', speed: 20 },
    ]);
    expect(speedCommand('Numpad4')).toEqual({ kind: 'speed', speed: 20 });
    expect(speedCommand('Digit5')).toBeNull();
    expect(speedCommand('KeyA')).toBeNull();
  });

  it('команды меняют скорость цикла', () => {
    const loop = createGameLoop(() => {}, { ticksPerSecond: 10 });
    applySpeedCommand(loop, speedCommand('Digit3')!);
    expect(loop.speed).toBe(5);
    applySpeedCommand(loop, speedCommand('Space')!);
    expect(loop.speed).toBe(0);
    applySpeedCommand(loop, speedCommand('Space')!);
    expect(loop.speed).toBe(5);
  });
});
