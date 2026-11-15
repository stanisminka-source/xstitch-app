// Все строки интерфейса. Позже рядом появится en.
export const ru = {
  appName: 'Вышивка',
  tagline: 'Схемы для вышивки крестом',
  stageNote: 'Это пустой каркас приложения (этап 0). Схемы появятся на этапе 1.',
  statusTitle: 'Состояние',
  offlineReady: 'Работает без интернета',
  offlinePreparing: 'Готовится к работе без интернета…',
  offlineUnsupported: 'Этот браузер не поддерживает работу без интернета',
  networkOnline: 'Сеть: есть',
  networkOffline: 'Сеть: нет (авиарежим)',
  storagePersistent: 'Хранилище: постоянное',
  storageBestEffort: 'Хранилище: обычное (браузер может очистить при нехватке места)',
  storageUnknown: 'Хранилище: проверяется…',
  installed: 'Открыто как приложение с главного экрана',
  inBrowser: 'Открыто во вкладке браузера',
  updateAvailable: 'Есть новая версия',
  updateButton: 'Обновить',
  version: 'Версия',
} as const;

export type Strings = typeof ru;
export const t: Strings = ru;
