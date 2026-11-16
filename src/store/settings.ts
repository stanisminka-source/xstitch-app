export type ViewMode = 'colorSymbol' | 'color' | 'symbol' | 'coloredSymbol' | 'selectedOnly' | 'stitched';
export type GridMode = 'strong' | 'soft' | 'off';
export type Theme = 'system' | 'light' | 'dark';
export type ThreadSort = 'code' | 'count';
/** Как показывать вышитое: проявлять цветом, приглушать или не показывать. */
export type ProgressMode = 'reveal' | 'fade' | 'off';
export const PROGRESS_MODES: ProgressMode[] = ['reveal', 'fade', 'off'];
/** Линии (бэкстич): не показывать, показывать или ярко — поверх приглушённой схемы. */
export type LinesMode = 'off' | 'on' | 'bright';
export const LINES_MODES: LinesMode[] = ['off', 'on', 'bright'];

export interface Settings {
  mode: ViewMode;
  grid: GridMode;
  theme: Theme;
  /** Насколько бледнеют невыделенные клетки: 0 — не бледнеют, 1 — исчезают. */
  dim: number;
  wakeLock: boolean;
  threadSort: ThreadSort;
  progress: ProgressMode;
  lines: LinesMode;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'colorSymbol',
  grid: 'strong',
  theme: 'system',
  dim: 0.7,
  wakeLock: true,
  threadSort: 'code',
  progress: 'reveal',
  lines: 'on',
};

export function normalizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(typeof raw === 'object' && raw ? raw : {}) } as Settings;
  if (!(s.dim >= 0 && s.dim <= 0.95)) s.dim = DEFAULT_SETTINGS.dim;
  if (!PROGRESS_MODES.includes(s.progress)) s.progress = DEFAULT_SETTINGS.progress;
  if (!LINES_MODES.includes(s.lines)) s.lines = DEFAULT_SETTINGS.lines;
  return s;
}
