// PDF из конструктора схем (отдельный закрытый проект рядом с этим): в него вложен файл схемы.
// Образцы делает команда «npm run sample» в папке конструктора. Если их нет — тест пропускается.
// Папку можно указать переменной XSTITCH_MAKER_SAMPLE.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePattern } from '../src/pattern/format';
import { patternFromPdf } from '../src/pattern/pdf';

const DIR = process.env.XSTITCH_MAKER_SAMPLE ?? join(__dirname, '../../xstitch-maker/sample');
const REF = join(DIR, 'domik-kontur.pattern.json');
const PDFS = ['domik-kontur.pdf', 'domik-kontur-en-color.pdf'].map((f) => join(DIR, f));
const have = existsSync(REF) && PDFS.every((f) => existsSync(f));

describe.skipIf(!have)('PDF из конструктора схем', () => {
  for (const file of PDFS) {
    it(`${file.split('/').pop()} открывается той же схемой, что и файл .pattern.json`, async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
      const fromPdf = parsePattern(await patternFromPdf(doc as never, pdfjs.OPS as never));
      const ref = parsePattern(JSON.parse(readFileSync(REF, 'utf8')));
      expect(fromPdf).toEqual(ref);
      expect(fromPdf.backstitch.length).toBeGreaterThan(0);
      expect(fromPdf.sheets?.length).toBeGreaterThan(1);
    });
  }
});
