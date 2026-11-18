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
      light: true,
      ticks: 0,
      speed: 1,
      sprite: null,
      zoom: null,
      cam: null,
      slot: null,
      debug: [],
      go: null,
      select: null,
      menu: false,
      worldFromUrl: true,
    });
  });

  it('reads select (a villager id ≥ 1) and menu=1 (step 1.6)', () => {
    expect(parseParams('?select=2').select).toBe(2);
    expect(parseParams('?select=0').select).toBeNull();
    expect(parseParams('?select=x').select).toBeNull();
    expect(parseParams('').select).toBeNull();
    expect(parseParams('?menu=1').menu).toBe(true);
    expect(parseParams('?menu=0').menu).toBe(false);
    expect(parseParams('').menu).toBe(false);
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

  it('reads zoom: the four camera steps 0.5, 1, 2, 4; anything else — the scene decides', () => {
    expect(parseParams('?zoom=0.5').zoom).toBe(0.5);
    expect(parseParams('?zoom=.5').zoom).toBe(0.5);
    expect(parseParams('?zoom=1').zoom).toBe(1);
    expect(parseParams('?zoom=2').zoom).toBe(2);
    expect(parseParams('?zoom=4').zoom).toBe(4);
    expect(parseParams('?zoom=3').zoom).toBeNull();
    expect(parseParams('?zoom=0').zoom).toBeNull();
    expect(parseParams('?zoom=5').zoom).toBeNull();
    expect(parseParams('?zoom=1.5').zoom).toBeNull();
    expect(parseParams('?zoom=0,5').zoom).toBeNull();
    expect(parseParams('?zoom=x').zoom).toBeNull();
    expect(parseParams('?zoom=').zoom).toBeNull();
  });

  it('reads cam: x,y in tiles (fractional too); malformed — the scene decides', () => {
    expect(parseParams('?cam=20,31').cam).toEqual({ x: 20, y: 31 });
    expect(parseParams('?cam=20.5,%2031.25').cam).toEqual({ x: 20.5, y: 31.25 });
    expect(parseParams('?cam=-3,70').cam).toEqual({ x: -3, y: 70 });
    expect(parseParams('?cam=20').cam).toBeNull();
    expect(parseParams('?cam=20,31,4').cam).toBeNull();
    expect(parseParams('?cam=a,b').cam).toBeNull();
    expect(parseParams('?cam=,').cam).toBeNull();
    expect(parseParams('?cam=1e3,2').cam).toBeNull();
    expect(parseParams('').cam).toBeNull();
  });

  it('reads light: on by default, light=0 turns the light of the time of day off', () => {
    expect(parseParams('').light).toBe(true);
    expect(parseParams('?light=0').light).toBe(false);
    expect(parseParams('?light=1').light).toBe(true);
  });

  it('reads debug: words of overlays; 1 — paths and clicks; 0 or nothing — none', () => {
    expect(parseParams('?debug=1').debug).toEqual(['1']);
    expect(parseParams('?debug=1,%20needs').debug).toEqual(['1', 'needs']);
    expect(parseParams('?debug=0').debug).toEqual([]);
    expect(parseParams('?debug=').debug).toEqual([]);
    expect(parseParams('').debug).toEqual([]);
  });

  it('reads go: a tile x,y (whole numbers ≥ 0); malformed — none', () => {
    expect(parseParams('?go=18,40').go).toEqual({ x: 18, y: 40 });
    expect(parseParams('?go=18.5,40').go).toBeNull();
    expect(parseParams('?go=-1,4').go).toBeNull();
    expect(parseParams('?go=18').go).toBeNull();
    expect(parseParams('').go).toBeNull();
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
