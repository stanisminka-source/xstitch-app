// Сверка разбора PDF Хогвартса с готовым JSON. Файлы лежат только на компьютере владелицы
// (в репозиторий не попадают), поэтому без них тест пропускается.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { parsePattern } from '../src/pattern/format';
import { parsePatternPdf } from '../src/pattern/pdf';

const PDF = `${homedir()}/Downloads/Hogwarts_100colors_Color.pdf`;
const JSON_FILE = `${homedir()}/Downloads/xstitch-app-package/hogwarts.pattern.json`;
const have = existsSync(PDF) && existsSync(JSON_FILE);

describe.skipIf(!have)('PDF Хогвартса', () => {
  it('разбирается так же, как готовый JSON', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(PDF)), verbosity: 0 }).promise;
    const raw = await parsePatternPdf(doc as never, pdfjs.OPS as never);
    const fromPdf = parsePattern(raw);
    const ref = parsePattern(JSON.parse(readFileSync(JSON_FILE, 'utf8')));
    expect(fromPdf.width).toBe(ref.width);
    expect(fromPdf.height).toBe(ref.height);
    expect(fromPdf.palette.map((c) => [c.code, c.symbol, c.count])).toEqual(ref.palette.map((c) => [c.code, c.symbol, c.count]));
    let diff = 0;
    for (let i = 0; i < ref.cells.length; i++) if (ref.cells[i] !== fromPdf.cells[i]) diff++;
    expect(diff).toBe(0);
    const rgbDiff = fromPdf.palette.filter((c, k) => c.rgb.some((v, j) => Math.abs(v - ref.palette[k].rgb[j]) > 2)).map((c) => c.code);
    expect(rgbDiff).toEqual([]);
  }, 120_000);
});
