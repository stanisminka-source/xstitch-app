// Список ниток в PDF (A4): квадратик для отметки, цвет, номер, название, мотки.
// pdf-lib и шрифт подгружаются только когда нужен файл и лежат в офлайн-кэше.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export interface PdfListRow {
  code: string;
  name: string;
  rgb: [number, number, number] | null;
  /** Правые колонки, например «2 мот.», «есть 1». */
  cells: string[];
}

export interface PdfList {
  heading: string;
  lines: string[];
  columns: string[];
  rows: PdfListRow[];
  total: string;
  footer: string;
}

let fontCache: Promise<[ArrayBuffer, ArrayBuffer]> | null = null;
function fonts() {
  const base = import.meta.env.BASE_URL;
  const get = (f: string) =>
    fetch(`${base}fonts/${f}`).then((r) => {
      if (!r.ok) throw new Error('Не нашёлся шрифт для PDF.');
      return r.arrayBuffer();
    });
  fontCache ??= Promise.all([get('DejaVuSans.ttf'), get('DejaVuSans-Bold.ttf')]);
  fontCache.catch(() => (fontCache = null));
  return fontCache;
}

const W = 595.28;
const H = 841.89;
const M = 40;
const INK = rgb(0.14, 0.13, 0.12);
const MUTED = rgb(0.45, 0.42, 0.38);
const LINE = rgb(0.85, 0.83, 0.8);

/** Обрезать строку, чтобы влезла в ширину. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let s = text;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > width) s = s.slice(0, -1);
  return s + '…';
}

export async function buildListPdf(list: PdfList, fontData?: [ArrayBuffer, ArrayBuffer]): Promise<Uint8Array> {
  const [regular, boldData] = fontData ?? (await fonts());
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regular, { subset: true });
  const bold = await doc.embedFont(boldData, { subset: true });
  doc.setTitle(list.heading);
  doc.setCreator('Smile & Stitch');

  const rowH = 22;
  const colW = 78; // ширина правой колонки
  const right = W - M;
  const nameX = M + 22 + 26 + 52;
  const nameW = right - list.columns.length * colW - nameX - 8;
  let page: PDFPage;
  let y = 0;
  let pageNo = 0;

  const header = (first: boolean) => {
    page = doc.addPage([W, H]);
    pageNo++;
    y = H - M;
    if (first) {
      page.drawText(list.heading, { x: M, y: y - 18, size: 18, font: bold, color: INK });
      y -= 30;
      for (const l of list.lines) {
        page.drawText(fit(l, font, 10.5, right - M), { x: M, y: y - 12, size: 10.5, font, color: MUTED });
        y -= 16;
      }
      y -= 8;
    }
    // шапка таблицы
    page.drawText('DMC', { x: M + 48, y: y - 12, size: 9, font: bold, color: MUTED });
    page.drawText('Название', { x: nameX, y: y - 12, size: 9, font: bold, color: MUTED });
    list.columns.forEach((c, i) => {
      const x = right - (list.columns.length - i) * colW;
      page.drawText(c, { x: x + colW - bold.widthOfTextAtSize(c, 9), y: y - 12, size: 9, font: bold, color: MUTED });
    });
    y -= 18;
    page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.8, color: LINE });
  };
  const footer = () => {
    const f = `${list.footer} · ${pageNo}`;
    page.drawText(f, { x: right - font.widthOfTextAtSize(f, 8), y: M - 18, size: 8, font, color: MUTED });
  };

  header(true);
  for (const r of list.rows) {
    if (y - rowH < M + 10) {
      footer();
      header(false);
    }
    const cy = y - rowH / 2;
    // квадратик «купила»
    page!.drawRectangle({ x: M, y: cy - 6, width: 12, height: 12, borderColor: INK, borderWidth: 0.9 });
    // образец цвета
    if (r.rgb) {
      page!.drawRectangle({
        x: M + 22, y: cy - 7, width: 20, height: 14,
        color: rgb(r.rgb[0] / 255, r.rgb[1] / 255, r.rgb[2] / 255), borderColor: LINE, borderWidth: 0.6,
      });
    }
    page!.drawText(r.code, { x: M + 48, y: cy - 4, size: 11, font: bold, color: INK });
    page!.drawText(fit(r.name, font, 10, nameW), { x: nameX, y: cy - 4, size: 10, font, color: INK });
    r.cells.forEach((c, i) => {
      const x = right - (list.columns.length - i) * colW;
      const f = i === r.cells.length - 1 ? bold : font;
      page!.drawText(c, { x: x + colW - f.widthOfTextAtSize(c, 10), y: cy - 4, size: 10, font: f, color: INK });
    });
    y -= rowH;
    page!.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.4, color: LINE });
  }
  y -= 22;
  if (y < M + 10) {
    footer();
    header(false);
    y -= 22;
  }
  page!.drawText(list.total, { x: M, y, size: 12, font: bold, color: INK });
  footer();
  return doc.save();
}
