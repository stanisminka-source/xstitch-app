// Разбор PDF-схем, напечатанных из Pattern Maker.
// Это не универсальный импорт: он опирается на то, как Pattern Maker раскладывает схему.
// — Страницы схемы: символы — текст в сетке с постоянным шагом, линейки с номерами клеток
//   сверху (горизонтально) и слева (повёрнуто), в цветной версии под символом — заливка цветом нити.
// — Легенда «Floss Used for Full Stitches»: символ, число нитей, DMC, номер, название.
// — Таблица расхода: «Full» — сколько полных крестиков каждого цвета.
// Результат сверяется с таблицей расхода: если хоть один цвет не сошёлся, схема не открывается.
//
// Текст берётся прямо из команд рисования страницы, а не из «текстового слоя» pdf.js:
// текстовый слой выбрасывает некоторые символы (например, мягкий перенос U+00AD),
// а Pattern Maker использует их как символы схемы.
// Модуль не зависит от браузера: в тестах ему дают pdf.js для Node, в приложении — браузерный.

import { PatternError } from './format';

/** Минимум из pdf.js, который нужен разбору. */
export interface PdfPage {
  getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray: unknown[] }>;
}
export interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
export type PdfOps = Record<
  | 'save' | 'restore' | 'transform' | 'setFillRGBColor' | 'constructPath' | 'fill' | 'eoFill'
  | 'beginText' | 'setFont' | 'setTextMatrix' | 'moveText' | 'setLeadingMoveText' | 'nextLine'
  | 'setLeading' | 'setCharSpacing' | 'setWordSpacing' | 'setHScale' | 'setTextRise'
  | 'showText' | 'showSpacedText' | 'nextLineShowText' | 'nextLineSetSpacingShowText',
  number
>;

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  n[0] * m[0] + n[1] * m[2],
  n[0] * m[1] + n[1] * m[3],
  n[2] * m[0] + n[3] * m[2],
  n[2] * m[1] + n[3] * m[3],
  n[4] * m[0] + n[5] * m[2] + m[4],
  n[4] * m[1] + n[5] * m[3] + m[5],
];
// mul(m, n) — сначала n, потом m (как в PDF: точка × n × m)
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const toM = (a: unknown): M => {
  const v = a as ArrayLike<number>;
  return [v[0], v[1], v[2], v[3], v[4], v[5]].map(Number) as M;
};

function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

function hexToRgb(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

/** Слово или одиночный символ на странице. Координаты — в pt, y вверх, как в PDF. */
interface Word {
  str: string;
  x: number; // начало (левый край) по направлению текста
  y: number; // базовая линия
  w: number; // длина по направлению текста
  size: number;
  font: string;
  rotated: boolean;
}
interface Fill {
  cx: number;
  cy: number;
  w: number;
  h: number;
  color: string;
}

/** Достаёт из команд рисования слова, отдельные символы и заливки прямоугольников. */
export async function readPage(page: PdfPage, ops: PdfOps): Promise<{ words: Word[]; glyphs: Word[]; fills: Fill[] }> {
  const ol = await page.getOperatorList();
  const words: Word[] = [];
  const glyphs: Word[] = [];
  const fills: Fill[] = [];

  let ctm: M = ID;
  let color = '#000000';
  const stack: { ctm: M; color: string; ts: typeof ts }[] = [];
  let ts = { font: '', size: 12, charSp: 0, wordSp: 0, hScale: 1, leading: 0, rise: 0 };
  let tm: M = ID; // матрица текста
  let tlm: M = ID; // начало строки

  const show = (items: unknown[]) => {
    const trm = mul(ctm, tm);
    const scaleX = Math.hypot(trm[0], trm[1]);
    const scaleY = Math.hypot(trm[2], trm[3]);
    const rotated = Math.abs(trm[1]) > Math.abs(trm[0]);
    const sizeOut = ts.size * scaleY;
    let tx = 0; // смещение по строке в единицах текста
    let cur: Word | null = null;
    const endWord = () => {
      if (cur && cur.str) words.push(cur);
      cur = null;
    };
    for (const g of items) {
      if (typeof g === 'number') {
        const adv = (-g / 1000) * ts.size * ts.hScale;
        tx += adv;
        if (Math.abs(adv) > ts.size * 0.3) endWord();
        continue;
      }
      const gl = g as { unicode?: string; width?: number; isSpace?: boolean };
      const ch = gl.unicode ?? '';
      const adv = ((gl.width ?? 0) / 1000) * ts.size;
      const space = gl.isSpace || ch === ' ';
      const [x0, y0] = apply(trm, tx, ts.rise);
      const [x1, y1] = apply(trm, tx + adv, ts.rise);
      const along0 = rotated ? y0 : x0;
      const along1 = rotated ? y1 : x1;
      if (space || !ch) endWord();
      else {
        glyphs.push({ str: ch, x: Math.min(along0, along1), y: rotated ? x0 : y0, w: Math.abs(along1 - along0), size: sizeOut, font: ts.font, rotated });
        if (!cur) cur = { str: '', x: along0, y: rotated ? x0 : y0, w: 0, size: sizeOut, font: ts.font, rotated };
        cur.str += ch;
        cur.w = along1 - cur.x;
      }
      tx += (adv + ts.charSp + (space ? ts.wordSp : 0)) * ts.hScale;
    }
    endWord();
    tm = mul(tm, [1, 0, 0, 1, tx, 0]);
    void scaleX;
  };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const f = ol.fnArray[i];
    const a = (ol.argsArray[i] ?? []) as unknown[];
    switch (f) {
      case ops.save:
        stack.push({ ctm, color, ts: { ...ts } });
        break;
      case ops.restore: {
        const s = stack.pop();
        if (s) ({ ctm, color, ts } = s);
        break;
      }
      case ops.transform:
        ctm = mul(ctm, toM(a));
        break;
      case ops.setFillRGBColor:
        color = String(a[0]);
        break;
      case ops.constructPath:
        if (a[0] === ops.fill || a[0] === ops.eoFill) {
          const mm = a[2] as ArrayLike<number> | null;
          if (!mm) break;
          const [x0, y0] = apply(ctm, mm[0], mm[1]);
          const [x1, y1] = apply(ctm, mm[2], mm[3]);
          fills.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), color });
        }
        break;
      case ops.beginText:
        tm = ID;
        tlm = ID;
        break;
      case ops.setFont:
        ts.font = String(a[0]);
        ts.size = Number(a[1]);
        break;
      case ops.setTextMatrix:
        tm = tlm = toM(Array.isArray(a[0]) || (a[0] && typeof a[0] === 'object') ? a[0] : a);
        break;
      case ops.moveText:
      case ops.setLeadingMoveText:
        if (f === ops.setLeadingMoveText) ts.leading = -Number(a[1]);
        tm = tlm = mul(tlm, [1, 0, 0, 1, Number(a[0]), Number(a[1])]);
        break;
      case ops.nextLine:
        tm = tlm = mul(tlm, [1, 0, 0, 1, 0, -ts.leading]);
        break;
      case ops.setLeading:
        ts.leading = Number(a[0]);
        break;
      case ops.setCharSpacing:
        ts.charSp = Number(a[0]);
        break;
      case ops.setWordSpacing:
        ts.wordSp = Number(a[0]);
        break;
      case ops.setHScale:
        ts.hScale = Number(a[0]) / 100;
        break;
      case ops.setTextRise:
        ts.rise = Number(a[0]);
        break;
      case ops.showText:
      case ops.showSpacedText:
        show(a[0] as unknown[]);
        break;
      case ops.nextLineShowText:
        tm = tlm = mul(tlm, [1, 0, 0, 1, 0, -ts.leading]);
        show(a[0] as unknown[]);
        break;
      case ops.nextLineSetSpacingShowText:
        ts.wordSp = Number(a[0]);
        ts.charSp = Number(a[1]);
        tm = tlm = mul(tlm, [1, 0, 0, 1, 0, -ts.leading]);
        show(a[2] as unknown[]);
        break;
    }
  }
  return { words, glyphs, fills };
}

/** Слова по строкам (по базовой линии), слева направо. */
function lines(words: Word[], tol = 2.5): Word[][] {
  const h = words.filter((w) => !w.rotated).sort((a, b) => b.y - a.y || a.x - b.x);
  const out: Word[][] = [];
  for (const w of h) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0].y - w.y) <= tol) last.push(w);
    else out.push([w]);
  }
  for (const l of out) l.sort((a, b) => a.x - b.x);
  return out;
}

const isNum = (s: string) => /^\d+$/.test(s);

interface LegendRow {
  symbol: string;
  strands: number;
  brand: string;
  code: string;
  name: string;
}
interface Label {
  n: number;
  c: number; // центр подписи вдоль линейки: x для верхней, u = −y для левой
}
interface PatternPage {
  page: number;
  gridLeft: number; // правый край левой линейки, pt
  gridTop: number; // нижний край верхней линейки, pt (y вверх)
  syms: { ch: string; x: number; u: number }[]; // центр символа; u = −y (вниз)
  top: Label[];
  left: Label[];
  fills: Fill[];
}

export type PdfParseProgress = (page: number, total: number) => void;

/** Разбирает PDF Pattern Maker и возвращает объект в формате файла схемы (для parsePattern). */
export async function parsePatternPdf(doc: PdfDoc, ops: PdfOps, onProgress?: PdfParseProgress): Promise<Record<string, unknown>> {
  let title = '';
  let width = 0;
  let height = 0;
  let fabric: { type: string; count: number; color: string } | undefined;
  const legend: LegendRow[] = [];
  const usage = new Map<string, number>();
  const pages: PatternPage[] = [];
  let inFull = false;

  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.(n, doc.numPages);
    const { words, glyphs, fills } = await readPage(await doc.getPage(n), ops);
    const text = words.map((w) => w.str).join(' ');

    // ——— легенда и сведения о схеме ———
    if (/Symbol/.test(text) && /Strands/.test(text)) {
      // символ легенды стоит на 3 pt выше строки — допуск меньше, чтобы он не попал в строку
      for (const l of lines(words, 2)) {
        const ws = l.map((w) => w.str);
        const joined = ws.join(' ');
        if (/^Pattern Name:/.test(joined)) title = joined.replace(/^Pattern Name:\s*/, '');
        const fab = /^Fabric:\s*([A-Za-z]+)\s*(\d+)?,?\s*(.*)$/.exec(joined);
        if (fab) fabric = { type: fab[1], count: Number(fab[2]) || 14, color: fab[3] || 'White' };
        const dims = /(\d+)w X (\d+)h Stitches/.exec(joined);
        if (dims) {
          width = Number(dims[1]);
          height = Number(dims[2]);
        }
        if (/^Floss Used for Full Stitches/.test(joined)) inFull = true;
        else if (/^Floss Used for/.test(joined)) inFull = false;
        // строка: «2 DMC 150 Dusty Rose…», символ — левее и на пару pt выше
        if (inFull && ws.length >= 3 && isNum(ws[0]) && /^[A-Za-z]+$/.test(ws[1]) && /^[\w.-]+$/.test(ws[2])) {
          const y = l[0].y;
          const sym = glyphs.find((g) => !g.rotated && g.x < l[0].x - 10 && g.y - y > -1 && g.y - y < 6);
          if (!sym) throw new PatternError(`В легенде PDF не нашёлся символ для нити ${ws[1]} ${ws[2]}.`);
          legend.push({ symbol: sym.str, strands: Number(ws[0]), brand: ws[1], code: ws[2], name: ws.slice(3).join(' ') });
        }
      }
      continue;
    }

    // ——— таблица расхода ———
    if (/Skein Est/.test(text) && /Full/.test(text)) {
      for (const l of lines(words)) {
        const ws = l.map((w) => w.str);
        if (ws.length >= 3 && /^[A-Za-z]+$/.test(ws[0]) && /^[\w.-]+$/.test(ws[1]) && isNum(ws[2])) usage.set(ws[1], Number(ws[2]));
      }
      continue;
    }

    // ——— страница схемы ———
    // левая линейка — повёрнутые числа; верхняя — строка горизонтальных чисел, в которой их больше всего
    const left: Label[] = words.filter((w) => w.rotated && isNum(w.str)).map((w) => ({ n: Number(w.str), c: -(w.x + w.w / 2) }));
    const numRows = new Map<number, Word[]>();
    for (const w of words) if (!w.rotated && isNum(w.str)) (numRows.get(Math.round(w.y)) ?? numRows.set(Math.round(w.y), []).get(Math.round(w.y))!).push(w);
    const topRow = [...numRows.values()].sort((a, b) => b.length - a.length || b[0].y - a[0].y)[0];
    if (!topRow || !left.length) continue; // не страница схемы
    const top: Label[] = topRow.map((w) => ({ n: Number(w.str), c: w.x + w.w / 2 }));
    const topY = topRow[0].y;
    const leftX = Math.max(...words.filter((w) => w.rotated && isNum(w.str)).map((w) => w.y));

    // символы — горизонтальные, ниже верхней линейки и правее левой, причём не шрифтом
    // колонтитулов («Page 2 …», «(9)») и линеек; среди остальных — самый частый шрифт
    const headY = Math.max(...words.map((w) => w.y));
    const otherFonts = new Set([...words.filter((w) => Math.abs(w.y - headY) < 1 || isNum(w.str) || /^\(\d+\)$/.test(w.str)).map((w) => w.font)]);
    const inside = glyphs.filter((g) => !g.rotated && g.y < topY - 2 && g.x > leftX + 2 && !otherFonts.has(g.font));
    const fonts = new Map<string, number>();
    for (const g of inside) fonts.set(`${g.font}|${g.size.toFixed(2)}`, (fonts.get(`${g.font}|${g.size.toFixed(2)}`) ?? 0) + 1);
    const symFont = [...fonts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const syms = inside
      .filter((g) => `${g.font}|${g.size.toFixed(2)}` === symFont)
      .map((g) => ({ ch: g.str, x: g.x + g.w / 2, u: -(g.y + g.size * 0.33) }));
    pages.push({ page: n, gridLeft: leftX, gridTop: topY, syms, top, left, fills });
  }

  if (!legend.length) throw new PatternError('В PDF не нашлась легенда ниток. Пока читаются только схемы из Pattern Maker.');
  if (!pages.length) throw new PatternError('В PDF не нашлись страницы схемы с символами.');
  if (!width || !height) throw new PatternError('В PDF не указан размер схемы («…w X …h Stitches»).');

  // ——— шаг сетки: расстояние между соседними символами в строке ———
  const gaps: number[] = [];
  for (const p of pages) {
    const rows = new Map<number, number[]>();
    for (const s of p.syms) (rows.get(Math.round(s.u * 4)) ?? rows.set(Math.round(s.u * 4), []).get(Math.round(s.u * 4))!).push(s.x);
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 1) gaps.push(xs[i] - xs[i - 1]);
    }
  }
  const rough = median(gaps);
  const step = median(gaps.filter((d) => Math.abs(d - rough) < rough * 0.1));
  if (!(step > 0)) throw new PatternError('Не удалось определить шаг сетки в PDF.');

  const symIndex = new Map(legend.map((l, i) => [l.symbol, i]));
  if (symIndex.size !== legend.length) throw new PatternError('В легенде PDF повторяются символы.');

  const cells = new Int16Array(width * height).fill(-1);
  const colorVotes: Map<string, number>[] = legend.map(() => new Map());
  let conflicts = 0;
  let outside = 0;
  let unknown = '';

  // Линии сетки: phase + k·step. Подпись линейки стоит по центру своей линии;
  // крайние подписи бывают прижаты к краю — они не на линии, их отбрасываем.
  const mod = (v: number) => ((v % step) + step) % step;
  const offset = (labels: Label[], phase: number): number | null => {
    const cand: number[] = [];
    for (const l of labels) {
      const k = (l.c - phase) / step;
      if (Math.abs(k - Math.round(k)) < 0.2) cand.push(l.n - Math.round(k));
    }
    return cand.length ? median(cand) : null;
  };

  const sheets: { page: number; x: number; y: number; w: number; h: number }[] = [];
  for (const p of pages) {
    if (!p.syms.length) continue;
    const phaseX = median(p.syms.map((s) => mod(s.x - step / 2)));
    const phaseU = median(p.syms.map((s) => mod(s.u - step / 2)));
    const col0 = offset(p.top, phaseX);
    const row0 = offset(p.left, phaseU);
    if (col0 === null || row0 === null) throw new PatternError('На странице схемы не прочитались номера клеток на линейках.');
    const colOf = (x: number) => col0 + Math.floor((x - phaseX) / step);
    const rowOf = (u: number) => row0 + Math.floor((u - phaseU) / step);
    // границы листа — по подписям линеек и символам на нём
    {
      // первая клетка листа — сразу за линейками
      const x0 = colOf(p.gridLeft + step / 2);
      const y0 = rowOf(-(p.gridTop - step / 2));
      const xs = p.syms.map((s) => colOf(s.x));
      const ys = p.syms.map((s) => rowOf(s.u));
      sheets.push({ page: p.page, x: x0, y: y0, w: Math.max(...xs) + 1 - x0, h: Math.max(...ys) + 1 - y0 });
    }

    for (const s of p.syms) {
      const k = symIndex.get(s.ch);
      if (k === undefined) {
        unknown ||= s.ch;
        continue;
      }
      const x = colOf(s.x);
      const y = rowOf(s.u);
      if (x < 0 || y < 0 || x >= width || y >= height) {
        outside++;
        continue;
      }
      const at = y * width + x;
      if (cells[at] >= 0 && cells[at] !== k) conflicts++;
      cells[at] = k;
    }
    // цвет нити — заливки размером примерно с клетку
    for (const f of p.fills) {
      if (Math.abs(f.w - step) > step * 0.2 || Math.abs(f.h - step) > step * 0.2) continue;
      const x = colOf(f.cx);
      const y = rowOf(-f.cy);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const k = cells[y * width + x];
      if (k < 0) continue;
      colorVotes[k].set(f.color, (colorVotes[k].get(f.color) ?? 0) + 1);
    }
  }

  if (unknown) throw new PatternError(`В схеме встретился символ «${unknown}», которого нет в легенде.`);
  if (conflicts) throw new PatternError(`Страницы PDF не совпали на перекрытиях (${conflicts} клеток). Разбор остановлен, чтобы не открыть схему с ошибками.`);
  if (outside) throw new PatternError(`${outside} символов оказались за краем схемы — разбор сетки не удался.`);

  // ——— сверка с таблицей расхода ———
  const counts = new Array(legend.length).fill(0);
  for (const k of cells) if (k >= 0) counts[k]++;
  if (!usage.size) throw new PatternError('В PDF не нашлась таблица расхода — не с чем сверить разбор.');
  const bad = legend.map((l, k) => ({ l, k, want: usage.get(l.code) })).filter(({ k, want }) => want !== counts[k]);
  if (bad.length) {
    const list = bad.slice(0, 4).map(({ l, k, want }) => `${l.code}: ${counts[k]} вместо ${want ?? '?'}`).join('; ');
    throw new PatternError(`Число крестиков не совпало с таблицей расхода в PDF (${list}${bad.length > 4 ? '…' : ''}). Схема не открыта, чтобы не было ошибок.`);
  }

  const palette = legend.map((l, k) => {
    const best = [...colorVotes[k].entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { id: k, brand: l.brand, code: l.code, name: l.name, symbol: l.symbol, rgb: (best && hexToRgb(best)) || [128, 128, 128], count: counts[k] };
  });
  const strands = median(legend.map((l) => l.strands));
  return {
    format: 'xstitch-pattern',
    version: 1,
    title: title || 'Схема из PDF',
    width,
    height,
    ...(fabric ? { fabric } : {}),
    ...(Number.isFinite(strands) ? { strands } : {}),
    palette,
    sheets: fitSheets(sheets, width, height),
    cells: Array.from({ length: height }, (_, y) => Array.from(cells.subarray(y * width, (y + 1) * width))),
  };
}

/** Размер листа — одинаковый у всех полных листов (крайние обрезаны краем схемы).
 *  По символам его видно не всегда (пустые края), поэтому берём самый частый шаг между листами. */
function fitSheets(sh: { page: number; x: number; y: number; w: number; h: number }[], W: number, H: number) {
  if (!sh.length) return undefined;
  const xs = [...new Set(sh.map((s) => s.x))].sort((a, b) => a - b);
  const ys = [...new Set(sh.map((s) => s.y))].sort((a, b) => a - b);
  const stepX = xs.length > 1 ? median(xs.slice(1).map((v, i) => v - xs[i])) : W;
  const stepY = ys.length > 1 ? median(ys.slice(1).map((v, i) => v - ys[i])) : H;
  // перекрытие листов: самая широкая ширина по символам минус шаг (у Pattern Maker — 3 клетки)
  const overX = Math.max(0, Math.max(...sh.map((s) => s.w)) - stepX);
  const overY = Math.max(0, Math.max(...sh.map((s) => s.h)) - stepY);
  // листы без единого символа (пустой край картины) тоже нужны — достраиваем сетку листов
  const known = new Map(sh.map((s) => [`${s.x},${s.y}`, s.page]));
  const nx = Math.ceil(Math.max(1, W - overX) / stepX);
  const ny = Math.ceil(Math.max(1, H - overY) / stepY);
  const ref = sh[0];
  const base = ref.page - (Math.round(ref.y / stepY) * nx + Math.round(ref.x / stepX));
  const out: { page: number; x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const x = c * stepX;
      const y = r * stepY;
      if (x >= W || y >= H) continue;
      out.push({ page: known.get(`${x},${y}`) ?? base + r * nx + c, x, y, w: Math.min(stepX + overX, W - x), h: Math.min(stepY + overY, H - y) });
    }
  }
  return out;
}
