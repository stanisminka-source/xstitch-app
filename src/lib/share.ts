// Отдать файл пользователю: меню «Поделиться» (iPad — «Сохранить в Файлы», заметки;
// Android — Диск, мессенджеры), а если его нет — обычное скачивание.

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export async function shareFile(name: string, text: string, type = 'text/plain'): Promise<ShareResult> {
  const file = new File([text], name, { type });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
