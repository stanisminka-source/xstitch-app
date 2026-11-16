import { describe, expect, it } from 'vitest';
import { assignSymbols, SYMBOL_SET } from '../src/pattern/symbols';

const seg = new Intl.Segmenter('ru', { granularity: 'grapheme' });
const graphemes = (s: string) => [...seg.segment(s)].length;

describe('Символы', () => {
  it('хватает на 130 цветов: все разные и каждый — один знак', () => {
    expect(SYMBOL_SET.length).toBeGreaterThanOrEqual(130);
    expect(new Set(SYMBOL_SET).size).toBe(SYMBOL_SET.length);
    for (const s of SYMBOL_SET) expect(graphemes(s), s).toBe(1);
  });

  it('первые 106 знаков прежние, дальше — кириллица и фигуры, как в конструкторе схем', () => {
    expect(SYMBOL_SET[0]).toBe('●');
    expect(SYMBOL_SET[105]).toBe('Ω');
    expect(SYMBOL_SET.slice(106, 122).join('')).toBe('БДЖЗИЙЦЧШЩЪЫЬЭЮЯ');
    expect(SYMBOL_SET.slice(122, 138)).toEqual(['◐', '◑', '◒', '◓', '▣', '◈', '◉', '◎', '⊕', '⊗', '⊞', '⊠', '☼', '♪', '♫', '⌂']);
  });

  it('130 цветам — 130 разных одиночных символов, без номеров', () => {
    const counts = Array.from({ length: 130 }, (_, i) => 1000 - i);
    const out = assignSymbols(counts);
    expect(new Set(out).size).toBe(130);
    for (const s of out) {
      expect(graphemes(s), s).toBe(1);
      expect(s).not.toMatch(/^\d{2,}$/);
    }
    // самый частый цвет — самый простой знак, 130-й — последний из набора
    expect(out[0]).toBe('●');
    expect(out[129]).toBe(SYMBOL_SET[129]);
  });
});
