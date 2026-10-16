import { memo } from 'react';
import { WEEKDAYS } from '../constants/terms.js';
import { cellTithiLabel, formatDate, fullTithiLabel, num, txt, weekdayName } from '../utils/format.js';
import { parseKey, weekdayOf } from '../utils/date.js';
import { useSwipe } from '../hooks/useSwipe.js';
import { CATEGORY_TEXT } from '../constants/categoryStyles.js';

function MoonGlyph({ paksha, onDark }) {
  const full = paksha === 'shukla';
  const ring = onDark ? 'border-white/80' : 'border-ink/70';
  const fill = full ? (onDark ? 'bg-white' : 'bg-card') : onDark ? 'bg-ink' : 'bg-ink/85';
  return <span aria-hidden="true" className={`inline-block h-3 w-3 shrink-0 rounded-full border ${ring} ${fill}`} />;
}

function ariaLabelFor(key, info, isToday) {
  const { y, m, d } = parseKey(key);
  const parts = [isToday ? 'आज' : '', formatDate(key), weekdayName(weekdayOf(y, m, d))];
  if (info?.panchang) parts.push(fullTithiLabel(info.panchang));
  for (const o of info?.occasions ?? []) parts.push(txt(o.title));
  return parts.filter(Boolean).join(', ');
}

/** Occasion names are shortened in cells: "दीपावली (लक्ष्मी पूजन)" → "दीपावली". */
const shortTitle = (o) => txt(o.title).split(' (')[0].split(' / ')[0];

const DayCell = memo(function DayCell({ dateKey, info, isToday, isSelected, onSelect }) {
  const { y, m, d } = parseKey(dateKey);
  const weekday = weekdayOf(y, m, d);
  const occasions = info?.occasions ?? [];
  const panchang = info?.panchang;
  const isMoonDay = panchang?.tithi === 15;
  const highlight = occasions.some((o) => o.importance === 'high');

  let tone = 'bg-card active:bg-gold-soft/60';
  if (highlight) tone = 'bg-saffron-soft/70 active:bg-saffron-soft';
  if (isToday) tone = 'bg-maroon text-white';

  return (
    <button
      type="button"
      onClick={() => onSelect(dateKey)}
      aria-label={ariaLabelFor(dateKey, info, isToday)}
      aria-current={isToday ? 'date' : undefined}
      aria-pressed={isSelected}
      className={`flex h-full w-full min-w-0 flex-col items-stretch gap-0.5 overflow-hidden px-1 pt-0.5 pb-1 text-left max-[359px]:px-0.5 ${tone} ${
        isSelected && !isToday ? 'shadow-[inset_0_0_0_2px_var(--color-gold)]' : ''
      }`}
    >
      <span className="flex items-start justify-between gap-0.5">
        <span
          className={`font-display text-[1.35rem] leading-tight ${
            isToday ? 'text-white' : weekday === 0 ? 'text-sunday' : 'text-ink'
          }`}
        >
          {num(d)}
        </span>
        {isMoonDay && (
          <span className="pt-1.5">
            <MoonGlyph paksha={panchang.paksha} onDark={isToday} />
          </span>
        )}
      </span>

      {panchang && (
        <span
          className={`line-clamp-2 text-[0.62rem] max-[359px]:text-[0.56rem] [overflow-wrap:anywhere] leading-tight ${
            isToday ? 'text-white/90' : isMoonDay ? 'font-semibold text-ink' : 'text-muted'
          }`}
        >
          {cellTithiLabel(panchang)}
        </span>
      )}

      {occasions.length > 0 && (
        <span className="mt-auto flex min-w-0 flex-col gap-px">
          <span
            className={`line-clamp-2 text-[0.62rem] max-[359px]:text-[0.56rem] [overflow-wrap:anywhere] leading-[1.2] font-semibold ${
              isToday ? 'text-gold-soft' : (CATEGORY_TEXT[occasions[0].category] ?? 'text-ink')
            }`}
          >
            {shortTitle(occasions[0])}
          </span>
          {occasions.length > 1 && (
            <span className={`text-[0.58rem] leading-none ${isToday ? 'text-white/80' : 'text-muted'}`}>
              +{num(occasions.length - 1)} और
            </span>
          )}
        </span>
      )}
    </button>
  );
});

/**
 * Full-height month grid in printed-calendar style (ruled cells, Sunday first).
 * Rows stretch to fill the available height. Swipe left/right to change month.
 * Works without panchang data (plain dates), so it never waits on loading.
 */
export function CalendarGrid({ weeks, days, today, selected, onSelect, onPrev, onNext }) {
  const swipe = useSwipe({ onSwipeLeft: onNext, onSwipeRight: onPrev });
  const lastRow = weeks.length - 1;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-card select-none"
      style={{ touchAction: 'pan-y' }}
      {...swipe}
    >
      <div className="grid shrink-0 grid-cols-7 bg-maroon" aria-hidden="true">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w.en}
            className={`py-1 text-center text-xs font-semibold ${i === 0 ? 'text-saffron-soft' : 'text-gold-soft'}`}
          >
            {txt(w.short)}
          </div>
        ))}
      </div>

      <div
        role="grid"
        aria-label="महीने का कैलेंडर"
        className="grid min-h-0 flex-1"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((week, wi) => (
          <div role="row" key={wi} className="grid min-h-0 grid-cols-7">
            {week.map((key, di) => {
              const borders = `${di < 6 ? 'border-r' : ''} ${wi < lastRow ? 'border-b' : ''} border-line`;
              return key ? (
                <div role="gridcell" key={key} className={`min-h-0 min-w-0 ${borders}`}>
                  <DayCell
                    dateKey={key}
                    info={days?.[key]}
                    isToday={key === today}
                    isSelected={key === selected}
                    onSelect={onSelect}
                  />
                </div>
              ) : (
                <div role="gridcell" key={`pad-${wi}-${di}`} aria-hidden="true" className={`bg-paper/70 ${borders}`} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
