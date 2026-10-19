import { memberName } from '../shared/directorySchema.js';
import { whatsappUrl } from '../shared/whatsapp.js';
import { celebrationLabel, greetingFor } from '../services/celebrations.js';
import { num } from '../utils/format.js';
import { WhatsAppIcon } from './Icons.jsx';
import { Avatar } from './Avatar.jsx';

/** One person's birthday/anniversary with an optional WhatsApp greeting (opens only on tap). */
function CelebrationRow({ entry, onOpen }) {
  const wa = whatsappUrl(entry.member.phone, greetingFor(entry));
  return (
    <li className="flex items-center gap-2 py-2">
      <span className="relative shrink-0">
        <Avatar member={entry.member} size={40} />
        <span aria-hidden="true" className="absolute -right-1 -bottom-1 text-sm">
          {entry.kind === 'birthday' ? '🎂' : '💐'}
        </span>
      </span>
      <button type="button" onClick={() => onOpen(entry.member.id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold text-ink">{memberName(entry.member)}</span>
        <span className="block text-xs text-muted">{celebrationLabel(entry, num)}</span>
      </button>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${memberName(entry.member)} को व्हाट्सऐप पर शुभकामना भेजें`}
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full bg-[#1f7a43] px-3 text-sm font-semibold text-white"
        >
          <WhatsAppIcon width={16} height={16} /> शुभकामना
        </a>
      )}
    </li>
  );
}

/** List of celebrations (used in the directory "today" card and the date-details sheet). */
export function CelebrationList({ entries, onOpen }) {
  return (
    <ul className="divide-y divide-line">
      {entries.map((e) => (
        <CelebrationRow key={`${e.kind}-${e.member.id}`} entry={e} onOpen={onOpen} />
      ))}
    </ul>
  );
}

/** "आज के जन्मदिन एवं वर्षगांठ" card at the top of the directory. Hidden when there are none. */
export function TodayCelebrations({ entries, onOpen }) {
  if (!entries.length) return null;
  return (
    <section className="card border-gold/60 bg-gold-soft/30 px-3 pt-2 pb-1" aria-labelledby="today-celebrations">
      <h3 id="today-celebrations" className="font-display text-lg text-maroon">
        आज के जन्मदिन एवं वर्षगांठ ({num(entries.length)})
      </h3>
      <CelebrationList entries={entries} onOpen={onOpen} />
    </section>
  );
}
