import { describe, expect, it } from 'vitest';
import { areaCounts, areaMask, compareCodes, crossUnits, defaultChoice, halvesByColor, recommendedStrands, sheetsOf, skeinsToBuy, snapRect } from '../src/pattern/threads';
import type { Pattern } from '../src/pattern/format';

describe('Расход ниток', () => {
  it('совпадает с таблицей расхода Pattern Maker для Аиды 18 в 2 нити', () => {
    // пары «крестиков → мотков» из настоящей таблицы расхода
    const table: [number, number][] = [[168, 1], [3069, 1], [3383, 2], [3908, 2], [6054, 2], [6228, 3], [9039, 3]];
    for (const [n, want] of table) expect(skeinsToBuy(n, 18, 2)).toBe(want);
    expect(skeinsToBuy(0, 18, 2)).toBe(0);
  });

  it('крупнее канва и больше нитей — больше мотков', () => {
    expect(skeinsToBuy(3000, 14, 3)).toBeGreaterThan(skeinsToBuy(3000, 18, 2));
    expect(skeinsToBuy(6000, 22, 1)).toBeLessThan(skeinsToBuy(6000, 18, 2));
  });

  it('число нитей по канве: 3 — до 16, 2 — 18, 1 — мельче', () => {
    expect([11, 14, 16, 18, 20, 22].map(recommendedStrands)).toEqual([3, 3, 3, 2, 1, 1]);
  });

  it('канва по умолчанию берётся из схемы', () => {
    const p = { fabric: { type: 'Aida', count: 14, color: 'White' } } as Pattern;
    expect(defaultChoice(p)).toEqual({ fabric: 'aida14', strands: 3 });
    expect(defaultChoice(p, { fabric: 'aida18', strands: 2 })).toEqual({ fabric: 'aida18', strands: 2 });
    expect(defaultChoice({} as Pattern, { fabric: 'nope', strands: 9 })).toEqual({ fabric: 'aida18', strands: 2 });
    const even = { fabric: { type: 'Evenweave 28 over 2', count: 14, color: 'white' } } as Pattern;
    expect(defaultChoice(even)).toEqual({ fabric: 'even28', strands: 3 });
  });
});

describe('Участок схемы', () => {
  it('прямоугольник расширяется до линий 10 × 10 и не выходит за схему', () => {
    expect(snapRect(13, 27, 5, 31, 100, 100)).toEqual({ x: 0, y: 20, w: 20, h: 20 });
    expect(snapRect(95, 95, 99, 99, 98, 97)).toEqual({ x: 90, y: 90, w: 8, h: 7 });
  });

  it('без листов из PDF схема делится на листы 60 × 84', () => {
    const { sheets, fromPdf } = sheetsOf({ width: 130, height: 100 } as Pattern);
    expect(fromPdf).toBe(false);
    expect(sheets.map((s) => [s.page, s.x, s.y, s.w, s.h])).toEqual([
      [1, 0, 0, 60, 84], [2, 60, 0, 60, 84], [3, 120, 0, 10, 84],
      [4, 0, 84, 60, 16], [5, 60, 84, 60, 16], [6, 120, 84, 10, 16],
    ]);
  });

  it('считает крестики участка без повторов на перекрытии и отдельно — невышитые', () => {
    // 4 × 2: цвета 0 0 1 . / 1 0 . 1
    const idx = Int16Array.from([0, 0, 1, -1, 1, 0, -1, 1]);
    const done = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
    const mask = areaMask(4, 2, [{ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 0, w: 2, h: 1 }]);
    expect(areaCounts(idx, done, mask, 2)).toEqual([
      { k: 0, total: 3, left: 2, halfTotal: 0, halfLeft: 0 },
      { k: 1, total: 2, left: 2, halfTotal: 0, halfLeft: 0 },
    ]);
  });

  it('полукрестики: считаются отдельно, нитки на них — половина', () => {
    // 4 × 2: цвета 0 0 1 . / 1 0 . 1; полукресты — в клетках 1, 2 и 5
    const idx = Int16Array.from([0, 0, 1, -1, 1, 0, -1, 1]);
    const half = Uint8Array.from([0, 1, 1, 0, 0, 1, 0, 0]);
    const done = Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0]);
    const mask = areaMask(4, 2, [{ x: 0, y: 0, w: 4, h: 2 }]);
    expect(areaCounts(idx, done, mask, 2, half)).toEqual([
      { k: 1, total: 3, left: 3, halfTotal: 1, halfLeft: 1 },
      { k: 0, total: 3, left: 2, halfTotal: 2, halfLeft: 1 },
    ]);
    expect(Array.from(halvesByColor(idx, half, 2))).toEqual([2, 1]);
    expect(Array.from(halvesByColor(idx, undefined, 2))).toEqual([0, 0]);
    // 4 стежка цвета 0, из них 2 полукреста → нитки как на 3 полных крестика
    expect(crossUnits(4, 2)).toBe(3);
    // 6000 полукрестиков — нитки как на 3000 крестиков: 1 моток, а не 2
    expect(skeinsToBuy(crossUnits(6000, 6000), 18, 2)).toBe(1);
  });
});

describe('Порядок номеров', () => {
  it('номера по возрастанию как числа, буквенные — в начале', () => {
    const codes = ['3865', '310', 'Blanc', '150', '3799', '890', 'Ecru', '152'];
    expect([...codes].sort(compareCodes)).toEqual(['Blanc', 'Ecru', '150', '152', '310', '890', '3799', '3865']);
  });
});
