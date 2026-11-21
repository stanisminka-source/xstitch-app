import { describe, expect, it } from 'vitest';
import { addCodes, haveAmount, listText, needToBuy, normalizeStash, parseCodes, stashKey } from '../src/store/stash';

describe('Мои нитки', () => {
  it('номера вводятся как угодно: через пробел, запятую, со словом DMC', () => {
    expect(parseCodes('310, 3865 150;  blanc DMC ecru 310 b5200')).toEqual(['310', '3865', '150', 'Blanc', 'Ecru', 'B5200']);
    expect(parseCodes('  ')).toEqual([]);
  });

  it('новый номер — один целый моток, уже записанный не меняется', () => {
    const a = addCodes({}, ['310', '150']);
    expect(a.added).toEqual(['310', '150']);
    expect(a.stash[stashKey('DMC', '310')]).toEqual({ brand: 'DMC', code: '310', skeins: 1, low: false });
    const s = { ...a.stash, [stashKey('DMC', '310')]: { brand: 'DMC', code: '310', skeins: 3, low: true } };
    const b = addCodes(s, ['310', '3865']);
    expect(b.already).toEqual(['310']);
    expect(b.stash[stashKey('DMC', '310')].skeins).toBe(3);
  });

  it('«мало» — один из мотков начат: считается за треть мотка', () => {
    expect(haveAmount({ brand: 'DMC', code: '1', skeins: 1, low: false })).toBe(1);
    expect(haveAmount({ brand: 'DMC', code: '1', skeins: 1, low: true })).toBeCloseTo(0.3);
    expect(haveAmount({ brand: 'DMC', code: '1', skeins: 3, low: true })).toBeCloseTo(2.3);
    expect(haveAmount(undefined)).toBe(0);
  });

  it('сколько докупить с учётом запасов', () => {
    expect(needToBuy(1.4, 0)).toBe(2);
    expect(needToBuy(1.4, 1)).toBe(1);
    expect(needToBuy(0.25, 0.3)).toBe(0);
    expect(needToBuy(0.4, 0.3)).toBe(1);
    expect(needToBuy(2, 2)).toBe(0);
    expect(needToBuy(0, 0)).toBe(0);
  });

  it('битые сохранённые записи отбрасываются', () => {
    const s = normalizeStash({ a: { code: '310', skeins: 2, low: true }, b: { skeins: 1 }, c: 5, d: { code: 'blanc', skeins: -4 } });
    expect(Object.values(s)).toEqual([
      { brand: 'DMC', code: '310', skeins: 2, low: true },
      { brand: 'DMC', code: 'Blanc', skeins: 1, low: false },
    ]);
  });

  it('список покупок — с квадратиками для отметки и итогом', () => {
    const txt = listText({
      title: 'Схема: Замок',
      heading: 'Нитки к покупке',
      notes: ['Канва: Аида 18, 2 нити'],
      mode: 'buy',
      rows: [{ code: '310', name: 'Black', need: 2.6, buy: 2 }, { code: '3865', name: 'Winter White', need: 0.7, buy: 1 }],
    });
    expect(txt).toContain('☐ DMC 310 Black — 2 мот.');
    expect(txt.trim().endsWith('Итого: 3 мот., цветов: 2')).toBe(true);
  });
});
