import { describe, expect, it } from 'vitest';
import { addCodes, haveAmount, listPdfData, needToBuy, normalizeStash, parseCodes, stashKey } from '../src/store/stash';
import { applyShop, normalizeShop, startShop } from '../src/store/shop';
import { dmcThread } from '../src/pattern/catalog';

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

  it('список покупок для PDF: колонки и итог', () => {
    const rows = [
      { code: '310', name: 'Black', rgb: [0, 0, 0] as [number, number, number], need: 2.6, buy: 2 },
      { code: '3865', name: 'Winter White', rgb: null, need: 0.7, buy: 1, have: { brand: 'DMC', code: '3865', skeins: 1, low: true } },
    ];
    const buy = listPdfData({ title: 'Схема: Замок', heading: 'Нитки к покупке', notes: [], rows, mode: 'buy' });
    expect(buy.columns).toEqual(['Купить']);
    expect(buy.rows[0].cells).toEqual(['2 мот.']);
    expect(buy.total).toBe('Итого купить: 3 мот., цветов: 2');
    const all = listPdfData({ title: 'Схема: Замок', heading: 'Нитки', notes: [], rows, mode: 'all' });
    expect(all.rows[1].cells).toEqual(['≈0,7', 'немного', '1 мот.']);
  });
});

describe('Гамма DMC', () => {
  it('знает цвет и название любой нитки, регистр номера не важен', () => {
    expect(dmcThread('310')?.name).toBe('Black');
    expect(dmcThread('blanc')?.code).toBe('BLANC');
    expect(dmcThread('ecru')?.rgb).toEqual([240, 234, 218]);
    expect(dmcThread('99999')).toBeUndefined();
  });
});

describe('В магазине', () => {
  it('по умолчанию берём столько, сколько нужно; сохраняется только отмеченное', () => {
    const s = startShop('Замок', [
      { code: '310', name: 'Black', rgb: null, buy: 2 },
      { code: '150', name: 'Rose', rgb: null, buy: 1 },
      { code: '3865', name: 'White', rgb: null, buy: 0 },
    ]);
    expect(s.items.map((i) => [i.code, i.plan, i.got, i.checked])).toEqual([['310', 2, 2, false], ['150', 1, 1, false]]);
    s.items[0].checked = true;
    s.items[0].got = 3;
    const stash = { [stashKey('DMC', '310')]: { brand: 'DMC', code: '310', skeins: 1, low: true } };
    const r = applyShop(stash, s);
    expect(r.stash[stashKey('DMC', '310')]).toEqual({ brand: 'DMC', code: '310', skeins: 4, low: true });
    expect(r.stash[stashKey('DMC', '150')]).toBeUndefined();
    expect([r.colors, r.skeins]).toEqual([1, 3]);
  });

  it('новая нитка из магазина появляется в «Моих нитках»; битая покупка не читается', () => {
    const r = applyShop({}, { title: '', startedAt: 0, items: [{ code: '3865', name: '', rgb: null, plan: 0, got: 2, checked: true }] });
    expect(r.stash[stashKey('DMC', '3865')]).toEqual({ brand: 'DMC', code: '3865', skeins: 2, low: false });
    expect(normalizeShop(null)).toBeNull();
    expect(normalizeShop({ items: [{ code: '310', got: 500 }] })?.items[0].got).toBe(1);
  });
});
