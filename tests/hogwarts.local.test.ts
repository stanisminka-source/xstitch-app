// Проверка на настоящей схеме. Файл схемы в репозиторий не входит:
// тест читает его с диска и пропускается, если файла нет (например, в GitHub Actions).
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePattern, stitchCount } from '../src/pattern/format';

const file =
  process.env.XSTITCH_HOGWARTS ?? join(homedir(), 'Downloads/xstitch-app-package/hogwarts.pattern.json');

describe.skipIf(!existsSync(file))('Хогвартс (локальный файл)', () => {
  it('разбирается, размеры и счётчики совпадают с ТЗ', () => {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const p = parsePattern(raw);
    expect(p.width).toBe(400);
    expect(p.height).toBe(514);
    expect(p.palette).toHaveLength(100);
    expect(stitchCount(p)).toBe(168_347);
    expect(p.width * p.height - stitchCount(p)).toBe(37_253);
    // счётчики из файла совпадают с пересчитанными
    for (const c of raw.palette) {
      expect(p.palette.find((q) => q.id === c.id)!.count).toBe(c.count);
    }
  });
});
