import { describe, expect, it } from 'vitest';
import { AUTOSAVE_KEY, createSaveSlot, type KeyValueStorage, storedSize } from './saveSlot.ts';

function storageThatThrows(error: Error): KeyValueStorage {
  return {
    getItem: () => {
      throw error;
    },
    setItem: () => {
      throw error;
    },
    removeItem: () => {
      throw error;
    },
  };
}

describe('слот автосохранения', () => {
  it('пишет, читает и стирает под своим ключом', () => {
    const items = new Map<string, string>();
    const slot = createSaveSlot({
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => void items.set(key, value),
      removeItem: (key) => void items.delete(key),
    });
    expect(slot.available).toBe(true);
    expect(slot.read()).toBeNull();
    expect(slot.write('сохранение')).toEqual({ ok: true });
    expect(items.get(AUTOSAVE_KEY)).toBe('сохранение');
    expect(slot.read()).toBe('сохранение');
    slot.clear();
    expect(slot.read()).toBeNull();
  });

  it('без хранилища — недоступен и объясняет почему', () => {
    const slot = createSaveSlot(null);
    expect(slot.available).toBe(false);
    expect(slot.read()).toBeNull();
    const result = slot.write('x');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/частный режим/);
    expect(() => slot.clear()).not.toThrow();
  });

  it('переполнение: размер сохранения в сообщении', () => {
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const result = createSaveSlot(storageThatThrows(quota)).write('x'.repeat(1_800_000));
    expect(!result.ok && result.message).toBe(
      'Хранилище браузера переполнено (сохранение — 1,7 МБ): автосохранение не записано. Сохраните мир в файл.',
    );
  });

  it('любая другая ошибка браузера — сообщение, а не исключение', () => {
    const slot = createSaveSlot(storageThatThrows(new Error('SecurityError')));
    expect(slot.read()).toBeNull();
    const result = slot.write('x');
    expect(!result.ok && result.message).toMatch(/не дал записать.*SecurityError/);
    expect(() => slot.clear()).not.toThrow();
  });

  it('размер сохранения — в КБ или МБ, примерно как у файла (знак — байт)', () => {
    expect(storedSize(10)).toBe('1 КБ');
    expect(storedSize(16_384)).toBe('16 КБ');
    expect(storedSize(1_800_000)).toBe('1,7 МБ');
  });
});
