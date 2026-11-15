// Рисует значки приложения в public/icons без сторонних библиотек:
// крестик из двух стежков на квадрате канвы.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [247, 244, 238];
const HOLE = [222, 214, 200];
const THREAD = [181, 71, 106];
const THREAD_DARK = [140, 48, 78];

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
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// pad — доля поля вокруг рисунка (для maskable значка больше).
function painter(pad) {
  return (x, y, s) => {
    const u = (x / s - pad) / (1 - 2 * pad);
    const v = (y / s - pad) / (1 - 2 * pad);
    // сетка канвы: 6 клеток, отверстия в узлах
    const g = 6, cu = u * g, cv = v * g;
    const dx = cu - Math.round(cu), dy = cv - Math.round(cv);
    let col = BG;
    if (u > 0 && u < 1 && v > 0 && v < 1 && Math.hypot(dx, dy) < 0.09) col = HOLE;
    // крестик в центральной области 1..5 клеток
    const a = 1 / g, b = 5 / g, w = 0.075;
    if (u > a && u < b && v > a && v < b) {
      const d1 = Math.abs((u - a) - (v - a)) / Math.SQRT2;
      const d2 = Math.abs((u - a) + (v - a) - (b - a)) / Math.SQRT2;
      if (d2 < w) col = THREAD_DARK; // нижний стежок
      if (d1 < w) col = THREAD; // верхний стежок
    }
    return col;
  };
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, painter(0.04)));
writeFileSync('public/icons/icon-512.png', png(512, painter(0.04)));
writeFileSync('public/icons/icon-maskable-512.png', png(512, painter(0.14)));
writeFileSync('public/icons/apple-touch-icon.png', png(180, painter(0.06)));
writeFileSync(
  'public/icons/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect width="60" height="60" rx="12" fill="rgb(${BG})"/>` +
    `<path d="M12 48 48 12" stroke="rgb(${THREAD_DARK})" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M12 12 48 48" stroke="rgb(${THREAD})" stroke-width="9" stroke-linecap="round"/></svg>\n`,
);
console.log('Значки готовы: public/icons');
