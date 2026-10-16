import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { msUntilNextMidnight, todayKey } from '../utils/date.js';

/** Calls `handler` whenever the app returns to the foreground. */
export function useOnResume(handler) {
  const saved = useRef(handler);
  useEffect(() => {
    saved.current = handler;
  });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') saved.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    let sub;
    if (Capacitor.isNativePlatform()) {
      sub = App.addListener('resume', () => saved.current());
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      Promise.resolve(sub).then((s) => s?.remove()).catch(() => {});
    };
  }, []);
}

/**
 * Today's local date key. Rolls over at midnight and re-checks on resume
 * (timers do not fire while the phone sleeps).
 */
export function useToday() {
  const [today, setToday] = useState(() => todayKey());

  useEffect(() => {
    let timer;
    const schedule = () => {
      // +1s guard so we land safely after midnight.
      timer = setTimeout(() => {
        setToday(todayKey());
        schedule();
      }, msUntilNextMidnight() + 1000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  useOnResume(() => setToday(todayKey()));
  return today;
}

/**
 * Android hardware back button. `handler` returns true if it handled the press;
 * otherwise the app exits (standard Android behaviour on the root screen).
 */
export function useBackButton(handler) {
  const saved = useRef(handler);
  useEffect(() => {
    saved.current = handler;
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const sub = App.addListener('backButton', () => {
      if (!saved.current()) App.exitApp();
    });
    return () => {
      Promise.resolve(sub).then((s) => s?.remove()).catch(() => {});
    };
  }, []);
}
