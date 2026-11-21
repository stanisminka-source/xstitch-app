// «В магазине»: список к покупке, в котором отмечаешь, что взяла с полки и сколько мотков.
// После «Сохранить» отмеченное прибавляется к «Моим ниткам». Незаконченная покупка
// хранится на устройстве — её можно продолжить после закрытия приложения.
import { stashKey, type Stash } from './stash';

export interface ShopItem {
  code: string;
  name: string;
  rgb: [number, number, number] | null;
  /** Сколько собирались купить. */
  plan: number;
  /** Сколько взяла (по умолчанию — сколько собирались). */
  got: number;
  checked: boolean;
}

export interface ShopSession {
  title: string;
  startedAt: number;
  items: ShopItem[];
}

export function startShop(title: string, rows: { code: string; name: string; rgb: [number, number, number] | null; buy: number }[]): ShopSession {
  return {
    title,
    startedAt: Date.now(),
    items: rows.filter((r) => r.buy > 0).map((r) => ({ code: r.code, name: r.name, rgb: r.rgb, plan: r.buy, got: r.buy, checked: false })),
  };
}

export function normalizeShop(raw: unknown): ShopSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<ShopSession>;
  if (!Array.isArray(s.items)) return null;
  const items: ShopItem[] = [];
  for (const it of s.items) {
    if (!it || typeof it.code !== 'string') continue;
    const n = (v: unknown, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 99 ? (v as number) : d);
    items.push({ code: it.code, name: String(it.name ?? ''), rgb: Array.isArray(it.rgb) && it.rgb.length === 3 ? (it.rgb as [number, number, number]) : null, plan: n(it.plan, 0), got: n(it.got, 1), checked: !!it.checked });
  }
  return { title: String(s.title ?? ''), startedAt: Number(s.startedAt) || Date.now(), items };
}

/** Прибавить купленное к «Моим ниткам». Возвращает новые запасы и сколько всего добавлено. */
export function applyShop(stash: Stash, session: ShopSession): { stash: Stash; colors: number; skeins: number } {
  const next = { ...stash };
  let colors = 0;
  let skeins = 0;
  for (const it of session.items) {
    if (!it.checked || it.got <= 0) continue;
    const key = stashKey('DMC', it.code);
    const had = next[key];
    next[key] = had ? { ...had, skeins: Math.min(99, had.skeins + it.got) } : { brand: 'DMC', code: it.code, skeins: Math.min(99, it.got), low: false };
    colors++;
    skeins += it.got;
  }
  return { stash: next, colors, skeins };
}
