import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, parseParams } from './params.ts';

describe('parseParams', () => {
  it('returns defaults for an empty query', () => {
    expect(parseParams('')).toEqual(DEFAULT_PARAMS);
  });

  it('reads seed, scene, frame and ui', () => {
    expect(parseParams('?seed=42&scene=title&frame=10&ui=0')).toEqual({
      seed: 42,
      seedGiven: true,
      scene: 'title',
      frame: 10,
      ui: false,
      ticks: 0,
      speed: 1,
      sprite: null,
      zoom: null,
      slot: null,
      worldFromUrl: true,
    });
  });

  it('a world given by seed= or ticks= comes from the address, unless slot= prepares a save', () => {
    expect(parseParams('?scene=world').worldFromUrl).toBe(false);
    expect(parseParams('?scene=world&seed=7').worldFromUrl).toBe(true);
    expect(parseParams('?scene=world&ticks=100').worldFromUrl).toBe(true);
    expect(parseParams('?scene=world&seed=bad').worldFromUrl).toBe(false);
    expect(parseParams('?scene=world&slot=world&seed=7&ticks=9000')).toMatchObject({
      slot: 'world',
      seed: 7,
      ticks: 9000,
      worldFromUrl: false,
    });
  });

  it('reads the debug slot preset; unknown ones are ignored', () => {
    for (const preset of ['world', 'broken', 'alien', 'newer', 'empty'])
      expect(parseParams(`?slot=${preset}`).slot).toBe(preset);
    expect(parseParams('?slot=nonsense').slot).toBeNull();
    expect(parseParams('?slot=').slot).toBeNull();
  });

  it('reads zoom: only whole scales 1–4, anything else — the scene decides', () => {
    expect(parseParams('?zoom=2').zoom).toBe(2);
    expect(parseParams('?zoom=4').zoom).toBe(4);
    expect(parseParams('?zoom=0').zoom).toBeNull();
    expect(parseParams('?zoom=5').zoom).toBeNull();
    expect(parseParams('?zoom=1.5').zoom).toBeNull();
    expect(parseParams('?zoom=x').zoom).toBeNull();
  });

  it('reads the gallery sprite name', () => {
    expect(parseParams('?scene=gallery&sprite=villager').sprite).toBe('villager');
    expect(parseParams('?scene=gallery&sprite=%20tree%20').sprite).toBe('tree');
    expect(parseParams('?scene=gallery&sprite=').sprite).toBeNull();
  });

  it('reads ticks and speed', () => {
    expect(parseParams('?scene=clock&ticks=3130&speed=20')).toMatchObject({
      scene: 'clock',
      ticks: 3130,
      speed: 20,
    });
    expect(parseParams('?speed=0').speed).toBe(0);
  });

  it('falls back to defaults for unknown speeds and bad tick counts', () => {
    expect(parseParams('?speed=3').speed).toBe(DEFAULT_PARAMS.speed);
    expect(parseParams('?speed=fast').speed).toBe(DEFAULT_PARAMS.speed);
    expect(parseParams('?ticks=-5').ticks).toBe(0);
    expect(parseParams('?ticks=12.5').ticks).toBe(0);
  });

  it('ignores malformed numbers instead of producing NaN', () => {
    const params = parseParams('?seed=abc&frame=1.5');
    expect(params.seed).toBe(DEFAULT_PARAMS.seed);
    expect(params.seedGiven).toBe(false);
    expect(params.frame).toBeNull();
  });

  it('rejects negative values', () => {
    expect(parseParams('?seed=-3&frame=-1')).toMatchObject({
      seed: DEFAULT_PARAMS.seed,
      frame: null,
    });
  });
});
