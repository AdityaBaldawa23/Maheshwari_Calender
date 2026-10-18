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

function ariaLabelFor(key, info, isToday, celebrationCount) {
  const { y, m, d } = parseKey(key);
  const parts = [isToday ? 'आज' : '', formatDate(key), weekdayName(weekdayOf(y, m, d))];
  if (info?.panchang) parts.push(fullTithiLabel(info.panchang));
  for (const o of info?.occasions ?? []) parts.push(txt(o.title));
  if (celebrationCount) parts.push(`${num(celebrationCount)} जन्मदिन/वर्षगांठ`);
  return parts.filter(Boolean).join(', ');
}

/** Occasion names are shortened in cells: "दीपावली (लक्ष्मी पूजन)" → "दीपावली". */
const shortTitle = (o) => txt(o.title).split(' (')[0].split(' / ')[0];

const DayCell = memo(function DayCell({ dateKey, info, isToday, isSelected, onSelect, celebrationCount = 0 }) {
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
      aria-label={ariaLabelFor(dateKey, info, isToday, celebrationCount)}
      aria-current={isToday ? 'date' : undefined}
      aria-pressed={isSelected}
      className={`flex h-full w-full min-w-0 flex-col items-stretch gap-0.5 overflow-hidden px-1 pt-0.5 pb-1 text-left max-[359px]:px-0.5 ${tone} ${
        isSelected && !isToday ? 'shadow-[inset_0_0_0_2px_var(--color-gold)]' : ''
      }`}
    >
      <span className="flex shrink-0 items-start justify-between gap-0.5">
        <span
          className={`font-display text-[1.35rem] leading-tight ${
            isToday ? 'text-white' : weekday === 0 ? 'text-sunday' : 'text-ink'
          }`}
        >
          {num(d)}
        </span>
        {isToday && <span className="rounded bg-white/20 px-1 text-[0.55rem] leading-4 font-semibold">आज</span>}
        {isMoonDay && (
          <span className="pt-1.5">
            <MoonGlyph paksha={panchang.paksha} onDark={isToday} />
          </span>
        )}
      </span>

      {panchang && (
        <span
          className={`line-clamp-2 shrink-0 text-[0.62rem] max-[359px]:text-[0.56rem] [overflow-wrap:anywhere] leading-tight ${
            isToday ? 'text-white/90' : isMoonDay ? 'font-semibold text-ink' : 'text-muted'
          }`}
        >
          {cellTithiLabel(panchang)}
        </span>
      )}

      {(occasions.length > 0 || celebrationCount > 0) && (
        <span className="mt-auto flex min-h-0 min-w-0 flex-col gap-px overflow-hidden">
          {celebrationCount > 0 && (
            <span aria-hidden="true" className={`shrink-0 text-[0.62rem] leading-tight font-semibold ${isToday ? 'text-gold-soft' : 'text-maroon'}`}>
              🎂 {num(celebrationCount)}
            </span>
          )}
          {occasions.length > 0 && (
          <span
            className={`line-clamp-2 max-[359px]:line-clamp-1 text-[0.62rem] max-[359px]:text-[0.56rem] [overflow-wrap:anywhere] leading-[1.2] font-semibold ${
              isToday ? 'text-gold-soft' : (CATEGORY_TEXT[occasions[0].category] ?? 'text-ink')
            }`}
          >
            {shortTitle(occasions[0])}
          </span>
          )}
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
 * Traditional Panchang layout: the seven weekdays run DOWN a column on the far
 * left (रवि … शनि) and each week is a column, so dates extend to the right
 * along their weekday row. Cells stretch to fill the available space.
 * Swipe left/right to change month. Renders plain dates while data loads.
 */
export function CalendarGrid({ weeks, days, today, selected, onSelect, onPrev, onNext, celebrations }) {
  const swipe = useSwipe({ onSwipeLeft: onNext, onSwipeRight: onPrev });
  const columns = weeks.length;
  const lastCol = columns - 1;

  return (
    <div
      role="grid"
      aria-label="महीने का कैलेंडर"
      aria-rowcount={7}
      aria-colcount={columns + 1}
      className="grid h-full min-h-0 overflow-hidden rounded-xl border border-gold/50 bg-card shadow-[0_1px_3px_rgb(90_50_20/0.08)] select-none"
      style={{
        touchAction: 'pan-y',
        gridTemplateColumns: `2.6rem repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
      }}
      {...swipe}
    >
      {WEEKDAYS.map((w, weekday) => (
        <div role="row" key={w.en} className="contents">
          <div
            role="rowheader"
            className={`flex items-center justify-center bg-maroon px-0.5 text-center font-display text-[0.95rem] leading-tight ${
              weekday === 0 ? 'text-saffron-soft' : 'text-gold-soft'
            } ${weekday < 6 ? 'border-b border-maroon-dark' : ''}`}
          >
            {txt(w.short)}
          </div>
          {weeks.map((week, wi) => {
            const key = week[weekday];
            const borders = `${wi < lastCol ? 'border-r' : ''} ${weekday < 6 ? 'border-b' : ''} border-line`;
            return key ? (
              <div role="gridcell" key={key} className={`min-h-0 min-w-0 ${borders}`}>
                <DayCell
                  dateKey={key}
                  info={days?.[key]}
                  isToday={key === today}
                  isSelected={key === selected}
                  onSelect={onSelect}
                  celebrationCount={celebrations?.[key] ?? 0}
                />
              </div>
            ) : (
              <div role="gridcell" key={`pad-${weekday}-${wi}`} aria-hidden="true" className={`bg-paper/70 ${borders}`} />
            );
          })}
        </div>
      ))}
    </div>
  );
}
