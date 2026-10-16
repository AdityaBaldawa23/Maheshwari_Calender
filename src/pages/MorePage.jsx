import { BellIcon, ChevronLeft, ChevronRight, MegaphoneIcon } from '../components/Icons.jsx';
import { BackPage } from './BackPage.jsx';
import { SettingsPage } from './SettingsPage.jsx';

const ITEMS = [
  { id: 'community', label: 'समाज सूचना एवं विज्ञापन', Icon: MegaphoneIcon },
  { id: 'settings', label: 'स्मरण (रिमाइंडर) एवं ऐप जानकारी', Icon: BellIcon },
];

/** "अधिक" tab: community notices & ads (kept separate from the calendar), reminders and app info. */
export function MorePage({ today, section, onOpenSection }) {
  if (section) {
    return (
      <div className="px-4 py-2">
        <button
          type="button"
          onClick={() => onOpenSection(null)}
          className="mb-1 inline-flex min-h-11 items-center gap-1 font-semibold text-maroon"
        >
          <ChevronLeft width={20} height={20} /> वापस
        </button>
        {section === 'community' && <BackPage today={today} />}
        {section === 'settings' && <SettingsPage />}
      </div>
    );
  }
  return (
    <div className="space-y-2 px-3 py-3">
      <h2 className="px-1 font-display text-2xl text-maroon">अधिक</h2>
      <ul className="card divide-y divide-line">
        {ITEMS.map(({ id, label, Icon }) => (
          <li key={id}>
            <button type="button" onClick={() => onOpenSection(id)} className="flex min-h-14 w-full items-center gap-3 px-3 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold-soft text-maroon">
                <Icon width={20} height={20} />
              </span>
              <span className="flex-1 font-semibold text-ink">{label}</span>
              <ChevronRight width={20} height={20} className="text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
