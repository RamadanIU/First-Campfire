import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, parseParams } from './params.ts';

describe('parseParams', () => {
  it('returns defaults for an empty query', () => {
    expect(parseParams('')).toEqual(DEFAULT_PARAMS);
  });

  it('reads seed, scene, frame and ui', () => {
    expect(parseParams('?seed=42&scene=title&frame=10&ui=0')).toEqual({
      seed: 42,
      scene: 'title',
      frame: 10,
      ui: false,
    });
  });

  it('ignores malformed numbers instead of producing NaN', () => {
    const params = parseParams('?seed=abc&frame=1.5');
    expect(params.seed).toBe(DEFAULT_PARAMS.seed);
    expect(params.frame).toBeNull();
  });

  it('rejects negative values', () => {
    expect(parseParams('?seed=-3&frame=-1')).toMatchObject({
      seed: DEFAULT_PARAMS.seed,
      frame: null,
    });
  });
});
