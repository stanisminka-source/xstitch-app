// Нитки для выбранного участка: сколько крестиков каждого цвета и сколько мотков.
import { useState } from 'preact/hooks';
import { css, inkOf } from '../lib/color';
import type { PaletteColor } from '../pattern/format';
import { fabricById, skeins, skeinsToBuy, type AreaRow, type FabricChoice } from '../pattern/threads';
import { plural, t } from '../strings';
import { Icon } from './Icon';

interface Props {
  rows: AreaRow[];
  palette: PaletteColor[];
  symbols: string[];
  fabric: FabricChoice;
  onPick(k: number): void;
  onClose(): void;
}

const fmt = (v: number) => (v < 0.1 ? '0,1' : v.toFixed(1).replace('.', ','));

export function AreaSheet({ rows, palette, symbols, fabric, onPick, onClose }: Props) {
  const [onlyLeft, setOnlyLeft] = useState(true);
  const fab = fabricById(fabric.fabric);
  const list = rows.map((r) => ({ ...r, n: onlyLeft ? r.left : r.total })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
  const crosses = list.reduce((s, r) => s + r.n, 0);
  const buy = list.reduce((s, r) => s + skeinsToBuy(r.n, fab.count, fabric.strands), 0);
  return (
    <div class="sheet tall">
      <div class="sheet-head">
        <b class="grow">{t.areaTitle}</b>
        <button class="icon-btn" onClick={onClose} aria-label={t.close}>
          <Icon name="x" />
        </button>
      </div>
      <div class="fabric-bar">
        <div class="segs">
          <button class={`seg${onlyLeft ? ' on' : ''}`} onClick={() => setOnlyLeft(true)}>{t.areaOnlyLeft}</button>
          <button class={`seg${!onlyLeft ? ' on' : ''}`} onClick={() => setOnlyLeft(false)}>{t.areaAll}</button>
        </div>
        <p class="muted small fabric-info">
          {t.areaTotals(plural(crosses), list.length)} · {t.areaFabric(fab.label, t.strands(fabric.strands))}
        </p>
        {list.length > 0 && <p class="small fabric-info">{t.areaBuy(buy)}</p>}
      </div>
      <div class="thread-list">
        {list.map((r) => {
          const c = palette[r.k];
          return (
            <button key={r.k} class="thread" onClick={() => onPick(r.k)}>
              <span class="sw" style={{ background: css(c.rgb), color: inkOf(c.rgb) }}>{symbols[r.k]}</span>
              <span class="code">{c.code}</span>
              <span class="name">{c.name}</span>
              <span class="count">{plural(r.n)} {t.crosses}</span>
              <span class="skeins">{t.areaSkeins(fmt(skeins(r.n, fab.count, fabric.strands)))}</span>
            </button>
          );
        })}
        {!list.length && <p class="muted pad">{t.areaNothing}</p>}
      </div>
    </div>
  );
}
