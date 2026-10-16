import { CalendarIcon, ListIcon, MenuIcon, SirenIcon, UsersIcon } from './Icons.jsx';
import { VIEW_ORDER } from '../constants/views.js';

const ITEMS = {
  calendar: { label: 'पंचांग', Icon: CalendarIcon },
  occasions: { label: 'अवसर', Icon: ListIcon },
  directory: { label: 'परिवार', Icon: UsersIcon },
  emergency: { label: 'आपातकाल', Icon: SirenIcon },
  more: { label: 'अधिक', Icon: MenuIcon },
};

export function BottomNav({ view, onChange }) {
  return (
    <nav aria-label="मुख्य मेनू" className="safe-bottom shrink-0 border-t border-line bg-card">
      <ul className="mx-auto flex max-w-lg">
        {VIEW_ORDER.map((id) => {
          const { label, Icon } = ITEMS[id];
          const active = view === id;
          return (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-0.5 text-[0.7rem] font-medium whitespace-nowrap ${
                  active ? 'text-maroon' : 'text-muted'
                }`}
              >
                <span className={`grid h-7 w-11 place-items-center rounded-full ${active ? 'bg-gold-soft' : ''}`}>
                  <Icon width={20} height={20} />
                </span>
                <span className={active ? 'font-semibold' : ''}>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
