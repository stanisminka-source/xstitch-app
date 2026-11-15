// Отрисовка схемы на Canvas 2D.
// Крупно — плитками (кусками схемы, нарисованными заранее и сохранёнными в памяти),
// мелко — одной картинкой «одна клетка = один пиксель». Сетка, линейки и линии
// бэкстича рисуются поверх на каждом кадре: это дёшево и всегда чётко.
import type { Pattern } from '../pattern/format';
import { contrastInk, css, darken, luminance, mix, type RGB } from '../lib/color';
import type { GridMode, ViewMode } from '../store/settings';
import { Viewport } from './viewport';

export interface RenderStyle {
  mode: ViewMode;
  grid: GridMode;
  dim: number;
  /** Индекс выделенного цвета в палитре или null. */
  selected: number | null;
  dark: boolean;
}

export const RULER = 20; // ширина линеек, CSS px
const WHITE: RGB = [255, 255, 255];
const FABRIC: RGB = [243, 239, 230];
const INK: RGB = [29, 27, 24];
const ACCENT = '#e0761c';
const TILE_PX = 512; // примерный размер плитки в пикселях экрана
const MAX_TILES = 64;
const SYMBOL_MIN_CSS = 9; // мельче — символы не читаются, не рисуем
const FONT = '-apple-system, system-ui, Roboto, "Segoe UI", "Noto Sans", sans-serif';

type AnyCanvas = HTMLCanvasElement;

interface Tile {
  canvas: AnyCanvas;
  used: number;
}

interface Pulse {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  start: number;
}

function makeCanvas(w: number, h: number): AnyCanvas {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
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
  private tiles = new Map<string, Tile>();
  private atlas: { p: number; canvas: AnyCanvas; cols: number; rowsPerVariant: number } | null = null;
  private activeP = 0;
  private raf = 0;
  private tick = 0;
  private pulse: Pulse | null = null;
  private fills: string[] = [];
  private dimFills: string[] = [];
  private inks: ('black' | 'white')[] = [];
  private dimRgb: RGB[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    readonly pattern: Pattern,
    readonly symbols: string[],
    style: RenderStyle,
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
    if (s.mode === style.mode && s.grid === style.grid && s.dim === style.dim && s.selected === style.selected && s.dark === style.dark) return;
    const tilesChange = s.mode !== style.mode || s.dim !== style.dim || s.selected !== style.selected;
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

  flash(x0: number, y0: number, x1: number, y1: number): void {
    this.pulse = { x0, y0, x1, y1, start: performance.now() };
    this.invalidate();
  }

  invalidate(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.draw());
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.tiles.clear();
  }

  // ——— Подготовка цветов ———

  private prepareStyle(): void {
    const { dim, mode } = this.style;
    const base = mode === 'stitched' ? FABRIC : WHITE;
    this.fills = this.rgb.map(css);
    this.dimRgb = this.rgb.map((c) => mix(c, base, dim));
    this.dimFills = this.dimRgb.map(css);
    this.inks = this.rgb.map(contrastInk);
    this.styleVersion++;
    this.tiles.clear();
    this.flat = this.buildFlat();
  }

  private isDimmed(k: number): boolean {
    const sel = this.style.selected;
    return sel !== null && k !== sel;
  }

  /** Картинка «одна клетка — один пиксель» для мелкого масштаба и мини-карты. */
  private buildFlat(): AnyCanvas {
    const { width: w, height: h } = this.pattern;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    const { mode } = this.style;
    const base = mode === 'stitched' ? FABRIC : WHITE;
    const colors = this.rgb.map((rgb, k): RGB => {
      const dimmed = this.isDimmed(k);
      if (mode === 'selectedOnly' && dimmed) return base;
      let c: RGB = rgb;
      if (mode === 'symbol') {
        const L = Math.round(255 - (1 - luminance(rgb)) * 120);
        c = [L, L, L];
      } else if (mode === 'coloredSymbol') {
        c = mix(rgb, WHITE, 0.45);
      }
      return dimmed ? mix(c, base, this.style.dim) : c;
    });
    for (let i = 0; i < this.idx.length; i++) {
      const k = this.idx[i];
      const col = k < 0 ? base : colors[k];
      img.data[i * 4] = col[0];
      img.data[i * 4 + 1] = col[1];
      img.data[i * 4 + 2] = col[2];
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  flatImage(): AnyCanvas {
    return this.flat ?? (this.flat = this.buildFlat());
  }

  // ——— Символы ———

  /** Все символы, нарисованные заранее в трёх цветах: чёрном, белом и цвете нити. */
  private getAtlas(p: number) {
    if (this.atlas?.p === p) return this.atlas;
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
    this.atlas = { p, canvas, cols, rowsPerVariant };
    return this.atlas;
  }

  // ——— Плитки ———

  private tileCells(p: number): number {
    const t = 2 ** Math.floor(Math.log2(TILE_PX / p));
    return Math.max(4, Math.min(64, t));
  }

  private renderTile(p: number, T: number, tx: number, ty: number): AnyCanvas {
    const { width: W, height: H } = this.pattern;
    const cx0 = tx * T;
    const cy0 = ty * T;
    const tw = Math.min(T, W - cx0);
    const th = Math.min(T, H - cy0);
    const canvas = makeCanvas(tw * p, th * p);
    const g = canvas.getContext('2d', { alpha: false })!;
    const { mode, selected, dim } = this.style;
    const stitched = mode === 'stitched';
    const symbols = mode !== 'color' && mode !== 'stitched' && p / this.dpr >= SYMBOL_MIN_CSS;
    const atlas = symbols ? this.getAtlas(p) : null;

    g.fillStyle = css(stitched ? FABRIC : WHITE);
    g.fillRect(0, 0, tw * p, th * p);

    if (stitched && p >= 8) {
      // отверстия канвы
      g.fillStyle = css(darken(FABRIC, 0.14));
      const r = Math.max(1, p * 0.09);
      for (let y = 0; y <= th; y++) for (let x = 0; x <= tw; x++) g.fillRect(x * p - r, y * p - r, r * 2, r * 2);
    }

    const ring = Math.max(1, p * 0.07);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const k = this.idx[(cy0 + y) * W + cx0 + x];
        if (k < 0) continue;
        const dimmed = selected !== null && k !== selected;
        if (mode === 'selectedOnly' && dimmed) continue;
        const px = x * p;
        const py = y * p;

        if (stitched) {
          const c = dimmed ? this.dimRgb[k] : this.rgb[k];
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
        } else if (mode === 'color' || mode === 'colorSymbol' || mode === 'selectedOnly') {
          g.fillStyle = dimmed ? this.dimFills[k] : this.fills[k];
          g.fillRect(px, py, p, p);
        }

        if (atlas) {
          let variant: number;
          let alpha = 1;
          if (mode === 'symbol') {
            variant = 0;
            if (dimmed) alpha = 1 - dim;
          } else if (mode === 'coloredSymbol') {
            variant = 2;
            if (dimmed) alpha = 1 - dim;
          } else {
            const ink = dimmed ? contrastInk(this.dimRgb[k]) : this.inks[k];
            variant = ink === 'black' ? 0 : 1;
            if (dimmed) alpha = Math.max(0.25, 1 - dim);
          }
          const sx = (k % atlas.cols) * p;
          const sy = (variant * atlas.rowsPerVariant + Math.floor(k / atlas.cols)) * p;
          g.globalAlpha = alpha;
          g.drawImage(atlas.canvas, sx, sy, p, p, px, py, p, p);
          g.globalAlpha = 1;
        }

        if (selected !== null && k === selected && p >= 6) {
          const filled = mode === 'color' || mode === 'colorSymbol' || mode === 'selectedOnly';
          g.strokeStyle = filled && this.inks[k] === 'white' ? '#fff' : css(INK);
          g.lineWidth = ring;
          g.beginPath();
          g.arc(px + p / 2, py + p / 2, p * 0.42 - ring / 2, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }
    return canvas;
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
            tile = { canvas: this.renderTile(p, T, tx, ty), used: 0 };
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
      g.strokeStyle = this.fills[index.get(l.color)!];
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
