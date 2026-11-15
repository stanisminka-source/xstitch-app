// Журнал по дням, счётчик «с последней копии» и файл резервной копии прогресса.
// Файл копии — обычный JSON: отметки упакованы по биту на клетку (Хогвартс — ~35 КБ).

export const REMIND_EVERY = 500; // через сколько отметок после копии напоминать

export interface Meta {
  /** Сколько крестиков отмечено за день (за вычетом стёртых): 'ГГГГ-ММ-ДД' → число. */
  days: Record<string, number>;
  /** Сколько отметок поставлено и снято с последней копии. */
  since: number;
  /** Когда последний раз сохраняли копию (мс) или null. */
  backupAt: number | null;
  /** При каком значении since показать напоминание. */
  remindAt: number;
}

export const emptyMeta = (): Meta => ({ days: {}, since: 0, backupAt: null, remindAt: REMIND_EVERY });

export function normalizeMeta(raw: unknown): Meta {
  const m = emptyMeta();
  if (!raw || typeof raw !== 'object') return m;
  const r = raw as Partial<Meta>;
  if (r.days && typeof r.days === 'object') {
    for (const [k, v] of Object.entries(r.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(v)) m.days[k] = v;
  }
  if (Number.isFinite(r.since) && r.since! >= 0) m.since = r.since!;
  if (Number.isFinite(r.backupAt)) m.backupAt = r.backupAt!;
  if (Number.isFinite(r.remindAt) && r.remindAt! > 0) m.remindAt = r.remindAt!;
  return m;
}

/** Ключ дня по местному времени. */
export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Записать изменение числа вышитого в журнал и в счётчик «с последней копии». */
export function logDelta(m: Meta, delta: number, day = dayKey()): void {
  if (!delta) return;
  m.days[day] = (m.days[day] ?? 0) + delta;
  if (m.days[day] === 0) delete m.days[day];
  m.since += Math.abs(delta);
}

/** Два журнала (с двух устройств) в один: за каждый день — большее значение. */
export function mergeDays(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? Math.max(out[k], v) : v;
  return out;
}

export function packBits(done: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(done.length / 8));
  for (let i = 0; i < done.length; i++) if (done[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unpackBits(b64: string, n: number): Uint8Array {
  const s = atob(b64);
  if (s.length !== Math.ceil(n / 8)) throw new BackupError('Файл копии повреждён.');
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return out;
}

export const BACKUP_FORMAT = 'smile-stitch-progress';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  patternId: string;
  title: string;
  width: number;
  height: number;
  savedAt: number;
  stitched: number;
  done: string;
  days: Record<string, number>;
}

export class BackupError extends Error {}

export function makeBackup(p: { id: string; title: string; width: number; height: number }, done: Uint8Array, stitched: number, days: Record<string, number>): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    patternId: p.id,
    title: p.title,
    width: p.width,
    height: p.height,
    savedAt: Date.now(),
    stitched,
    done: packBits(done),
    days,
  };
}

/** Проверяет файл копии и что он от этой схемы. */
export function readBackup(raw: unknown, p: { id: string; width: number; height: number }): { done: Uint8Array; days: Record<string, number>; savedAt: number } {
  if (!raw || typeof raw !== 'object') throw new BackupError('Это не файл прогресса.');
  const b = raw as Partial<BackupFile> & { cells?: unknown; palette?: unknown };
  if (b.format !== BACKUP_FORMAT) {
    if (b.cells || b.palette) throw new BackupError('Это файл схемы, а не прогресса. Схему загружают в «Ещё» → «Загрузить схему».');
    throw new BackupError('Это не файл прогресса.');
  }
  if (b.patternId !== p.id || b.width !== p.width || b.height !== p.height) {
    throw new BackupError(`Этот прогресс от другой схемы${b.title ? `: «${b.title}»` : ''}. Сначала откройте её.`);
  }
  if (typeof b.done !== 'string') throw new BackupError('Файл копии повреждён.');
  return { done: unpackBits(b.done, p.width * p.height), days: normalizeMeta({ days: b.days }).days, savedAt: Number(b.savedAt) || 0 };
}

export function backupFileName(title: string, d = new Date()): string {
  const slug = title.replace(/\(.*?\)/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'схема';
  return `${slug}-прогресс-${dayKey(d)}.json`;
}
