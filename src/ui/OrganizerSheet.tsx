// «Органайзер»: какие нитки заранее разложить, если мест на органайзере мало.
import { useMemo, useState } from 'preact/hooks';
import { css, inkOf } from '../lib/color';
import type { PaletteColor } from '../pattern/format';
import { amount, MAX_SLOTS, propose, ranked, replacements, type OrgBasis, type Organizer, type OrgPick, type OrgSource } from '../pattern/organizer';
import { compareCodes, type AreaRow } from '../pattern/threads';
import { exportListPdf } from '../pdf/exportList';
import { haveText, listFileName, stashKey, type Stash } from '../store/stash';
import { plural, t } from '../strings';
import { Icon } from './Icon';

interface Props {
  palette: PaletteColor[];
  symbols: string[];
  title: string;
  stash: Stash;
  slots: number;
  onSlots(n: number): void;
  saved: Organizer | null;
  onSave(o: Organizer | null): void;
  /** Крестики по цветам для всей схемы или выбранного участка. */
  countsFor(source: OrgSource): AreaRow[];
  /** Меняется, когда меняются отметки — чтобы пересчитать. */
  version: number;
  hasArea: boolean;
  initialSource: OrgSource;
  onChooseArea(): void;
  onPick(k: number): void;
  onToast(msg: string): void;
  onClose(): void;
}

export function OrganizerSheet(p: Props) {
  // открыли «для участка», а разложен органайзер для всей схемы (или наоборот) — сразу предлагаем новый
  const [editing, setEditing] = useState(!p.saved || p.saved.source !== p.initialSource);
  const [source, setSource] = useState<OrgSource>(p.initialSource);
  const [basis, setBasis] = useState<OrgBasis>(p.saved?.basis ?? 'left');
  const [showRest, setShowRest] = useState(false);
  const codeOf = (k: number) => p.palette[k].code;
  const kOf = useMemo(() => new Map(p.palette.map((c, k) => [c.code.toUpperCase(), k])), [p.palette]);

  // при просмотре разложенного органайзера считаем по тому, как его раскладывали
  const src = editing ? source : (p.saved?.source ?? 'all');
  const bas = editing ? basis : (p.saved?.basis ?? 'left');
  const rows = useMemo(() => (src === 'area' && !p.hasArea ? [] : p.countsFor(src)), [src, p.version, p.hasArea]);
  const list = useMemo(() => ranked(rows, bas, codeOf, compareCodes), [rows, bas]);
  const nOf = useMemo(() => new Map(rows.map((r) => [r.k, amount(r, bas)])), [rows, bas]);
  const plan = propose(list, p.slots);

  const save = () => {
    p.onSave({ codes: plan.placed.map((x) => codeOf(x.k)), source, basis, at: Date.now() });
    setEditing(false);
  };

  const exportPdf = async () => {
    const codes = editing ? plan.placed.map((x) => codeOf(x.k)) : (p.saved?.codes ?? []);
    const data = {
      heading: t.orgTitle,
      lines: [
        `${t.listPattern}: ${p.title}`,
        `${src === 'area' ? t.orgSourceArea : t.orgSourceAll} · ${bas === 'left' ? t.orgBasisLeft : t.orgBasisAll}`,
        t.orgCoverage(codes.length, Math.round(plan.coverage * 100)),
      ],
      columns: [t.orgColCrosses, t.orgColSlot],
      rows: codes.map((code, i) => {
        const k = kOf.get(code.toUpperCase());
        const c = k === undefined ? null : p.palette[k];
        return { code, name: c?.name ?? '', rgb: c?.rgb ?? null, cells: [plural(k === undefined ? 0 : (nOf.get(k) ?? 0)), `№ ${i + 1}`] };
      }),
      total: t.orgPdfTotal(codes.length, p.slots),
      footer: `Smile & Stitch · ${new Date().toLocaleDateString('ru-RU')}`,
    };
    try {
      await exportListPdf(data, listFileName(p.title, 'органайзер'));
    } catch (e) {
      p.onToast(`${t.fileError}: ${(e as Error).message}`);
    }
  };

  const row = (k: number, n: number, slot: number | null, extra?: preact.ComponentChildren) => {
    const c = p.palette[k];
    const have = p.stash[stashKey(c.brand, c.code)];
    return (
      <button key={`${slot}-${k}`} class={`thread${n === 0 ? ' finished' : ''}`} onClick={() => p.onPick(k)}>
        {slot !== null && <span class="slot">{slot}</span>}
        <span class="sw" style={{ background: css(c.rgb), color: inkOf(c.rgb) }}>{p.symbols[k]}</span>
        <span class="code">{c.code}</span>
        <span class="name">
          {c.name}
          {have && <span class="have"> · {haveText(have)}</span>}
          {extra}
        </span>
        <span class="count">{n === 0 ? <><Icon name="check" size={14} /> {t.done}</> : `${plural(n)} ${t.crosses}`}</span>
      </button>
    );
  };

  // разложенный органайзер: освободившиеся места и кого туда повесить
  const savedView = () => {
    const org = p.saved!;
    const free = org.codes.map((code, i) => ({ code, i })).filter(({ code }) => {
      const k = kOf.get(code.toUpperCase());
      return k === undefined || (nOf.get(k) ?? 0) === 0;
    });
    const subs = replacements(list, org, codeOf, free.length);
    const subFor = new Map(free.map((f, j) => [f.i, subs[j]] as const));
    const put = (i: number, pick: OrgPick) => {
      const codes = [...org.codes];
      codes[i] = codeOf(pick.k);
      p.onSave({ ...org, codes });
    };
    return (
      <>
        <div class="fabric-bar">
          <p class="small fabric-info">
            {t.orgSavedInfo(new Date(org.at).toLocaleDateString('ru-RU'), org.source === 'area' ? t.orgSourceArea : t.orgSourceAll)}
            {free.length > 0 && ` ${t.orgFree(free.length)}`}
          </p>
          <button class="seg" onClick={() => setEditing(true)}>
            <Icon name="undo" /> {t.orgRedo}
          </button>
          <button class="seg" onClick={exportPdf}>
            <Icon name="share" /> {t.listExport}
          </button>
        </div>
        <div class="thread-list">
          {org.codes.map((code, i) => {
            const k = kOf.get(code.toUpperCase());
            if (k === undefined) return null;
            const sub = subFor.get(i);
            return row(
              k,
              nOf.get(k) ?? 0,
              i + 1,
              sub && (
                <button
                  class="seg org-sub"
                  onClick={(e) => {
                    e.stopPropagation();
                    put(i, sub);
                  }}
                >
                  {t.orgPut(codeOf(sub.k))}
                </button>
              ),
            );
          })}
        </div>
      </>
    );
  };

  const editView = () => (
    <>
      <div class="fabric-bar">
        <span class="org-slots">
          {t.orgSlots}
          <button class="icon-btn" aria-label={t.stashLess} disabled={p.slots <= 1} onClick={() => p.onSlots(p.slots - 1)}>−</button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SLOTS}
            value={p.slots}
            onChange={(e) => {
              const v = Math.round(Number((e.currentTarget as HTMLInputElement).value));
              if (v >= 1 && v <= MAX_SLOTS) p.onSlots(v);
            }}
          />
          <button class="icon-btn" aria-label={t.stashMore} disabled={p.slots >= MAX_SLOTS} onClick={() => p.onSlots(p.slots + 1)}>+</button>
        </span>
        <div class="segs">
          <button class={`seg${source === 'all' ? ' on' : ''}`} onClick={() => setSource('all')}>{t.orgSourceAll}</button>
          <button class={`seg${source === 'area' ? ' on' : ''}`} onClick={() => setSource('area')}>{t.orgSourceArea}</button>
        </div>
        <div class="segs">
          <button class={`seg${basis === 'left' ? ' on' : ''}`} onClick={() => setBasis('left')}>{t.orgBasisLeft}</button>
          <button class={`seg${basis === 'all' ? ' on' : ''}`} onClick={() => setBasis('all')}>{t.orgBasisAll}</button>
        </div>
        {source === 'area' && !p.hasArea ? (
          <p class="small fabric-info">
            {t.orgNoArea}{' '}
            <button class="seg" onClick={p.onChooseArea}>
              <Icon name="area" /> {t.orgChooseArea}
            </button>
          </p>
        ) : (
          <p class="small fabric-info">
            {list.length ? t.orgCoverage(plan.placed.length, Math.round(plan.coverage * 100)) : t.areaNothing}
            {plan.rest.length > 0 && ` ${t.orgRest(plan.rest.length)}`}
          </p>
        )}
        <button class="primary small" disabled={!plan.placed.length} onClick={save}>
          <Icon name="check" /> {t.orgSave}
        </button>
        {p.saved && (
          <button class="seg" onClick={() => setEditing(false)}>
            {t.close}
          </button>
        )}
      </div>
      <div class="thread-list">
        {plan.placed.map((x, i) => row(x.k, x.n, i + 1))}
        {plan.rest.length > 0 && (
          <button class="seg org-rest" onClick={() => setShowRest((v) => !v)}>
            {showRest ? t.orgHideRest : t.orgShowRest(plan.rest.length)}
          </button>
        )}
        {showRest && plan.rest.map((x) => row(x.k, x.n, null))}
      </div>
    </>
  );

  return (
    <div class="sheet tall">
      <div class="sheet-head">
        <b class="grow">{t.orgTitle}</b>
        <button class="icon-btn" onClick={p.onClose} aria-label={t.close}>
          <Icon name="x" />
        </button>
      </div>
      {editing || !p.saved ? editView() : savedView()}
    </div>
  );
}
