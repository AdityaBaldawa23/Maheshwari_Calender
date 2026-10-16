import { useSettings } from '../hooks/useSettings.jsx';
import { useReminders } from '../hooks/useReminders.jsx';
import { REMINDER_GROUPS } from '../constants/categories.js';
import { DEFAULT_REMINDER_TIME } from '../services/reminderPlanner.js';
import { calendarService } from '../services/calendarService.js';
import { formatTime, num, txt } from '../utils/format.js';
import { isValidTime } from '../utils/date.js';
import { Toggle } from '../components/Toggle.jsx';

function PermissionNote({ permission, enabled }) {
  if (!enabled) return null;
  if (permission === 'denied') {
    return (
      <p role="alert" className="rounded-xl bg-saffron-soft p-3 text-sm leading-relaxed text-ink">
        फ़ोन में इस ऐप की सूचनाएँ बंद हैं, इसलिए स्मरण नहीं आएँगे। चालू करने के लिए: फ़ोन की सेटिंग्स → ऐप्स →
        माहेश्वरी कैलेंडर → सूचनाएँ।
      </p>
    );
  }
  if (permission === 'unsupported') {
    return <p className="rounded-xl bg-paper p-3 text-sm text-muted">स्मरण Android ऐप में काम करते हैं।</p>;
  }
  return null;
}

export function SettingsPage() {
  const { settings, update } = useSettings();
  const { permission, lastSync, requestEnable, disable } = useReminders();
  const on = settings.remindersEnabled;
  const years = calendarService.getAvailableYears();

  return (
    <div className="space-y-3">
      <h2 className="px-1 font-display text-2xl text-maroon">स्मरण (रिमाइंडर)</h2>

      <section className="card space-y-1 p-3">
        <Toggle
          id="reminders-master"
          checked={on}
          onChange={(v) => (v ? requestEnable() : disable())}
          label="त्योहारों का स्मरण"
          description="चुने हुए अवसरों पर फ़ोन पर सूचना — इंटरनेट के बिना"
        />
        <PermissionNote permission={permission} enabled={on} />
        {on && permission === 'granted' && lastSync?.ok && (
          <p className="text-xs text-vrat">✓ आगामी {num(lastSync.scheduled + lastSync.kept)} स्मरण निर्धारित हैं</p>
        )}
        {on && lastSync && !lastSync.ok && lastSync.error !== 'unsupported' && lastSync.error !== 'permission' && (
          <p role="alert" className="text-xs text-sunday">
            स्मरण निर्धारित नहीं हो सके। कृपया ऐप दोबारा खोलें।
          </p>
        )}
      </section>

      <fieldset className="card p-3" disabled={!on}>
        <legend className="sr-only">स्मरण कब मिले</legend>
        <h3 className="font-display text-lg text-maroon">कब याद दिलाएँ</h3>
        <Toggle
          id="reminder-same-day"
          checked={settings.sameDay}
          onChange={(v) => update({ sameDay: v })}
          label="उसी दिन"
          description="जैसे: “आज महेश नवमी है 🙏”"
          disabled={!on}
        />
        <Toggle
          id="reminder-day-before"
          checked={settings.dayBefore}
          onChange={(v) => update({ dayBefore: v })}
          label="एक दिन पहले"
          description="तैयारी के लिए पिछले दिन स्मरण"
          disabled={!on}
        />
        <div className={`flex items-center gap-3 py-2 ${on ? '' : 'opacity-55'}`}>
          <div className="min-w-0 flex-1">
            <label htmlFor="reminder-time" className="block font-medium text-ink">
              समय
            </label>
            <p className="text-xs text-muted">
              {settings.reminderTime ? formatTime(settings.reminderTime) : `अवसर अनुसार (सामान्यतः ${formatTime(DEFAULT_REMINDER_TIME)})`}
            </p>
          </div>
          <input
            id="reminder-time"
            type="time"
            value={settings.reminderTime ?? DEFAULT_REMINDER_TIME}
            onChange={(e) => isValidTime(e.target.value) && update({ reminderTime: e.target.value })}
            disabled={!on}
            className="min-h-11 rounded-xl border border-line bg-paper px-3 text-lg text-ink"
          />
        </div>
        {settings.reminderTime && on && (
          <button type="button" onClick={() => update({ reminderTime: null })} className="min-h-10 text-sm text-maroon underline">
            अवसर अनुसार समय पर लौटें
          </button>
        )}
      </fieldset>

      <fieldset className="card p-3" disabled={!on}>
        <legend className="sr-only">किन अवसरों का स्मरण</legend>
        <h3 className="font-display text-lg text-maroon">किन अवसरों का</h3>
        {Object.entries(REMINDER_GROUPS).map(([key, label]) => (
          <Toggle
            key={key}
            id={`group-${key}`}
            checked={settings.groups[key]}
            onChange={(v) => update((s) => ({ groups: { ...s.groups, [key]: v } }))}
            label={txt(label)}
            disabled={!on}
          />
        ))}
        {settings.mutedOccasions.length > 0 && (
          <div className="mt-2 border-t border-line pt-2">
            <p className="text-sm text-muted">{num(settings.mutedOccasions.length)} अवसरों का स्मरण आपने बंद किया है।</p>
            <button
              type="button"
              onClick={() => update({ mutedOccasions: [] })}
              className="min-h-10 text-sm font-semibold text-maroon underline"
            >
              सभी पुनः चालू करें
            </button>
          </div>
        )}
      </fieldset>

      <section className="card space-y-2 p-3 text-sm leading-relaxed text-ink/90">
        <h3 className="font-display text-lg text-maroon">ऐप के बारे में</h3>
        <p>
          तिथियाँ उज्जैन के सूर्योदय (उदया तिथि) पर आधारित हैं; माह पूर्णिमांत पद्धति से दर्शाए गए हैं। उपलब्ध पंचांग:{' '}
          {years.length ? num(`${years[0]}–${years[years.length - 1]}`) : '—'}।
        </p>
        <p>
          यह ऐप पूरी तरह ऑफ़लाइन चलता है। कोई खाता नहीं, कोई व्यक्तिगत जानकारी एकत्र नहीं की जाती, और कुछ भी किसी
          सर्वर पर नहीं भेजा जाता। आपकी पसंद केवल आपके फ़ोन में सहेजी जाती है।
        </p>
        <p className="text-xs text-muted">संस्करण {num(__APP_VERSION__)}</p>
      </section>
    </div>
  );
}
