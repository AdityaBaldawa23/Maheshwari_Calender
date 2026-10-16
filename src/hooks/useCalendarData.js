import { useEffect, useState } from 'react';
import { calendarService } from '../services/calendarService.js';

/**
 * Month data for the grid. Data is bundled locally, so this resolves within
 * milliseconds; until then the grid renders dates only (no spinner needed).
 */
export function useMonthData(y, m) {
  const [state, setState] = useState({ key: null, data: null });
  const key = `${y}-${m}`;

  useEffect(() => {
    let cancelled = false;
    calendarService
      .getCalendarForMonth(y, m)
      .then((data) => !cancelled && setState({ key, data }))
      .catch((err) => {
        console.error('[calendar] month load failed', err);
        if (!cancelled) setState({ key, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [y, m, key]);

  return state.key === key ? state.data : null;
}

/** Full info for one date (or null while loading / when no date is given). */
export function useDateInfo(dateKey) {
  const [state, setState] = useState({ key: null, info: null });

  useEffect(() => {
    if (!dateKey) return undefined;
    let cancelled = false;
    calendarService
      .getDateInfo(dateKey)
      .then((info) => !cancelled && setState({ key: dateKey, info }))
      .catch((err) => {
        console.error('[calendar] date load failed', err);
        if (!cancelled) setState({ key: dateKey, info: null });
      });
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  return state.key === dateKey ? state.info : null;
}
