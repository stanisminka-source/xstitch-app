// Отдать готовый файл: окошко «Файл готов» с двумя кнопками.
// «Сохранить файл» — обычное скачивание (Android — в «Загрузки», iPad — «Файлы» → «Загрузки»),
// «Поделиться» — меню системы (почта, мессенджеры, заметки, Диск).
// Кнопки нажимаются уже после того, как файл собран: браузер разрешает скачивание и меню
// «Поделиться» только сразу после нажатия, а сборка PDF может занять секунду.

/** iPad и iPhone (iPadOS представляется как Mac, но с сенсорным экраном). */
export function isIos(): boolean {
  const n = navigator;
  return /iPad|iPhone|iPod/.test(n.userAgent) || (/Macintosh/.test(n.userAgent) && n.maxTouchPoints > 1);
}

export interface SaveTexts {
  title: string;
  hint: string;
  save: string;
  share: string;
  close: string;
}

export function offerFile(data: BlobPart, name: string, type: string, tx: SaveTexts): void {
  // На iPad PDF с настоящим типом Safari открывает просмотром и сохраняет с чужим окончанием —
  // как «просто данные» он скачивается сразу под нашим именем.
  const ios = isIos();
  const url = URL.createObjectURL(new Blob([data], { type: ios ? 'application/octet-stream' : type }));
  const file = new File([data], name, { type });

  const back = document.createElement('div');
  back.className = 'modal-back';
  const box = document.createElement('div');
  box.className = 'modal';
  const title = document.createElement('b');
  title.textContent = tx.title;
  const fname = document.createElement('p');
  fname.className = 'small';
  fname.textContent = name;
  const hint = document.createElement('p');
  hint.className = 'small muted';
  hint.textContent = tx.hint;
  const row = document.createElement('div');
  row.className = 'modal-row';
  const save = document.createElement('a');
  save.className = 'primary-link';
  save.href = url;
  save.download = name;
  save.textContent = tx.save;
  const done = () => {
    back.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  };
  save.addEventListener('click', () => setTimeout(done, 300));
  row.append(save);
  let canShare = false;
  try {
    canShare = !!navigator.canShare?.({ files: [file] });
  } catch {
    canShare = false;
  }
  if (canShare) {
    const share = document.createElement('button');
    share.className = 'seg';
    share.textContent = tx.share;
    share.addEventListener('click', async () => {
      try {
        await navigator.share({ files: [file], title: name });
        done();
      } catch {
        /* передумали — окошко остаётся */
      }
    });
    row.append(share);
  }
  const close = document.createElement('button');
  close.className = 'seg';
  close.textContent = tx.close;
  close.addEventListener('click', done);
  row.append(close);
  back.addEventListener('click', (e) => e.target === back && done());
  box.append(title, fname, hint, row);
  back.append(box);
  document.body.append(back);
}
