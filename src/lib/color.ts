export type RGB = readonly [number, number, number];

/** Относительная яркость по WCAG, 0..1. */
export function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Чёрный или белый — что читается лучше поверх цвета. */
export function contrastInk(c: RGB): 'black' | 'white' {
  const L = luminance(c);
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? 'black' : 'white';
}

/** Смешивает цвет с другим: t = 0 — исходный, 1 — второй. */
export function mix(a: RGB, b: RGB, t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function css(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function darken(c: RGB, t: number): [number, number, number] {
  return mix(c, [0, 0, 0], t);
}

/** Цвет текста поверх образца нити (CSS). */
export function inkOf(rgb: RGB): string {
  return contrastInk(rgb) === 'black' ? '#1d1b18' : '#fff';
}
