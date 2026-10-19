import { useState } from 'react';
import { ChevronLeft, ChevronRight } from './Icons.jsx';
import { MonthPicker } from './MonthPicker.jsx';
import { lunarMonthsLabel, monthYearLabel, samvatLabel } from '../utils/format.js';
import { useSettings } from '../hooks/useSettings.jsx';

/** Switches calendar dates/weekdays between Hindi (अ) and English (A). Shows the language you'll get. */
export function DateLangToggle({ className = '' }) {
  const { settings, update } = useSettings();
  const toEnglish = settings.dateLang !== 'en';
  return (
    <button
      type="button"
      onClick={() => update({ dateLang: toEnglish ? 'en' : 'hi' })}
      aria-label={toEnglish ? 'तारीख़ें अंग्रेज़ी में दिखाएँ (Show dates in English)' : 'तारीख़ें हिंदी में दिखाएँ'}
      className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-full border border-gold/70 bg-card px-1.5 text-sm font-bold text-maroon shadow-sm active:bg-gold-soft ${className}`}
    >
      {toEnglish ? 'A' : 'अ'}
    </button>
  );
}

/** Compact month switcher: ‹ अक्टूबर २०२६ [A] › [आज]. */
export function MonthNavigator({ y, m, monthData, isCurrentMonth, onPrev, onNext, onToday, onPick }) {
  const [picking, setPicking] = useState(false);
  const { settings } = useSettings();
  const lang = settings.dateLang;
  const lunar = monthData ? lunarMonthsLabel(monthData.lunarMonths) : '';
  const samvat = monthData ? samvatLabel(monthData.samvats, lang) : '';
  const title = monthYearLabel(y, m, lang);

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={onPrev}
        aria-label="पिछला महीना"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-maroon active:bg-gold-soft"
      >
        <ChevronLeft />
      </button>

      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        <div className="flex items-center justify-center gap-1.5">
          <h2 className="min-w-0 truncate font-display text-xl leading-snug font-bold text-maroon">
            {onPick ? (
              <button
                type="button"
                onClick={() => setPicking(true)}
                aria-label={`${title} — महीना या वर्ष बदलें`}
                className="rounded-lg px-1 underline decoration-gold/60 decoration-dotted underline-offset-4"
              >
                {title}
              </button>
            ) : (
              title
            )}
          </h2>
          <DateLangToggle />
        </div>
        <p className="min-h-4 truncate text-[0.72rem] leading-tight text-muted">{[lunar, samvat].filter(Boolean).join(' · ')}</p>
      </div>

      <button
        type="button"
        onClick={onNext}
        aria-label="अगला महीना"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-maroon active:bg-gold-soft"
      >
        <ChevronRight />
      </button>

      {!isCurrentMonth && (
        <button
          type="button"
          onClick={onToday}
          aria-label="आज के महीने पर जाएँ"
          className="min-h-9 shrink-0 rounded-full border border-maroon px-3 text-sm font-semibold text-maroon active:bg-maroon active:text-white"
        >
          {lang === 'en' ? 'Today' : 'आज'}
        </button>
      )}
      {picking && <MonthPicker y={y} m={m} lang={lang} onPick={onPick} onClose={() => setPicking(false)} />}
    </div>
  );
}
