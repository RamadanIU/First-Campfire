import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePng, paeth } from './png.ts';

/** CRC-32 of PNG chunks (decodePng does not check it, but a real file has it). */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/**
 * A test encoder: `pixels` — rows of channel values; row y uses filter `filters[y % 5]`, so all
 * five PNG filters are exercised. IDAT is split in two chunks, as encoders may do.
 */
function encodePng(
  width: number,
  height: number,
  channels: 3 | 4,
  pixels: number[],
  options: { depth?: number; interlace?: number; filters?: number[] } = {},
): Buffer {
  const filters = options.filters ?? [0, 1, 2, 3, 4];
  const stride = width * channels;
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    const filter = filters[y % filters.length]!;
    raw.push(filter);
    for (let x = 0; x < stride; x++) {
      const value = pixels[y * stride + x]!;
      const a = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const c = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels]! : 0;
      const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter] ?? 0;
      raw.push((value - predicted) & 0xff);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = options.depth ?? 8;
  header[9] = channels === 4 ? 6 : 2;
  header[12] = options.interlace ?? 0;
  const compressed = deflateSync(Buffer.from(raw));
  const half = compressed.length >> 1;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', compressed.subarray(0, half)),
    chunk('IDAT', compressed.subarray(half)),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** Deterministic "noise" that makes every filter predict something different. */
function noise(count: number): number[] {
  let state = 12345;
  return Array.from({ length: count }, () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state >> 23;
  });
}

describe('чтение PNG', () => {
  it('RGBA: все пять фильтров строк дают исходные пиксели', () => {
    const pixels = noise(7 * 10 * 4);
    const image = decodePng(encodePng(7, 10, 4, pixels));
    expect(image.width).toBe(7);
    expect(image.height).toBe(10);
    expect([...image.data]).toEqual(pixels);
  });

  it('RGB: прозрачность становится 255', () => {
    const pixels = noise(5 * 6 * 3);
    const image = decodePng(encodePng(5, 6, 3, pixels));
    const expected: number[] = [];
    for (let i = 0; i < pixels.length; i += 3)
      expected.push(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, 255);
    expect([...image.data]).toEqual(expected);
  });

  it('чужой или неподдержанный файл — понятная ошибка, а не мусор', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow('Не PNG');
    expect(() => decodePng(encodePng(2, 2, 4, noise(16), { depth: 16 }))).toThrow('глубина 16');
    expect(() => decodePng(encodePng(2, 2, 4, noise(16), { interlace: 1 }))).toThrow(
      'чересстрочность 1',
    );
    expect(() => decodePng(encodePng(2, 2, 4, noise(16), { filters: [7] }))).toThrow(
      'неизвестный фильтр 7',
    );
  });

  it('предсказатель Паэта — как в стандарте PNG', () => {
    expect(paeth(10, 20, 10)).toBe(20); // p = 20: closest to b
    expect(paeth(20, 10, 10)).toBe(20); // p = 20: closest to a
    expect(paeth(10, 10, 20)).toBe(10); // p = 0: a and b tie, a wins
    expect(paeth(0, 100, 50)).toBe(50); // p = 50: c is exact
  });
});
