import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { notificationService } from '../services/notificationService.js';
import { reminderService } from '../services/reminderService.js';
import { useSettings } from './useSettings.jsx';
import { useOnResume } from './useAppLifecycle.js';

const RemindersContext = createContext(null);

/**
 * Owns the notification-permission flow and keeps scheduled reminders in sync.
 *
 * Permission UX (Android 13+):
 *  1. Nothing is asked at launch.
 *  2. When the user chooses to enable reminders we first explain why (our dialog),
 *     then show the system prompt once.
 *  3. If denied, we explain how to allow it in phone settings — we never re-prompt
 *     automatically.
 */
export function RemindersProvider({ children }) {
  const { settings, ready, update } = useSettings();
  const [permission, setPermission] = useState('unknown');
  const [dialog, setDialog] = useState(null); // null | 'explain' | 'denied' | 'unsupported'
  const [lastSync, setLastSync] = useState(null);

  const refreshPermission = useCallback(async () => {
    const state = await notificationService.checkPermission();
    setPermission(state);
    return state;
  }, []);

  const sync = useCallback(async () => {
    const result = await reminderService.sync(settings);
    setLastSync(result);
  }, [settings]);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  // Re-plan whenever relevant settings change.
  useEffect(() => {
    if (ready) sync();
  }, [ready, sync]);

  // Coming back to the app: permission may have changed in system settings,
  // and the scheduling window needs to roll forward.
  useOnResume(() => {
    refreshPermission().then(() => ready && sync());
  });

  const requestEnable = useCallback(async () => {
    const state = await refreshPermission();
    if (state === 'granted') {
      update({ remindersEnabled: true });
    } else if (state === 'unsupported') {
      update({ remindersEnabled: true }); // keep the preference; it applies in the Android app
      setDialog('unsupported');
    } else if (state === 'denied') {
      setDialog('denied');
    } else {
      setDialog('explain');
    }
  }, [refreshPermission, update]);

  const confirmPermission = useCallback(async () => {
    const state = await notificationService.requestPermission();
    setPermission(state);
    update({ permissionAsked: true, ...(state === 'granted' ? { remindersEnabled: true } : {}) });
    setDialog(state === 'granted' ? null : 'denied');
  }, [update]);

  const disable = useCallback(() => update({ remindersEnabled: false }), [update]);
  const closeDialog = useCallback(() => setDialog(null), []);

  const value = useMemo(
    () => ({ permission, dialog, lastSync, requestEnable, confirmPermission, disable, closeDialog }),
    [permission, dialog, lastSync, requestEnable, confirmPermission, disable, closeDialog],
  );
  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useReminders() {
  const ctx = useContext(RemindersContext);
  if (!ctx) throw new Error('useReminders must be used inside <RemindersProvider>');
  return ctx;
}
