import { useDateInfo } from '../hooks/useCalendarData.js';
import { useSettings } from '../hooks/useSettings.jsx';
import { useReminders } from '../hooks/useReminders.jsx';
import { isOccasionReminderEligible, DEFAULT_REMINDER_TIME } from '../services/reminderPlanner.js';
import { PAKSHAS } from '../constants/terms.js';
import { addDays } from '../utils/date.js';
import {
  formatDate, formatDateTime, formatTime, fullTithiLabel, maasName, num, tithiName, txt, weekdayName,
} from '../utils/format.js';
import { Sheet } from './Sheet.jsx';
import { CategoryLabel } from './OccasionTag.jsx';
import { BellIcon, BellOffIcon, ChevronLeft, ChevronRight, SunriseIcon, SunsetIcon } from './Icons.jsx';

function Row({ label, children }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-24 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 leading-snug text-ink">{children}</dd>
    </div>
  );
}

/** Explicit start and end of a tithi, each with its date (IST). */
function TithiTimes({ start, end }) {
  if (!start && !end) return null;
  return (
    <span className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-2 text-sm leading-snug">
      {start && (
        <>
          <span className="text-muted">प्रारंभ:</span>
          <span>{formatDateTime(start)}</span>
        </>
      )}
      {end && (
        <>
          <span className="text-muted">समाप्ति:</span>
          <span>{formatDateTime(end)}</span>
        </>
      )}
    </span>
  );
}

function OccasionReminder({ occasion }) {
  const { settings, update } = useSettings();
  const { requestEnable } = useReminders();
  if (!occasion.reminder?.enabled) return null;

  if (!settings.remindersEnabled) {
    return (
      <button
        type="button"
        onClick={requestEnable}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-maroon px-3 text-sm font-semibold text-maroon"
      >
        <BellIcon width={18} height={18} /> स्मरण चालू करें
      </button>
    );
  }

  const muted = settings.mutedOccasions.includes(occasion.id);
  const eligible = isOccasionReminderEligible(occasion, settings);
  const time = settings.reminderTime ?? occasion.reminder.defaultTime ?? DEFAULT_REMINDER_TIME;
  const toggleMute = () =>
    update((s) => ({
      mutedOccasions: muted ? s.mutedOccasions.filter((id) => id !== occasion.id) : [...s.mutedOccasions, occasion.id],
    }));

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      {eligible ? (
        <span className="inline-flex items-center gap-1 text-vrat">
          <BellIcon width={16} height={16} /> स्मरण: {formatTime(time)}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted">
          <BellOffIcon width={16} height={16} /> {muted ? 'इस अवसर का स्मरण बंद है' : 'इस श्रेणी का स्मरण बंद है'}
        </span>
      )}
      {(eligible || muted) && (
        <button type="button" onClick={toggleMute} className="min-h-11 rounded-full px-3 font-semibold text-maroon underline">
          {muted ? 'स्मरण चालू करें' : 'स्मरण बंद करें'}
        </button>
      )}
    </div>
  );
}

/** Full details for one date: Gregorian + Hindu date, tithi, paksha, occasions, reminders. */
export function DayDetailSheet({ dateKey, today, onClose, onNavigate }) {
  const info = useDateInfo(dateKey);
  const isToday = dateKey === today;

  return (
    <Sheet labelledBy="day-sheet-title" onClose={onClose}>
      <div className="px-4 pb-6">
        <header className="flex items-center gap-1 pt-2 pr-10">
          <button
            type="button"
            onClick={() => onNavigate(addDays(dateKey, -1))}
            aria-label="पिछला दिन"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-maroon hover:bg-paper"
          >
            <ChevronLeft />
          </button>
          <div className="min-w-0 flex-1 text-center">
            {isToday && (
              <span className="inline-block rounded-full bg-maroon px-2 text-xs leading-5 text-white">आज</span>
            )}
            <h2 id="day-sheet-title" className="font-display text-2xl leading-snug text-maroon">
              {formatDate(dateKey)}
            </h2>
            <p className="text-sm text-muted">{info ? weekdayName(info.weekday) : ' '}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(addDays(dateKey, 1))}
            aria-label="अगला दिन"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-maroon hover:bg-paper"
          >
            <ChevronRight />
          </button>
        </header>

        {info && !info.hasData && (
          <p className="mt-4 rounded-xl bg-paper p-3 text-sm text-muted">
            इस तिथि का पंचांग अभी उपलब्ध नहीं है। नए वर्ष का पंचांग ऐप अपडेट के साथ जोड़ा जाएगा।
          </p>
        )}

        {info?.panchang && (
          <section className="mt-3 rounded-2xl bg-paper p-3" aria-label="पंचांग">
            <p className="font-display text-xl leading-snug text-ink">{fullTithiLabel(info.panchang)}</p>
            <dl className="mt-1 divide-y divide-line/70">
              <Row label="तिथि">
                {tithiName(info.panchang.tithi, info.panchang.paksha)}
                <TithiTimes start={info.panchang.tithiStart} end={info.panchang.tithiEnd} />
                {info.panchang.kshaya && (
                  <span className="mt-1 block border-t border-line/70 pt-1">
                    क्षय तिथि: {tithiName(info.panchang.kshaya.tithi, info.panchang.kshaya.paksha)}
                    <TithiTimes start={info.panchang.kshaya.start} end={info.panchang.kshaya.end} />
                  </span>
                )}
              </Row>
              <Row label="पक्ष">{txt(PAKSHAS[info.panchang.paksha].full)}</Row>
              <Row label="मास">
                {maasName(info.panchang.maas, info.panchang.adhik)}
                {info.panchang.adhik && <span className="block text-sm text-muted">अधिक मास (पुरुषोत्तम मास)</span>}
              </Row>
              {info.samvat && <Row label="विक्रम संवत">{num(info.samvat)}</Row>}
              {info.panchang.sunrise && (
                <Row label="सूर्योदय / अस्त">
                  <span className="inline-flex flex-wrap items-center gap-x-3">
                    <span className="inline-flex items-center gap-1">
                      <SunriseIcon width={16} height={16} /> {formatTime(info.panchang.sunrise)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <SunsetIcon width={16} height={16} /> {formatTime(info.panchang.sunset)}
                    </span>
                  </span>
                  {info.location && <span className="block text-xs text-muted">({txt(info.location)} के अनुसार)</span>}
                </Row>
              )}
            </dl>
          </section>
        )}

        {info?.hasData && (!info.verified?.panchang || (info.occasions.length > 0 && !info.verified?.occasions)) && (
          <p className="mt-2 rounded-xl border border-dashed border-gold/60 px-3 py-2 text-xs leading-relaxed text-muted">
            ⓘ {!info.verified?.panchang ? 'तिथि खगोलीय गणना पर आधारित है' : 'पर्व तिथियाँ'} — आधिकारिक सत्यापन लंबित। स्थानीय परंपरा
            अनुसार अंतर संभव है।
          </p>
        )}

        {info && (
          <section className="mt-4" aria-labelledby="day-occasions-title">
            <h3 id="day-occasions-title" className="font-display text-lg text-maroon">
              विशेष अवसर
            </h3>
            {info.occasions.length === 0 ? (
              <p className="text-sm text-muted">इस दिन कोई विशेष अवसर नहीं है।</p>
            ) : (
              <ul className="mt-1 space-y-3">
                {info.occasions.map((o) => (
                  <li key={o.id} className="rounded-2xl border border-line p-3">
                    <p className="font-semibold leading-snug text-ink">{txt(o.title)}</p>
                    <CategoryLabel category={o.category} />
                    {o.description && <p className="mt-1 text-sm leading-relaxed text-ink/85">{txt(o.description)}</p>}
                    <OccasionReminder occasion={o} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}
