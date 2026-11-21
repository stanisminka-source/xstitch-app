// «В магазине»: отмечаю, что взяла с полки, и сколько мотков; потом — в «Мои нитки».
import { useState } from 'preact/hooks';
import { css } from '../lib/color';
import { dmcThread } from '../pattern/catalog';
import { parseCodes, tidyCode } from '../store/stash';
import type { ShopItem, ShopSession } from '../store/shop';
import { t } from '../strings';
import { Icon } from './Icon';

interface Props {
  session: ShopSession;
  onChange(s: ShopSession): void;
  onSave(): void;
  onLater(): void;
  onCancel(): void;
}

export function ShopSheet({ session, onChange, onSave, onLater, onCancel }: Props) {
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const items = session.items;
  const got = items.filter((i) => i.checked && i.got > 0).length;
  const set = (i: number, patch: Partial<ShopItem>) => onChange({ ...session, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  const addExtra = () => {
    const codes = parseCodes(extra);
    if (!codes.length) return;
    const next = [...items];
    const unknown: string[] = [];
    for (const raw of codes) {
      const code = tidyCode(raw);
      const at = next.findIndex((it) => it.code.toUpperCase() === code.toUpperCase());
      if (at >= 0) {
        next[at] = { ...next[at], checked: true, got: Math.max(1, next[at].got) };
        continue;
      }
      const c = dmcThread(code);
      if (!c) unknown.push(code);
      next.push({ code: c?.code ?? code, name: c?.name ?? '', rgb: c?.rgb ?? null, plan: 0, got: 1, checked: true });
    }
    onChange({ ...session, items: next });
    setExtra('');
    setNote(unknown.length ? t.stashUnknown(unknown) : null);
  };

  return (
    <div class="sheet tall">
      <div class="sheet-head">
        <b class="grow">
          {t.shopTitle} · {t.shopProgress(got, items.length)}
        </b>
        <button class="icon-btn" onClick={onLater} aria-label={t.shopLater}>
          <Icon name="x" />
        </button>
      </div>
      <div class="fabric-bar">
        <p class="muted small fabric-info">{note ?? t.shopHelp}</p>
        <form
          class="stash-add"
          onSubmit={(e) => {
            e.preventDefault();
            addExtra();
          }}
        >
          <input
            type="text"
            autoCapitalize="off"
            autoComplete="off"
            placeholder={t.shopExtra}
            value={extra}
            onInput={(e) => setExtra((e.currentTarget as HTMLInputElement).value)}
          />
          <button class="seg" type="submit" disabled={!extra.trim()}>
            {t.shopAdd}
          </button>
        </form>
      </div>
      <div class="thread-list">
        {items.map((it, i) => (
          <div key={it.code} class={`thread shop-row${it.checked ? ' on' : ''}`}>
            <label class="shop-check">
              <input type="checkbox" checked={it.checked} onChange={(e) => set(i, { checked: (e.currentTarget as HTMLInputElement).checked, got: Math.max(1, it.got) })} />
              <span class="sw" style={{ background: it.rgb ? css(it.rgb) : 'var(--surface-2)' }} />
              <span class="code">{it.code}</span>
              <span class="name">
                {it.name}
                {it.plan > 0 && <span class="muted"> · {t.shopPlan(it.plan)}</span>}
              </span>
            </label>
            <span class="stepper">
              <button class="icon-btn" aria-label={t.stashLess} disabled={it.got <= 0} onClick={() => set(i, { got: it.got - 1, checked: it.got - 1 > 0 && it.checked })}>
                −
              </button>
              <b>{it.got}</b>
              <button class="icon-btn" aria-label={t.stashMore} disabled={it.got >= 99} onClick={() => set(i, { got: it.got + 1, checked: true })}>
                +
              </button>
            </span>
          </div>
        ))}
      </div>
      <div class="shop-foot">
        <button class="primary" onClick={onSave} disabled={!got}>
          <Icon name="check" /> {t.shopSave}
        </button>
        <button class="seg" onClick={onCancel}>
          {t.shopCancel}
        </button>
      </div>
    </div>
  );
}
