import { useState } from 'react';
import { ChevronLeft, ChevronRight } from './Icons.jsx';
import { MonthPicker } from './MonthPicker.jsx';
import { lunarMonthsLabel, monthYearLabel, samvatLabel } from '../utils/format.js';

/** Compact one-row month switcher: ‹ अक्टूबर २०२६ › [आज]. */
export function MonthNavigator({ y, m, monthData, isCurrentMonth, onPrev, onNext, onToday, onPick }) {
  const [picking, setPicking] = useState(false);
  const lunar = monthData ? lunarMonthsLabel(monthData.lunarMonths) : '';
  const samvat = monthData ? samvatLabel(monthData.samvats) : '';

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
        <h2 className="font-display text-xl leading-snug text-maroon">
          {onPick ? (
            <button
              type="button"
              onClick={() => setPicking(true)}
              aria-label={`${monthYearLabel(y, m)} — महीना या वर्ष बदलें`}
              className="rounded-lg px-2 underline decoration-gold/60 decoration-dotted underline-offset-4"
            >
              {monthYearLabel(y, m)}
            </button>
          ) : (
            monthYearLabel(y, m)
          )}
        </h2>
        <p className="min-h-4 truncate text-[0.7rem] leading-tight text-muted">
          {[lunar, samvat].filter(Boolean).join(' · ')}
        </p>
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
          आज
        </button>
      )}
      {picking && <MonthPicker y={y} m={m} onPick={onPick} onClose={() => setPicking(false)} />}
    </div>
  );
}
