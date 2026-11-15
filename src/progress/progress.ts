// Что уже вышито: по байту на клетку (1 — вышито), счётчики по цветам,
// многошаговая отмена и повтор. Без интерфейса — чтобы проверять тестами.

export interface Op {
  /** Клетки, которые эта операция действительно изменила. */
  cells: number[];
  value: 0 | 1;
}

const MAX_UNDO = 300;

export class Progress {
  readonly done: Uint8Array;
  /** Вышито крестиков каждого цвета. */
  readonly doneBy: Int32Array;
  /** Всего крестиков каждого цвета. */
  readonly countBy: Int32Array;
  readonly total: number;
  doneTotal = 0;
  /** Растёт при каждом изменении — по нему перерисовывается интерфейс. */
  version = 0;
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];

  constructor(
    readonly idx: Int16Array,
    nColors: number,
  ) {
    this.done = new Uint8Array(idx.length);
    this.doneBy = new Int32Array(nColors);
    this.countBy = new Int32Array(nColors);
    let total = 0;
    for (let i = 0; i < idx.length; i++) {
      if (idx[i] >= 0) {
        this.countBy[idx[i]]++;
        total++;
      }
    }
    this.total = total;
  }

  /** Подставляет сохранённые отметки. Чужой или битый файл не принимается. */
  load(saved: unknown): boolean {
    if (!(saved instanceof Uint8Array) || saved.length !== this.done.length) return false;
    this.doneBy.fill(0);
    this.doneTotal = 0;
    for (let i = 0; i < saved.length; i++) {
      const k = this.idx[i];
      const v = k >= 0 && saved[i] ? 1 : 0;
      this.done[i] = v;
      if (v) {
        this.doneBy[k]++;
        this.doneTotal++;
      }
    }
    this.undoStack = [];
    this.redoStack = [];
    this.version++;
    return true;
  }

  /** Ставит или снимает отметку; возвращает клетки, которые изменились. */
  set(cells: Iterable<number>, value: 0 | 1): number[] {
    const changed: number[] = [];
    const d = value ? 1 : -1;
    for (const i of cells) {
      const k = this.idx[i];
      if (k < 0 || this.done[i] === value) continue;
      this.done[i] = value;
      this.doneBy[k] += d;
      this.doneTotal += d;
      changed.push(i);
    }
    if (changed.length) this.version++;
    return changed;
  }

  /** Запоминает законченный жест для отмены. */
  commit(op: Op): void {
    if (!op.cells.length) return;
    this.undoStack.push(op);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): number[] {
    const op = this.undoStack.pop();
    if (!op) return [];
    this.redoStack.push(op);
    return this.set(op.cells, op.value ? 0 : 1);
  }

  redo(): number[] {
    const op = this.redoStack.pop();
    if (!op) return [];
    this.undoStack.push(op);
    return this.set(op.cells, op.value);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

/** Клетки на отрезке между двумя клетками (палец мог проскочить несколько за кадр). */
export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** Квадрат 10 × 10 по жирной сетке, в который попала клетка. */
export function blockCells(x: number, y: number, width: number, height: number): number[] {
  const bx = Math.floor(x / 10) * 10;
  const by = Math.floor(y / 10) * 10;
  const out: number[] = [];
  for (let j = by; j < Math.min(by + 10, height); j++) for (let i = bx; i < Math.min(bx + 10, width); i++) out.push(j * width + i);
  return out;
}

/** Сплошное пятно одного цвета: соседи только по сторонам, не по диагонали —
 *  иначе тонкая диагональная линия утянет за собой далёкие клетки. */
export function patchCells(idx: ArrayLike<number>, width: number, height: number, x: number, y: number): number[] {
  const start = y * width + x;
  const color = idx[start];
  if (color < 0) return [];
  const seen = new Uint8Array(width * height);
  const out: number[] = [];
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    out.push(i);
    const cx = i % width;
    const cy = (i - cx) / width;
    const near = [cx > 0 ? i - 1 : -1, cx < width - 1 ? i + 1 : -1, cy > 0 ? i - width : -1, cy < height - 1 ? i + width : -1];
    for (const j of near) {
      if (j >= 0 && !seen[j] && idx[j] === color) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return out;
}

/** Процент для показа: «<1», если что-то вышито, но меньше процента; 100 — только когда всё. */
export function percent(done: number, total: number): string {
  if (!total || !done) return '0';
  if (done >= total) return '100';
  const p = (done / total) * 100;
  if (p < 1) return '<1';
  return String(Math.min(99, Math.floor(p)));
}
