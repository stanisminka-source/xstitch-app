import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AppEnv } from '../App';
import { css, inkOf } from '../lib/color';
import { byDistance, findRegions, type Region } from '../pattern/regions';
import { assignSymbols } from '../pattern/symbols';
import type { Pattern } from '../pattern/format';
import type { RGB } from '../lib/color';
import { dmcThread } from '../pattern/catalog';
import { colorChecks, type Subs } from '../pattern/subs';
import { ColorsSheet } from './ColorsSheet';
import { db, type StoredPattern } from '../store/db';
import { blockCells, lineCells, patchCells, percent, Progress, type Op } from '../progress/progress';
import { BackupError, backupFileName, emptyMeta, logDelta, makeBackup, mergeDays, normalizeMeta, readBackup, REMIND_EVERY, type Meta } from '../progress/backup';
import { ProgressSheet } from './ProgressSheet';
import { AreaSheet } from './AreaSheet';
import { StashSheet } from './StashSheet';
import { normalizeStash, type Stash } from '../store/stash';
import { applyShop, normalizeShop, startShop, type ShopSession } from '../store/shop';
import type { ListRow } from '../store/stash';
import { ShopSheet } from './ShopSheet';
import { OrganizerSheet } from './OrganizerSheet';
import { normalizeOrganizer, normalizeSlots, type Organizer, type OrgSource } from '../pattern/organizer';
import { areaCounts, areaMask, compareCodes, defaultChoice, halvesByColor, sheetsOf, snapRect, type FabricChoice, type Rect } from '../pattern/threads';

/** Что выбрано для расчёта ниток: целые листы и обведённые участки, в порядке добавления. */
type AreaItem = { kind: 'sheet'; page: number } | { kind: 'rect'; rect: Rect };
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
  /** Схема до замен ниток (по ней — символы, чтобы они не менялись от замен). */
  base: Pattern;
  subs: Subs;
  onSubs(s: Subs, reopen: SheetName | null): void;
  initialSheet: SheetName | null;
}

export function Viewer({ stored, settings, dark, env, onSettings, onImport, onOpen, onDelete, base, subs, onSubs, initialSheet }: Props) {
  const { pattern, id } = stored;
  const rawPalette = pattern.palette;
  // предпросмотр замены: клетки цвета k показываем цветом нитки to
  const [preview, setPreview] = useState<{ k: number; to: string } | null>(null);
  const shownRgb = useMemo(
    () =>
      rawPalette.map((c, k): RGB => {
        if (preview?.k === k) return dmcThread(preview.to)?.rgb ?? c.rgb;
        if (settings.colors === 'thread') return dmcThread(c.code)?.rgb ?? c.rgb;
        return c.rgb;
      }),
    [rawPalette, settings.colors, preview],
  );
  const palette = useMemo(
    () => rawPalette.map((c, k) => (shownRgb[k] === c.rgb ? c : { ...c, rgb: [shownRgb[k][0], shownRgb[k][1], shownRgb[k][2]] as [number, number, number] })),
    [rawPalette, shownRgb],
  );
  const checks = useMemo(() => colorChecks(rawPalette), [rawPalette]);
  const symbols = useMemo(() => assignSymbols(base.palette.map((c) => c.count)), [base]);
  const [selected, setSelected] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetName | null>(initialSheet);
  const [toast, setToast] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const rRef = useRef<SchemeRenderer | null>(null);
  const regions = useRef(new Map<number, Region[]>());
  const nearbyState = useRef<{ color: number; list: Region[]; i: number } | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [marking, setMarking] = useState(false);
  const [tool, setTool] = useState<'brush' | 'square'>('brush');
  const [erase, setErase] = useState(false);
  const markRef = useRef({ marking, tool, erase });
  markRef.current = { marking, tool, erase };
  const [, setTick] = useState(0);
  const progRef = useRef<Progress | null>(null);
  /** После любого изменения отметок: журнал, сохранение, обновление экрана. */
  const afterChange = useRef<() => void>(() => {});
  /** Записать отметки и журнал на устройство прямо сейчас. */
  const saveNow = useRef<() => void>(() => {});
  /** После загрузки копии: новое число вышитого не попадает в журнал за сегодня. */
  const resetLogged = useRef<() => void>(() => {});
  const metaRef = useRef<Meta>(emptyMeta());
  const backupInput = useRef<HTMLInputElement>(null);

  // ——— канва и участок для расчёта ниток ———
  const [fabric, setFabric] = useState<FabricChoice>(() => defaultChoice(pattern));
  // ——— мои нитки (общие для всех схем) ———
  const [stash, setStash] = useState<Stash>({});
  useEffect(() => {
    db.get('stash').then((v) => setStash(normalizeStash(v)));
  }, []);
  const updateStash = (s: Stash) => {
    setStash(s);
    db.set('stash', s);
  };
  // ——— «пока не покупать редкие нитки»: порог общий для всех схем ———
  const [minCrosses, setMinCrosses] = useState(0);
  useEffect(() => {
    db.get('minCrosses').then((v) => {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= 300) setMinCrosses(n);
    });
  }, []);
  const updateMinCrosses = (n: number) => {
    setMinCrosses(n);
    db.set('minCrosses', n);
  };

  // ——— органайзер: число мест общее, раскладка — своя у каждой схемы ———
  const [orgSlots, setOrgSlots] = useState(20);
  const [org, setOrg] = useState<Organizer | null>(null);
  const [orgSource, setOrgSource] = useState<OrgSource>('all');
  useEffect(() => {
    db.get('orgSlots').then((v) => setOrgSlots(normalizeSlots(v)));
    db.get(`org:${id}`).then((v) => setOrg(normalizeOrganizer(v)));
  }, []);
  const updateOrgSlots = (n: number) => {
    setOrgSlots(n);
    db.set('orgSlots', n);
  };
  const updateOrg = (o: Organizer | null) => {
    setOrg(o);
    if (o) db.set(`org:${id}`, o);
    else db.del(`org:${id}`);
  };
  const slotOf = useMemo(() => new Map((org?.codes ?? []).map((c, i) => [c.toUpperCase(), i + 1])), [org]);
  const openOrganizer = (source: OrgSource) => {
    setOrgSource(source);
    setSheet('organizer');
  };

  // ——— покупка в магазине (общая, переживает закрытие приложения) ———
  const [shop, setShop] = useState<ShopSession | null>(null);
  useEffect(() => {
    db.get('shop').then((v) => setShop(normalizeShop(v)));
  }, []);
  const updateShop = (s: ShopSession | null) => {
    setShop(s);
    if (s) db.set('shop', s);
    else db.del('shop');
  };
  const beginShop = (rows: ListRow[]) => {
    if (shop?.items.some((i) => i.checked) && !confirm(t.shopReplaceConfirm)) return setSheet('shop');
    updateShop(startShop(pattern.title, rows));
    setSheet('shop');
  };
  const saveShop = () => {
    if (!shop) return;
    const r = applyShop(stash, shop);
    updateStash(r.stash);
    updateShop(null);
    setSheet('threads');
    setToast(t.shopSaved(r.colors, r.skeins));
  };
  const sheetInfo = useMemo(() => sheetsOf(pattern), [pattern]);
  const [area, setArea] = useState(false);
  const [areaItems, setAreaItems] = useState<AreaItem[]>([]);
  const areaRef = useRef({ on: false, items: [] as AreaItem[], temp: null as Rect | null });
  const areaLoaded = useRef(false);
  areaRef.current.on = area;
  areaRef.current.items = areaItems;

  useWakeLock(settings.wakeLock);

  // при предпросмотре замены показываем схему в полную силу: бледные «невышитые» клетки мешают сравнить цвет
  const style = { mode: settings.mode, grid: settings.grid, dim: settings.dim, selected, dark, progress: preview ? ('off' as const) : settings.progress, lines: settings.lines };

  // Создаём отрисовщик, восстанавливаем место и выбранную нить.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const r = new SchemeRenderer(canvas, pattern, symbols, style);
    r.setColors(shownRgb as RGB[]);
    rRef.current = r;
    const prog = new Progress(r.idx, palette.length);
    // общий массив: отрисовщик видит отметки сразу, без копирования
    r.done = prog.done;
    progRef.current = prog;
    let restored: ViewState | undefined;
    let ready = false;
    let saveTimer = 0;
    let doneTimer = 0;
    let uiFrame = 0;

    // ——— сохранение отметок и журнала ———
    const meta = emptyMeta();
    metaRef.current = meta;
    let loggedTotal = 0;
    let dirty = false;
    const flushDone = () => {
      clearTimeout(doneTimer);
      if (!dirty) return;
      dirty = false;
      db.set(`done:${id}`, prog.done);
      db.set(`meta:${id}`, meta);
    };
    saveNow.current = () => {
      dirty = true;
      flushDone();
    };
    resetLogged.current = () => {
      loggedTotal = prog.doneTotal;
    };
    const onHide = () => document.visibilityState === 'hidden' && flushDone();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushDone);

    /** Интерфейс (проценты, «осталось») обновляем не чаще раза за кадр. */
    const bump = () => {
      if (!uiFrame) uiFrame = requestAnimationFrame(() => { uiFrame = 0; setTick((n) => n + 1); });
    };
    afterChange.current = () => {
      logDelta(meta, prog.doneTotal - loggedTotal);
      loggedTotal = prog.doneTotal;
      dirty = true;
      clearTimeout(doneTimer);
      doneTimer = window.setTimeout(flushDone, 600);
      bump();
    };

    // ——— штрих пальцем ———
    let op: Op | null = null;
    let last: { x: number; y: number } | null = null;
    // что палец задел, если штрих ничего не изменил — чтобы подсказать почему
    let sawAny = false;
    let sawOther = false;
    const W = pattern.width;
    const H = pattern.height;
    const apply = (cells: Iterable<number>) => {
      if (!op) return;
      const sel = selectedRef.current;
      const pick: number[] = [];
      for (const i of cells) {
        const k = r.idx[i];
        if (k < 0) continue;
        sawAny = true;
        if (sel === null || k === sel) pick.push(i);
        else sawOther = true;
      }
      const changed = prog.set(pick, op.value);
      if (!changed.length) return;
      for (const i of changed) op.cells.push(i);
      r.markChanged(changed);
      bump();
    };
    const visit = (px: number, py: number) => {
      const c = r.cellUnder(px, py);
      const path = last ? lineCells(last.x, last.y, c.x, c.y) : [[c.x, c.y] as [number, number]];
      if (last && last.x === c.x && last.y === c.y) return;
      last = c;
      const cells: number[] = [];
      for (const [x, y] of path) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (markRef.current.tool === 'square') cells.push(...blockCells(x, y, W, H));
        else cells.push(y * W + x);
      }
      apply(cells);
    };
    const value = (): 0 | 1 => (markRef.current.erase ? 0 : 1);

    const ro = new ResizeObserver(() => {
      const b = wrap.getBoundingClientRect();
      r.resize(b.width, b.height);
      if (restored && !ready) r.vp.setView(restored);
      ready = true;
    });

    Promise.all([db.get(`fabric:${id}`), db.get<AreaItem[]>(`area:${id}`)]).then(([f, a]) => {
      setFabric(defaultChoice(pattern, f));
      if (Array.isArray(a)) setAreaItems(a);
      areaLoaded.current = true;
    });
    Promise.all([db.get<ViewState>(`view:${id}`), db.get<number>(`sel:${id}`), db.get(`done:${id}`), db.get(`meta:${id}`)]).then(([v, sel, done, m]) => {
      if (prog.load(done)) {
        r.refresh();
        bump();
      }
      Object.assign(meta, normalizeMeta(m));
      loggedTotal = prog.doneTotal;
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

    // ——— выбор участка: касание — лист, проведение — прямоугольник по линиям 10 × 10 ———
    let aStart: { x: number; y: number } | null = null;
    let aMoved = false;
    const sheetAt = (x: number, y: number) => {
      const hits = sheetInfo.sheets.filter((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
      const d = (s: (typeof hits)[0]) => Math.hypot(x - (s.x + s.w / 2), y - (s.y + s.h / 2));
      return hits.sort((a, b) => d(a) - d(b))[0];
    };
    const areaStroke = {
      start(px: number, py: number) {
        aStart = r.cellUnder(px, py);
        aMoved = false;
        areaRef.current.temp = null;
      },
      move(px: number, py: number) {
        if (!aStart) return;
        const c = r.cellUnder(px, py);
        if (c.x !== aStart.x || c.y !== aStart.y) aMoved = true;
        if (aMoved) {
          areaRef.current.temp = snapRect(aStart.x, aStart.y, c.x, c.y, W, H);
          r.invalidate();
        }
      },
      end() {
        const tmp = areaRef.current.temp;
        areaRef.current.temp = null;
        if (aMoved && tmp && tmp.w > 0 && tmp.h > 0) setAreaItems((it) => [...it, { kind: 'rect', rect: tmp }]);
        else if (aStart && !aMoved) {
          const sh = sheetAt(aStart.x, aStart.y);
          if (sh) {
            setAreaItems((it) =>
              it.some((i) => i.kind === 'sheet' && i.page === sh.page)
                ? it.filter((i) => !(i.kind === 'sheet' && i.page === sh.page))
                : [...it, { kind: 'sheet', page: sh.page }],
            );
          }
        }
        aStart = null;
        r.invalidate();
      },
      cancel() {
        areaRef.current.temp = null;
        aMoved = false;
        r.invalidate();
      },
      longPress(px: number, py: number) {
        aStart = r.cellUnder(px, py);
        aMoved = false;
      },
    };

    r.overlay = (g) => {
      const A = areaRef.current;
      if (!A.on) return;
      const { s, ox, oy } = r.vp;
      const box = (x: number, y: number, w: number, h: number) => [ox + x * s, oy + y * s, w * s, h * s] as const;
      const chosen = new Set(A.items.flatMap((i) => (i.kind === 'sheet' ? [i.page] : [])));
      g.save();
      g.fillStyle = 'rgba(224,118,28,0.22)';
      for (const sh of sheetInfo.sheets) if (chosen.has(sh.page)) g.fillRect(...box(sh.x, sh.y, sh.w, sh.h));
      for (const i of A.items) if (i.kind === 'rect') g.fillRect(...box(i.rect.x, i.rect.y, i.rect.w, i.rect.h));
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(40,70,150,0.75)';
      g.setLineDash([6, 4]);
      for (const sh of sheetInfo.sheets) g.strokeRect(...box(sh.x, sh.y, sh.w, sh.h));
      g.setLineDash([]);
      g.strokeStyle = '#e0761c';
      g.lineWidth = 2;
      for (const i of A.items) if (i.kind === 'rect') g.strokeRect(...box(i.rect.x, i.rect.y, i.rect.w, i.rect.h));
      if (A.temp) {
        g.setLineDash([5, 3]);
        g.strokeRect(...box(A.temp.x, A.temp.y, A.temp.w, A.temp.h));
        g.setLineDash([]);
      }
      // подписи листов
      g.font = '600 12px -apple-system, system-ui, Roboto, sans-serif';
      g.textBaseline = 'top';
      for (const sh of sheetInfo.sheets) {
        if (sh.w * s < 56) continue;
        const [x, y] = box(sh.x, sh.y, 0, 0);
        const label = t.sheet(sh.page);
        const w = g.measureText(label).width + 10;
        g.fillStyle = chosen.has(sh.page) ? '#e0761c' : 'rgba(40,70,150,0.85)';
        g.beginPath();
        g.roundRect(x + 4, y + 4, w, 18, 9);
        g.fill();
        g.fillStyle = '#fff';
        g.fillText(label, x + 9, y + 7);
      }
      g.restore();
    };

    const detach = attachGestures(canvas, r, {
      marking: () => markRef.current.marking || areaRef.current.on,
      stroke: {
        start(px, py) {
          if (areaRef.current.on) return areaStroke.start(px, py);
          op = { cells: [], value: value() };
          last = null;
          sawAny = sawOther = false;
          visit(px, py);
        },
        move: (px, py) => (areaRef.current.on ? areaStroke.move(px, py) : visit(px, py)),
        end() {
          if (areaRef.current.on) return areaStroke.end();
          if (op?.cells.length) {
            prog.commit(op);
            afterChange.current();
            regions.current.clear();
          } else if (op && sawAny) {
            const sel = selectedRef.current;
            if (sel !== null && sawOther && !markRef.current.erase) setToast(t.onlySelected(palette[sel].code));
            else if (markRef.current.erase) setToast(t.eraserOn);
          }
          op = null;
          bump();
        },
        cancel() {
          if (areaRef.current.on) return areaStroke.cancel();
          if (op?.cells.length) r.markChanged(prog.set(op.cells, op.value ? 0 : 1));
          op = null;
          bump();
        },
        longPress(px, py) {
          if (areaRef.current.on) return areaStroke.longPress(px, py);
          const hit = r.hit(px, py);
          if (!hit || hit.color < 0) return;
          const sel = selectedRef.current;
          if (sel !== null && hit.color !== sel) return;
          op = { cells: [], value: value() };
          last = { x: hit.x, y: hit.y }; // дальше можно вести пальцем — штрих продолжится
          apply(patchCells(r.idx, W, H, hit.x, hit.y));
          if (op.cells.length) {
            navigator.vibrate?.(15);
            const xs = op.cells.map((i) => i % W);
            const ys = op.cells.map((i) => Math.floor(i / W));
            r.flash(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
          }
          // end() придёт, когда палец поднимут
        },
      },
      onTap: (px, py) => {
        const hit = r.hit(px, py);
        setSheet((s) => (s === 'threads' || s === 'more' || s === 'progress' || s === 'stash' || s === 'organizer' ? null : s));
        if (!hit || hit.color < 0) return;
        choose(hit.color === selectedRef.current ? null : hit.color);
      },
      onUserMove: () => {
        nearbyState.current = null;
      },
    });

    return () => {
      flushDone();
      cancelAnimationFrame(uiFrame);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flushDone);
      ro.disconnect();
      detach();
      r.destroy();
      clearTimeout(saveTimer);
    };
  }, []);

  useEffect(() => {
    rRef.current?.setColors(shownRgb as RGB[]);
  }, [shownRgb]);

  useEffect(() => {
    rRef.current?.setStyle(style);
  }, [settings.mode, settings.grid, settings.dim, selected, dark, settings.progress, settings.lines, preview]);

  useEffect(() => {
    rRef.current?.invalidate();
    if (areaLoaded.current) db.set(`area:${id}`, areaItems);
  }, [area, areaItems]);

  useEffect(() => {
    if (!toast) return;
    // длинную подсказку показываем дольше
    const tm = setTimeout(() => setToast(null), 2500 + Math.max(0, toast.length - 60) * 40);
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
      // ищем только среди ещё не вышитых клеток
      const done = progRef.current?.done;
      const cells = done ? r.idx.map((k, i) => (done[i] ? -1 : k)) : r.idx;
      list = findRegions(cells, pattern.width, pattern.height, selected);
      regions.current.set(selected, list);
    }
    if (!list.length) {
      setToast(t.colorDone);
      return;
    }
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
  const halves = useMemo(() => {
    const index = new Map(palette.map((c, i) => [c.id, i]));
    const idx = Int16Array.from(pattern.cells, (v) => (v < 0 ? -1 : index.get(v)!));
    return halvesByColor(idx, pattern.half, palette.length);
  }, [pattern]);
  const order = useMemo(() => {
    // цвета, все клетки которых отданы другой нитке (замена), в списках не показываем
    const idx = palette.map((_, i) => i).filter((i) => palette[i].count > 0);
    if (settings.threadSort === 'count') return idx.sort((a, b) => palette[b].count - palette[a].count);
    return idx.sort((a, b) => compareCodes(palette[a].code, palette[b].code));
  }, [palette, settings.threadSort]);

  const toggleSheet = (s: SheetName) => setSheet((cur) => (cur === s ? null : s));

  const prog = progRef.current;
  const left = (k: number) => (prog ? prog.countBy[k] - prog.doneBy[k] : palette[k].count);
  const finished = (k: number) => !!prog && prog.countBy[k] > 0 && prog.doneBy[k] >= prog.countBy[k];
  const history = (dir: 'undo' | 'redo') => {
    const r = rRef.current;
    if (!r || !prog) return;
    const changed = dir === 'undo' ? prog.undo() : prog.redo();
    r.markChanged(changed);
    regions.current.clear();
    afterChange.current();
    setTick((n) => n + 1);
  };

  // ——— резервная копия ———
  const exportProgress = async () => {
    if (!prog) return;
    const meta = metaRef.current;
    const name = backupFileName(pattern.title);
    const text = JSON.stringify(makeBackup({ id, title: pattern.title, width: pattern.width, height: pattern.height }, prog.done, prog.doneTotal, meta.days));
    const asJson = new File([text], name, { type: 'application/json' });
    const asText = new File([text], name, { type: 'text/plain' });
    let saved = false;
    try {
      // меню «Поделиться»: на iPad — «Сохранить в Файлы», на Android — Диск, мессенджеры
      const file = navigator.canShare?.({ files: [asJson] }) ? asJson : navigator.canShare?.({ files: [asText] }) ? asText : null;
      if (file) {
        await navigator.share({ files: [file], title: name });
        saved = true;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // передумали — ничего не делаем
    }
    if (!saved) {
      // без меню «Поделиться» — обычное скачивание в «Загрузки»
      const url = URL.createObjectURL(asJson);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    meta.backupAt = Date.now();
    meta.since = 0;
    meta.remindAt = REMIND_EVERY;
    saveNow.current();
    setToast(t.backupSaved);
    setTick((n) => n + 1);
  };

  const importProgress = async (file: File) => {
    const r = rRef.current;
    if (!r || !prog) return;
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        throw new BackupError(t.notProgressFile);
      }
      const b = readBackup(raw, { id, width: pattern.width, height: pattern.height });
      const fileDone = b.done.reduce((n, v, i) => n + (v && r.idx[i] >= 0 ? 1 : 0), 0);
      const when = b.savedAt ? new Date(b.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
      if (!confirm(t.restoreConfirm(percent(prog.doneTotal, prog.total), percent(fileDone, prog.total), when))) return;
      prog.load(b.done);
      r.refresh();
      const meta = metaRef.current;
      meta.days = mergeDays(meta.days, b.days);
      resetLogged.current();
      regions.current.clear();
      saveNow.current();
      setSheet(null);
      setToast(t.restored(percent(prog.doneTotal, prog.total)));
      setTick((n) => n + 1);
    } catch (e) {
      setToast(e instanceof BackupError ? e.message : String(e));
    }
  };

  const meta = metaRef.current;
  const remind = !marking && sheet === null && !!prog && prog.doneTotal > 0 && meta.since >= meta.remindAt;
  const snooze = () => {
    meta.remindAt = meta.since + REMIND_EVERY;
    saveNow.current();
    setTick((n) => n + 1);
  };
  const rectsOf = (items: AreaItem[]): Rect[] =>
    items.flatMap((i) => (i.kind === 'rect' ? [i.rect] : sheetInfo.sheets.filter((s) => s.page === i.page)));
  const areaRects = (): Rect[] => rectsOf(areaItems);
  const areaRows = useMemo(() => {
    const r = rRef.current;
    if (!r || !prog || (!area && sheet !== 'area' && sheet !== 'organizer')) return [];
    return areaCounts(r.idx, prog.done, areaMask(pattern.width, pattern.height, areaRects()), palette.length, r.half);
  }, [areaItems, area, sheet, prog?.version]);
  const areaCrosses = areaRows.reduce((n, r) => n + r.total, 0);
  // выбор участка, начатый из органайзера, заканчивается кнопкой «К органайзеру»
  const [areaForOrg, setAreaForOrg] = useState(false);
  const openArea = (forOrganizer = false) => {
    setSheet(null);
    setMarking(false);
    setArea(true);
    setAreaForOrg(forOrganizer);
    const hint = forOrganizer ? t.areaHintOrg : t.areaHint;
    setToast(sheetInfo.fromPdf ? hint : `${hint}. ${t.sheetsApprox}`);
  };
  const areaLabel = areaItems.length
    ? t.areaSummary(areaItems.filter((i) => i.kind === 'sheet').length, areaItems.filter((i) => i.kind === 'rect').length, plural(areaCrosses))
    : t.areaEmpty;
  const updateFabric = (f: FabricChoice) => {
    setFabric(f);
    db.set(`fabric:${id}`, f);
  };

  const toggleMarking = () => {
    setSheet(null);
    setArea(false);
    setMarking((m) => {
      if (!m) setToast(t.markHint);
      return !m;
    });
    // каждый вход в отметку начинается с кисти, а не с ластика
    setErase(false);
  };

  return (
    <div class="viewer">
      <header class="topbar">
        <div class="title" title={pattern.title}>{pattern.title}</div>
        <button class={`pill${sheet === 'progress' ? ' on' : ''}`} onClick={() => toggleSheet('progress')}>
          {t.totalDone} {prog ? percent(prog.doneTotal, prog.total) : '0'}%
        </button>
        {sel && selected !== null && (
          <span class="pill accent">{sel.code} · {prog ? percent(prog.doneBy[selected], prog.countBy[selected]) : '0'}%</span>
        )}
      </header>

      <div class={`stage${marking || area ? ' marking' : ''}${marking && erase ? ' erasing' : ''}`} ref={wrapRef}>
        <canvas ref={canvasRef} class="scheme" />
        <canvas
          ref={miniRef}
          class="minimap"
          style={{ top: `${RULER + 8}px` }}
          onPointerDown={(e) => miniJump(e, rRef.current)}
          onPointerMove={(e) => e.buttons && miniJump(e, rRef.current)}
        />
        {settings.mode === 'selectedOnly' && selected === null && <div class="hint">{t.selectedOnlyHint}</div>}
        {sheet === 'view' && (
          <ViewSheet
            value={settings.mode}
            onChange={(mode) => onSettings({ mode })}
            progress={settings.progress}
            onProgress={(progress) => onSettings({ progress })}
            colors={settings.colors}
            onColors={(colors) => onSettings({ colors })}
            hasLines={pattern.backstitch.length > 0}
            lines={settings.lines}
            onLines={(lines) => onSettings({ lines })}
          />
        )}
        {sheet === 'grid' && <GridSheet value={settings.grid} onChange={(grid) => onSettings({ grid })} />}
        {sheet === 'threads' && (
          <ThreadsSheet
            palette={palette}
            symbols={symbols}
            halves={halves}
            order={order}
            selected={selected}
            left={left}
            finished={finished}
            fabric={fabric}
            size={{ width: pattern.width, height: pattern.height }}
            onFabric={updateFabric}
            onArea={() => openArea()}
            onOrganizer={() => openOrganizer(org?.source ?? 'all')}
            colorWarnings={checks.length}
            onColors={() => setSheet('colors')}
            title={pattern.title}
            stash={stash}
            onStash={() => setSheet('stash')}
            onToast={setToast}
            minCrosses={minCrosses}
            onMinCrosses={updateMinCrosses}
            onShop={beginShop}
            shopOpen={!!shop}
            onResumeShop={() => setSheet('shop')}
            sort={settings.threadSort}
            onSort={(threadSort) => onSettings({ threadSort })}
            onPick={(k) => {
              choose(k);
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'colors' && (
          <ColorsSheet
            checks={checks}
            palette={rawPalette}
            base={base.palette}
            symbols={symbols}
            subs={subs}
            stash={stash}
            colors={settings.colors}
            onColors={(colors) => onSettings({ colors })}
            onPreview={(k, to) => {
              setPreview({ k, to });
              setSheet(null);
            }}
            onAccept={(from, to) => onSubs({ ...subs, [from]: to }, 'colors')}
            onRevert={(from) => {
              const next = { ...subs };
              delete next[from];
              onSubs(next, 'colors');
            }}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'organizer' && (
          <OrganizerSheet
            palette={palette}
            symbols={symbols}
            title={pattern.title}
            stash={stash}
            slots={orgSlots}
            onSlots={updateOrgSlots}
            saved={org}
            onSave={updateOrg}
            countsFor={(source, saved) => {
              const r = rRef.current;
              if (!r || !prog) return [];
              const rects = saved ? rectsOf(saved as AreaItem[]) : areaRects();
              const mask = source === 'area' ? areaMask(pattern.width, pattern.height, rects) : new Uint8Array(pattern.width * pattern.height).fill(1);
              return areaCounts(r.idx, prog.done, mask, palette.length, r.half);
            }}
            version={prog?.version ?? 0}
            area={areaItems}
            areaKey={JSON.stringify(areaItems)}
            hasArea={areaItems.length > 0}
            initialSource={orgSource}
            onChooseArea={() => openArea(true)}
            areaLabel={areaLabel}
            onPick={(k) => {
              choose(k);
              setSheet(null);
            }}
            onToast={setToast}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'shop' && shop && (
          <ShopSheet
            session={shop}
            onChange={updateShop}
            onSave={saveShop}
            onLater={() => setSheet(null)}
            onCancel={() => {
              if (confirm(t.shopCancelConfirm)) {
                updateShop(null);
                setSheet('threads');
              }
            }}
          />
        )}
        {sheet === 'stash' && <StashSheet stash={stash} palette={palette} onChange={updateStash} onClose={() => setSheet('threads')} />}
        {sheet === 'area' && (
          <AreaSheet
            rows={areaRows}
            palette={palette}
            symbols={symbols}
            fabric={fabric}
            title={pattern.title}
            stash={stash}
            onToast={setToast}
            onShop={beginShop}
            onOrganizer={() => openOrganizer('area')}
            minCrosses={minCrosses}
            onMinCrosses={updateMinCrosses}
            sort={settings.threadSort}
            onSort={(threadSort) => onSettings({ threadSort })}
            onPick={(k) => {
              choose(k);
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'progress' && prog && (
          <ProgressSheet
            prog={prog}
            meta={meta}
            colors={palette.length}
            onExport={exportProgress}
            onImport={() => backupInput.current?.click()}
            onClose={() => setSheet(null)}
          />
        )}
        {remind && (
          <div class="remind" style={{ top: `${RULER + 8}px` }}>
            <span>{t.remindText(plural(meta.since))}</span>
            <button class="primary small" onClick={exportProgress}>{t.backupNow}</button>
            <button class="icon-btn" onClick={snooze} aria-label={t.later}>
              <Icon name="x" />
            </button>
          </div>
        )}
        <input
          ref={backupInput}
          type="file"
          hidden
          onChange={(e) => {
            const f = (e.currentTarget as HTMLInputElement).files?.[0];
            (e.currentTarget as HTMLInputElement).value = '';
            if (f) importProgress(f);
          }}
        />
        {sheet === 'more' && (
          <MoreSheet
            settings={settings}
            env={env}
            currentId={id}
            onSettings={onSettings}
            onImport={onImport}
            onProgress={() => setSheet('progress')}
            onStash={() => setSheet('stash')}
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
              <b>{sel.code}</b>
              {slotOf.has(sel.code.toUpperCase()) && <span class="slot-pill">{t.orgSlotBadge(slotOf.get(sel.code.toUpperCase())!)}</span>}
              {' · '}
              {left(selected) ? `${t.left} ${plural(left(selected))}` : t.allDone}
            </span>
            <button class="primary small" onClick={goNearby} title={t.nearbyTitle}>
              <Icon name="target" /> {t.nearby}
            </button>
          </div>
        )}
        {preview && (
          <div class="areabar preview-bar">
            <span class="ab-text">
              {t.previewText(rawPalette[preview.k].code, preview.to, dmcThread(preview.to)?.name ?? '')}
            </span>
            <button class="primary small" onClick={() => onSubs({ ...subs, [rawPalette[preview.k].code]: preview.to }, 'colors')}>
              <Icon name="check" /> {t.previewAccept}
            </button>
            <button
              class="seg"
              onClick={() => {
                setPreview(null);
                setSheet('colors');
              }}
            >
              {t.previewOther}
            </button>
            <button class="icon-btn" onClick={() => setPreview(null)} aria-label={t.close}>
              <Icon name="x" />
            </button>
          </div>
        )}
        {area && (
          <div class="areabar">
            <span class="ab-text">{areaLabel}</span>
            <button class="seg" disabled={!areaItems.length} onClick={() => setAreaItems((it) => it.slice(0, -1))}>
              <Icon name="undo" /> {t.areaUndo}
            </button>
            <button class="seg" disabled={!areaItems.length} onClick={() => setAreaItems([])}>
              {t.areaClear}
            </button>
            {areaForOrg ? (
              <button
                class="primary small"
                disabled={!areaItems.length}
                onClick={() => {
                  setArea(false);
                  setAreaForOrg(false);
                  openOrganizer('area');
                }}
              >
                <Icon name="org" /> {t.areaToOrg}
              </button>
            ) : (
              <button class="primary small" disabled={!areaItems.length} onClick={() => setSheet('area')}>
                {t.areaCount}
              </button>
            )}
            <button
              class="icon-btn"
              onClick={() => {
                setArea(false);
                setAreaForOrg(false);
              }}
              aria-label={t.close}
            >
              <Icon name="x" />
            </button>
          </div>
        )}
        {marking && (
          <div class="markbar">
            <div class="mb-group">
              <button class={`mb${tool === 'brush' ? ' on' : ''}`} onClick={() => setTool('brush')}>
                <Icon name="brush" /> {t.toolBrush}
              </button>
              <button class={`mb${tool === 'square' ? ' on' : ''}`} onClick={() => setTool('square')}>
                <Icon name="square" /> {t.toolSquare}
              </button>
            </div>
            <button class={`mb erase${erase ? ' on' : ''}`} onClick={() => {
                setErase((v) => !v);
                setToast(erase ? t.eraserOff : t.eraserOn);
              }} aria-pressed={erase}>
              <Icon name="eraser" /> {t.toolErase}
            </button>
            <span class="grow" />
            <button class="icon-btn" disabled={!prog?.canUndo} onClick={() => history('undo')} aria-label={t.undo}>
              <Icon name="undo" />
            </button>
            <button class="icon-btn" disabled={!prog?.canRedo} onClick={() => history('redo')} aria-label={t.redo}>
              <Icon name="redo" />
            </button>
          </div>
        )}
        <Strip palette={palette} order={order} selected={selected} finished={finished} slotOf={slotOf} onPick={(k) => choose(k === selected ? null : k)} />
        <nav class="toolbar">
          <ToolButton icon="eye" label={t.tabView} active={sheet === 'view'} onClick={() => toggleSheet('view')} />
          <ToolButton icon="grid" label={t.tabGrid} active={sheet === 'grid'} onClick={() => toggleSheet('grid')} />
          <ToolButton icon="pencil" label={t.tabMark} active={marking} onClick={toggleMarking} />
          <ToolButton icon="list" label={t.tabThreads} active={sheet === 'threads'} onClick={() => toggleSheet('threads')} />
          <ToolButton icon="dots" label={t.tabMore} active={sheet === 'more'} onClick={() => toggleSheet('more')} />
        </nav>
      </footer>
    </div>
  );
}

function ToolButton(p: { icon: string; label: string; active: boolean; onClick(): void }) {
  return (
    <button class={`tool${p.active ? ' active' : ''}`} onClick={p.onClick} aria-pressed={p.active}>
      <Icon name={p.icon} size={22} />
      <span>{p.label}</span>
    </button>
  );
}

function Strip(p: {
  palette: StoredPattern['pattern']['palette'];
  order: number[];
  selected: number | null;
  finished(k: number): boolean;
  slotOf: Map<string, number>;
  onPick(k: number): void;
}) {
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
            <span class="sw" style={{ background: css(c.rgb), color: inkOf(c.rgb) }}>{p.finished(k) && <Icon name="check" size={16} />}</span>
            <span class="code">{c.code}</span>
            {p.slotOf.has(c.code.toUpperCase()) && <span class="chip-slot">{p.slotOf.get(c.code.toUpperCase())}</span>}
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
