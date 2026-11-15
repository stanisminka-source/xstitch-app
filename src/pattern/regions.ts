// Участки одного цвета: связные группы клеток (соседство по 8 направлениям).
// Нужны для перехода «к ближайшему участку этого цвета».

export interface Region {
  /** Центр участка в клетках (центр клетки = +0.5). */
  cx: number;
  cy: number;
  count: number;
  x0: number;
  y0: number;
  x1: number; // включительно
  y1: number;
}

export function findRegions(cells: ArrayLike<number>, width: number, height: number, color: number): Region[] {
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const regions: Region[] = [];
  for (let start = 0; start < cells.length; start++) {
    if (cells[start] !== color || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let sx = 0, sy = 0, n = 0;
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      sx += x; sy += y; n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width || (dx === 0 && dy === 0)) continue;
          const j = ny * width + nx;
          if (!seen[j] && cells[j] === color) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    regions.push({ cx: sx / n + 0.5, cy: sy / n + 0.5, count: n, x0, y0, x1, y1 });
  }
  return regions;
}

/** Участки по удалённости от точки (x, y) — ближайшие первыми. */
export function byDistance(regions: Region[], x: number, y: number): Region[] {
  const d = (r: Region) => {
    // расстояние до прямоугольника участка, а не до центра: крупный участок рядом — ближе
    const dx = Math.max(r.x0 - x, 0, x - (r.x1 + 1));
    const dy = Math.max(r.y0 - y, 0, y - (r.y1 + 1));
    return Math.hypot(dx, dy) + Math.hypot(r.cx - x, r.cy - y) * 0.01;
  };
  return [...regions].sort((a, b) => d(a) - d(b));
}
