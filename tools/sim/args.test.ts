import { describe, expect, it } from 'vitest';
import { ArgsError, parseSeeds, parseSimArgs } from './args.ts';

describe('параметры npm run sim', () => {
  it('зёрна: диапазон, список, их смесь — по возрастанию', () => {
    expect(parseSeeds('1..5')).toEqual([1, 2, 3, 4, 5]);
    expect(parseSeeds('7')).toEqual([7]);
    expect(parseSeeds('10,2,5')).toEqual([2, 5, 10]);
    expect(parseSeeds('1..3, 50, 0')).toEqual([0, 1, 2, 3, 50]);
    expect(parseSeeds('4..4')).toEqual([4]);
    expect(parseSeeds('1..100')).toHaveLength(100);
  });

  it('ошибки в зёрнах объяснены', () => {
    expect(() => parseSeeds('5..1')).toThrow('диапазон 5..1 идёт назад — нужно 1..5');
    expect(() => parseSeeds('1..3,2')).toThrow('зерно 2 указано дважды');
    expect(() => parseSeeds('1,,2')).toThrow('пустой элемент');
    expect(() => parseSeeds('-1')).toThrow('«-1» — не зерно');
    expect(() => parseSeeds('abc')).toThrow(ArgsError);
    expect(() => parseSeeds('1.5')).toThrow('не зерно');
    expect(() => parseSeeds('0..2000000')).toThrow('больше миллиона миров');
  });

  it('по умолчанию: зёрна 1..100, 10 лет, потоков — по числу ядер, итог в out/sim', () => {
    expect(parseSimArgs([], 4)).toEqual({
      seeds: Array.from({ length: 100 }, (_, i) => i + 1),
      seedsText: '1..100',
      years: 10,
      threads: 4,
      out: 'out/sim',
      help: false,
      load: null,
    });
  });

  it('--load: один мир из сохранения, один поток; с --seeds нельзя', () => {
    expect(parseSimArgs(['--load', 'out/мир.json', '--years', '5'], 8)).toEqual({
      seeds: [],
      seedsText: '',
      years: 5,
      threads: 1,
      out: 'out/sim',
      help: false,
      load: 'out/мир.json',
    });
    expect(() => parseSimArgs(['--load', 'мир.json', '--seeds', '1..3'], 8)).toThrow(
      '--load и --seeds вместе нельзя',
    );
    expect(() => parseSimArgs(['--load', ' '], 8)).toThrow('--load: не указан файл сохранения');
    expect(() => parseSimArgs(['--load'], 8)).toThrow(ArgsError);
  });

  it('все параметры', () => {
    const options = parseSimArgs(
      ['--seeds', '3..6', '--years', '50', '--threads', '2', '--out', 'out/x'],
      8,
    );
    expect(options).toMatchObject({ seeds: [3, 4, 5, 6], years: 50, threads: 2, out: 'out/x' });
    expect(parseSimArgs(['--help'], 1).help).toBe(true);
    expect(parseSimArgs(['-h'], 1).help).toBe(true);
  });

  it('потоков не больше, чем миров', () => {
    expect(parseSimArgs(['--seeds', '1..3'], 16).threads).toBe(3);
    expect(parseSimArgs(['--seeds', '1,2', '--threads', '8'], 16).threads).toBe(2);
  });

  it('неверные параметры — понятная ошибка', () => {
    expect(() => parseSimArgs(['--years', '0'], 4)).toThrow(
      '--years: нужно целое число от 1 до 10000, получено «0»',
    );
    expect(() => parseSimArgs(['--years', '2.5'], 4)).toThrow('--years');
    expect(() => parseSimArgs(['--threads', 'много'], 4)).toThrow('--threads');
    expect(() => parseSimArgs(['--seed', '1'], 4)).toThrow('неизвестный параметр или нет значения');
    expect(() => parseSimArgs(['лишнее'], 4)).toThrow(ArgsError);
    expect(() => parseSimArgs(['--out', ' '], 4)).toThrow('--out: пустое имя папки');
  });
});
