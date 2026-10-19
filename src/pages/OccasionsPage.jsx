import { useMonthData } from '../hooks/useCalendarData.js';
import { buildMonthEvents } from '../services/monthEvents.js';
import { MonthNavigator } from '../components/MonthNavigator.jsx';
import { ReminderPromo } from '../components/ReminderPromo.jsx';
import { CategoryLabel } from '../components/OccasionTag.jsx';
import { parseKey, weekdayOf } from '../utils/date.js';
import { formatDateTime, fullTithiLabel, num, txt, weekdayShort } from '../utils/format.js';
import { useDateLang } from '../hooks/useDateLang.js';

function groupByDate(events) {
  const groups = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last?.dateKey === e.dateKey) last.events.push(e);
    else groups.push({ dateKey: e.dateKey, events: [e] });
  }
  return groups;
}

function MoonEvent({ event, panchang, lang }) {
  const isAmavasya = event.paksha === 'krishna';
  return (
    <div>
      <p className="flex items-center gap-1.5 font-semibold leading-snug text-ink">
        <span
          aria-hidden="true"
          className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-ink/70 ${isAmavasya ? 'bg-ink/85' : 'bg-card'}`}
        />
        {panchang ? fullTithiLabel(panchang) : isAmavasya ? 'अमावस्या' : 'पूर्णिमा'}
      </p>
      <dl className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-2 text-sm leading-snug">
        {event.start && (
          <>
            <dt className="text-muted">प्रारंभ:</dt>
            <dd className="text-ink">{formatDateTime(event.start, lang)}</dd>
          </>
        )}
        {event.end && (
          <>
            <dt className="text-muted">समाप्ति:</dt>
            <dd className="text-ink">{formatDateTime(event.end, lang)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function OccasionEvent({ occasion }) {
  return (
    <div>
      <p className={`leading-snug ${occasion.importance === 'low' ? 'text-ink/90' : 'font-semibold text-ink'}`}>
        {txt(occasion.title)}
      </p>
      {occasion.holiday && (
        <span className="mr-2 inline-block rounded bg-holiday px-1.5 text-xs leading-5 font-semibold text-white">सार्वजनिक अवकाश</span>
      )}
      <CategoryLabel category={occasion.category} />
    </div>
  );
}

/** "अवसर" tab — all occasions of the month, plus Purnima/Amavasya with start and end times. */
export function OccasionsPage({ month, onChangeMonth, onGoToday, isCurrentMonth, onPickMonth, onSelectDate }) {
  const monthData = useMonthData(month.y, month.m);
  const lang = useDateLang();
  const groups = groupByDate(buildMonthEvents(monthData));

  return (
    <div className="space-y-3 px-3 py-2">
      <MonthNavigator
        y={month.y}
        m={month.m}
        monthData={monthData}
        isCurrentMonth={isCurrentMonth}
        onPrev={() => onChangeMonth(-1)}
        onNext={() => onChangeMonth(1)}
        onToday={onGoToday}
        onPick={onPickMonth}
      />
      <ReminderPromo />

      {monthData && !monthData.hasData && (
        <p className="card p-4 text-sm text-muted">
          इस वर्ष का पंचांग अभी उपलब्ध नहीं है। ऐप के अगले अपडेट में जोड़ा जाएगा।
        </p>
      )}

      {groups.length > 0 && (
        <ul className="card divide-y divide-line px-3" aria-label="इस माह के अवसर">
          {groups.map(({ dateKey, events }) => {
            const { y, m, d } = parseKey(dateKey);
            const weekday = weekdayOf(y, m, d);
            const day = monthData.days[dateKey];
            const important = events.some((e) => e.occasion?.importance === 'high');
            return (
              <li key={dateKey}>
                <button
                  type="button"
                  onClick={() => onSelectDate(dateKey)}
                  className="flex w-full items-start gap-3 py-2.5 text-left"
                >
                  <span
                    className={`flex w-12 shrink-0 flex-col items-center rounded-lg py-1 ${important ? 'bg-saffron-soft' : 'bg-paper'}`}
                  >
                    <span className={`font-display text-xl leading-tight ${weekday === 0 || events.some((e) => e.occasion?.holiday) ? 'text-holiday' : 'text-ink'}`}>
                      {num(d, lang)}
                    </span>
                    <span className="text-[0.7rem] text-muted">{weekdayShort(weekday, lang)}</span>
                  </span>
                  <span className="min-w-0 flex-1 space-y-2">
                    {events.map((e) =>
                      e.type === 'moon' ? (
                        <MoonEvent key={`moon-${e.start}`} event={e} panchang={day?.panchang?.tithi === 15 ? day.panchang : null} lang={lang} />
                      ) : (
                        <OccasionEvent key={e.occasion.id} occasion={e.occasion} />
                      ),
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
