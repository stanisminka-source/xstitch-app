// Геометрия просмотра: какая клетка схемы где на экране.
// Все величины — в CSS-пикселях области схемы (без линеек).

export interface ViewState {
  /** Клетка в центре экрана (дробная). */
  cx: number;
  cy: number;
  /** Размер клетки в CSS-пикселях. */
  s: number;
}

export const MAX_SCALE = 80;

export class Viewport {
  w = 1;
  h = 1;
  s = 1;
  ox = 0;
  oy = 0;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {}

  setSize(w: number, h: number): void {
    const c = this.center();
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.setView({ ...c, s: this.s });
  }

  fitScale(): number {
    return Math.min(this.w / this.cols, this.h / this.rows);
  }

  minScale(): number {
    return Math.min(this.fitScale(), MAX_SCALE);
  }

  clampScale(s: number): number {
    return Math.min(MAX_SCALE, Math.max(this.minScale(), s));
  }

  fit(): void {
    this.s = this.fitScale();
    this.ox = (this.w - this.cols * this.s) / 2;
    this.oy = (this.h - this.rows * this.s) / 2;
  }

  /** Экранная точка → координаты в клетках (дробные). */
  toCell(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.ox) / this.s, y: (py - this.oy) / this.s };
  }

  /** Клетка под точкой экрана или null, если вне схемы. */
  cellAt(px: number, py: number): { x: number; y: number } | null {
    const c = this.toCell(px, py);
    const x = Math.floor(c.x);
    const y = Math.floor(c.y);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;
    return { x, y };
  }

  center(): { cx: number; cy: number } {
    const c = this.toCell(this.w / 2, this.h / 2);
    return { cx: c.x, cy: c.y };
  }

  getView(): ViewState {
    return { ...this.center(), s: this.s };
  }

  setView(v: ViewState): void {
    this.s = this.clampScale(v.s);
    this.ox = this.w / 2 - v.cx * this.s;
    this.oy = this.h / 2 - v.cy * this.s;
    this.clampPan();
  }

  /** Масштаб с неподвижной точкой (px, py) — как при щипке. */
  zoomAt(factor: number, px: number, py: number): void {
    const c = this.toCell(px, py);
    this.s = this.clampScale(this.s * factor);
    this.ox = px - c.x * this.s;
    this.oy = py - c.y * this.s;
    this.clampPan();
  }

  panBy(dx: number, dy: number): void {
    this.ox += dx;
    this.oy += dy;
    this.clampPan();
  }

  /** Не даём увести схему с экрана: если она меньше экрана — по центру,
   *  иначе край схемы может отойти от края экрана не больше чем на треть. */
  clampPan(): void {
    const m = Math.min(this.w, this.h) / 3;
    const pw = this.cols * this.s;
    const ph = this.rows * this.s;
    this.ox = pw <= this.w ? (this.w - pw) / 2 : Math.min(m, Math.max(this.w - pw - m, this.ox));
    this.oy = ph <= this.h ? (this.h - ph) / 2 : Math.min(m, Math.max(this.h - ph - m, this.oy));
  }

  /** Видимые клетки: [x0, x1) × [y0, y1), обрезано по схеме. */
  visible(): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.toCell(0, 0);
    const b = this.toCell(this.w, this.h);
    return {
      x0: Math.max(0, Math.floor(a.x)),
      y0: Math.max(0, Math.floor(a.y)),
      x1: Math.min(this.cols, Math.ceil(b.x)),
      y1: Math.min(this.rows, Math.ceil(b.y)),
    };
  }

  /** Видна ли схема целиком (почти). */
  showsAll(): boolean {
    return this.cols * this.s <= this.w * 1.05 && this.rows * this.s <= this.h * 1.05;
  }
}
