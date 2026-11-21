// Полная гамма DMC: чтобы у ниток из «Моих ниток» был цвет и название, даже если их нет в схеме.
import { DMC_RAW } from '../data/dmc';

export interface CatalogThread {
  code: string;
  name: string;
  rgb: [number, number, number];
}

const byKey = new Map<string, CatalogThread>(
  DMC_RAW.map(([code, name, r, g, b]) => [code.toUpperCase(), { code, name, rgb: [r, g, b] }]),
);

/** Нитка DMC по номеру (регистр не важен: blanc, Blanc, BLANC). */
export function dmcThread(code: string): CatalogThread | undefined {
  return byKey.get(code.trim().toUpperCase());
}

export const DMC_COUNT = byKey.size;
