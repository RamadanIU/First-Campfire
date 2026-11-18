import { describe, expect, it } from 'vitest';
import { barFill, drawNeeds, NEED_BARS, NEED_BARS_HEIGHT, OVERLAY_COLORS } from './debugOverlay.ts';

/** A fake 2D context that remembers the rectangles filled, with their colours. */
function recorder() {
  const rects: { color: string; x: number; y: number; w: number; h: number }[] = [];
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ color: this.fillStyle, x, y, w, h });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}

describe('шкалы нужд над головой (debug=needs)', () => {
  it('заполнение: пусто только на нуле, полно только на 100', () => {
    expect(barFill(0)).toBe(0);
    expect(barFill(0.4)).toBe(1);
    expect(barFill(50)).toBe(NEED_BARS.width / 2);
    expect(barFill(99.6)).toBe(NEED_BARS.width - 1);
    expect(barFill(100)).toBe(NEED_BARS.width);
  });

  it('рамка над головой, четыре полосы: сытость, жажда, сон, здоровье — сверху вниз', () => {
    const { ctx, rects } = recorder();
    const view = { x: 100, y: 200, width: 64, height: 64 };
    drawNeeds(ctx, view, 130, 240, { food: 50, water: 100, sleep: 25, health: 0 });
    const [frame, ...bars] = rects;
    // The frame ends 2 px above the head, in view coordinates.
    expect(frame).toMatchObject({
      color: OVERLAY_COLORS.edge,
      y: 240 - 2 - NEED_BARS_HEIGHT - 200,
    });
    expect(frame!.w).toBe(NEED_BARS.width + 2);
    const filled = bars.filter((_, i) => i % 2 === 0);
    expect(filled.map((r) => [r.color, r.w])).toEqual([
      [OVERLAY_COLORS.food, 6],
      [OVERLAY_COLORS.water, 12],
      [OVERLAY_COLORS.sleep, 3],
      [OVERLAY_COLORS.health, 0],
    ]);
    expect(filled.map((r) => r.y)).toEqual([
      frame!.y + 1,
      frame!.y + 4,
      frame!.y + 7,
      frame!.y + 10,
    ]);
  });
});
