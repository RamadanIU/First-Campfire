import { describe, expect, it } from 'vitest';
import type { WorldEvent } from '../sim/events.ts';
import type { LoadError } from '../sim/save.ts';
import {
  capitalize,
  countOf,
  dateText,
  deathNote,
  describeCause,
  FORMS,
  feedText,
  loadErrorText,
  loadWarningText,
  plural,
  shortDateText,
  speedName,
  storedSize,
  zoomName,
} from './texts.ts';

const event = (body: Partial<WorldEvent> & { type: WorldEvent['type'] }): WorldEvent =>
  ({ id: 1, tick: 0, cause: { kind: 'rule', rule: 'genesis' }, ...body }) as WorldEvent;

describe('модуль текстов', () => {
  it('окончания после чисел: 1 мир, 2 мира, 5 миров, 11–14 миров, 21 мир; дробь — «2,5 тика»', () => {
    const forms = [1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 100, 101, 111, 112].map(
      (n) => `${n} ${plural(n, FORMS.world)}`,
    );
    expect(forms).toEqual([
      '1 мир',
      '2 мира',
      '4 мира',
      '5 миров',
      '11 миров',
      '12 миров',
      '14 миров',
      '21 мир',
      '22 мира',
      '25 миров',
      '100 миров',
      '101 мир',
      '111 миров',
      '112 миров',
    ]);
    expect(plural(2.5, FORMS.tick)).toBe('тика');
    expect(plural(0, FORMS.year)).toBe('лет');
    expect(countOf(9000, FORMS.tick)).toBe('9 000 тиков');
    expect(countOf(1, FORMS.villager)).toBe('1 житель');
  });

  it('дата словами: год, сезон, день сезона', () => {
    expect(dateText({ year: 1, season: 'spring', dayOfSeason: 1 }, 3)).toBe(
      'год 1 · весна · день 1 из 3',
    );
    expect(dateText({ year: 12, season: 'winter', dayOfSeason: 3 }, 3)).toBe(
      'год 12 · зима · день 3 из 3',
    );
    expect(shortDateText({ year: 9, season: 'autumn', dayOfSeason: 2 })).toBe(
      'год 9, осень, день 2',
    );
    expect(capitalize('год 2')).toBe('Год 2');
  });

  it('скорость и масштаб: «пауза», «×20», «×0,5»', () => {
    expect(speedName(0)).toBe('пауза');
    expect(speedName(20)).toBe('×20');
    expect(zoomName(0.5)).toBe('×0,5');
    expect(zoomName(2)).toBe('×2');
  });

  it('причина отказа загрузки — по коду: у каждого кода и повреждения свои слова', () => {
    const error = (over: Partial<LoadError>): LoadError => ({
      code: 'damaged',
      reason: null,
      versions: null,
      detail: '',
      ...over,
    });
    expect(loadErrorText(error({ code: 'empty' }))).toBe('Сохранение пустое.');
    expect(loadErrorText(error({ code: 'not_save' }))).toBe('Это не сохранение «Первого костра».');
    expect(loadErrorText(error({ reason: 'cut' }))).toBe(
      'Сохранение повреждено: файл обрезан или испорчен.',
    );
    expect(loadErrorText(error({ reason: 'hash_mismatch' }))).toMatch(/контрольная сумма/);
    expect(loadErrorText(error({ code: 'too_new', versions: { found: 9, current: 5 } }))).toBe(
      'Сохранение сделано более новой версией игры (формат 9, а эта версия понимает до 5).',
    );
    expect(loadErrorText(error({ code: 'too_old', versions: { found: 2, current: 5 } }))).toMatch(
      /старой версией игры \(формат 2, а эта версия — 5\)/,
    );
    const reasons = [
      'unreadable',
      'cut',
      'no_version',
      'no_world',
      'no_header',
      'header_mismatch',
      'hash_mismatch',
    ] as const;
    const texts = reasons.map((reason) => loadErrorText(error({ reason })));
    expect(new Set(texts).size).toBe(reasons.length);
    expect(loadWarningText({ code: 'data_changed' })).toMatch(/таблицах данных изменились/);
  });

  it('размер сохранения — в КБ или МБ', () => {
    expect(storedSize(10)).toBe('1 КБ');
    expect(storedSize(1_800_000)).toBe('1,7 МБ');
  });

  it('строки ленты событий: кто и что, с причиной; не для ленты — null', () => {
    expect(feedText(event({ type: 'villager_arrived', sex: 'female' }), 'female')).toBe(
      'Пришла женщина',
    );
    expect(feedText(event({ type: 'villager_arrived', sex: 'male' }), 'male')).toBe(
      'Пришёл мужчина',
    );
    expect(
      feedText(event({ type: 'villager_died', sex: 'female', reason: 'hunger' }), 'female'),
    ).toBe('Умерла женщина — голод');
    expect(feedText(event({ type: 'villager_died', sex: 'male', reason: 'thirst' }), 'male')).toBe(
      'Умер мужчина — жажда',
    );
    expect(feedText(event({ type: 'villager_fainted', sex: 'female' }), 'female')).toBe(
      'Женщина упала без сил — не спала',
    );
    expect(feedText(event({ type: 'need_ran_out', need: 'water' }), 'male')).toBe(
      'Мужчина мучается жаждой',
    );
    expect(feedText(event({ type: 'need_ran_out', need: 'food' }), undefined)).toBe(
      'Житель голодает',
    );
    // A need of sleep running out is told by the fainting that follows.
    expect(feedText(event({ type: 'need_ran_out', need: 'sleep' }), 'male')).toBeNull();
    expect(
      feedText(event({ type: 'phase_started', phase: 'night', day: 2 }), undefined),
    ).toBeNull();
  });

  it('о смерти и причинах — по-русски', () => {
    expect(deathNote('female', 104, 'hunger')).toBe('умерла на 104-й день — голод');
    expect(describeCause({ kind: 'rule', rule: 'calendar' }, null)).toBe('ход времени');
    expect(describeCause({ kind: 'need', villager: 2, need: 'sleep' }, null)).toBe(
      'у жителя 2 кончились силы — не спал',
    );
    expect(describeCause({ kind: 'event', event: 7 }, 'наступила ночь')).toBe('#7 наступила ночь');
  });
});
