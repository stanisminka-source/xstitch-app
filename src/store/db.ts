// Хранение на устройстве (IndexedDB): схемы и мелкие записи (настройки, место просмотра).
import type { Pattern } from '../pattern/format';

const DB_NAME = 'smile-stitch';
const DB_VERSION = 1;

export interface StoredPattern {
  id: string;
  title: string;
  width: number;
  height: number;
  importedAt: number;
  pattern: Pattern;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('patterns')) db.createObjectStore('patterns', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const db = {
  savePattern: (p: StoredPattern) => tx('patterns', 'readwrite', (s) => s.put(p)).then(() => undefined),
  getPattern: (id: string) => tx<StoredPattern | undefined>('patterns', 'readonly', (s) => s.get(id)),
  deletePattern: (id: string) => tx('patterns', 'readwrite', (s) => s.delete(id)).then(() => undefined),
  /** Список без самих клеток — для экрана «Мои схемы». */
  async listPatterns(): Promise<Omit<StoredPattern, 'pattern'>[]> {
    const all = await tx<StoredPattern[]>('patterns', 'readonly', (s) => s.getAll());
    return all
      .map(({ id, title, width, height, importedAt }) => ({ id, title, width, height, importedAt }))
      .sort((a, b) => b.importedAt - a.importedAt);
  },
  get: <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key)),
  set: (key: string, value: unknown) => tx('kv', 'readwrite', (s) => s.put(value, key)).then(() => undefined),
  del: (key: string) => tx('kv', 'readwrite', (s) => s.delete(key)).then(() => undefined),
};

/** Отпечаток схемы: одинаковый файл при повторной загрузке попадает в ту же запись. */
export function patternId(p: Pattern): string {
  let h = 0x811c9dc5;
  const feed = (n: number) => {
    h ^= n & 0xffff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  feed(p.width);
  feed(p.height);
  for (let i = 0; i < p.cells.length; i++) feed(p.cells[i] + 1);
  for (const c of p.palette) for (const ch of c.code) feed(ch.charCodeAt(0));
  return 'p' + h.toString(36);
}
