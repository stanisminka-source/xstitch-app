// Мои нитки: что уже есть дома. Общий список для всех схем.
// Моток по умолчанию — один целый. Переключатель «мало» значит: один из мотков начат
// и ниток в нём немного — считаем его за треть мотка.

export interface StashItem {
  brand: string;
  code: string;
  /** Сколько мотков (вместе с начатым). */
  skeins: number;
  /** Один из мотков почти кончился. */
  low: boolean;
}

export type Stash = Record<string, StashItem>;

/** Сколько мотка считаем у начатого «мало». */
export const LOW_PART = 0.3;

export const stashKey = (brand: string, code: string) => `${(brand || 'DMC').trim().toUpperCase()}:${code.trim().toUpperCase()}`;

/** Номер как его пишут: 310, Blanc, Ecru, B5200. */
export function tidyCode(raw: string): string {
  const s = raw.trim();
  if (/^[a-zа-я]+$/i.test(s)) return s[0].toUpperCase() + s.slice(1).toLowerCase();
  return s.toUpperCase();
}

/** Номера из строки: «310, 3865 150; blanc» → ['310', '3865', '150', 'Blanc']. Слово «DMC» пропускаем. */
export function parseCodes(text: string): string[] {
  const out: string[] = [];
  for (const tok of text.split(/[\s,;]+/)) {
    if (!tok || /^dmc$/i.test(tok)) continue;
    if (!/^[\p{L}\p{N}-]{1,10}$/u.test(tok)) continue;
    const c = tidyCode(tok);
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

export function normalizeStash(raw: unknown): Stash {
  const out: Stash = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const v of Object.values(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const it = v as Partial<StashItem>;
    if (typeof it.code !== 'string' || !it.code.trim()) continue;
    const skeins = Number.isInteger(it.skeins) && it.skeins! >= 0 && it.skeins! <= 99 ? it.skeins! : 1;
    const item = { brand: typeof it.brand === 'string' && it.brand ? it.brand : 'DMC', code: tidyCode(it.code), skeins, low: !!it.low };
    out[stashKey(item.brand, item.code)] = item;
  }
  return out;
}

/** Добавить номера: каждый — один целый моток. Уже записанные не трогаем. */
export function addCodes(stash: Stash, codes: string[], brand = 'DMC'): { stash: Stash; added: string[]; already: string[] } {
  const next = { ...stash };
  const added: string[] = [];
  const already: string[] = [];
  for (const code of codes) {
    const key = stashKey(brand, code);
    if (next[key]) already.push(code);
    else {
      next[key] = { brand, code, skeins: 1, low: false };
      added.push(code);
    }
  }
  return { stash: next, added, already };
}

/** Сколько ниток есть, в мотках: начатый «мало» — треть мотка. */
export function haveAmount(item: StashItem | undefined): number {
  if (!item || item.skeins <= 0) return 0;
  return item.low ? item.skeins - 1 + LOW_PART : item.skeins;
}

/** Сколько целых мотков докупить, если нужно need мотков (дробно), а есть have. */
export function needToBuy(need: number, have: number): number {
  if (need <= 0) return 0;
  return Math.max(0, Math.ceil(need - have - 1e-9));
}

export interface ListRow {
  code: string;
  name: string;
  rgb: [number, number, number] | null;
  /** Нужно мотков (дробно). */
  need: number;
  have?: StashItem;
  buy: number;
}

const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');

export function haveText(it: StashItem | undefined): string {
  if (!it || it.skeins <= 0) return '';
  if (it.low && it.skeins === 1) return 'есть немного';
  return `есть ${it.skeins} мот.${it.low ? ', один начат' : ''}`;
}

/** Данные для PDF-списка: «к покупке» — сколько купить; «все» — нужно, есть, купить. */
export function listPdfData(o: { title: string; heading: string; notes: string[]; rows: ListRow[]; mode: 'buy' | 'all' }) {
  const total = o.rows.reduce((n, r) => n + r.buy, 0);
  return {
    heading: o.heading,
    lines: [o.title, ...o.notes],
    columns: o.mode === 'buy' ? ['Купить'] : ['Нужно', 'Есть', 'Купить'],
    rows: o.rows.map((r) => ({
      code: r.code,
      name: r.name,
      rgb: r.rgb,
      cells:
        o.mode === 'buy'
          ? [`${r.buy} мот.`]
          : [`≈${fmt1(r.need)}`, haveText(r.have).replace(/^есть /, '') || '—', r.buy ? `${r.buy} мот.` : '—'],
    })),
    total: `Итого купить: ${total} мот., цветов: ${o.rows.filter((r) => r.buy > 0).length}`,
    footer: `Smile & Stitch · ${new Date().toLocaleDateString('ru-RU')}`,
  };
}

/** Имя файла без странных знаков. */
export function listFileName(title: string, kind: string): string {
  const slug = title.replace(/\(.*?\)/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'схема';
  return `${slug}-${kind}.pdf`;
}
