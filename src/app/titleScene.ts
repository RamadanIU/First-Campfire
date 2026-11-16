import type { Scene, SceneContext } from './scene.ts';

/**
 * Title screen: a night camp drawn with plain rectangles on a low-resolution
 * buffer that is scaled up by a whole factor (so pixels stay square and crisp).
 * It is a placeholder that proves the build, the render loop and the screenshot
 * pipeline work. Real art arrives with the art pipeline (roadmap step 0.3).
 */
const VIEW_W = 240;
const VIEW_H = 135;
const HORIZON = 92;
const FIRE_X = 120;
const FIRE_Y = 108;

/** Cheap deterministic hash → [0, 1). Presentation only; the sim has its own RNG. */
function hash(a: number, b = 0): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createTitleScene({ canvas, ui, params }: SceneContext): Scene {
  const screen = canvas.getContext('2d')!;
  const buffer = document.createElement('canvas');
  buffer.width = VIEW_W;
  buffer.height = VIEW_H;
  const ctx = buffer.getContext('2d')!;

  if (params.ui) {
    ui.innerHTML = `
      <div class="title">
        <h1>ПЕРВЫЙ КОСТЁР</h1>
        <p>симулятор эволюции цивилизации</p>
      </div>
      <div class="build">v${__APP_VERSION__} · зерно ${params.seed}</div>`;
  }

  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };

  function drawSky(frame: number) {
    const bands = ['#0b1026', '#0e1530', '#121b3b', '#172345', '#1c2b4e', '#22345a'];
    const bandH = Math.ceil(HORIZON / bands.length);
    for (const [i, color] of bands.entries()) px(0, i * bandH, VIEW_W, bandH, color);
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash(i, params.seed) * VIEW_W);
      const y = Math.floor(hash(i, params.seed + 1) * (HORIZON - 14));
      const twinkle = hash(i, Math.floor(frame / 6) + i) > 0.25;
      if (twinkle) px(x, y, 1, 1, hash(i, 7) > 0.8 ? '#ffffff' : '#9fb0d8');
    }
    // Moon
    px(188, 16, 9, 9, '#e8ecf4');
    px(189, 15, 7, 11, '#e8ecf4');
    px(187, 17, 11, 7, '#e8ecf4');
    px(191, 18, 2, 2, '#c5cbdb');
    px(194, 21, 2, 1, '#c5cbdb');
  }

  function drawForest() {
    for (let x = 0; x < VIEW_W; x += 5) {
      const h = 10 + Math.floor(hash(x, params.seed + 2) * 16);
      for (let row = 0; row < h; row++) {
        const half = Math.max(1, Math.floor(((row + 2) * 4) / h));
        px(x + 2 - half, HORIZON - h + row, half * 2 + 1, 1, '#0d1a1c');
      }
    }
    px(0, HORIZON, VIEW_W, VIEW_H - HORIZON, '#13211c');
    for (let i = 0; i < 120; i++) {
      const x = Math.floor(hash(i, 11) * VIEW_W);
      const y = HORIZON + 1 + Math.floor(hash(i, 12) * (VIEW_H - HORIZON - 2));
      px(x, y, 1, 1, '#1a2e24');
    }
  }

  function drawGlow(frame: number) {
    const flicker = hash(Math.floor(frame / 3), 3) * 3;
    const rings: [number, string][] = [
      [46 + flicker, 'rgba(255,150,60,0.05)'],
      [34 + flicker, 'rgba(255,160,70,0.07)'],
      [23 + flicker, 'rgba(255,180,90,0.09)'],
      [13 + flicker, 'rgba(255,200,120,0.12)'],
    ];
    for (const [radius, color] of rings) {
      for (let dy = -radius; dy <= radius; dy++) {
        const half = Math.floor(Math.sqrt(radius * radius - dy * dy));
        // Squash vertically: light lies on the ground.
        const y = FIRE_Y + Math.round(dy * 0.5);
        if (y > HORIZON) px(FIRE_X - half, y, half * 2, 1, color);
      }
    }
  }

  function drawShelter() {
    const baseY = FIRE_Y + 3;
    for (let row = 0; row < 22; row++) {
      const half = Math.floor((row * 15) / 22);
      px(64 - half, baseY - 22 + row, half * 2 + 1, 1, row % 4 === 0 ? '#3c2c1e' : '#4a3927');
    }
    for (let row = 6; row < 22; row++) {
      const half = Math.floor(((row - 6) * 5) / 16);
      px(64 - half, baseY - 22 + row, half * 2 + 1, 1, '#120d0a');
    }
    px(63, baseY - 25, 1, 4, '#5a4630');
    px(65, baseY - 24, 1, 3, '#5a4630');
  }

  function drawPerson(x: number, facing: 1 | -1, hair: string, cloth: string) {
    const y = FIRE_Y - 4;
    px(x, y - 9, 4, 4, '#d9a273'); // head
    px(x, y - 10, 4, 2, hair);
    px(facing === 1 ? x : x + 3, y - 9, 1, 2, hair);
    px(x - 1, y - 5, 6, 5, cloth); // torso, sitting
    px(facing === 1 ? x + 4 : x - 3, y - 1, 3, 2, '#d9a273'); // knees toward the fire
    px(facing === 1 ? x + 5 : x - 2, y - 4, 2, 1, '#d9a273'); // hand toward the fire
    px(facing === 1 ? x + 4 : x - 1, y - 8, 1, 3, '#ffcf8f'); // warm rim light
  }

  function drawFire(frame: number) {
    px(FIRE_X - 7, FIRE_Y, 14, 2, '#3b2616');
    px(FIRE_X - 5, FIRE_Y - 1, 10, 1, '#523420');
    px(FIRE_X - 9, FIRE_Y + 1, 2, 1, '#6b6f78');
    px(FIRE_X + 7, FIRE_Y + 1, 2, 1, '#6b6f78');
    const step = Math.floor(frame / 4);
    for (let col = -4; col <= 4; col++) {
      const shape = 11 - Math.abs(col) * 2;
      const h = Math.max(1, shape + Math.floor(hash(col + 9, step) * 5) - 2);
      px(FIRE_X + col, FIRE_Y - h, 1, h, '#e2552a');
      if (h > 3) px(FIRE_X + col, FIRE_Y - h + 2, 1, h - 2, '#ff9a3c');
      if (h > 6 && Math.abs(col) < 3) px(FIRE_X + col, FIRE_Y - h + 5, 1, h - 5, '#ffd27a');
    }
    for (let i = 0; i < 6; i++) {
      const life = (frame + i * 17) % 60;
      const sx = FIRE_X + Math.round((hash(i, Math.floor((frame + i * 17) / 60)) - 0.5) * 16);
      if (life < 44)
        px(
          sx + Math.round(Math.sin(life / 6 + i) * 2),
          FIRE_Y - 12 - life / 2,
          1,
          1,
          life < 22 ? '#ffd27a' : '#c9622f',
        );
    }
  }

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  return {
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      // Cover the window with a whole-number scale; overflow is cropped evenly.
      scale = Math.max(1, Math.ceil(Math.max(width / VIEW_W, height / VIEW_H)));
      offsetX = Math.floor((width - VIEW_W * scale) / 2);
      offsetY = Math.floor((height - VIEW_H * scale) / 2);
    },
    render(frame) {
      drawSky(frame);
      drawForest();
      drawGlow(frame);
      drawShelter();
      drawPerson(100, 1, '#3a2418', '#7a5a3a');
      drawPerson(137, -1, '#a8642c', '#6b4a33');
      drawFire(frame);
      screen.imageSmoothingEnabled = false;
      screen.drawImage(buffer, offsetX, offsetY, VIEW_W * scale, VIEW_H * scale);
    },
  };
}
