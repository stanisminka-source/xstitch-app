// Нитки для выбранного участка: сколько крестиков каждого цвета и сколько мотков.
import { useState } from 'preact/hooks';
import { css, inkOf } from '../lib/color';
import type { PaletteColor } from '../pattern/format';
import { compareCodes, crossUnits, fabricById, skeins, skeinsToBuy, type AreaRow, type FabricChoice } from '../pattern/threads';
import type { ThreadSort } from '../store/settings';
import { plural, t } from '../strings';
import { Icon } from './Icon';
import { MinCrosses } from './Sheets';
import { haveAmount, listFileName, listPdfData, needToBuy, stashKey, type ListRow, type Stash } from '../store/stash';
import { exportListPdf } from '../pdf/exportList';

interface Props {
  rows: AreaRow[];
  palette: PaletteColor[];
  symbols: string[];
  fabric: FabricChoice;
  sort: ThreadSort;
  onSort(s: ThreadSort): void;
  title: string;
  stash: Stash;
  onToast(msg: string): void;
  onShop(rows: ListRow[]): void;
  onOrganizer(): void;
  minCrosses: number;
  onMinCrosses(n: number): void;
  onPick(k: number): void;
  onClose(): void;
}

const fmt = (v: number) => (v < 0.1 ? '0,1' : v.toFixed(1).replace('.', ','));

export function AreaSheet({ rows, palette, symbols, fabric, sort, onSort, title, stash, onToast, onShop, onOrganizer, minCrosses, onMinCrosses, onPick, onClose }: Props) {
  const [onlyLeft, setOnlyLeft] = useState(true);
  const fab = fabricById(fabric.fabric);
  // для покупки удобнее по возрастанию номера; «по количеству» — как в общем списке ниток
  const list = rows
    .map((r) => ({ ...r, n: onlyLeft ? r.left : r.total, h: onlyLeft ? r.halfLeft : r.halfTotal }))
    .filter((r) => r.n > 0)
    .sort((a, b) => (sort === 'count' ? b.n - a.n : compareCodes(palette[a.k].code, palette[b.k].code)));
  const crosses = list.reduce((s, r) => s + r.n, 0);
  const need = (r: (typeof list)[0]) => skeins(crossUnits(r.n, r.h), fab.count, fabric.strands);
  const haveOf = (k: number) => stash[stashKey(palette[k].brand, palette[k].code)];
  const useStash = Object.keys(stash).length > 0;
  // с запасами — сколько докупить; без них — по целому мотку каждого цвета, как раньше
  const rawBuy = (r: (typeof list)[0]) => (useStash ? needToBuy(need(r), haveAmount(haveOf(r.k))) : skeinsToBuy(crossUnits(r.n, r.h), fab.count, fabric.strands));
  // редкие нитки (меньше порога крестиков на участке) пока не покупаем
  const deferred = (r: (typeof list)[0]) => minCrosses > 0 && r.n < minCrosses;
  const buyOf = (r: (typeof list)[0]) => (deferred(r) ? 0 : rawBuy(r));
  const deferredCount = list.filter((r) => deferred(r) && rawBuy(r) > 0).length;
  const buy = list.reduce((s, r) => s + buyOf(r), 0);
  const buyRows = (): ListRow[] =>
    list.filter((r) => buyOf(r) > 0).map((r) => ({ code: palette[r.k].code, name: palette[r.k].name, rgb: palette[r.k].rgb, need: need(r), have: haveOf(r.k), buy: buyOf(r) }));
  const exportList = async () => {
    const data = listPdfData({
      title: `${t.listPattern}: ${title}`,
      heading: t.listAreaHeading,
      notes: [`${t.fabric}: ${fab.label}, ${t.strands(fabric.strands)}`, onlyLeft ? t.listBuyNote : t.areaAll],
      rows: buyRows(),
      mode: 'buy',
    });
    try {
      await exportListPdf(data, listFileName(title, 'участок-покупки'));
    } catch (e) {
      onToast(`${t.fileError}: ${(e as Error).message}`);
    }
  };
  return (
    <div class="sheet tall">
      <div class="sheet-head">
        <b class="grow">{t.areaTitle}</b>
        <button class="seg" onClick={() => onSort(sort === 'code' ? 'count' : 'code')}>
          <Icon name="sort" /> {sort === 'code' ? t.sortCode : t.sortCount}
        </button>
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
        {list.length > 0 && <MinCrosses value={minCrosses} onChange={onMinCrosses} />}
        {list.length > 0 && (
          <p class="small fabric-info">
            {useStash ? t.areaBuyStash(buy) : t.areaBuy(buy)}
            {deferredCount > 0 && ` ${t.deferred(deferredCount, minCrosses)}`}
          </p>
        )}
        {list.length > 0 && (
          <button class="seg" onClick={exportList} disabled={!buy}>
            <Icon name="share" /> {t.listExport}
          </button>
        )}
        {list.length > 0 && (
          <button class="seg" onClick={onOrganizer}>
            <Icon name="org" /> {t.orgOpenArea}
          </button>
        )}
        {buy > 0 && (
          <button class="primary small" onClick={() => onShop(buyRows())}>
            <Icon name="bag" /> {t.shopStart}
          </button>
        )}
      </div>
      <div class="thread-list">
        {list.map((r) => {
          const c = palette[r.k];
          return (
            <button key={r.k} class={`thread${deferred(r) ? ' deferred' : ''}`} onClick={() => onPick(r.k)}>
              <span class="sw" style={{ background: css(c.rgb), color: inkOf(c.rgb) }}>{symbols[r.k]}</span>
              <span class="code">{c.code}</span>
              <span class="name">{c.name}</span>
              <span class="count">
                {plural(r.n)} {t.crosses}
                {r.h ? `, ${t.halves(plural(r.h))}` : ''}
              </span>
              <span class="skeins">{deferred(r) ? t.deferredShort : t.areaSkeins(fmt(skeins(crossUnits(r.n, r.h), fab.count, fabric.strands)))}</span>
            </button>
          );
        })}
        {!list.length && <p class="muted pad">{t.areaNothing}</p>}
      </div>
    </div>
  );
}
