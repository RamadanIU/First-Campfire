/**
 * A small PNG reader for checks of screenshots (./screenshot.ts: `--check-crisp`, `--compare`):
 * PNG bytes → RGBA pixels. Node only, no libraries.
 *
 * Reads what Chromium writes: 8 bits per channel, RGB or RGBA, without interlacing. Anything
 * else is refused with a clear message rather than misread.
 */
import { inflateSync } from 'node:zlib';

/** Pixels row by row, 4 bytes (R, G, B, A) per pixel. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** Colour type → channels per pixel. */
const CHANNELS: Record<number, number> = { 2: 3, 6: 4 };

export function decodePng(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 8 || SIGNATURE.some((value, index) => bytes[index] !== value))
    throw new Error('Не PNG: нет подписи файла');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Uint8Array[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      channels = CHANNELS[colour!] ?? 0;
      if (depth !== 8 || channels === 0 || interlace !== 0)
        throw new Error(
          `PNG этого вида не читается: глубина ${depth}, тип цвета ${colour}, чересстрочность ${interlace} (умею 8 бит, RGB/RGBA, без чересстрочности)`,
        );
    } else if (type === 'IDAT') {
      parts.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (width === 0 || height === 0) throw new Error('PNG без заголовка IHDR');

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new Error('PNG обрезан: не хватает строк');
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = rows.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? rows.subarray((y - 1) * stride, y * stride) : null;
    unfilter(filter, source, row, above, channels, y);
  }

  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    data[i * 4] = rows[j]!;
    data[i * 4 + 1] = rows[j + 1]!;
    data[i * 4 + 2] = rows[j + 2]!;
    data[i * 4 + 3] = channels === 4 ? rows[j + 3]! : 255;
  }
  return { width, height, data };
}

/** Undo one row's filter (PNG spec, section 9). */
function unfilter(
  filter: number,
  source: Uint8Array,
  row: Uint8Array,
  above: Uint8Array | null,
  bpp: number,
  y: number,
): void {
  for (let x = 0; x < row.length; x++) {
    const a = x >= bpp ? row[x - bpp]! : 0;
    const b = above ? above[x]! : 0;
    const c = above && x >= bpp ? above[x - bpp]! : 0;
    let predicted: number;
    switch (filter) {
      case 0:
        predicted = 0;
        break;
      case 1:
        predicted = a;
        break;
      case 2:
        predicted = b;
        break;
      case 3:
        predicted = (a + b) >> 1;
        break;
      case 4:
        predicted = paeth(a, b, c);
        break;
      default:
        throw new Error(`PNG испорчен: неизвестный фильтр ${filter} в строке ${y}`);
    }
    row[x] = (source[x]! + predicted) & 0xff;
  }
}

export function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
