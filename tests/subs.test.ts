import { describe, expect, it } from 'vitest';
import { applySubs, colorChecks, normalizeSubs, suggest } from '../src/pattern/subs';
import type { Pattern } from '../src/pattern/format';

const pal = (id: number, code: string, rgb: [number, number, number]) => ({ id, brand: 'DMC', code, name: code, symbol: '', rgb, count: 0 });
const base = (): Pattern => ({
  format: 'xstitch-pattern',
  version: 1,
  title: 'т',
  width: 3,
  height: 2,
  palette: [pal(0, '310', [44, 50, 37]), pal(1, '934', [49, 57, 25]), pal(2, '3865', [249, 247, 241])],
  cells: Int16Array.from([0, 0, 1, 2, -1, 0]),
  backstitch: [{ color: 0, x1: 0, y1: 0, x2: 1, y2: 1 }],
});

describe('Сверка цветов', () => {
  it('находит нитки, у которых цвет в PDF далёк от настоящего', () => {
    const p = applySubs(base(), {});
    p.palette.forEach((c) => (c.count = 1));
    const checks = colorChecks(p.palette);
    expect(checks[0].code).toBe('310');
    expect(checks[0].level).toBe('strong');
    expect(checks.find((c) => c.code === '3865')).toBeUndefined();
  });

  it('подсказывает нитки ближе к картинке: для «оливкового 310» — тёмно-зелёную, не чёрную', () => {
    const s = suggest([44, 50, 37], '310');
    expect(s[0].code).toBe('934');
    expect(s.some((x) => x.code === '310')).toBe(false);
  });
});

describe('Замена нитки', () => {
  it('на нитку, которая уже есть в схеме: клетки переходят к ней, места цветов не меняются', () => {
    const p = applySubs(base(), { '310': '934' });
    expect([...p.cells]).toEqual([1, 1, 1, 2, -1, 1]);
    expect(p.palette.map((c) => [c.code, c.count])).toEqual([['310', 0], ['934', 4], ['3865', 1]]);
    expect(p.backstitch[0].color).toBe(1);
  });

  it('на новую нитку: у цвета меняются номер, название и цвет, клетки на месте', () => {
    const p = applySubs(base(), { '310': '3031' });
    expect([...p.cells]).toEqual([...base().cells]);
    expect(p.palette[0]).toMatchObject({ code: '3031', name: 'Mocha Brown - Very Dark', count: 3, replaced: '310' });
  });

  it('исходная схема не меняется; без замен — та же схема; мусор в заменах отбрасывается', () => {
    const b = base();
    applySubs(b, { '310': '934' });
    expect(b.palette[0].code).toBe('310');
    expect(applySubs(b, {})).toBe(b);
    expect(normalizeSubs({ '310': '934', x: 5, '150': '150' })).toEqual({ '310': '934' });
  });
});
