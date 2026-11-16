// Загрузка PDF в браузере. Этот файл (и pdf.js) подгружается только когда выбран PDF,
// но заранее кладётся в офлайн-кэш — так PDF открывается и без интернета.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { patternFromPdf, type PdfOps, type PdfParseProgress } from './pdf';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function loadPdfPattern(data: ArrayBuffer, onProgress?: PdfParseProgress): Promise<Record<string, unknown>> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    return await patternFromPdf(doc as never, pdfjs.OPS as unknown as PdfOps, onProgress);
  } finally {
    task.destroy();
  }
}
