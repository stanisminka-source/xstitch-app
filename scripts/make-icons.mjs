// Рисует значки Smile & Stitch в public/icons без сторонних библиотек:
// смайлик, «вышитый» оранжевыми крестиками по белой канве.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

// Схема смайлика: X — крестик, точка — пустая клетка.
const ART = [
  '.................',
  '.....XXXXXXX.....',
  '...XXX.....XXX...',
  '..XX.........XX..',
  '..X...........X..',
  '.XX...........XX.',
  '.X...X.....X...X.',
  '.X...X.....X...X.',
  '.X.............X.',
  '.X.............X.',
  '.X..X.......X..X.',
  '.XX..X.....X..XX.',
  '..X...XXXXX...X..',
  '..XX.........XX..',
  '...XXX.....XXX...',
  '.....XXXXXXX.....',
  '.................',
];
const N = ART.length;

const BG = [255, 255, 255];
const HOLE = [226, 222, 214];
const TOP = [240, 128, 32]; // верхний стежок
const UNDER = [204, 96, 18]; // нижний стежок, чуть темнее
const EDGE = [176, 80, 14];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel, ss = 3) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // сглаживание: усредняем несколько точек внутри пикселя
      const acc = [0, 0, 0];
      for (let i = 0; i < ss; i++) for (let j = 0; j < ss; j++) {
        const c = pixel(x + (i + 0.5) / ss, y + (j + 0.5) / ss, size);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(acc[k] / (ss * ss));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// pad — доля поля вокруг рисунка (для maskable-значка Android больше).
function painter(pad) {
  return (x, y, s) => {
    const u = (x / s - pad) / (1 - 2 * pad);
    const v = (y / s - pad) / (1 - 2 * pad);
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return BG;
    const cu = u * N, cv = v * N;
    const cx = Math.floor(cu), cy = Math.floor(cv);
    const fx = cu - cx, fy = cv - cy; // положение внутри клетки 0..1
    if (ART[cy][cx] === 'X') {
      const w = 0.17, m = 0.1; // толщина стежка, отступ от края клетки
      const inside = fx > m * 0.5 && fx < 1 - m * 0.5 && fy > m * 0.5 && fy < 1 - m * 0.5;
      const d1 = Math.abs(fx - fy) / Math.SQRT2; // верхний: \
      const d2 = Math.abs(fx + fy - 1) / Math.SQRT2; // нижний: /
      if (inside && d1 < w) return d1 > w * 0.75 ? EDGE : TOP;
      if (inside && d2 < w) return d2 > w * 0.75 ? EDGE : UNDER;
    }
    // отверстия канвы в углах клеток
    const hx = Math.min(fx, 1 - fx), hy = Math.min(fy, 1 - fy);
    if (Math.hypot(hx, hy) < 0.1) return HOLE;
    return BG;
  };
}

function svg() {
  const cells = [];
  ART.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== 'X') return;
    const a = x + 0.12, b = x + 0.88, c = y + 0.12, d = y + 0.88;
    cells.push(`<path d="M${a} ${d}L${b} ${c}" stroke="rgb(${UNDER})"/><path d="M${a} ${c}L${b} ${d}" stroke="rgb(${TOP})"/>`);
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 ${N + 1} ${N + 1}"><rect x="-0.5" y="-0.5" width="${N + 1}" height="${N + 1}" rx="3" fill="#fff"/><g stroke-width="0.3" stroke-linecap="round">${cells.join('')}</g></svg>\n`;
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, painter(0.03)));
writeFileSync('public/icons/icon-512.png', png(512, painter(0.03)));
writeFileSync('public/icons/icon-maskable-512.png', png(512, painter(0.12)));
writeFileSync('public/icons/apple-touch-icon.png', png(180, painter(0.05)));
writeFileSync('public/icons/favicon.svg', svg());
console.log('Значки готовы: public/icons');
