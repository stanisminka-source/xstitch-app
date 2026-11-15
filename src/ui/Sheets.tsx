import { useEffect, useState } from 'preact/hooks';
import type { AppEnv } from '../App';
import { css, inkOf } from '../lib/color';
import type { PaletteColor } from '../pattern/format';
import { db } from '../store/db';
import type { GridMode, Settings, ThreadSort, ViewMode } from '../store/settings';
import { plural, t } from '../strings';
import { Icon } from './Icon';

export type SheetName = 'view' | 'grid' | 'threads' | 'more';

const MODES: ViewMode[] = ['colorSymbol', 'color', 'symbol', 'coloredSymbol', 'selectedOnly', 'stitched'];

/** Маленькая картинка 3×3 для каждого режима. */
function ModePreview({ mode }: { mode: ViewMode }) {
  const cols = ['#8f86c9', '#2a2a2a', '#c9a86a', '#2a2a2a', '#7e9a62', '#8f86c9', '#c9a86a', '#2a2a2a', '#8f86c9'];
  const syms = ['○', '◆', 'A', '◆', 'G', '○', 'A', '◆', '○'];
  return (
    <div class={`mp mp-${mode}`}>
      {cols.map((c, i) => {
        const sel = c === '#2a2a2a';
        let bg = '#fff';
        let fg = 'transparent';
        if (mode === 'colorSymbol') { bg = c; fg = inkOf(hex(c)); }
        if (mode === 'color') bg = c;
        if (mode === 'symbol') fg = '#1d1b18';
        if (mode === 'coloredSymbol') fg = c;
        if (mode === 'selectedOnly') { if (sel) { bg = c; fg = '#fff'; } }
        if (mode === 'stitched') { bg = '#f3efe6'; fg = c; }
        return (
          <span key={i} style={{ background: bg, color: fg}}>
            {mode === 'stitched' ? '×' : syms[i]}
          </span>
        );
      })}
    </div>
  );
}

function hex(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function ViewSheet({ value, onChange }: { value: ViewMode; onChange(m: ViewMode): void }) {
  return (
    <div class="sheet row-sheet">
      {MODES.map((m) => (
        <button key={m} class={`opt${m === value ? ' on' : ''}`} onClick={() => onChange(m)}>
          <ModePreview mode={m} />
          <span>{t.modes[m]}</span>
        </button>
      ))}
    </div>
  );
}

export function GridSheet({ value, onChange }: { value: GridMode; onChange(m: GridMode): void }) {
  const items: GridMode[] = ['strong', 'soft', 'off'];
  return (
    <div class="sheet row-sheet">
      {items.map((m) => (
        <button key={m} class={`opt${m === value ? ' on' : ''}`} onClick={() => onChange(m)}>
          <div class={`gp gp-${m}`} />
          <span>{t.grid[m]}</span>
        </button>
      ))}
    </div>
  );
}

interface ThreadsProps {
  palette: PaletteColor[];
  symbols: string[];
  order: number[];
  selected: number | null;
  sort: ThreadSort;
  onSort(s: ThreadSort): void;
  onPick(k: number | null): void;
  onClose(): void;
}

export function ThreadsSheet(p: ThreadsProps) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const rows = p.order.filter((k) => !query || p.palette[k].code.toLowerCase().includes(query));
  return (
    <div class="sheet tall">
      <div class="sheet-head">
        <input
          type="search"
          inputMode="text"
          placeholder={t.search}
          value={q}
          onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
        />
        <button class="seg" onClick={() => p.onSort(p.sort === 'code' ? 'count' : 'code')}>
          <Icon name="sort" /> {p.sort === 'code' ? t.sortCode : t.sortCount}
        </button>
        <button class="icon-btn" onClick={p.onClose} aria-label={t.close}>
          <Icon name="x" />
        </button>
      </div>
      <div class="thread-list">
        {rows.map((k) => {
          const c = p.palette[k];
          return (
            <button key={k} class={`thread${k === p.selected ? ' on' : ''}`} onClick={() => p.onPick(k === p.selected ? null : k)}>
              <span class="sw" style={{ background: css(c.rgb), color: inkOf(c.rgb) }}>{p.symbols[k]}</span>
              <span class="code">{c.code}</span>
              <span class="name">{c.name}</span>
              <span class="count">{plural(c.count)} {t.crosses}</span>
            </button>
          );
        })}
        {!rows.length && <p class="muted pad">{t.nothingFound}</p>}
      </div>
    </div>
  );
}

interface MoreProps {
  settings: Settings;
  env: AppEnv;
  currentId: string;
  onSettings(patch: Partial<Settings>): void;
  onImport(): void;
  onOpen(id: string): void;
  onDelete(id: string): void;
  onClose(): void;
}

export function MoreSheet(p: MoreProps) {
  const [list, setList] = useState<{ id: string; title: string; width: number; height: number }[]>([]);
  const refresh = () => db.listPatterns().then(setList);
  useEffect(() => {
    refresh();
  }, []);
  const s = p.settings;
  return (
    <div class="sheet tall">
      <div class="sheet-head">
        <b class="grow">{t.tabMore}</b>
        <button class="icon-btn" onClick={p.onClose} aria-label={t.close}>
          <Icon name="x" />
        </button>
      </div>
      <div class="more">
        <section>
          <h3>{t.patterns}</h3>
          {list.map((x) => (
            <div key={x.id} class={`pat${x.id === p.currentId ? ' on' : ''}`}>
              <button class="pat-open" onClick={() => p.onOpen(x.id)}>
                <span class="pat-title">{x.title}</span>
                <span class="muted">{x.width} × {x.height}</span>
              </button>
              <button
                class="icon-btn"
                aria-label={t.deletePattern}
                onClick={async () => {
                  if (confirm(t.deleteConfirm(x.title))) {
                    await p.onDelete(x.id);
                    refresh();
                  }
                }}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
          <button class="primary" onClick={p.onImport}>
            <Icon name="upload" /> {t.importButton}
          </button>
        </section>

        <section>
          <h3>{t.theme}</h3>
          <div class="segs">
            {(['system', 'light', 'dark'] as const).map((th) => (
              <button key={th} class={`seg${s.theme === th ? ' on' : ''}`} onClick={() => p.onSettings({ theme: th })}>
                {t.themes[th]}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>
            {t.dim}: {Math.round(s.dim * 100)}%
          </h3>
          <input
            type="range"
            min="0"
            max="0.9"
            step="0.05"
            value={s.dim}
            onInput={(e) => p.onSettings({ dim: Number((e.currentTarget as HTMLInputElement).value) })}
          />
        </section>

        <section>
          <label class="switch">
            <input type="checkbox" checked={s.wakeLock} onChange={(e) => p.onSettings({ wakeLock: (e.currentTarget as HTMLInputElement).checked })} />
            <span>{t.wakeLock}</span>
          </label>
        </section>

        <section class="muted small">
          <p>{p.env.offlineReady ? `✓ ${t.offlineReady}` : t.offlinePreparing}</p>
          <p>
            {t.storage}: {p.env.persisted ? t.storagePersistent : t.storageBestEffort}
          </p>
          <p>
            {t.version} {__APP_VERSION__}
          </p>
        </section>
      </div>
    </div>
  );
}
