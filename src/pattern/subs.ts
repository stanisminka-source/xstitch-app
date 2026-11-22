// Сверка цветов и замена ниток.
// Цвет клетки в PDF задаёт автор схемы — часто он подогнан под исходную картинку
// и не совпадает с настоящей ниткой (310 Black в PDF бывает тёмно-оливковым).
// Здесь: какие нитки на экране выглядят не так, как в жизни, какие нитки ближе
// к картинке, и замена нитки во всей схеме (её можно вернуть).

import { DMC_RAW } from '../data/dmc';
import type { RGB } from '../lib/color';
import { deltaE } from '../lib/lab';
import { dmcThread } from './catalog';
import type { Pattern } from './format';

/** Замены: номер в схеме → номер, которым вышиваем. */
export type Subs = Record<string, string>;

export const NOTICEABLE = 10;
export const STRONG = 15;

export function normalizeSubs(raw: unknown): Subs {
  const out: Subs = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'string' && v && k !== v) out[k] = v;
  return out;
}

/**
 * Схема с заменами. Порядок цветов не меняется (у цветов остаются те же места, символы
 * и отметки). Если новая нитка уже есть в схеме — клетки переходят к ней, а у старого
 * цвета остаётся 0 крестиков. Если нет — у цвета меняются номер, название и цвет.
 */
export function applySubs(p: Pattern, subs: Subs): Pattern {
  const entries = Object.entries(subs);
  if (!entries.length) return p;
  const byCode = new Map(p.palette.map((c) => [c.code.toUpperCase(), c]));
  const remap = new Map<number, number>();
  const palette = p.palette.map((c) => {
    const to = subs[c.code];
    // цепочки (а → б, б → в) не разворачиваем: замена на заменённую нитку не действует
    if (!to || subs[to]) return { ...c };
    const target = byCode.get(to.toUpperCase());
    if (target && target.id !== c.id) {
      remap.set(c.id, target.id);
      return { ...c };
    }
    const t = dmcThread(to);
    return { ...c, code: t?.code ?? to, name: t?.name ?? '', rgb: t ? ([...t.rgb] as [number, number, number]) : c.rgb, replaced: c.code };
  });
  const cells = remap.size ? p.cells.map((v) => remap.get(v) ?? v) : p.cells;
  const counts = new Map<number, number>();
  for (const v of cells) if (v >= 0) counts.set(v, (counts.get(v) ?? 0) + 1);
  for (const c of palette) c.count = counts.get(c.id) ?? 0;
  const backstitch = p.backstitch.map((l) => (remap.has(l.color) ? { ...l, color: remap.get(l.color)! } : l));
  return { ...p, palette, cells: cells instanceof Int16Array ? cells : Int16Array.from(cells), backstitch };
}

export interface ColorCheck {
  k: number;
  code: string;
  /** Цвет в PDF и настоящий цвет нитки. */
  pdf: RGB;
  real: RGB;
  de: number;
  level: 'strong' | 'noticeable';
}

/** Нитки, у которых цвет в PDF заметно отличается от настоящего, — сильные первыми. */
export function colorChecks(palette: { code: string; rgb: RGB; count: number }[]): ColorCheck[] {
  const out: ColorCheck[] = [];
  palette.forEach((c, k) => {
    if (!c.count) return;
    const t = dmcThread(c.code);
    if (!t) return;
    const de = deltaE(c.rgb, t.rgb);
    if (de >= NOTICEABLE) out.push({ k, code: c.code, pdf: c.rgb, real: t.rgb, de, level: de >= STRONG ? 'strong' : 'noticeable' });
  });
  return out.sort((a, b) => b.de - a.de);
}

export interface Suggestion {
  code: string;
  name: string;
  rgb: RGB;
  de: number;
}

/** Нитки DMC, которые ближе всего к цвету из PDF (то есть к задуманной картинке). */
export function suggest(rgb: RGB, exclude: string, n = 4): Suggestion[] {
  return DMC_RAW.filter(([code]) => code.toUpperCase() !== exclude.toUpperCase())
    .map(([code, name, r, g, b]) => ({ code, name, rgb: [r, g, b] as RGB, de: deltaE(rgb, [r, g, b]) }))
    .sort((a, b) => a.de - b.de)
    .slice(0, n);
}
