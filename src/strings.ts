// Все строки интерфейса. Позже рядом появится en.
export const ru = {
  appName: 'Smile & Stitch',
  tagline: 'Схемы для вышивки крестом',

  // загрузка схемы
  emptyTitle: 'Загрузите первую схему',
  emptyText: 'Файл схемы в формате .json хранится только на этом устройстве.',
  importButton: 'Загрузить схему',
  importing: 'Загружаю схему…',
  importError: 'Не получилось загрузить схему',
  loading: 'Открываю схему…',

  // шапка
  totalDone: 'Вышито',
  menu: 'Мои схемы',

  // плашка нити
  left: 'осталось',
  nearby: 'рядом',
  nearbyTitle: 'Перейти к ближайшему участку этого цвета',
  allVisible: 'Все участки этого цвета уже на экране',
  colorDone: 'Этот цвет вышит полностью 🎉',
  allDone: 'вышито полностью',

  // нижняя панель
  tabView: 'Вид',
  tabGrid: 'Сетка',
  tabMark: 'Отметить',
  tabThreads: 'Нитки',
  tabMore: 'Ещё',
  markHint: 'Ведите пальцем по вышитому. Двигать схему — двумя пальцами',
  toolBrush: 'Кисть',
  toolSquare: '10×10',
  toolErase: 'Ластик',
  undo: 'Отменить',
  redo: 'Вернуть',
  progressTitle: 'Вышитое:',
  progressModes: { reveal: 'Проявлять', fade: 'Приглушать', off: 'Не показывать' },

  modes: {
    colorSymbol: 'Цвет и символ',
    color: 'Только цвет',
    symbol: 'Символы',
    coloredSymbol: 'Цветные символы',
    selectedOnly: 'Только выбранный',
    stitched: 'Вышитый вид',
  },
  selectedOnlyHint: 'Выберите нить — останутся только её клетки',
  grid: { strong: 'Контрастная', soft: 'Бледная', off: 'Без сетки' },

  // нитки
  threadsTitle: 'Нитки',
  search: 'Номер DMC',
  sortCode: 'По номеру',
  sortCount: 'По количеству',
  crosses: 'кр.',
  of: 'из',
  done: 'вышито',
  nothingFound: 'Такого номера в схеме нет',

  // ещё
  theme: 'Тема',
  themes: { system: 'Как в системе', light: 'Светлая', dark: 'Тёмная' },
  dim: 'Приглушение остальных цветов',
  wakeLock: 'Экран не гаснет',
  patterns: 'Мои схемы',
  deletePattern: 'Удалить',
  deleteConfirm: (title: string) => `Удалить схему «${title}» с устройства? Это нельзя отменить.`,
  storage: 'Хранилище',
  storagePersistent: 'постоянное',
  storageBestEffort: 'обычное — браузер может очистить при нехватке места',
  offlineReady: 'Работает без интернета',
  offlinePreparing: 'Готовится к работе без интернета…',
  updateAvailable: 'Есть новая версия',
  updateButton: 'Обновить',
  version: 'Версия',
  close: 'Закрыть',
} as const;

export type Strings = typeof ru;
export const t: Strings = ru;

export function plural(n: number): string {
  return n.toLocaleString('ru-RU');
}
