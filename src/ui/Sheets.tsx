import { useEffect, useState } from 'preact/hooks';
import type { AppEnv } from '../App';
import { css, inkOf } from '../lib/color';
import type { PaletteColor } from '../pattern/format';
import { db } from '../store/db';
import { LINES_MODES, PROGRESS_MODES, type GridMode, type LinesMode, type ProgressMode, type Settings, type ThreadSort, type ViewMode } from '../store/settings';
import { plural, t } from '../strings';
import { crossUnits, FABRICS, fabricById, finishedSize, recommendedStrands, skeins, skeinsToBuy, type FabricChoice } from '../pattern/threads';
import { Icon } from './Icon';
import { haveAmount, haveText, listFileName, listText, needToBuy, stashKey, type ListRow, type Stash } from '../store/stash';
import { shareFile, type ShareResult } from '../lib/share';

export type SheetName = 'view' | 'grid' | 'threads' | 'more' | 'progress' | 'area' | 'stash';

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

export function ViewSheet(p: {
  value: ViewMode;
  onChange(m: ViewMode): void;
  progress: ProgressMode;
  onProgress(m: ProgressMode): void;
  /** Переключатель линий — только у схем, где линии есть. */
  hasLines: boolean;
  lines: LinesMode;
  onLines(m: LinesMode): void;
}) {
  return (
    <div class="sheet">
      <div class="row-sheet">
        {MODES.map((m) => (
          <button key={m} class={`opt${m === p.value ? ' on' : ''}`} onClick={() => p.onChange(m)}>
            <ModePreview mode={m} />
            <span>{t.modes[m]}</span>
          </button>
        ))}
      </div>
      <div class="sheet-row">
        <span class="muted small">{t.progressTitle}</span>
        <div class="segs">
          {PROGRESS_MODES.map((m) => (
            <button key={m} class={`seg${m === p.progress ? ' on' : ''}`} onClick={() => p.onProgress(m)}>
              {t.progressModes[m]}
            </button>
          ))}
        </div>
      </div>
      {p.hasLines && (
        <div class="sheet-row">
          <span class="muted small">{t.linesTitle}</span>
          <div class="segs">
            {LINES_MODES.map((m) => (
              <button key={m} class={`seg${m === p.lines ? ' on' : ''}`} onClick={() => p.onLines(m)}>
                {t.linesModes[m]}
              </button>
            ))}
          </div>
        </div>
      )}
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
  /** Полукрестиков каждого цвета. */
  halves: Int32Array;
  order: number[];
  selected: number | null;
  left(k: number): number;
  finished(k: number): boolean;
  fabric: FabricChoice;
  size: { width: number; height: number };
  onFabric(f: FabricChoice): void;
  onArea(): void;
  title: string;
  stash: Stash;
  onStash(): void;
  onShared(r: ShareResult): void;
  sort: ThreadSort;
  onSort(s: ThreadSort): void;
  onPick(k: number | null): void;
  onClose(): void;
}

export function ThreadsSheet(p: ThreadsProps) {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'all' | 'buy'>('all');
  const query = q.trim().toLowerCase();
  const fab = fabricById(p.fabric.fabric);
  const cm = finishedSize(p.size.width, p.size.height, fab.count);
  const toBuy = (k: number) => skeinsToBuy(crossUnits(p.palette[k].count, p.halves[k]), fab.count, p.fabric.strands);
  const total = p.order.reduce((n, k) => n + toBuy(k), 0);
  const have = (k: number) => p.stash[stashKey(p.palette[k].brand, p.palette[k].code)];
  // к покупке: сколько нужно на ещё не вышитое минус то, что уже есть дома
  const needLeft = (k: number) => {
    const c = p.palette[k];
    const left = p.left(k);
    const halvesLeft = c.count ? (p.halves[k] * left) / c.count : 0;
    return skeins(crossUnits(left, halvesLeft), fab.count, p.fabric.strands);
  };
  const buyLeft = (k: number) => needToBuy(needLeft(k), haveAmount(have(k)));
  const shown = mode === 'buy' ? p.order.filter((k) => buyLeft(k) > 0) : p.order;
  const rows = shown.filter((k) => !query || p.palette[k].code.toLowerCase().includes(query));
  const buyTotal = p.order.reduce((n, k) => n + buyLeft(k), 0);
  const buyColors = p.order.filter((k) => buyLeft(k) > 0).length;

  const exportList = async () => {
    const listRows: ListRow[] = shown.map((k) => ({
      code: p.palette[k].code,
      name: p.palette[k].name,
      need: mode === 'buy' ? needLeft(k) : skeins(crossUnits(p.palette[k].count, p.halves[k]), fab.count, p.fabric.strands),
      have: have(k),
      buy: mode === 'buy' ? buyLeft(k) : toBuy(k),
    }));
    const text = listText({
      title: `${t.listPattern}: ${p.title}`,
      heading: mode === 'buy' ? t.listBuyHeading : t.listAllHeading,
      notes: [`${t.fabric}: ${fab.label}, ${t.strands(p.fabric.strands)}`, ...(mode === 'buy' ? [t.listBuyNote] : [])],
      rows: listRows,
      mode,
    });
    p.onShared(await shareFile(listFileName(p.title, mode === 'buy' ? 'покупки' : 'нитки'), text));
  };
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
      <div class="fabric-bar">
        <select
          value={p.fabric.fabric}
          onChange={(e) => {
            const id = (e.currentTarget as HTMLSelectElement).value;
            p.onFabric({ fabric: id, strands: recommendedStrands(fabricById(id).count) });
          }}
          aria-label={t.fabric}
        >
          {FABRICS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        <div class="segs">
          {[1, 2, 3].map((n) => (
            <button key={n} class={`seg${p.fabric.strands === n ? ' on' : ''}`} onClick={() => p.onFabric({ ...p.fabric, strands: n })}>
              {t.strands(n)}
            </button>
          ))}
        </div>
        <p class="muted small fabric-info">
          {t.finished(cm.w.toFixed(1).replace('.', ','), cm.h.toFixed(1).replace('.', ','))} · {t.colorsTotal(p.order.length)} · {t.skeinsTotal(total)}
          {p.fabric.strands !== recommendedStrands(fab.count) && ` · ${t.strandsAdvice(recommendedStrands(fab.count))}`}
        </p>
        <button class="seg area-btn" onClick={p.onArea}>
          <Icon name="area" /> {t.areaOpen}
        </button>
      </div>
      <div class="fabric-bar">
        <div class="segs">
          <button class={`seg${mode === 'all' ? ' on' : ''}`} onClick={() => setMode('all')}>{t.listAll}</button>
          <button class={`seg${mode === 'buy' ? ' on' : ''}`} onClick={() => setMode('buy')}>{t.listBuy}</button>
        </div>
        <button class="seg" onClick={p.onStash}>
          <Icon name="box" /> {t.stashTitle}
        </button>
        <button class="seg" onClick={exportList} disabled={!shown.length}>
          <Icon name="share" /> {t.listExport}
        </button>
        {mode === 'buy' && (
          <p class="small fabric-info">
            {buyColors ? t.buySummary(buyTotal, buyColors) : t.buyNothing}
            {!Object.keys(p.stash).length && ` ${t.buyNoStash}`}
          </p>
        )}
      </div>
      <div class="thread-list">
        {rows.map((k) => {
          const c = p.palette[k];
          return (
            <button key={k} class={`thread${k === p.selected ? ' on' : ''}${p.finished(k) ? ' finished' : ''}`} onClick={() => p.onPick(k === p.selected ? null : k)}>
              <span class="sw" style={{ background: css(c.rgb), color: inkOf(c.rgb) }}>{p.symbols[k]}</span>
              <span class="code">{c.code}</span>
              <span class="name">
                {c.name}
                {have(k) && <span class="have"> · {haveText(have(k))}</span>}
              </span>
              <span class="count">
                {p.finished(k) ? (
                  <>
                    <Icon name="check" size={14} /> {t.done}
                  </>
                ) : p.left(k) < c.count ? (
                  `${t.left} ${plural(p.left(k))} ${t.of} ${plural(c.count)}`
                ) : (
                  `${plural(c.count)} ${t.crosses}${p.halves[k] ? `, ${t.halves(plural(p.halves[k]))}` : ''}`
                )}
              </span>
              <span class="skeins">{t.skeinsShort(mode === 'buy' ? buyLeft(k) : toBuy(k))}</span>
            </button>
          );
        })}
        {!rows.length && <p class="muted pad">{mode === 'buy' && !query ? t.buyNothing : t.nothingFound}</p>}
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
  onProgress(): void;
  onStash(): void;
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
          <h3>{t.progressSection}</h3>
          <button class="seg" onClick={p.onProgress}>
            <Icon name="chart" /> {t.progressOpen}
          </button>
        </section>

        <section>
          <h3>{t.stashTitle}</h3>
          <button class="seg" onClick={p.onStash}>
            <Icon name="box" /> {t.stashOpen}
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
