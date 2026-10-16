import { useSettings } from '../hooks/useSettings.jsx';
import { useReminders } from '../hooks/useReminders.jsx';
import { BellIcon } from './Icons.jsx';

/** One gentle, dismissible invitation to turn on reminders. Never shown again once dismissed or enabled. */
export function ReminderPromo() {
  const { settings, ready, update } = useSettings();
  const { requestEnable } = useReminders();
  if (!ready || settings.remindersEnabled || settings.reminderPromoDismissed) return null;

  return (
    <section className="card flex items-center gap-3 border-gold/60 bg-gold-soft/40 p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card text-saffron">
        <BellIcon width={22} height={22} />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug text-ink">त्योहारों और समाज के अवसरों का स्मरण पाएँ</p>
      <div className="flex shrink-0 flex-col items-end">
        <button
          type="button"
          onClick={requestEnable}
          className="min-h-10 rounded-full bg-maroon px-4 text-sm font-semibold text-white"
        >
          चालू करें
        </button>
        <button
          type="button"
          onClick={() => update({ reminderPromoDismissed: true })}
          className="min-h-9 px-2 text-xs text-muted underline"
        >
          नहीं, धन्यवाद
        </button>
      </div>
    </section>
  );
}
