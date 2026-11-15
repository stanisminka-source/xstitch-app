import { useEffect, useRef, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { parsePattern, PatternError } from './pattern/format';
import { db, patternId, type StoredPattern } from './store/db';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './store/settings';
import { t } from './strings';
import { Viewer } from './ui/Viewer';
import { Logo } from './ui/Logo';

export interface AppEnv {
  offlineReady: boolean;
  persisted: boolean | null;
  update: null | (() => void);
}

function useDarkTheme(theme: Settings['theme']): boolean {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const [sysDark, setSysDark] = useState(mq.matches);
  useEffect(() => {
    const f = () => setSysDark(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  const dark = theme === 'dark' || (theme === 'system' && sysDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#1c1b19' : '#ffffff'));
  }, [dark]);
  return dark;
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [current, setCurrent] = useState<StoredPattern | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [env, setEnv] = useState<AppEnv>({ offlineReady: false, persisted: null, update: null });
  const fileRef = useRef<HTMLInputElement>(null);
  const dark = useDarkTheme(settings?.theme ?? 'system');

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const updateSW = registerSW({
        onOfflineReady: () => setEnv((e) => ({ ...e, offlineReady: true })),
        onNeedRefresh: () => setEnv((e) => ({ ...e, update: () => updateSW(true) })),
      });
      navigator.serviceWorker.ready.then(() => setEnv((e) => ({ ...e, offlineReady: true })));
    }
    (async () => {
      let persisted = false;
      try {
        persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
      } catch {
        /* не поддерживается */
      }
      setEnv((e) => ({ ...e, persisted }));
    })();

    (async () => {
      setSettings(normalizeSettings(await db.get('settings').catch(() => null)));
      const id = await db.get<string>('current').catch(() => undefined);
      const p = id ? await db.getPattern(id).catch(() => undefined) : undefined;
      if (p) return setCurrent(p);
      const list = await db.listPatterns().catch(() => []);
      setCurrent(list.length ? ((await db.getPattern(list[0].id)) ?? null) : null);
    })();
  }, []);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...(s ?? DEFAULT_SETTINGS), ...patch };
      db.set('settings', next);
      return next;
    });
  };

  const openPattern = async (id: string) => {
    const p = await db.getPattern(id);
    if (p) {
      await db.set('current', id);
      setCurrent(p);
    }
  };

  const importFile = async (file: File) => {
    setError(null);
    setBusy(t.importing);
    try {
      const raw = JSON.parse(await file.text());
      if (raw?.format === 'smile-stitch-progress') throw new PatternError(t.progressNotPattern);
      const pattern = parsePattern(raw);
      const id = patternId(pattern);
      const stored: StoredPattern = {
        id,
        title: pattern.title,
        width: pattern.width,
        height: pattern.height,
        importedAt: Date.now(),
        pattern,
      };
      await db.savePattern(stored);
      await db.set('current', id);
      setCurrent(stored);
    } catch (e) {
      setError(e instanceof PatternError ? e.message : e instanceof SyntaxError ? 'Файл повреждён или это не JSON.' : String(e));
    } finally {
      setBusy(null);
    }
  };

  const deletePattern = async (id: string) => {
    await db.deletePattern(id);
    await Promise.all([db.del(`view:${id}`), db.del(`sel:${id}`), db.del(`done:${id}`), db.del(`meta:${id}`)]);
    if (current?.id === id) {
      const list = await db.listPatterns();
      if (list.length) await openPattern(list[0].id);
      else {
        await db.del('current');
        setCurrent(null);
      }
    }
  };

  const pickFile = () => fileRef.current?.click();

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      hidden
      onChange={(e) => {
        const f = (e.currentTarget as HTMLInputElement).files?.[0];
        (e.currentTarget as HTMLInputElement).value = '';
        if (f) importFile(f);
      }}
    />
  );

  if (!settings || current === undefined) {
    return <div class="splash"><Logo size={72} /></div>;
  }

  if (!current || busy) {
    return (
      <main class="empty">
        {fileInput}
        <Logo size={96} />
        <h1>{t.appName}</h1>
        {busy ? (
          <p class="muted">{busy}</p>
        ) : (
          <>
            <h2>{t.emptyTitle}</h2>
            <p class="muted">{t.emptyText}</p>
            <button class="primary big" onClick={pickFile}>{t.importButton}</button>
          </>
        )}
        {error && <p class="error">{t.importError}: {error}</p>}
        {env.update && <UpdateBanner run={env.update} />}
      </main>
    );
  }

  return (
    <>
      {fileInput}
      <Viewer
        key={current.id}
        stored={current}
        settings={settings}
        dark={dark}
        env={env}
        onSettings={updateSettings}
        onImport={pickFile}
        onOpen={openPattern}
        onDelete={deletePattern}
      />
      {error && (
        <div class="toast error" onClick={() => setError(null)}>
          {t.importError}: {error}
        </div>
      )}
      {env.update && <UpdateBanner run={env.update} />}
    </>
  );
}

function UpdateBanner({ run }: { run: () => void }) {
  return (
    <div class="toast update">
      <span>{t.updateAvailable}</span>
      <button class="primary" onClick={run}>{t.updateButton}</button>
    </div>
  );
}
