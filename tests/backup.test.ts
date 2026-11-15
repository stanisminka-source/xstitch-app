import { describe, expect, it } from 'vitest';
import { BackupError, backupFileName, emptyMeta, logDelta, makeBackup, mergeDays, normalizeMeta, packBits, readBackup, unpackBits } from '../src/progress/backup';

const P = { id: 'pabc', title: 'Hogwarts by the Crystal Lake (100 colours)', width: 7, height: 3 };

describe('Копия прогресса', () => {
  it('отметки упаковываются по биту и читаются обратно без потерь', () => {
    const done = new Uint8Array(21).map((_, i) => (i % 3 === 0 || i === 20 ? 1 : 0));
    expect([...unpackBits(packBits(done), 21)]).toEqual([...done]);
    const big = new Uint8Array(400 * 514).map(() => (Math.random() < 0.3 ? 1 : 0));
    expect(unpackBits(packBits(big), big.length)).toEqual(big);
  });

  it('файл копии читается на другом устройстве с той же схемой', () => {
    const done = new Uint8Array(21);
    done[4] = done[5] = 1;
    const file = JSON.parse(JSON.stringify(makeBackup(P, done, 2, { '2026-11-15': 2 })));
    const r = readBackup(file, P);
    expect([...r.done]).toEqual([...done]);
    expect(r.days).toEqual({ '2026-11-15': 2 });
  });

  it('не принимает копию от другой схемы, файл схемы и мусор', () => {
    const file = makeBackup(P, new Uint8Array(21), 0, {});
    expect(() => readBackup(file, { ...P, id: 'other' })).toThrow(/другой схемы.*Hogwarts/);
    expect(() => readBackup({ cells: [], palette: [] }, P)).toThrow(/файл схемы/);
    expect(() => readBackup(42, P)).toThrow(BackupError);
    expect(() => readBackup({ ...file, done: 'AA==' }, P)).toThrow(/повреждён/);
  });

  it('журнал: за день — сумма, стёртое вычитается, счётчик копии растёт', () => {
    const m = emptyMeta();
    logDelta(m, 30, '2026-11-15');
    logDelta(m, -5, '2026-11-15');
    logDelta(m, 7, '2026-11-16');
    expect(m.days).toEqual({ '2026-11-15': 25, '2026-11-16': 7 });
    expect(m.since).toBe(42);
    expect(mergeDays({ a: 5, b: 1 }, { b: 3, c: 2 })).toEqual({ a: 5, b: 3, c: 2 });
  });

  it('битые сохранённые данные журнала заменяются пустыми', () => {
    expect(normalizeMeta(null)).toEqual(emptyMeta());
    expect(normalizeMeta({ days: { bad: 3, '2026-01-02': 4 }, since: -1 }).days).toEqual({ '2026-01-02': 4 });
  });

  it('имя файла понятное, без «(100 colours)»', () => {
    expect(backupFileName(P.title, new Date(2026, 10, 15))).toBe('Hogwarts-by-the-Crystal-Lake-прогресс-2026-11-15.json');
  });
});
