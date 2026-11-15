// Формат файла схемы (см. TZ.md, раздел «Формат схемы»).
// Версия 1 — только полные крестики. Поле backstitch необязательное:
// оно заложено заранее для схем с линиями (бэкстичем).

export interface PaletteColor {
  id: number;
  brand: string;
  code: string;
  name: string;
  symbol: string;
  rgb: [number, number, number];
  count: number;
}

/** Линия бэкстича: от узла сетки (x1, y1) до узла (x2, y2).
 *  Узлы — углы клеток, поэтому координаты от 0 до width / height включительно;
 *  допускаются половинки (0.5) для линий через центр клетки. */
export interface BackstitchLine {
  color: number; // id из palette
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Pattern {
  format: 'xstitch-pattern';
  version: 1;
  title: string;
  width: number;
  height: number;
  fabric?: { type: string; count: number; color: string };
  strands?: number;
  palette: PaletteColor[];
  /** id цвета в каждой клетке, построчно (y * width + x); -1 — пусто. */
  cells: Int16Array;
  backstitch: BackstitchLine[];
}

export class PatternError extends Error {}

const EMPTY = -1;

function fail(msg: string): never {
  throw new PatternError(msg);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Разбирает и проверяет JSON схемы. Бросает PatternError с понятным текстом. */
export function parsePattern(raw: unknown): Pattern {
  if (!isRecord(raw)) fail('Файл не похож на схему: ожидался объект JSON.');
  if (raw.format !== 'xstitch-pattern') fail('Это не файл схемы (поле format).');
  if (raw.version !== 1) fail(`Неизвестная версия формата: ${String(raw.version)}.`);

  const width = raw.width;
  const height = raw.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) <= 0 || (height as number) <= 0) {
    fail('Неверный размер схемы.');
  }
  const w = width as number;
  const h = height as number;

  if (!Array.isArray(raw.palette) || raw.palette.length === 0) fail('В схеме нет палитры.');
  const ids = new Set<number>();
  const palette: PaletteColor[] = raw.palette.map((p, i) => {
    if (!isRecord(p)) fail(`Цвет №${i + 1} записан неверно.`);
    const { id, code, symbol, rgb } = p;
    if (!Number.isInteger(id) || (id as number) < 0) fail(`У цвета №${i + 1} неверный id.`);
    if (ids.has(id as number)) fail(`Повторяется id цвета ${String(id)}.`);
    ids.add(id as number);
    if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) {
      fail(`У цвета ${String(code)} неверный rgb.`);
    }
    return {
      id: id as number,
      brand: String(p.brand ?? 'DMC'),
      code: String(code ?? ''),
      name: String(p.name ?? ''),
      symbol: String(symbol ?? ''),
      rgb: rgb as [number, number, number],
      count: Number(p.count ?? 0),
    };
  });

  if (!Array.isArray(raw.cells) || raw.cells.length !== h) fail('Число строк в cells не совпадает с height.');
  const cells = new Int16Array(w * h);
  const counted = new Map<number, number>();
  raw.cells.forEach((row, y) => {
    if (!Array.isArray(row) || row.length !== w) fail(`Строка ${y + 1} неверной длины.`);
    row.forEach((v, x) => {
      if (v !== EMPTY && !ids.has(v)) fail(`Клетка (${x + 1}, ${y + 1}): неизвестный цвет ${String(v)}.`);
      cells[y * w + x] = v;
      if (v !== EMPTY) counted.set(v, (counted.get(v) ?? 0) + 1);
    });
  });
  // Число крестиков считаем сами — так оно всегда сходится со схемой.
  for (const c of palette) c.count = counted.get(c.id) ?? 0;

  const backstitch: BackstitchLine[] = [];
  if (raw.backstitch !== undefined) {
    if (!Array.isArray(raw.backstitch)) fail('Поле backstitch должно быть списком линий.');
    raw.backstitch.forEach((l, i) => {
      if (!isRecord(l)) fail(`Линия №${i + 1} записана неверно.`);
      const nums = [l.x1, l.y1, l.x2, l.y2];
      const onGrid = (v: unknown, max: number) =>
        typeof v === 'number' && Number.isInteger(v * 2) && v >= 0 && v <= max;
      if (!onGrid(nums[0], w) || !onGrid(nums[2], w) || !onGrid(nums[1], h) || !onGrid(nums[3], h)) {
        fail(`Линия №${i + 1} выходит за схему или не попадает в узлы сетки.`);
      }
      if (!ids.has(l.color as number)) fail(`Линия №${i + 1}: неизвестный цвет.`);
      backstitch.push({ color: l.color as number, x1: l.x1 as number, y1: l.y1 as number, x2: l.x2 as number, y2: l.y2 as number });
    });
  }

  return {
    format: 'xstitch-pattern',
    version: 1,
    title: String(raw.title ?? 'Без названия'),
    width: w,
    height: h,
    fabric: isRecord(raw.fabric) ? (raw.fabric as Pattern['fabric']) : undefined,
    strands: typeof raw.strands === 'number' ? raw.strands : undefined,
    palette,
    cells,
    backstitch,
  };
}

export function stitchCount(p: Pattern): number {
  let n = 0;
  for (const v of p.cells) if (v !== EMPTY) n++;
  return n;
}
