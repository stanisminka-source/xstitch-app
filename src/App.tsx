import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { t } from './strings';

type Offline = 'preparing' | 'ready' | 'unsupported';
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

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const updateSW = registerSW({
        onOfflineReady: () => setOffline('ready'),
        onNeedRefresh: () => setUpdate(() => () => updateSW(true)),
        onRegisteredSW: (_url, reg) => {
          if (reg?.active) setOffline('ready');
        },
      });
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

  const offlineText =
    offline === 'ready' ? t.offlineReady : offline === 'preparing' ? t.offlinePreparing : t.offlineUnsupported;
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

      <p class="note">{t.stageNote}</p>
      <p class="version">
        {t.version} {__APP_VERSION__} · {new Date(__BUILD_TIME__).toLocaleString('ru-RU')}
      </p>
    </main>
  );
}
