// Жесты на схеме: один палец — прокрутка (с инерцией), два — масштаб,
// короткое касание — выбор клетки. Колесо мыши/трекпад — масштаб (для компьютера).
import { RULER, type SchemeRenderer } from './renderer';

export interface GestureHandlers {
  onTap(px: number, py: number): void;
  onUserMove(): void;
}

const TAP_SLOP = 8;
const TAP_MS = 350;

export function attachGestures(el: HTMLElement, r: SchemeRenderer, h: GestureHandlers): () => void {
  const pts = new Map<number, { x: number; y: number }>();
  let downAt = 0;
  let downPos = { x: 0, y: 0 };
  let moved = false;
  let multi = false;
  let pinch: { d: number; mx: number; my: number } | null = null;
  let vel = { x: 0, y: 0 };
  let lastMove = 0;
  let inertia = 0;

  const local = (e: PointerEvent | WheelEvent) => {
    const b = el.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const stopInertia = () => {
    cancelAnimationFrame(inertia);
    inertia = 0;
  };
  const end = () => {
    r.interacting = false;
    r.invalidate();
  };

  const down = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    stopInertia();
    const p = local(e);
    pts.set(e.pointerId, p);
    r.interacting = true;
    if (pts.size === 1) {
      downAt = performance.now();
      downPos = p;
      moved = false;
      multi = false;
      vel = { x: 0, y: 0 };
      lastMove = downAt;
    } else {
      multi = true;
      pinch = pinchState();
    }
  };

  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const move = (e: PointerEvent) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size >= 2 && pinch) {
      const now = pinchState();
      if (pinch.d > 0) r.vp.zoomAt(now.d / pinch.d, now.mx - RULER, now.my - RULER);
      r.vp.panBy(now.mx - pinch.mx, now.my - pinch.my);
      pinch = now;
      moved = true;
      h.onUserMove();
      r.invalidate();
      return;
    }
    if (pts.size === 1 && !multi) {
      if (!moved && Math.hypot(p.x - downPos.x, p.y - downPos.y) < TAP_SLOP) return;
      if (!moved) {
        moved = true;
        h.onUserMove();
      }
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const t = performance.now();
      const dt = Math.max(1, t - lastMove);
      vel = { x: 0.8 * (dx / dt) + 0.2 * vel.x, y: 0.8 * (dy / dt) + 0.2 * vel.y };
      lastMove = t;
      r.vp.panBy(dx, dy);
      r.invalidate();
    }
  };

  const up = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.delete(e.pointerId);
    if (pts.size === 1) {
      // второй палец поднят — продолжаем прокрутку оставшимся без скачка
      pinch = null;
      return;
    }
    if (pts.size > 0) return;
    pinch = null;
    const quick = performance.now() - downAt < TAP_MS;
    if (!moved && !multi && quick && e.type === 'pointerup') {
      end();
      h.onTap(p.x, p.y);
      return;
    }
    const speed = Math.hypot(vel.x, vel.y);
    if (!multi && moved && speed > 0.25 && performance.now() - lastMove < 80) {
      let last = performance.now();
      const step = () => {
        const t = performance.now();
        const dt = t - last;
        last = t;
        const decay = Math.pow(0.0035, dt / 1000);
        vel = { x: vel.x * decay, y: vel.y * decay };
        r.vp.panBy(vel.x * dt, vel.y * dt);
        r.invalidate();
        if (Math.hypot(vel.x, vel.y) > 0.02) inertia = requestAnimationFrame(step);
        else {
          inertia = 0;
          end();
        }
      };
      inertia = requestAnimationFrame(step);
    } else end();
  };

  let wheelEnd = 0;
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    stopInertia();
    const p = local(e);
    r.interacting = true;
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
    if (e.ctrlKey) {
      // щипок на трекпаде
      r.vp.zoomAt(Math.exp(-e.deltaY * 0.01), p.x - RULER, p.y - RULER);
    } else if (mouseWheel) {
      r.vp.zoomAt(Math.exp(-Math.sign(e.deltaY) * 0.2), p.x - RULER, p.y - RULER);
    } else {
      r.vp.panBy(-e.deltaX, -e.deltaY);
    }
    h.onUserMove();
    r.invalidate();
    clearTimeout(wheelEnd);
    wheelEnd = window.setTimeout(end, 150);
  };

  // Safari: не даём странице масштабироваться жестом поверх схемы
  const prevent = (e: Event) => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('gesturestart', prevent);
  return () => {
    stopInertia();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('gesturestart', prevent);
  };
}

/** Плавный перелёт к месту на схеме. */
export function animateTo(r: SchemeRenderer, cx: number, cy: number, s: number, ms = 450): Promise<void> {
  const from = r.vp.getView();
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      // масштаб меняем по логарифму — так перелёт выглядит ровно
      const sc = Math.exp(Math.log(from.s) + (Math.log(s) - Math.log(from.s)) * e);
      r.vp.setView({ cx: from.cx + (cx - from.cx) * e, cy: from.cy + (cy - from.cy) * e, s: sc });
      r.interacting = t < 1;
      r.invalidate();
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
