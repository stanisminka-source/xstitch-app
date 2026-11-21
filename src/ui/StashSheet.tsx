// «Мои нитки»: какие нитки уже есть дома и сколько.
import { useState } from 'preact/hooks';
import { css } from '../lib/color';
import type { PaletteColor } from '../pattern/format';
import { compareCodes } from '../pattern/threads';
import { addCodes, parseCodes, stashKey, type Stash, type StashItem } from '../store/stash';
import { dmcThread } from '../pattern/catalog';
import { t } from '../strings';
import { Icon } from './Icon';

interface Props {
  stash: Stash;
  /** Цвета открытой схемы — чтобы показать название и образец. */
  palette: PaletteColor[];
  onChange(s: Stash): void;
  onClose(): void;
}

export function StashSheet({ stash, palette, onChange, onClose }: Props) {
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const known = new Map(palette.map((c) => [stashKey(c.brand, c.code), c]));
  const items = Object.entries(stash).sort((a, b) => compareCodes(a[1].code, b[1].code));
  const inPattern = items.filter(([k]) => known.has(k)).length;

  const add = () => {
    const codes = parseCodes(text);
    if (!codes.length) return;
    // номера пишем так, как в таблице DMC (BLANC, ECRU)
    const r = addCodes(stash, codes.map((c) => dmcThread(c)?.code ?? c));
    onChange(r.stash);
    setText('');
    const unknown = codes.filter((c) => !dmcThread(c));
    setNote(`${t.stashAdded(r.added.length, r.already)}${unknown.length ? `. ${t.stashUnknown(unknown)}` : ''}`);
  };
  const update = (key: string, patch: Partial<StashItem>) => onChange({ ...stash, [key]: { ...stash[key], ...patch } });
  const remove = (key: string) => {
    const next = { ...stash };
    delete next[key];
    onChange(next);
  };

  return (
    <div class="sheet tall">
      <div class="sheet-head">
        <b class="grow">{t.stashTitle}</b>
        <button class="icon-btn" onClick={onClose} aria-label={t.close}>
          <Icon name="x" />
        </button>
      </div>
      <div class="fabric-bar">
        <form
          class="stash-add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            type="text"
            inputMode="text"
            autoCapitalize="off"
            autoComplete="off"
            placeholder={t.stashPlaceholder}
            value={text}
            onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
          />
          <button class="primary small" type="submit" disabled={!text.trim()}>
            {t.stashAdd}
          </button>
        </form>
        <p class="muted small fabric-info">{note ?? t.stashHelp}</p>
        {items.length > 0 && <p class="small fabric-info">{t.stashCount(items.length, inPattern)}</p>}
      </div>
      <div class="thread-list">
        {items.map(([key, it]) => {
          const c = known.get(key) ?? dmcThread(it.code);
          return (
            <div key={key} class="thread stash-row">
              <span class="sw" style={{ background: c ? css(c.rgb) : 'var(--surface-2)' }} />
              <span class="code">{it.code}</span>
              <span class="name">{c?.name ?? ''}</span>
              <span class="stepper">
                <button class="icon-btn" aria-label={t.stashLess} disabled={it.skeins <= 1} onClick={() => update(key, { skeins: it.skeins - 1 })}>
                  −
                </button>
                <b>{it.skeins}</b>
                <button class="icon-btn" aria-label={t.stashMore} disabled={it.skeins >= 99} onClick={() => update(key, { skeins: it.skeins + 1 })}>
                  +
                </button>
              </span>
              <label class="low">
                <input type="checkbox" role="switch" checked={it.low} onChange={(e) => update(key, { low: (e.currentTarget as HTMLInputElement).checked })} />
                <span>{t.stashLow}</span>
              </label>
              <button class="icon-btn" aria-label={t.deletePattern} onClick={() => remove(key)}>
                <Icon name="trash" />
              </button>
            </div>
          );
        })}
        {!items.length && <p class="muted pad">{t.stashEmpty}</p>}
      </div>
    </div>
  );
}
