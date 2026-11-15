import { describe, expect, it } from 'vitest';
import { blockCells, lineCells, patchCells, percent, Progress } from '../src/progress/progress';

// 0 0 . 1
// . 0 . 1
// 0 . 1 1
const idx = Int16Array.from([0, 0, -1, 1, -1, 0, -1, 1, 0, -1, 1, 1]);

describe('Отметки вышитого', () => {
  it('считает вышитое всего и по цветам, пустые клетки не отмечаются', () => {
    const p = new Progress(idx, 2);
    expect(p.total).toBe(8);
    expect(p.set([0, 1, 2, 3], 1)).toEqual([0, 1, 3]);
    expect(p.doneTotal).toBe(3);
    expect([...p.doneBy]).toEqual([2, 1]);
    expect(p.set([0], 1)).toEqual([]); // уже вышито — ничего не меняется
  });

  it('отмена и повтор на несколько шагов', () => {
    const p = new Progress(idx, 2);
    p.commit({ cells: p.set([0, 1], 1), value: 1 });
    p.commit({ cells: p.set([3, 7], 1), value: 1 });
    p.commit({ cells: p.set([0], 0), value: 0 });
    expect(p.doneTotal).toBe(3);
    p.undo();
    expect(p.doneTotal).toBe(4);
    p.undo();
    p.undo();
    expect(p.doneTotal).toBe(0);
    expect(p.canUndo).toBe(false);
    p.redo();
    expect(p.doneTotal).toBe(2);
    // новый жест после отмены стирает «повтор»
    p.commit({ cells: p.set([10], 1), value: 1 });
    expect(p.canRedo).toBe(false);
  });

  it('загружает сохранённое и отказывается от чужого размера', () => {
    const p = new Progress(idx, 2);
    const saved = new Uint8Array(12);
    saved[0] = saved[2] = saved[11] = 1;
    expect(p.load(saved)).toBe(true);
    expect(p.doneTotal).toBe(2); // клетка 2 пустая — отметка на ней не считается
    expect(p.load(new Uint8Array(5))).toBe(false);
    expect(p.load(null)).toBe(false);
    expect(p.doneTotal).toBe(2);
  });

  it('палец проскочил несколько клеток — отмечаются все по пути', () => {
    expect(lineCells(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(lineCells(2, 2, 0, 0)).toEqual([[2, 2], [1, 1], [0, 0]]);
  });

  it('квадрат 10 × 10 по жирной сетке, обрезанный краем схемы', () => {
    expect(blockCells(13, 4, 100, 100)).toHaveLength(100);
    expect(blockCells(13, 4, 100, 100)[0]).toBe(10);
    expect(blockCells(95, 95, 98, 97)).toHaveLength(8 * 7);
  });

  it('пятно — только соседи по сторонам', () => {
    expect(patchCells(idx, 4, 3, 0, 0).sort()).toEqual([0, 1, 5]);
    expect(patchCells(idx, 4, 3, 3, 0).sort((a, b) => a - b)).toEqual([3, 7, 10, 11]);
    expect(patchCells(idx, 4, 3, 2, 0)).toEqual([]);
  });

  it('проценты', () => {
    expect(percent(0, 100)).toBe('0');
    expect(percent(1, 1000)).toBe('<1');
    expect(percent(999, 1000)).toBe('99');
    expect(percent(1000, 1000)).toBe('100');
  });
});
