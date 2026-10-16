import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { storageService } from '../services/storageService.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY, sanitizeSettings } from '../services/settings.js';

const SettingsContext = createContext(null);

/** Loads settings once from device storage and persists every change. */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => sanitizeSettings(DEFAULT_SETTINGS));
  const [ready, setReady] = useState(false);
  const latest = useRef(settings);

  useEffect(() => {
    let cancelled = false;
    storageService.getJSON(SETTINGS_KEY, null).then((stored) => {
      if (cancelled) return;
      const next = sanitizeSettings(stored ?? DEFAULT_SETTINGS);
      latest.current = next;
      setSettings(next);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Accepts a partial object or an updater function. */
  const update = useCallback((patch) => {
    const prev = latest.current;
    const next = sanitizeSettings({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) });
    latest.current = next;
    setSettings(next);
    storageService.setJSON(SETTINGS_KEY, next);
    return next;
  }, []);

  const value = useMemo(() => ({ settings, ready, update }), [settings, ready, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
