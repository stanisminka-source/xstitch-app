// PDF со вложенным файлом схемы (так делает конструктор схем) и PDF без него.
// Все PDF собираются прямо в тесте; схема синтетическая, придумана для теста.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { parsePattern, PatternError } from '../src/pattern/format';
import { patternFromPdf, readPatternAttachment } from '../src/pattern/pdf';

const tiny = () => ({
  format: 'xstitch-pattern',
  version: 1,
  title: 'Тест с контуром',
  width: 3,
  height: 2,
  fabric: { type: 'Evenweave 28 over 2', count: 14, color: 'white' },
  strands: 2,
  palette: [
    { id: 0, brand: 'Anchor', code: '403', name: 'Black', symbol: '■', rgb: [0, 0, 0], count: 3 },
    { id: 1, brand: 'Anchor', code: '1', name: 'White', symbol: '○', rgb: [255, 255, 255], count: 1 },
  ],
  cells: [
    [0, 1, -1],
    [0, 0, -1],
  ],
  backstitch: [{ color: 0, x1: 0, y1: 0, x2: 3, y2: 2 }],
  sheets: [
    { page: 3, x: 0, y: 0, w: 2, h: 2 },
    { page: 4, x: 1, y: 0, w: 2, h: 2 },
  ],
});

async function makePdf(attachments: { name: string; text: string }[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText('Hello', { x: 20, y: 100, font: await doc.embedFont(StandardFonts.Helvetica), size: 12 });
  for (const a of attachments) await doc.attach(new TextEncoder().encode(a.text), a.name, { mimeType: 'application/json' });
  return doc.save();
}

async function open(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  return { doc: doc as never, ops: pdfjs.OPS as never };
}

// Первый тест загружает pdf.js с нуля — на медленном сервере GitHub это дольше 5 секунд
describe('PDF с вложенным файлом схемы', { timeout: 30_000 }, () => {
  it('открывается как сама схема — с контуром, листами, канвой и палитрой Anchor', async () => {
    const { doc, ops } = await open(await makePdf([{ name: 'Тест с контуром.pattern.json', text: JSON.stringify(tiny()) }]));
    const p = parsePattern(await patternFromPdf(doc, ops));
    expect(p).toEqual(parsePattern(tiny()));
    expect(p.backstitch).toHaveLength(1);
    expect(p.sheets?.map((s) => s.page)).toEqual([3, 4]);
    expect(p.fabric?.type).toBe('Evenweave 28 over 2');
    expect(p.palette[0].brand).toBe('Anchor');
  });

  it('находит схему среди других вложений и пропускает чужие JSON', async () => {
    const bytes = await makePdf([
      { name: 'readme.txt', text: 'просто текст' },
      { name: 'other.json', text: JSON.stringify({ format: 'something-else' }) },
      { name: 'broken.pattern.json', text: '{не json' },
      { name: 'scheme.json', text: '﻿' + JSON.stringify(tiny()) },
    ]);
    const { doc } = await open(bytes);
    const raw = await readPatternAttachment(doc);
    expect(raw?.title).toBe('Тест с контуром');
  });

  it('без вложения схемы — null, а разбор как PDF Pattern Maker даёт понятную ошибку', async () => {
    for (const att of [[], [{ name: 'notes.json', text: '{"a":1}' }]]) {
      const { doc, ops } = await open(await makePdf(att));
      expect(await readPatternAttachment(doc)).toBeNull();
      const err = await patternFromPdf(doc, ops).catch((e) => e);
      expect(err).toBeInstanceOf(PatternError);
      expect(err.message).toMatch(/не получилось открыть как схему/);
      expect(err.message).toMatch(/Pattern Maker/);
    }
  });
});
