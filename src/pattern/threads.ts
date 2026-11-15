// Канва, число нитей, расход ниток и листы схемы.

import type { Pattern, Sheet } from './format';

export interface FabricOption {
  id: string;
  label: string;
  /** Крестиков на дюйм (для равномерки «через 2» — половина её счёта). */
  count: number;
}

export const FABRICS: FabricOption[] = [
  { id: 'aida11', label: 'Аида 11', count: 11 },
  { id: 'aida14', label: 'Аида 14', count: 14 },
  { id: 'aida16', label: 'Аида 16', count: 16 },
  { id: 'aida18', label: 'Аида 18', count: 18 },
  { id: 'aida20', label: 'Аида 20', count: 20 },
  { id: 'hard22', label: 'Хардангер 22', count: 22 },
  { id: 'even28', label: 'Равномерка 28 (через 2)', count: 14 },
  { id: 'even32', label: 'Равномерка 32 (через 2)', count: 16 },
  { id: 'even36', label: 'Равномерка 36 (через 2)', count: 18 },
];

export interface FabricChoice {
  fabric: string;
  strands: number;
}

/** Сколько нитей советуем: 3 — для крупной канвы (16 и меньше), 2 — для 18, 1 — для более мелкой. */
export function recommendedStrands(count: number): number {
  if (count <= 16) return 3;
  if (count <= 18) return 2;
  return 1;
}

export function fabricById(id: string): FabricOption {
  return FABRICS.find((f) => f.id === id) ?? FABRICS[3];
}

/** Канва по умолчанию — из самой схемы (PDF пишет «Aida 18»), иначе Аида 18. */
export function defaultChoice(p: Pattern, saved?: unknown): FabricChoice {
  const s = saved as Partial<FabricChoice> | undefined;
  if (s && typeof s.fabric === 'string' && FABRICS.some((f) => f.id === s.fabric) && [1, 2, 3, 4, 5, 6].includes(Number(s.strands))) {
    return { fabric: s.fabric, strands: Number(s.strands) };
  }
  const c = p.fabric?.count;
  const f = FABRICS.find((x) => x.id.startsWith('aida') && x.count === c) ?? FABRICS[3];
  return { fabric: f.id, strands: recommendedStrands(f.count) };
}

/**
 * Сколько полных крестиков выходит из одного мотка DMC (8 м, 6 сложений).
 * Опора — таблица расхода Pattern Maker: для Аиды 18 в 2 нити это ≈3090 крестиков
 * (с запасом на закрепки). Крестик тем длиннее, чем крупнее канва, а нить — тем
 * быстрее кончается, чем больше сложений берём.
 */
export function crossesPerSkein(count: number, strands: number): number {
  return 3090 * (count / 18) * (2 / strands);
}

export function skeins(crosses: number, count: number, strands: number): number {
  return crosses / crossesPerSkein(count, strands);
}

/** Целых мотков купить (хотя бы один, если цвет вообще нужен). */
export function skeinsToBuy(crosses: number, count: number, strands: number): number {
  return crosses > 0 ? Math.ceil(skeins(crosses, count, strands) - 1e-9) : 0;
}

/** Размер готовой работы в сантиметрах. */
export function finishedSize(width: number, height: number, count: number): { w: number; h: number } {
  return { w: (width / count) * 2.54, h: (height / count) * 2.54 };
}

/** Листы схемы: из PDF, а если их нет — разбивка как у Pattern Maker (60 × 84 клетки, без перекрытия). */
export function sheetsOf(p: Pattern): { sheets: Sheet[]; fromPdf: boolean } {
  if (p.sheets?.length) return { sheets: p.sheets, fromPdf: true };
  const out: Sheet[] = [];
  let page = 1;
  for (let y = 0; y < p.height; y += 84) for (let x = 0; x < p.width; x += 60) out.push({ page: page++, x, y, w: Math.min(60, p.width - x), h: Math.min(84, p.height - y) });
  return { sheets: out, fromPdf: false };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Прямоугольник по двум клеткам, расширенный до жирных линий 10 × 10. */
export function snapRect(ax: number, ay: number, bx: number, by: number, W: number, H: number): Rect {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) / 10) * 10);
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) / 10) * 10);
  const x1 = Math.min(W, Math.ceil((Math.max(ax, bx) + 1) / 10) * 10);
  const y1 = Math.min(H, Math.ceil((Math.max(ay, by) + 1) / 10) * 10);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Клетки выбранных листов и участков (без повторов на перекрытиях). */
export function areaMask(W: number, H: number, rects: Rect[]): Uint8Array {
  const m = new Uint8Array(W * H);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) m.fill(1, y * W + r.x, y * W + r.x + r.w);
  return m;
}

export interface AreaRow {
  k: number;
  total: number;
  left: number;
}

/** Сколько крестиков каждого цвета на участке и сколько из них ещё не вышито. */
export function areaCounts(idx: Int16Array, done: Uint8Array, mask: Uint8Array, nColors: number): AreaRow[] {
  const total = new Int32Array(nColors);
  const left = new Int32Array(nColors);
  for (let i = 0; i < idx.length; i++) {
    const k = idx[i];
    if (k < 0 || !mask[i]) continue;
    total[k]++;
    if (!done[i]) left[k]++;
  }
  const rows: AreaRow[] = [];
  for (let k = 0; k < nColors; k++) if (total[k]) rows.push({ k, total: total[k], left: left[k] });
  return rows.sort((a, b) => b.left - a.left || b.total - a.total);
}
