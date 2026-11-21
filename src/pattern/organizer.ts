// Органайзер для ниток: на него помещается ограниченное число цветов.
// Предлагаем самые нужные — по числу крестиков (всей схемы или выбранного участка),
// от большего к меньшему. Разложенный органайзер запоминается: места не прыгают,
// пока не попросишь разложить заново. Когда цвет на участке вышит, место освобождается
// и подсказываем, кого туда повесить.

import type { AreaRow } from './threads';

export type OrgSource = 'all' | 'area';
export type OrgBasis = 'left' | 'all';

export interface Organizer {
  /** Номера ниток по местам: codes[0] — место 1. */
  codes: string[];
  source: OrgSource;
  basis: OrgBasis;
  at: number;
}

export interface OrgPick {
  k: number;
  n: number;
}

export const DEFAULT_SLOTS = 20;
export const MAX_SLOTS = 200;

export function normalizeSlots(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_SLOTS ? n : DEFAULT_SLOTS;
}

export function normalizeOrganizer(raw: unknown): Organizer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<Organizer>;
  if (!Array.isArray(o.codes) || !o.codes.every((c) => typeof c === 'string')) return null;
  return {
    codes: o.codes.slice(0, MAX_SLOTS),
    source: o.source === 'area' ? 'area' : 'all',
    basis: o.basis === 'all' ? 'all' : 'left',
    at: Number(o.at) || 0,
  };
}

/** Сколько крестиков цвета берём в расчёт: только невышитые или все. */
export const amount = (r: AreaRow, basis: OrgBasis) => (basis === 'left' ? r.left : r.total);

/** Все нужные цвета по убыванию крестиков (при равенстве — по номеру). */
export function ranked(rows: AreaRow[], basis: OrgBasis, codeOf: (k: number) => string, cmp: (a: string, b: string) => number): OrgPick[] {
  return rows
    .map((r) => ({ k: r.k, n: amount(r, basis) }))
    .filter((p) => p.n > 0)
    .sort((a, b) => b.n - a.n || cmp(codeOf(a.k), codeOf(b.k)));
}

/** Предложение: первые slots цветов — на органайзер, остальные — «не поместились».
 *  coverage — какая доля крестиков придётся на нитки с органайзера. */
export function propose(list: OrgPick[], slots: number): { placed: OrgPick[]; rest: OrgPick[]; coverage: number } {
  const placed = list.slice(0, slots);
  const rest = list.slice(slots);
  const all = list.reduce((s, p) => s + p.n, 0);
  const on = placed.reduce((s, p) => s + p.n, 0);
  return { placed, rest, coverage: all ? on / all : 0 };
}

/** Чем занять освободившиеся места: самые нужные цвета, которых ещё нет на органайзере. */
export function replacements(list: OrgPick[], org: Organizer, codeOf: (k: number) => string, count: number): OrgPick[] {
  const on = new Set(org.codes.map((c) => c.toUpperCase()));
  return list.filter((p) => !on.has(codeOf(p.k).toUpperCase())).slice(0, count);
}
