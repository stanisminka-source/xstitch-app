import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AppEnv } from '../App';
import { css, inkOf } from '../lib/color';
import { byDistance, findRegions, type Region } from '../pattern/regions';
import { assignSymbols } from '../pattern/symbols';
import { db, type StoredPattern } from '../store/db';
import type { Settings } from '../store/settings';
import { plural, t } from '../strings';
import { animateTo, attachGestures } from '../view/gestures';
import { RULER, SchemeRenderer } from '../view/renderer';
import type { ViewState } from '../view/viewport';
import { useWakeLock } from './wakeLock';
import { GridSheet, MoreSheet, ThreadsSheet, ViewSheet, type SheetName } from './Sheets';
import { Icon } from './Icon';

interface Props {
  stored: StoredPattern;
  settings: Settings;
  dark: boolean;
  env: AppEnv;
  onSettings(patch: Partial<Settings>): void;
  onImport(): void;
  onOpen(id: string): void;
  onDelete(id: string): void;
}

export function Viewer({ stored, settings, dark, env, onSettings, onImport, onOpen, onDelete }: Props) {
  const { pattern, id } = stored;
  const palette = pattern.palette;
  const symbols = useMemo(() => assignSymbols(palette.map((c) => c.count)), [pattern]);
  const [selected, setSelected] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const rRef = useRef<SchemeRenderer | null>(null);
  const regions = useRef(new Map<number, Region[]>());
  const nearbyState = useRef<{ color: number; list: Region[]; i: number } | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useWakeLock(settings.wakeLock);

  const style = { mode: settings.mode, grid: settings.grid, dim: settings.dim, selected, dark };

  // Создаём отрисовщик, восстанавливаем место и выбранную нить.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const r = new SchemeRenderer(canvas, pattern, symbols, style);
    rRef.current = r;
    let restored: ViewState | undefined;
    let ready = false;
    let saveTimer = 0;

    const ro = new ResizeObserver(() => {
      const b = wrap.getBoundingClientRect();
      r.resize(b.width, b.height);
      if (restored && !ready) r.vp.setView(restored);
      ready = true;
    });

    Promise.all([db.get<ViewState>(`view:${id}`), db.get<number>(`sel:${id}`)]).then(([v, sel]) => {
      restored = v;
      if (v && ready) {
        r.vp.setView(v);
        r.invalidate();
      }
      if (typeof sel === 'number' && sel >= 0 && sel < palette.length) setSelected(sel);
      ro.observe(wrap);
    });

    r.onViewChange = () => {
      drawMinimap(r, miniRef.current);
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => db.set(`view:${id}`, r.vp.getView()), 400);
    };

    const detach = attachGestures(canvas, r, {
      onTap: (px, py) => {
        const hit = r.hit(px, py);
        setSheet((s) => (s === 'threads' || s === 'more' ? null : s));
        if (!hit || hit.color < 0) return;
        choose(hit.color === selectedRef.current ? null : hit.color);
      },
      onUserMove: () => {
        nearbyState.current = null;
      },
    });

    return () => {
      ro.disconnect();
      detach();
      r.destroy();
      clearTimeout(saveTimer);
    };
  }, []);

  useEffect(() => {
    rRef.current?.setStyle(style);
  }, [settings.mode, settings.grid, settings.dim, selected, dark]);

  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(tm);
  }, [toast]);

  const choose = (k: number | null) => {
    setSelected(k);
    nearbyState.current = null;
    db.set(`sel:${id}`, k ?? -1);
  };

  const goNearby = () => {
    const r = rRef.current;
    if (!r || selected === null) return;
    let list = regions.current.get(selected);
    if (!list) {
      list = findRegions(r.idx, pattern.width, pattern.height, selected);
      regions.current.set(selected, list);
    }
    if (!list.length) return;
    let st = nearbyState.current;
    if (!st || st.color !== selected) {
      const c = r.vp.center();
      const sorted = byDistance(list, c.cx, c.cy);
      // пропускаем участки, которые и так в середине экрана
      const v = r.vp.visible();
      const mx = (v.x1 - v.x0) * 0.2;
      const my = (v.y1 - v.y0) * 0.2;
      const inView = (g: Region) => g.cx > v.x0 + mx && g.cx < v.x1 - mx && g.cy > v.y0 + my && g.cy < v.y1 - my;
      const i = sorted.findIndex((g) => !inView(g));
      if (i < 0) {
        setToast(t.allVisible);
        const g = sorted[0];
        r.flash(g.x0, g.y0, g.x1, g.y1);
        return;
      }
      st = { color: selected, list: sorted, i };
    } else {
      st = { ...st, i: (st.i + 1) % st.list.length };
    }
    nearbyState.current = st;
    const g = st.list[st.i];
    const s = Math.max(r.vp.s, 18);
    animateTo(r, g.cx, g.cy, s).then(() => {
      r.flash(g.x0, g.y0, g.x1, g.y1);
      nearbyState.current = st;
    });
  };

  const sel = selected !== null ? palette[selected] : null;
  const order = useMemo(() => {
    const idx = palette.map((_, i) => i);
    if (settings.threadSort === 'count') return idx.sort((a, b) => palette[b].count - palette[a].count);
    return idx.sort((a, b) => codeKey(palette[a].code) - codeKey(palette[b].code) || palette[a].code.localeCompare(palette[b].code));
  }, [palette, settings.threadSort]);

  const toggleSheet = (s: SheetName) => setSheet((cur) => (cur === s ? null : s));

  return (
    <div class="viewer">
      <header class="topbar">
        <div class="title" title={pattern.title}>{pattern.title}</div>
        <span class="pill">{t.totalDone} 0%</span>
        {sel && <span class="pill accent">{sel.code} · 0%</span>}
      </header>

      <div class="stage" ref={wrapRef}>
        <canvas ref={canvasRef} class="scheme" />
        <canvas
          ref={miniRef}
          class="minimap"
          style={{ top: `${RULER + 8}px` }}
          onPointerDown={(e) => miniJump(e, rRef.current)}
          onPointerMove={(e) => e.buttons && miniJump(e, rRef.current)}
        />
        {settings.mode === 'selectedOnly' && selected === null && <div class="hint">{t.selectedOnlyHint}</div>}
        {sheet === 'view' && <ViewSheet value={settings.mode} onChange={(mode) => onSettings({ mode })} />}
        {sheet === 'grid' && <GridSheet value={settings.grid} onChange={(grid) => onSettings({ grid })} />}
        {sheet === 'threads' && (
          <ThreadsSheet
            palette={palette}
            symbols={symbols}
            order={order}
            selected={selected}
            sort={settings.threadSort}
            onSort={(threadSort) => onSettings({ threadSort })}
            onPick={(k) => {
              choose(k);
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'more' && (
          <MoreSheet
            settings={settings}
            env={env}
            currentId={id}
            onSettings={onSettings}
            onImport={onImport}
            onOpen={(pid) => {
              setSheet(null);
              onOpen(pid);
            }}
            onDelete={onDelete}
            onClose={() => setSheet(null)}
          />
        )}
        {toast && <div class="toast">{toast}</div>}
      </div>

      <footer class="bottom">
        {sel && selected !== null && (
          <div class="threadbar">
            <span class="sw" style={{ background: css(sel.rgb), color: inkOf(sel.rgb) }}>{symbols[selected]}</span>
            <span class="tb-text" title={sel.name}>
              <b>{sel.code}</b> · {t.left} {plural(sel.count)}
            </span>
            <button class="primary small" onClick={goNearby} title={t.nearbyTitle}>
              <Icon name="target" /> {t.nearby}
            </button>
          </div>
        )}
        <Strip palette={palette} order={order} selected={selected} onPick={(k) => choose(k === selected ? null : k)} />
        <nav class="toolbar">
          <ToolButton icon="eye" label={t.tabView} active={sheet === 'view'} onClick={() => toggleSheet('view')} />
          <ToolButton icon="grid" label={t.tabGrid} active={sheet === 'grid'} onClick={() => toggleSheet('grid')} />
          <ToolButton icon="pencil" label={t.tabMark} active={false} onClick={() => setToast(t.markLater)} />
          <ToolButton icon="list" label={t.tabThreads} active={sheet === 'threads'} onClick={() => toggleSheet('threads')} />
          <ToolButton icon="dots" label={t.tabMore} active={sheet === 'more'} onClick={() => toggleSheet('more')} />
        </nav>
      </footer>
    </div>
  );
}

function codeKey(code: string): number {
  const n = parseInt(code, 10);
  return Number.isNaN(n) ? -1 : n;
}

function ToolButton(p: { icon: string; label: string; active: boolean; onClick(): void }) {
  return (
    <button class={`tool${p.active ? ' active' : ''}`} onClick={p.onClick} aria-pressed={p.active}>
      <Icon name={p.icon} size={22} />
      <span>{p.label}</span>
    </button>
  );
}

function Strip(p: { palette: StoredPattern['pattern']['palette']; order: number[]; selected: number | null; onPick(k: number): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (p.selected === null) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-k="${p.selected}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [p.selected]);
  return (
    <div class="strip" ref={ref}>
      {p.order.map((k) => {
        const c = p.palette[k];
        return (
          <button key={k} data-k={k} class={`chip${k === p.selected ? ' on' : ''}`} onClick={() => p.onPick(k)} title={`${c.code} ${c.name}`}>
            <span class="sw" style={{ background: css(c.rgb) }} />
            <span class="code">{c.code}</span>
          </button>
        );
      })}
    </div>
  );
}

function drawMinimap(r: SchemeRenderer, mini: HTMLCanvasElement | null): void {
  if (!mini) return;
  const vp = r.vp;
  if (vp.showsAll()) {
    if (mini.style.display !== 'none') mini.style.display = 'none';
    return;
  }
  mini.style.display = 'block';
  const W = r.pattern.width;
  const H = r.pattern.height;
  const cssW = 64;
  const cssH = Math.round((cssW * H) / W);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (mini.width !== cssW * dpr) {
    mini.width = cssW * dpr;
    mini.height = cssH * dpr;
    mini.style.width = `${cssW}px`;
    mini.style.height = `${cssH}px`;
  }
  const g = mini.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(r.flatImage(), 0, 0, cssW, cssH);
  const v = vp.visible();
  const k = cssW / W;
  g.strokeStyle = '#e0761c';
  g.lineWidth = 2;
  g.strokeRect(v.x0 * k, v.y0 * k, Math.max(3, (v.x1 - v.x0) * k), Math.max(3, (v.y1 - v.y0) * k));
}

function miniJump(e: PointerEvent, r: SchemeRenderer | null): void {
  if (!r) return;
  e.stopPropagation();
  const el = e.currentTarget as HTMLCanvasElement;
  const b = el.getBoundingClientRect();
  const cx = ((e.clientX - b.left) / b.width) * r.pattern.width;
  const cy = ((e.clientY - b.top) / b.height) * r.pattern.height;
  r.vp.setView({ cx, cy, s: r.vp.s });
  r.invalidate();
}
