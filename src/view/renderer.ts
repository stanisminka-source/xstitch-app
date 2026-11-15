// Отрисовка схемы на Canvas 2D.
// Крупно — плитками (кусками схемы, нарисованными заранее и сохранёнными в памяти),
// мелко — одной картинкой «одна клетка = один пиксель». Сетка, линейки и линии
// бэкстича рисуются поверх на каждом кадре: это дёшево и всегда чётко.
import type { Pattern } from '../pattern/format';
import { contrastInk, css, darken, luminance, mix, type RGB } from '../lib/color';
import type { GridMode, ProgressMode, ViewMode } from '../store/settings';
import { Viewport } from './viewport';

export interface RenderStyle {
  mode: ViewMode;
  grid: GridMode;
  dim: number;
  /** Индекс выделенного цвета в палитре или null. */
  selected: number | null;
  dark: boolean;
  progress: ProgressMode;
}

export const RULER = 20; // ширина линеек, CSS px
const WHITE: RGB = [255, 255, 255];
const FABRIC: RGB = [243, 239, 230];
const INK: RGB = [29, 27, 24];
const ACCENT = '#e0761c';
const TILE_PX = 512; // примерный размер плитки в пикселях экрана
const MAX_TILES = 64;
const SYMBOL_MIN_CSS = 9; // мельче — символы не читаются, не рисуем
const TINT = 0.6; // насколько бледнее невышитые клетки в режиме «проявление»
const FONT = '-apple-system, system-ui, Roboto, "Segoe UI", "Noto Sans", sans-serif';

type AnyCanvas = HTMLCanvasElement;

interface Tile {
  canvas: AnyCanvas;
  used: number;
  p: number;
  x0: number;
  y0: number;
  w: number;
  h: number;
}

interface Atlas {
  p: number;
  canvas: AnyCanvas;
  cols: number;
  rowsPerVariant: number;
}

interface Pulse {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  start: number;
}

/** Набор оттенков всех цветов палитры: сам цвет, приглушённый, бледный… */
type Shade = 'full' | 'dim' | 'tint' | 'dimTint';
interface ShadeSet {
  rgb: RGB[];
  css: string[];
  ink: ('black' | 'white')[];
}

/** Как выглядит одна клетка. */
interface Look {
  kind: 'none' | 'fill' | 'cross' | 'fade';
  shade: Shade;
  /** Символ: −1 — нет, 0 — чёрный, 1 — белый, 2 — цвета нити. */
  sym: number;
  alpha: number;
  ring: boolean;
}
const NONE: Look = { kind: 'none', shade: 'full', sym: -1, alpha: 1, ring: false };
const FADED: Look = { kind: 'fade', shade: 'full', sym: -1, alpha: 1, ring: false };

function makeCanvas(w: number, h: number): AnyCanvas {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

function shadeSet(rgb: RGB[]): ShadeSet {
  return { rgb, css: rgb.map(css), ink: rgb.map(contrastInk) };
}

export class SchemeRenderer {
  readonly vp: Viewport;
  /** Индекс цвета в палитре для каждой клетки, −1 — пусто. */
  readonly idx: Int16Array;
  readonly rgb: RGB[];
  /** Пользователь сейчас двигает схему — не перерисовываем плитки под новый масштаб. */
  interacting = false;
  onViewChange?: () => void;

  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private style: RenderStyle;
  private styleVersion = 0;
  private flat: AnyCanvas | null = null;
  private flatImg: ImageData | null = null;
  private flatDirty = false;
  private flatUndone: RGB[] = [];
  private flatDone: RGB[] = [];
  private tiles = new Map<string, Tile>();
  private atlases = new Map<number, Atlas>();
  private activeP = 0;
  private raf = 0;
  private tick = 0;
  private pulse: Pulse | null = null;
  private shades!: Record<Shade, ShadeSet>;
  private base: RGB = WHITE;
  private fadeRgb: RGB = WHITE;

  constructor(
    private canvas: HTMLCanvasElement,
    readonly pattern: Pattern,
    readonly symbols: string[],
    style: RenderStyle,
    /** Отметки вышитого (1 — вышито); массив общий с Progress. */
    public done: Uint8Array = new Uint8Array(pattern.width * pattern.height),
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.vp = new Viewport(pattern.width, pattern.height);
    const index = new Map(pattern.palette.map((c, i) => [c.id, i]));
    this.idx = new Int16Array(pattern.cells.length);
    for (let i = 0; i < pattern.cells.length; i++) {
      const v = pattern.cells[i];
      this.idx[i] = v < 0 ? -1 : index.get(v)!;
    }
    this.rgb = pattern.palette.map((c) => c.rgb);
    this.style = style;
    this.prepareStyle();
  }

  // ——— Настройка ———

  setStyle(style: RenderStyle): void {
    const s = this.style;
    if (
      s.mode === style.mode && s.grid === style.grid && s.dim === style.dim &&
      s.selected === style.selected && s.dark === style.dark && s.progress === style.progress
    ) return;
    const tilesChange = s.mode !== style.mode || s.dim !== style.dim || s.selected !== style.selected || s.progress !== style.progress;
    this.style = style;
    if (tilesChange) this.prepareStyle();
    this.invalidate();
  }

  resize(cssW: number, cssH: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const first = this.cssW === 1 && this.cssH === 1;
    this.dpr = dpr;
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.vp.setSize(cssW - RULER, cssH - RULER);
    if (first) this.vp.fit();
    this.invalidate();
  }

  /** Индекс цвета в клетке под точкой экрана (CSS px относительно холста). */
  hit(px: number, py: number): { x: number; y: number; color: number } | null {
    const c = this.vp.cellAt(px - RULER, py - RULER);
    if (!c) return null;
    return { ...c, color: this.idx[c.y * this.pattern.width + c.x] };
  }

  /** Клетка под точкой экрана, даже за краем схемы (для проведения пальцем). */
  cellUnder(px: number, py: number): { x: number; y: number } {
    const c = this.vp.toCell(px - RULER, py - RULER);
    return { x: Math.floor(c.x), y: Math.floor(c.y) };
  }

  flash(x0: number, y0: number, x1: number, y1: number): void {
    this.pulse = { x0, y0, x1, y1, start: performance.now() };
    this.invalidate();
  }

  invalidate(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.draw());
  }

  /** Отметки в этих клетках изменились — перерисовываем только их. */
  markChanged(cells: number[]): void {
    if (!cells.length) return;
    if (cells.length > 4000) {
      // большое изменение (отмена крупного пятна, загрузка) — проще нарисовать заново
      this.tiles.clear();
      this.flat = null;
      this.invalidate();
      return;
    }
    const W = this.pattern.width;
    const img = this.flatImg;
    if (img) {
      for (const i of cells) {
        const k = this.idx[i];
        const c = k < 0 ? this.base : this.done[i] ? this.flatDone[k] : this.flatUndone[k];
        img.data[i * 4] = c[0];
        img.data[i * 4 + 1] = c[1];
        img.data[i * 4 + 2] = c[2];
      }
      this.flatDirty = true;
    }
    for (const tile of this.tiles.values()) {
      let g: CanvasRenderingContext2D | null = null;
      let atlas: Atlas | null | undefined;
      for (const i of cells) {
        const x = i % W;
        const y = (i - x) / W;
        if (x < tile.x0 || y < tile.y0 || x >= tile.x0 + tile.w || y >= tile.y0 + tile.h) continue;
        g ??= tile.canvas.getContext('2d')!;
        if (atlas === undefined) atlas = this.atlasFor(tile.p);
        this.patchCell(g, tile, x, y, atlas);
      }
    }
    this.invalidate();
  }

  /** Всё нарисовать заново (например, после загрузки сохранённых отметок). */
  refresh(): void {
    this.prepareStyle();
    this.invalidate();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.tiles.clear();
  }

  // ——— Подготовка цветов ———

  private prepareStyle(): void {
    const { dim, mode } = this.style;
    const base = mode === 'stitched' ? FABRIC : WHITE;
    this.base = base;
    this.fadeRgb = mix(base, [150, 148, 144], 0.2);
    const tint = this.rgb.map((c) => mix(c, base, TINT));
    this.shades = {
      full: shadeSet(this.rgb),
      dim: shadeSet(this.rgb.map((c) => mix(c, base, dim))),
      tint: shadeSet(tint),
      dimTint: shadeSet(tint.map((c) => mix(c, base, dim))),
    };
    this.flatUndone = this.rgb.map((_, k) => this.flatColor(k, false));
    this.flatDone = this.rgb.map((_, k) => this.flatColor(k, true));
    this.styleVersion++;
    this.tiles.clear();
    this.flat = null;
  }

  /** Как выглядит клетка цвета k — с учётом режима, выделения и того, вышита ли она. */
  private look(k: number, isDone: boolean): Look {
    const { mode, selected, dim, progress } = this.style;
    const dimmed = selected !== null && k !== selected;
    const isSel = selected === k;
    if (mode === 'selectedOnly' && dimmed) return NONE;
    if (isDone && progress === 'fade') return FADED;
    if (isDone && progress === 'reveal') {
      return { kind: mode === 'stitched' ? 'cross' : 'fill', shade: dimmed ? 'dim' : 'full', sym: -1, alpha: 1, ring: false };
    }
    const reveal = progress === 'reveal';
    const symAlpha = dimmed ? 1 - dim : 1;
    if (mode === 'stitched') {
      if (reveal) return { kind: 'fill', shade: dimmed ? 'dimTint' : 'tint', sym: -1, alpha: 1, ring: isSel };
      return { kind: 'cross', shade: dimmed ? 'dim' : 'full', sym: -1, alpha: 1, ring: isSel };
    }
    if (mode === 'symbol') return { kind: 'none', shade: 'full', sym: 0, alpha: symAlpha, ring: isSel };
    if (mode === 'coloredSymbol') return { kind: 'none', shade: 'full', sym: 2, alpha: symAlpha, ring: isSel };
    // цвет / цвет и символ / только выбранный: выбранная нить всегда в полную силу
    const shade: Shade = reveal && !isSel ? (dimmed ? 'dimTint' : 'tint') : dimmed ? 'dim' : 'full';
    const sym = mode === 'color' ? -1 : this.shades[shade].ink[k] === 'black' ? 0 : 1;
    return { kind: 'fill', shade, sym, alpha: dimmed ? Math.max(0.25, 1 - dim) : 1, ring: isSel };
  }

  /** Цвет клетки на мелком масштабе и мини-карте. */
  private flatColor(k: number, isDone: boolean): RGB {
    const L = this.look(k, isDone);
    if (L.kind === 'fill' || L.kind === 'cross') return this.shades[L.shade].rgb[k];
    if (L.kind === 'fade') return this.fadeRgb;
    const rgb = this.rgb[k];
    if (L.sym === 0) {
      const g = Math.round(255 - (1 - luminance(rgb)) * 120);
      return mix([g, g, g], this.base, 1 - L.alpha);
    }
    if (L.sym === 2) return mix(mix(rgb, WHITE, 0.45), this.base, 1 - L.alpha);
    return this.base;
  }

  /** Картинка «одна клетка — один пиксель» для мелкого масштаба и мини-карты. */
  private buildFlat(): AnyCanvas {
    const { width: w, height: h } = this.pattern;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    for (let i = 0; i < this.idx.length; i++) {
      const k = this.idx[i];
      const col = k < 0 ? this.base : this.done[i] ? this.flatDone[k] : this.flatUndone[k];
      img.data[i * 4] = col[0];
      img.data[i * 4 + 1] = col[1];
      img.data[i * 4 + 2] = col[2];
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.flatImg = img;
    this.flatDirty = false;
    return c;
  }

  flatImage(): AnyCanvas {
    if (this.flat && this.flatDirty && this.flatImg) {
      this.flat.getContext('2d')!.putImageData(this.flatImg, 0, 0);
      this.flatDirty = false;
    }
    return this.flat ?? (this.flat = this.buildFlat());
  }

  // ——— Символы ———

  /** Все символы, нарисованные заранее в трёх цветах: чёрном, белом и цвете нити. */
  private getAtlas(p: number): Atlas {
    const have = this.atlases.get(p);
    if (have) return have;
    const n = this.symbols.length;
    const cols = 16;
    const rowsPerVariant = Math.ceil(n / cols);
    const canvas = makeCanvas(cols * p, rowsPerVariant * 3 * p);
    const g = canvas.getContext('2d')!;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(p * 0.68)}px ${FONT}`;
    for (let v = 0; v < 3; v++) {
      for (let k = 0; k < n; k++) {
        const rgb = this.rgb[k];
        g.fillStyle = v === 0 ? css(INK) : v === 1 ? '#fff' : css(luminance(rgb) > 0.75 ? darken(rgb, 0.3) : rgb);
        const x = (k % cols) * p + p / 2;
        const y = (v * rowsPerVariant + Math.floor(k / cols)) * p + p / 2 + p * 0.04;
        g.fillText(this.symbols[k], x, y);
      }
    }
    const atlas = { p, canvas, cols, rowsPerVariant };
    if (this.atlases.size >= 6) this.atlases.delete(this.atlases.keys().next().value!);
    this.atlases.set(p, atlas);
    return atlas;
  }

  private atlasFor(p: number): Atlas | null {
    const { mode } = this.style;
    const symbols = mode !== 'color' && mode !== 'stitched' && p / this.dpr >= SYMBOL_MIN_CSS;
    return symbols ? this.getAtlas(p) : null;
  }

  // ——— Плитки ———

  private tileCells(p: number): number {
    const t = 2 ** Math.floor(Math.log2(TILE_PX / p));
    return Math.max(4, Math.min(64, t));
  }

  private renderTile(p: number, T: number, tx: number, ty: number): Tile {
    const { width: W, height: H } = this.pattern;
    const x0 = tx * T;
    const y0 = ty * T;
    const tw = Math.min(T, W - x0);
    const th = Math.min(T, H - y0);
    const canvas = makeCanvas(tw * p, th * p);
    const g = canvas.getContext('2d', { alpha: false })!;
    const atlas = this.atlasFor(p);

    g.fillStyle = css(this.base);
    g.fillRect(0, 0, tw * p, th * p);
    if (this.style.mode === 'stitched' && p >= 8) {
      // отверстия канвы
      g.fillStyle = css(darken(FABRIC, 0.14));
      const r = Math.max(1, p * 0.09);
      for (let y = 0; y <= th; y++) for (let x = 0; x <= tw; x++) g.fillRect(x * p - r, y * p - r, r * 2, r * 2);
    }
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const i = (y0 + y) * W + x0 + x;
        const k = this.idx[i];
        if (k >= 0) this.drawCell(g, k, this.done[i] === 1, x * p, y * p, p, atlas);
      }
    }
    return { canvas, used: 0, p, x0, y0, w: tw, h: th };
  }

  /** Перерисовать одну клетку внутри готовой плитки. */
  private patchCell(g: CanvasRenderingContext2D, tile: Tile, x: number, y: number, atlas: Atlas | null): void {
    const p = tile.p;
    const px = (x - tile.x0) * p;
    const py = (y - tile.y0) * p;
    const i = y * this.pattern.width + x;
    g.save();
    g.beginPath();
    g.rect(px, py, p, p);
    g.clip();
    g.fillStyle = css(this.base);
    g.fillRect(px, py, p, p);
    if (this.style.mode === 'stitched' && p >= 8) {
      g.fillStyle = css(darken(FABRIC, 0.14));
      const r = Math.max(1, p * 0.09);
      for (const [cx, cy] of [[px, py], [px + p, py], [px, py + p], [px + p, py + p]]) g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    const k = this.idx[i];
    if (k >= 0) this.drawCell(g, k, this.done[i] === 1, px, py, p, atlas);
    g.restore();
  }

  private drawCell(g: CanvasRenderingContext2D, k: number, isDone: boolean, px: number, py: number, p: number, atlas: Atlas | null): void {
    const L = this.look(k, isDone);
    if (L === NONE) return;
    const sh = this.shades[L.shade];
    if (L.kind === 'fill') {
      g.fillStyle = sh.css[k];
      g.fillRect(px, py, p, p);
    } else if (L.kind === 'fade') {
      g.fillStyle = css(this.fadeRgb);
      g.fillRect(px, py, p, p);
    } else if (L.kind === 'cross') {
      const c = sh.rgb[k];
      const inset = p * 0.14;
      g.lineCap = 'round';
      g.lineWidth = Math.max(1, p * 0.26);
      g.strokeStyle = css(darken(c, 0.18));
      g.beginPath();
      g.moveTo(px + inset, py + p - inset);
      g.lineTo(px + p - inset, py + inset);
      g.stroke();
      g.strokeStyle = css(c);
      g.beginPath();
      g.moveTo(px + inset, py + inset);
      g.lineTo(px + p - inset, py + p - inset);
      g.stroke();
    }
    if (atlas && L.sym >= 0) {
      const sx = (k % atlas.cols) * p;
      const sy = (L.sym * atlas.rowsPerVariant + Math.floor(k / atlas.cols)) * p;
      g.globalAlpha = L.alpha;
      g.drawImage(atlas.canvas, sx, sy, p, p, px, py, p, p);
      g.globalAlpha = 1;
    }
    if (L.ring && p >= 6) {
      const ring = Math.max(1, p * 0.07);
      g.strokeStyle = L.kind === 'fill' && sh.ink[k] === 'white' ? '#fff' : css(INK);
      g.lineWidth = ring;
      g.beginPath();
      g.arc(px + p / 2, py + p / 2, p * 0.42 - ring / 2, 0, Math.PI * 2);
      g.stroke();
    }
  }

  // ——— Кадр ———

  private idealP(): number {
    const raw = this.vp.s * this.dpr;
    const q = 2 ** (Math.round(Math.log2(raw) * 2) / 2); // шаг √2
    return Math.max(1, Math.round(q));
  }

  private draw(): void {
    this.raf = 0;
    this.tick++;
    const g = this.ctx;
    const { dpr, vp } = this;
    const { s, ox, oy } = vp;
    const W = this.pattern.width;
    const H = this.pattern.height;
    const dark = this.style.dark;
    let again = false;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = dark ? '#2a2825' : '#ece8e1';
    g.fillRect(0, 0, this.cssW, this.cssH);

    g.save();
    g.beginPath();
    g.rect(RULER, RULER, vp.w, vp.h);
    g.clip();
    g.translate(RULER, RULER);

    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const ideal = this.idealP();
    if (!this.interacting || !this.activeP || ideal / this.activeP > 2 || this.activeP / ideal > 2) this.activeP = ideal;
    const p = this.activeP;

    if (s * dpr < 3 || p < 3) {
      g.imageSmoothingEnabled = s < 1;
      g.drawImage(this.flatImage(), snap(ox), snap(oy), snap(ox + W * s) - snap(ox), snap(oy + H * s) - snap(oy));
    } else {
      const T = this.tileCells(p);
      const v = vp.visible();
      const tx0 = Math.floor(v.x0 / T);
      const ty0 = Math.floor(v.y0 / T);
      const tx1 = Math.ceil(v.x1 / T);
      const ty1 = Math.ceil(v.y1 / T);
      const start = performance.now();
      const flat = this.flatImage();
      for (let ty = ty0; ty < ty1; ty++) {
        for (let tx = tx0; tx < tx1; tx++) {
          const key = `${this.styleVersion}|${p}|${tx}|${ty}`;
          let tile = this.tiles.get(key);
          if (!tile && performance.now() - start < 10) {
            tile = this.renderTile(p, T, tx, ty);
            this.tiles.set(key, tile);
          }
          const cx0 = tx * T;
          const cy0 = ty * T;
          const tw = Math.min(T, W - cx0);
          const th = Math.min(T, H - cy0);
          const x0 = snap(ox + cx0 * s);
          const y0 = snap(oy + cy0 * s);
          const x1 = snap(ox + (cx0 + tw) * s);
          const y1 = snap(oy + (cy0 + th) * s);
          if (tile) {
            tile.used = this.tick;
            g.imageSmoothingEnabled = true;
            g.drawImage(tile.canvas, x0, y0, x1 - x0, y1 - y0);
          } else {
            again = true;
            g.imageSmoothingEnabled = false;
            g.drawImage(flat, cx0, cy0, tw, th, x0, y0, x1 - x0, y1 - y0);
          }
        }
      }
      this.evict();
    }

    this.drawBackstitch(g);
    if (this.drawPulse(g)) again = true;
    this.drawGrid(g, snap);
    g.restore();
    this.drawRulers(g);

    if (again) this.invalidate();
  }

  private evict(): void {
    if (this.tiles.size <= MAX_TILES) return;
    const entries = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < entries.length - MAX_TILES; i++) this.tiles.delete(entries[i][0]);
  }

  private drawBackstitch(g: CanvasRenderingContext2D): void {
    const lines = this.pattern.backstitch;
    if (!lines.length) return;
    const { s, ox, oy } = this.vp;
    const index = new Map(this.pattern.palette.map((c, i) => [c.id, i]));
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.5, s * 0.16);
    for (const l of lines) {
      g.strokeStyle = this.shades.full.css[index.get(l.color)!];
      g.beginPath();
      g.moveTo(ox + l.x1 * s, oy + l.y1 * s);
      g.lineTo(ox + l.x2 * s, oy + l.y2 * s);
      g.stroke();
    }
  }

  private drawPulse(g: CanvasRenderingContext2D): boolean {
    if (!this.pulse) return false;
    const t = (performance.now() - this.pulse.start) / 1400;
    if (t >= 1) {
      this.pulse = null;
      return false;
    }
    const { s, ox, oy } = this.vp;
    const pad = 6 + 10 * (1 - t);
    const { x0, y0, x1, y1 } = this.pulse;
    g.globalAlpha = 1 - t * t;
    g.strokeStyle = ACCENT;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(ox + x0 * s - pad, oy + y0 * s - pad, (x1 - x0 + 1) * s + pad * 2, (y1 - y0 + 1) * s + pad * 2, 10);
    g.stroke();
    g.globalAlpha = 1;
    return true;
  }

  private drawGrid(g: CanvasRenderingContext2D, snap: (v: number) => number): void {
    const { grid } = this.style;
    const { s, ox, oy, w, h } = this.vp;
    const W = this.pattern.width;
    const H = this.pattern.height;
    const v = this.vp.visible();
    const dpr = this.dpr;
    const left = Math.max(0, ox);
    const right = Math.min(w, ox + W * s);
    const top = Math.max(0, oy);
    const bottom = Math.min(h, oy + H * s);
    const strong = grid === 'strong';

    const lines = (every: number, color: string, widthDev: number) => {
      const half = widthDev % 2 ? 0.5 / dpr : 0;
      g.strokeStyle = color;
      g.lineWidth = widthDev / dpr;
      g.beginPath();
      for (let x = Math.ceil(v.x0 / every) * every; x <= v.x1; x += every) {
        const X = snap(ox + x * s) + half;
        g.moveTo(X, top);
        g.lineTo(X, bottom);
      }
      for (let y = Math.ceil(v.y0 / every) * every; y <= v.y1; y += every) {
        const Y = snap(oy + y * s) + half;
        g.moveTo(left, Y);
        g.lineTo(right, Y);
      }
      g.stroke();
    };

    if (grid !== 'off') {
      if (s >= 5) lines(1, strong ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.10)', 1);
      if (s * 10 >= 24) lines(10, strong ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.32)', Math.max(1, Math.round(dpr * (s >= 5 ? 1.2 : 0.8))));
    }
    // контур схемы виден всегда
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1 / dpr;
    g.strokeRect(snap(ox), snap(oy), snap(ox + W * s) - snap(ox), snap(oy + H * s) - snap(oy));
  }

  private drawRulers(g: CanvasRenderingContext2D): void {
    const { s, ox, oy, w, h } = this.vp;
    const dark = this.style.dark;
    const bg = dark ? '#1f1e1b' : '#ffffff';
    const fg = dark ? '#cfc9bd' : '#5f5a50';
    const line = dark ? '#3a3732' : '#e2ddd3';
    g.fillStyle = bg;
    g.fillRect(0, 0, this.cssW, RULER);
    g.fillRect(0, 0, RULER, this.cssH);
    g.fillStyle = line;
    g.fillRect(RULER, RULER - 1, w, 1);
    g.fillRect(RULER - 1, RULER, 1, h);

    const step = s * 10 >= 26 ? 10 : s * 50 >= 30 ? 50 : 100;
    const v = this.vp.visible();
    g.fillStyle = fg;
    g.strokeStyle = fg;
    g.lineWidth = 1;
    g.font = `11px ${FONT}`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.save();
    g.beginPath();
    g.rect(RULER, 0, w, RULER);
    g.clip();
    for (let x = Math.ceil(v.x0 / step) * step; x <= v.x1; x += step) {
      if (x === 0) continue;
      const X = RULER + ox + x * s;
      g.fillRect(Math.round(X), RULER - 6, 1, 6);
      g.fillText(String(x), X + 3, RULER / 2 - 1);
    }
    g.restore();
    g.save();
    g.beginPath();
    g.rect(0, RULER, RULER, h);
    g.clip();
    for (let y = Math.ceil(v.y0 / step) * step; y <= v.y1; y += step) {
      if (y === 0) continue;
      const Y = RULER + oy + y * s;
      g.fillRect(RULER - 6, Math.round(Y), 6, 1);
      g.save();
      g.translate(RULER / 2 + 1, Y + 3);
      g.rotate(-Math.PI / 2);
      g.textAlign = 'right';
      g.fillText(String(y), 0, 0);
      g.restore();
    }
    g.restore();
    this.onViewChange?.();
  }
}
