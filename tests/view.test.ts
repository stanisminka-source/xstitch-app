import { describe, expect, it } from 'vitest';
import { contrastInk, mix } from '../src/lib/color';
import { byDistance, findRegions } from '../src/pattern/regions';
import { assignSymbols, SYMBOL_SET } from '../src/pattern/symbols';
import { MAX_SCALE, Viewport } from '../src/view/viewport';
import { normalizeSettings } from '../src/store/settings';
import { lineLook } from '../src/view/renderer';

describe('Viewport', () => {
  const make = () => {
    const v = new Viewport(400, 514);
    v.setSize(360, 600);
    v.fit();
    return v;
  };

  it('в начале показывает всю схему по центру', () => {
    const v = make();
    expect(v.showsAll()).toBe(true);
    expect(v.s).toBeCloseTo(0.9);
    const c = v.center();
    expect(c.cx).toBeCloseTo(200);
    expect(c.cy).toBeCloseTo(257);
  });

  it('масштаб щипком сохраняет точку под пальцами', () => {
    const v = make();
    const before = v.toCell(100, 200);
    v.zoomAt(8, 100, 200);
    const after = v.toCell(100, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('масштаб ограничен: не мельче всей схемы и не крупнее предела', () => {
    const v = make();
    v.zoomAt(0.1, 180, 300);
    expect(v.s).toBeCloseTo(v.fitScale());
    v.zoomAt(10_000, 180, 300);
    expect(v.s).toBe(MAX_SCALE);
  });

  it('находит клетку под пальцем', () => {
    const v = make();
    v.setView({ cx: 50.5, cy: 60.5, s: 20 });
    expect(v.cellAt(180, 300)).toEqual({ x: 50, y: 60 });
    expect(v.cellAt(180 + 20, 300)).toEqual({ x: 51, y: 60 });
  });

  it('не даёт увести схему с экрана', () => {
    const v = make();
    v.setView({ cx: 200, cy: 257, s: 20 });
    v.panBy(100_000, 100_000);
    const vis = v.visible();
    expect(vis.x0).toBe(0);
    expect(vis.y0).toBe(0);
    expect(vis.x1).toBeGreaterThan(0);
  });

  it('сохраняет и восстанавливает место просмотра', () => {
    const v = make();
    v.setView({ cx: 123.4, cy: 321, s: 14 });
    const saved = v.getView();
    const w = make();
    w.setView(saved);
    expect(w.center().cx).toBeCloseTo(123.4);
    expect(w.s).toBe(14);
  });
});

describe('Участки цвета', () => {
  // 0 0 . 1
  // . 0 . 1
  // 0 . . .
  // . . 0 0
  const cells = [0, 0, -1, 1, -1, 0, -1, 1, 0, -1, -1, -1, -1, -1, 0, 0];

  it('собирает связные участки, считая диагональ соседством', () => {
    const r = findRegions(cells, 4, 4, 0);
    expect(r.map((g) => g.count).sort()).toEqual([2, 4]);
  });

  it('ближайший участок — первый', () => {
    const r = byDistance(findRegions(cells, 4, 4, 0), 3.5, 3.5);
    expect(r[0].count).toBe(2);
    expect(r[0].x0).toBe(2);
  });
});

describe('Символы и цвета', () => {
  it('в наборе больше 100 разных символов', () => {
    expect(new Set(SYMBOL_SET).size).toBe(SYMBOL_SET.length);
    expect(SYMBOL_SET.length).toBeGreaterThanOrEqual(100);
  });

  it('самому частому цвету — первый символ, все символы разные', () => {
    const s = assignSymbols([5, 100, 20]);
    expect(s[1]).toBe(SYMBOL_SET[0]);
    expect(new Set(s).size).toBe(3);
  });

  it('символ на светлом — чёрный, на тёмном — белый', () => {
    expect(contrastInk([250, 250, 240])).toBe('black');
    expect(contrastInk([30, 30, 60])).toBe('white');
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128]);
  });

  it('настройки: неизвестные и битые значения заменяются на обычные', () => {
    expect(normalizeSettings(null).mode).toBe('colorSymbol');
    expect(normalizeSettings({ dim: 7 }).dim).toBe(0.7);
    expect(normalizeSettings({ grid: 'soft' }).grid).toBe('soft');
  });
});

describe('Линии (бэкстич)', () => {
  it('по умолчанию показываются; неизвестное значение настройки — тоже «с линиями»', () => {
    expect(normalizeSettings(null).lines).toBe('on');
    expect(normalizeSettings({ lines: 'bright' }).lines).toBe('bright');
    expect(normalizeSettings({ lines: 'off' }).lines).toBe('off');
    expect(normalizeSettings({ lines: 'zzz' }).lines).toBe('on');
  });

  it('три режима: без линий, обычные, яркие поверх бледной схемы', () => {
    const off = lineLook('off', 20);
    const on = lineLook('on', 20);
    const bright = lineLook('bright', 20);
    expect(off.show).toBe(false);
    expect(on).toEqual({ show: true, width: 20 * 0.16, halo: 0, veil: 0 });
    expect(bright.show).toBe(true);
    // ярко: толще, со светлой обводкой шире самой линии, схема под ними заметно бледнее
    expect(bright.width).toBeGreaterThan(on.width);
    expect(bright.halo).toBeGreaterThan(bright.width);
    expect(bright.veil).toBeGreaterThan(0.4);
    expect(bright.veil).toBeLessThan(0.9);
    // на мелком масштабе линии всё равно не тоньше пары пикселей
    expect(lineLook('bright', 1).width).toBeGreaterThanOrEqual(2.5);
    expect(lineLook('on', 1).width).toBeGreaterThanOrEqual(1.5);
  });
});
