import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { t } from './strings';

type Offline = 'preparing' | 'ready' | 'unsupported' | 'error';

const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function diagnostics(extra: string[]): Promise<string> {
  const lines = [...extra, `ua: ${navigator.userAgent}`, `secure: ${window.isSecureContext}`];
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    lines.push(`sw: ${reg ? `scope=${reg.scope} active=${reg.active?.state ?? '-'} waiting=${!!reg.waiting} installing=${!!reg.installing}` : 'нет'}`);
    lines.push(`controller: ${!!navigator.serviceWorker?.controller}`);
  } catch (e) {
    lines.push(`sw error: ${String(e)}`);
  }
  try {
    const keys = await caches.keys();
    lines.push(`caches: ${keys.join(', ') || 'нет'}`);
  } catch (e) {
    lines.push(`caches error: ${String(e)}`);
  }
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) lines.push(`storage: ${Math.round((est.usage ?? 0) / 1024)} КБ из ${Math.round((est.quota ?? 0) / 1048576)} МБ`);
  } catch {
    /* нет данных */
  }
  return lines.join('\n');
}
type Storage = 'unknown' | 'persistent' | 'best-effort';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function App() {
  const [offline, setOffline] = useState<Offline>('serviceWorker' in navigator ? 'preparing' : 'unsupported');
  const [online, setOnline] = useState(navigator.onLine);
  const [storage, setStorage] = useState<Storage>('unknown');
  const [update, setUpdate] = useState<null | (() => void)>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [diag, setDiag] = useState('');

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const updateSW = registerSW({
        onOfflineReady: () => setOffline('ready'),
        onNeedRefresh: () => setUpdate(() => () => updateSW(true)),
        onRegisteredSW: (_url, reg) => {
          if (reg?.active) setOffline('ready');
        },
        onRegisterError: (e) => {
          setOffline('error');
          setErrors((l) => [...l, `register: ${String(e)}`]);
        },
      });
      navigator.serviceWorker.ready.then(() => setOffline((s) => (s === 'error' ? s : 'ready')));
    }

    // Просим браузер не стирать наши данные при нехватке места.
    (async () => {
      try {
        const persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.());
        setStorage(persisted ? 'persistent' : 'best-effort');
      } catch {
        setStorage('best-effort');
      }
    })();

    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => diagnostics(errors).then(setDiag), 3000);
    return () => clearTimeout(id);
  }, [errors, offline]);

  const offlineText = {
    ready: t.offlineReady,
    preparing: t.offlinePreparing,
    unsupported: t.offlineUnsupported,
    error: t.offlineError,
  }[offline];
  const storageText =
    storage === 'persistent' ? t.storagePersistent : storage === 'best-effort' ? t.storageBestEffort : t.storageUnknown;

  return (
    <main class="shell">
      <header class="hero">
        <img class="logo" src={`${import.meta.env.BASE_URL}icons/favicon.svg`} alt="" width={72} height={72} />
        <h1>{t.appName}</h1>
        <p class="tagline">{t.tagline}</p>
      </header>

      {update && (
        <div class="card update">
          <span>{t.updateAvailable}</span>
          <button onClick={() => update()}>{t.updateButton}</button>
        </div>
      )}

      <section class="card">
        <h2>{t.statusTitle}</h2>
        <ul class="status">
          <li class={offline === 'ready' ? 'ok' : 'wait'}>{offlineText}</li>
          <li class={online ? 'ok' : 'info'}>{online ? t.networkOnline : t.networkOffline}</li>
          <li class={storage === 'persistent' ? 'ok' : 'info'}>{storageText}</li>
          <li class={isStandalone() ? 'ok' : 'info'}>{isStandalone() ? t.installed : t.inBrowser}</li>
        </ul>
      </section>

      {isApple && offline !== 'ready' && <p class="card hint">{t.iosHint}</p>}

      <p class="note">{t.stageNote}</p>
      {diag && (
        <details class="diag">
          <summary>{t.details}</summary>
          <pre>{diag}</pre>
        </details>
      )}
      <p class="version">
        {t.version} {__APP_VERSION__} · {new Date(__BUILD_TIME__).toLocaleString('ru-RU')}
      </p>
    </main>
  );
}
