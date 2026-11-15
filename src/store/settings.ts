export type ViewMode = 'colorSymbol' | 'color' | 'symbol' | 'coloredSymbol' | 'selectedOnly' | 'stitched';
export type GridMode = 'strong' | 'soft' | 'off';
export type Theme = 'system' | 'light' | 'dark';
export type ThreadSort = 'code' | 'count';
/** Как показывать вышитое: проявлять цветом, приглушать или не показывать. */
export type ProgressMode = 'reveal' | 'fade' | 'off';
export const PROGRESS_MODES: ProgressMode[] = ['reveal', 'fade', 'off'];

export interface Settings {
  mode: ViewMode;
  grid: GridMode;
  theme: Theme;
  /** Насколько бледнеют невыделенные клетки: 0 — не бледнеют, 1 — исчезают. */
  dim: number;
  wakeLock: boolean;
  threadSort: ThreadSort;
  progress: ProgressMode;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'colorSymbol',
  grid: 'strong',
  theme: 'system',
  dim: 0.7,
  wakeLock: true,
  threadSort: 'code',
  progress: 'reveal',
};

export function normalizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(typeof raw === 'object' && raw ? raw : {}) } as Settings;
  if (!(s.dim >= 0 && s.dim <= 0.95)) s.dim = DEFAULT_SETTINGS.dim;
  if (!PROGRESS_MODES.includes(s.progress)) s.progress = DEFAULT_SETTINGS.progress;
  return s;
}
