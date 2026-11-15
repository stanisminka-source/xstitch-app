// Панель «Прогресс»: сколько вышито, журнал по дням, резервная копия.
import { dayKey, type Meta } from '../progress/backup';
import { percent, type Progress } from '../progress/progress';
import { plural, t } from '../strings';
import { Icon } from './Icon';

interface Props {
  prog: Progress;
  meta: Meta;
  colors: number;
  onExport(): void;
  onImport(): void;
  onClose(): void;
}

function dayLabel(key: string): string {
  const today = new Date();
  if (key === dayKey(today)) return t.today;
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y)) return t.yesterday;
  const [Y, M, D] = key.split('-').map(Number);
  return new Date(Y, M - 1, D).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function ProgressSheet({ prog, meta, colors, onExport, onImport, onClose }: Props) {
  let finished = 0;
  for (let k = 0; k < colors; k++) if (prog.countBy[k] > 0 && prog.doneBy[k] >= prog.countBy[k]) finished++;
  const days = Object.entries(meta.days)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 30);
  const max = Math.max(1, ...days.map(([, v]) => Math.abs(v)));
  const last = meta.backupAt
    ? new Date(meta.backupAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div class="sheet tall">
      <div class="sheet-head">
        <b class="grow">{t.progressTitle2}</b>
        <button class="icon-btn" onClick={onClose} aria-label={t.close}>
          <Icon name="x" />
        </button>
      </div>
      <div class="more">
        <section class="pg-summary">
          <div class="pg-big">{percent(prog.doneTotal, prog.total)}%</div>
          <div>
            <p>{t.stitchedOf(plural(prog.doneTotal), plural(prog.total))}</p>
            <p class="muted">
              {t.leftTotal} {plural(prog.total - prog.doneTotal)} · {t.colorsDone} {finished} {t.of} {colors}
            </p>
          </div>
        </section>

        <section>
          <h3>{t.journal}</h3>
          {days.length ? (
            <div class="days">
              {days.map(([k, v]) => (
                <div class="day" key={k}>
                  <span class="day-label">{dayLabel(k)}</span>
                  <span class="day-bar">
                    <span style={{ width: `${(Math.abs(v) / max) * 100}%` }} class={v < 0 ? 'neg' : ''} />
                  </span>
                  <span class="day-n">{v < 0 ? `−${plural(-v)}` : plural(v)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p class="muted small">{t.journalEmpty}</p>
          )}
        </section>

        <section>
          <h3>{t.backup}</h3>
          <p>{last ? t.backupLast(last) : t.backupNever}</p>
          {meta.backupAt !== null && <p class="muted small">{t.backupSince(plural(meta.since))}</p>}
          <div class="segs" style={{ margin: '10px 0 8px' }}>
            <button class="primary" onClick={onExport}>
              <Icon name="upload" /> {t.backupSave}
            </button>
            <button class="seg" onClick={onImport}>
              <Icon name="download" /> {t.backupLoad}
            </button>
          </div>
          <p class="muted small">{t.backupHelp}</p>
        </section>
      </div>
    </div>
  );
}
