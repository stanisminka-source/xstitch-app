// Проверка на настоящей схеме. Файл схемы в репозиторий не входит (путь — в tests/localPaths.ts);
// без него тест пропускается, например в GitHub Actions.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePattern, stitchCount } from '../src/pattern/format';
import { REAL_JSON, haveFile } from './localPaths';

describe.skipIf(!haveFile(REAL_JSON))('Настоящая схема (локальный файл)', () => {
  it('разбирается, и счётчики из файла совпадают с пересчитанными', () => {
    const raw = JSON.parse(readFileSync(REAL_JSON, 'utf8'));
    const p = parsePattern(raw);
    expect(p.width * p.height).toBe(p.cells.length);
    expect(stitchCount(p)).toBe(p.palette.reduce((s, c) => s + c.count, 0));
    for (const c of raw.palette) {
      expect(p.palette.find((q) => q.id === c.id)!.count).toBe(c.count);
    }
  });
});
