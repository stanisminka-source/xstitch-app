// «Сверка цветов»: где цвет в PDF не похож на настоящую нитку и на что её можно заменить.
import { css, inkOf } from '../lib/color';
import type { PaletteColor } from '../pattern/format';
import { dmcThread } from '../pattern/catalog';
import { suggest, type ColorCheck, type Subs } from '../pattern/subs';
import type { ColorsMode } from '../store/settings';
import { stashKey, type Stash } from '../store/stash';
import { plural, t } from '../strings';
import { Icon } from './Icon';

interface Props {
  checks: ColorCheck[];
  /** Палитра схемы с заменами (номера, число крестиков) и исходная — до замен. */
  palette: PaletteColor[];
  base: PaletteColor[];
  symbols: string[];
  subs: Subs;
  stash: Stash;
  colors: ColorsMode;
  onColors(m: ColorsMode): void;
  /** Посмотреть на схеме, как будет с другой ниткой. */
  onPreview(k: number, to: string): void;
  onAccept(from: string, to: string): void;
  onRevert(from: string): void;
  onClose(): void;
}

const Sw = ({ rgb, title, children }: { rgb: readonly [number, number, number]; title?: string; children?: preact.ComponentChildren }) => (
  <span class="sw" title={title} style={{ background: css(rgb), color: inkOf(rgb) }}>
    {children}
  </span>
);

export function ColorsSheet(p: Props) {
  const inPattern = new Set(p.palette.filter((c) => c.count > 0).map((c) => c.code.toUpperCase()));
  const replaced = Object.entries(p.subs);
  return (
    <div class="sheet tall">
      <div class="sheet-head">
        <b class="grow">{t.colorsTitle}</b>
        <button class="icon-btn" onClick={p.onClose} aria-label={t.close}>
          <Icon name="x" />
        </button>
      </div>
      <div class="fabric-bar">
        <p class="small fabric-info">{p.checks.length ? t.colorsIntro(p.checks.length) : t.colorsAllGood}</p>
        <div class="segs">
          <button class={`seg${p.colors === 'pdf' ? ' on' : ''}`} onClick={() => p.onColors('pdf')}>{t.colorsPdf}</button>
          <button class={`seg${p.colors === 'thread' ? ' on' : ''}`} onClick={() => p.onColors('thread')}>{t.colorsThread}</button>
        </div>
      </div>
      <div class="thread-list colors-list">
        {replaced.length > 0 && <h4 class="colors-h">{t.colorsReplaced}</h4>}
        {replaced.map(([from, to]) => {
          const was = p.base.find((c) => c.code === from);
          const now = dmcThread(to);
          return (
            <div key={from} class="color-check">
              <div class="cc-row">
                {was && <Sw rgb={was.rgb} title={t.colorsInPdf} />}
                <Icon name="arrow" size={14} />
                {now && <Sw rgb={now.rgb} title={t.colorsReal} />}
                <span class="name">
                  <b>{from}</b> → <b>{to}</b> {now?.name ?? ''}
                </span>
                <button class="seg" onClick={() => p.onRevert(from)}>
                  <Icon name="undo" /> {t.colorsRevert}
                </button>
              </div>
            </div>
          );
        })}
        {p.checks.length > 0 && <h4 class="colors-h">{t.colorsDiffer}</h4>}
        {p.checks.map((ch) => {
          const c = p.palette[ch.k];
          const sugg = suggest(ch.pdf, c.code, 4);
          return (
            <div key={ch.k} class="color-check">
              <div class="cc-row">
                <Sw rgb={ch.pdf} title={t.colorsInPdf}>{p.symbols[ch.k]}</Sw>
                <Icon name="arrow" size={14} />
                <Sw rgb={ch.real} title={t.colorsReal} />
                <span class="name">
                  <b>{c.code}</b> {c.name}
                  <br />
                  <span class="muted small">
                    {plural(c.count)} {t.crosses} · {ch.level === 'strong' ? t.colorsStrong : t.colorsNoticeable}
                  </span>
                </span>
              </div>
              <div class="cc-sugg">
                <span class="muted small">{t.colorsCloser}</span>
                {sugg.map((s) => {
                  const tags = [inPattern.has(s.code.toUpperCase()) && t.colorsTagInPattern, p.stash[stashKey('DMC', s.code)] && t.colorsTagHave].filter(Boolean);
                  return (
                    <button key={s.code} class="cc-chip" onClick={() => p.onPreview(ch.k, s.code)} title={s.name}>
                      <Sw rgb={s.rgb} />
                      <span>
                        <b>{s.code}</b>
                        {tags.length > 0 && <span class="muted"> · {tags.join(', ')}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
