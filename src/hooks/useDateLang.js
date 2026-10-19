import { useSettings } from './useSettings.jsx';

/** 'hi' or 'en' — the user's choice for calendar dates, month names and weekday names. */
export function useDateLang() {
  return useSettings().settings.dateLang;
}
