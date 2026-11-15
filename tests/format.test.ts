import { describe, expect, it } from 'vitest';
import { parsePattern, PatternError, stitchCount } from '../src/pattern/format';

// Синтетическая схема 3 × 2 — не настоящая схема, придумана для теста.
const tiny = () => ({
  format: 'xstitch-pattern',
  version: 1,
  title: 'Тест',
  width: 3,
  height: 2,
  palette: [
    { id: 0, brand: 'DMC', code: '310', name: 'Black', symbol: '■', rgb: [0, 0, 0], count: 999 },
    { id: 1, brand: 'DMC', code: 'BLANC', name: 'White', symbol: '○', rgb: [255, 255, 255], count: 0 },
  ],
  cells: [
    [0, 1, -1],
    [0, 0, -1],
  ],
});

describe('parsePattern', () => {
  it('разбирает корректную схему и пересчитывает число крестиков', () => {
    const p = parsePattern(tiny());
    expect(p.width).toBe(3);
    expect(Array.from(p.cells)).toEqual([0, 1, -1, 0, 0, -1]);
    expect(p.palette[0].count).toBe(3);
    expect(p.palette[1].count).toBe(1);
    expect(stitchCount(p)).toBe(4);
    expect(p.backstitch).toEqual([]);
  });

  it('принимает линии бэкстича по узлам сетки, включая половинки', () => {
    const raw = { ...tiny(), backstitch: [{ color: 0, x1: 0, y1: 0, x2: 3, y2: 2 }, { color: 1, x1: 0.5, y1: 0, x2: 0.5, y2: 2 }] };
    expect(parsePattern(raw).backstitch).toHaveLength(2);
  });

  it('отклоняет линию за пределами схемы', () => {
    const raw = { ...tiny(), backstitch: [{ color: 0, x1: 0, y1: 0, x2: 4, y2: 2 }] };
    expect(() => parsePattern(raw)).toThrow(PatternError);
  });

  it('отклоняет неизвестный цвет в клетке', () => {
    const raw = tiny();
    raw.cells[1][2] = 7;
    expect(() => parsePattern(raw)).toThrow(/неизвестный цвет/);
  });

  it('отклоняет строку неверной длины', () => {
    const raw = tiny();
    raw.cells[0].pop();
    expect(() => parsePattern(raw)).toThrow(PatternError);
  });

  it('отклоняет чужой формат', () => {
    expect(() => parsePattern({ format: 'other' })).toThrow(/не файл схемы/);
  });
});
