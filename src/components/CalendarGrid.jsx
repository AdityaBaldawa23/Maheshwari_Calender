import { memo } from 'react';
import { WEEKDAYS } from '../constants/terms.js';
import { cellTithiLabel, formatDate, fullTithiLabel, num, txt, weekdayName } from '../utils/format.js';
import { adjacentMonthKey, parseKey, weekdayOf } from '../utils/date.js';
import { useSwipe } from '../hooks/useSwipe.js';
import { CATEGORY_TEXT } from '../constants/categoryStyles.js';

/** Traditional weekday colours (रवि saffron … शनि indigo) for the weekday column. */
const DAY_BG = ['bg-day-0', 'bg-day-1', 'bg-day-2', 'bg-day-3', 'bg-day-4', 'bg-day-5', 'bg-day-6'];

const CATEGORY_TINT = {
  festival: 'bg-tint-festival',
  maheshwari: 'bg-tint-community',
  marwadi: 'bg-tint-community',
  event: 'bg-tint-community',
  jayanti: 'bg-tint-community',
  punyatithi: 'bg-tint-community',
  vrat: 'bg-tint-vrat',
  national: 'bg-tint-national',
};

function MoonGlyph({ paksha }) {
  const full = paksha === 'shukla';
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-ink/70 ${full ? 'bg-[#fde68a]' : 'bg-ink/85'}`}
    />
  );
}

function ariaLabelFor(key, info, isToday, celebrationCount, lang, holiday) {
  const { y, m, d } = parseKey(key);
  const parts = [isToday ? 'आज' : '', formatDate(key, lang), weekdayName(weekdayOf(y, m, d), lang)];
  if (holiday) parts.push('सार्वजनिक अवकाश');
  if (info?.panchang) parts.push(fullTithiLabel(info.panchang));
  for (const o of info?.occasions ?? []) parts.push(txt(o.title));
  if (celebrationCount) parts.push(`${num(celebrationCount)} जन्मदिन/वर्षगांठ`);
  return parts.filter(Boolean).join(', ');
}

/** Occasion names are shortened in cells: "दीपावली (लक्ष्मी पूजन)" → "दीपावली". */
const shortTitle = (o) => txt(o.title).split(' (')[0].split(' / ')[0];

/** Background tint by priority: holiday › most important occasion › full/new moon › Sunday. */
function tintFor({ holiday, top, panchang, weekday }) {
  if (holiday) return 'bg-tint-holiday';
  if (top) return CATEGORY_TINT[top.category] ?? 'bg-tint-festival';
  if (panchang?.tithi === 15) return panchang.paksha === 'shukla' ? 'bg-tint-purnima' : 'bg-tint-amavasya';
  if (weekday === 0) return 'bg-tint-sunday';
  return 'bg-card';
}

const DayCell = memo(function DayCell({ dateKey, info, isToday, isSelected, onSelect, celebrationCount = 0, lang }) {
  const { y, m, d } = parseKey(dateKey);
  const weekday = weekdayOf(y, m, d);
  const occasions = info?.occasions ?? [];
  const panchang = info?.panchang;
  const isMoonDay = panchang?.tithi === 15;
  const holiday = occasions.some((o) => o.holiday);
  // Holidays first, then the most important occasion (the list is already sorted by importance).
  const top = occasions.find((o) => o.holiday) ?? occasions.find((o) => o.importance !== 'low') ?? null;
  const shown = top ?? occasions[0];
  const red = holiday || weekday === 0;

  const tone = isToday
    ? 'bg-gradient-to-br from-maroon to-maroon-dark text-white'
    : `${tintFor({ holiday, top, panchang, weekday })} active:brightness-95`;

  return (
    <button
      type="button"
      onClick={() => onSelect(dateKey)}
      aria-label={ariaLabelFor(dateKey, info, isToday, celebrationCount, lang, holiday)}
      aria-current={isToday ? 'date' : undefined}
      aria-pressed={isSelected}
      className={`flex h-full w-full min-w-0 flex-col items-stretch gap-0.5 overflow-hidden px-1 pt-0.5 pb-1 text-left max-[359px]:px-0.5 ${tone} ${
        isSelected && !isToday ? 'shadow-[inset_0_0_0_2.5px_var(--color-gold)]' : ''
      }`}
    >
      <span className="flex shrink-0 items-start justify-between gap-0.5">
        <span
          className={`font-display text-[1.6rem] leading-[1.15] font-bold tracking-tight max-[359px]:text-[1.35rem] ${
            isToday ? 'text-white' : red ? 'text-holiday' : 'text-ink'
          }`}
        >
          {num(d, lang)}
        </span>
        {isToday && <span className="mt-1 rounded bg-white/25 px-1 text-[0.6rem] leading-4 font-semibold">{lang === 'en' ? 'Today' : 'आज'}</span>}
        {!isToday && holiday && (
          <span aria-hidden="true" title="सार्वजनिक अवकाश" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-holiday ring-2 ring-white" />
        )}
        {isMoonDay && !holiday && !isToday && (
          <span className="pt-1.5">
            <MoonGlyph paksha={panchang.paksha} />
          </span>
        )}
      </span>

      {panchang && (
        <span
          className={`line-clamp-2 shrink-0 text-[0.7rem] leading-tight wrap-anywhere max-[359px]:text-[0.6rem] ${
            isToday ? 'text-white/90' : isMoonDay ? 'font-semibold text-ink' : 'text-ink/70'
          }`}
        >
          {cellTithiLabel(panchang)}
        </span>
      )}

      {(shown || celebrationCount > 0) && (
        // Fixed two-line budget at the bottom: occasion name, then "🎂 n · +k".
        <span className="mt-auto flex min-w-0 shrink-0 flex-col leading-tight">
          {shown && (
            <span
              className={`truncate text-[0.7rem] font-semibold max-[359px]:text-[0.6rem] ${
                isToday ? 'text-gold-soft' : shown.holiday ? 'text-holiday' : (CATEGORY_TEXT[shown.category] ?? 'text-ink')
              }`}
            >
              {shortTitle(shown)}
            </span>
          )}
          {(celebrationCount > 0 || occasions.length > 1) && (
            <span className={`flex items-center gap-1 text-[0.64rem] font-semibold ${isToday ? 'text-white/85' : 'text-muted'}`}>
              {celebrationCount > 0 && (
                <span aria-hidden="true" className={isToday ? 'text-gold-soft' : 'text-[#be185d]'}>
                  🎂{num(celebrationCount, lang)}
                </span>
              )}
              {occasions.length > 1 && <span>+{num(occasions.length - 1, lang)}</span>}
            </span>
          )}
        </span>
      )}
    </button>
  );
});

/** Faint previous/next-month date shown in an otherwise empty box (decorative only). */
function GhostCell({ dateKey, lang, className }) {
  return (
    <div role="gridcell" aria-hidden="true" className={`bg-paper/80 px-1 pt-0.5 select-none ${className}`}>
      <span className="font-display text-[1.6rem] leading-[1.15] font-bold text-ink/15 max-[359px]:text-[1.35rem]">
        {num(parseKey(dateKey).d, lang)}
      </span>
    </div>
  );
}

/**
 * Traditional Panchang layout: the seven weekdays run DOWN a colourful column on
 * the far left (रवि … शनि) and each week is a column, so dates extend to the right
 * along their weekday row. Cells stretch to fill the available space.
 * Swipe left/right to change month. Renders plain dates while data loads.
 */
export function CalendarGrid({ weeks, days, today, selected, onSelect, onPrev, onNext, celebrations, lang = 'hi' }) {
  const swipe = useSwipe({ onSwipeLeft: onNext, onSwipeRight: onPrev });
  const columns = weeks.length;
  const lastCol = columns - 1;

  return (
    <div
      role="grid"
      aria-label="महीने का कैलेंडर"
      aria-rowcount={7}
      aria-colcount={columns + 1}
      className="grid h-full min-h-0 overflow-hidden rounded-xl border border-gold/60 bg-card shadow-[0_2px_8px_rgb(122_31_43/0.12)] select-none"
      style={{
        touchAction: 'pan-y',
        gridTemplateColumns: `2.7rem repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
      }}
      {...swipe}
    >
      {WEEKDAYS.map((w, weekday) => (
        <div role="row" key={w.en} className="contents">
          <div
            role="rowheader"
            className={`flex items-center justify-center px-0.5 text-center font-display text-[1rem] leading-tight font-bold text-white ${DAY_BG[weekday]} ${
              weekday < 6 ? 'border-b border-white/25' : ''
            }`}
          >
            {txt(w.short, lang)}
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
                  lang={lang}
                />
              </div>
            ) : (
              <GhostCell key={`pad-${weekday}-${wi}`} dateKey={adjacentMonthKey(weeks, wi, weekday)} lang={lang} className={borders} />
            );
          })}
        </div>
      ))}
    </div>
  );
}
