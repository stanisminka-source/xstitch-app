import { useEffect } from 'preact/hooks';

/** Пока схема открыта, экран не гаснет (если браузер это умеет). */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const request = async () => {
      if (document.visibilityState !== 'visible' || !alive) return;
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        /* отказано — например, режим энергосбережения */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') request();
    };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => undefined);
    };
  }, [enabled]);
}
