import { describe, expect, it } from 'vitest';
import { normalizeOrganizer, normalizeSlots, propose, ranked, replacements } from '../src/pattern/organizer';
import { compareCodes } from '../src/pattern/threads';

const codes = ['310', '150', '3865', '666', 'BLANC'];
const codeOf = (k: number) => codes[k];
const rows = [
  { k: 0, total: 900, left: 100, halfTotal: 0, halfLeft: 0 },
  { k: 1, total: 50, left: 50, halfTotal: 0, halfLeft: 0 },
  { k: 2, total: 400, left: 400, halfTotal: 0, halfLeft: 0 },
  { k: 3, total: 50, left: 0, halfTotal: 0, halfLeft: 0 },
  { k: 4, total: 50, left: 50, halfTotal: 0, halfLeft: 0 },
];

describe('Органайзер', () => {
  it('самые частые цвета — первыми; вышитые не предлагаем', () => {
    const list = ranked(rows, 'left', codeOf, compareCodes);
    expect(list.map((p) => codeOf(p.k))).toEqual(['3865', '310', 'BLANC', '150']);
    const all = ranked(rows, 'all', codeOf, compareCodes);
    expect(all.map((p) => codeOf(p.k))).toEqual(['310', '3865', 'BLANC', '150', '666']);
  });

  it('на органайзер — сколько мест, остальное — «не поместились», и доля крестиков', () => {
    const r = propose(ranked(rows, 'left', codeOf, compareCodes), 2);
    expect(r.placed.map((p) => codeOf(p.k))).toEqual(['3865', '310']);
    expect(r.rest.map((p) => codeOf(p.k))).toEqual(['BLANC', '150']);
    expect(r.coverage).toBeCloseTo(500 / 600);
  });

  it('на освободившееся место — следующий по частоте цвет, которого нет на органайзере', () => {
    const list = ranked(rows, 'left', codeOf, compareCodes);
    const org = { codes: ['3865', '666'], source: 'all' as const, basis: 'left' as const, at: 0 };
    expect(replacements(list, org, codeOf, 2).map((p) => codeOf(p.k))).toEqual(['310', 'BLANC']);
  });

  it('битые настройки заменяются обычными', () => {
    expect(normalizeSlots('12')).toBe(12);
    expect(normalizeSlots(0)).toBe(20);
    expect(normalizeSlots(1000)).toBe(20);
    expect(normalizeOrganizer({ codes: [1, 2] })).toBeNull();
    expect(normalizeOrganizer({ codes: ['310'], source: 'x' })).toEqual({ codes: ['310'], source: 'all', basis: 'left', at: 0 });
  });
});
