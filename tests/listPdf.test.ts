// PDF-список собирается и читается обратно — с русским текстом и несколькими страницами.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildListPdf } from '../src/pdf/listPdf';

const font = (f: string) => {
  const b = readFileSync(`public/fonts/${f}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('PDF со списком ниток', () => {
  it('длинный список — несколько страниц, текст читается', async () => {
    const rows = Array.from({ length: 70 }, (_, i) => ({ code: String(150 + i), name: `Нитка №${i} — очень длинное название, чтобы обрезалось`, rgb: [i * 3, 100, 200] as [number, number, number], cells: [`${(i % 3) + 1} мот.`] }));
    const bytes = await buildListPdf(
      { heading: 'Нитки к покупке', lines: ['Схема: Замок', 'Канва: Аида 18, 2 нити'], columns: ['Купить'], rows, total: 'Итого купить: 140 мот.', footer: 'Smile & Stitch' },
      [font('DejaVuSans.ttf'), font('DejaVuSans-Bold.ttf')],
    );
    expect(bytes.length).toBeGreaterThan(5000);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
    expect(doc.numPages).toBe(3);
    const first = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
    expect(first).toContain('Нитки к покупке');
    expect(first).toContain('Канва: Аида 18');
    const last = (await (await doc.getPage(3)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
    expect(last).toContain('Итого купить: 140 мот.');
  });
});
