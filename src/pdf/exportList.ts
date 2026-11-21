// Собрать PDF-список и предложить сохранить или отправить.
import { offerFile } from '../lib/share';
import { t } from '../strings';
import type { PdfList } from './listPdf';

export async function exportListPdf(list: PdfList, name: string): Promise<void> {
  const { buildListPdf } = await import('./listPdf');
  const bytes = await buildListPdf(list);
  offerFile(bytes as Uint8Array<ArrayBuffer>, name, 'application/pdf', { title: t.fileReady, hint: t.fileHint, save: t.fileSave, share: t.fileShare, close: t.close });
}
