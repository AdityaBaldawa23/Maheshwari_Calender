import { Sheet } from './Sheet.jsx';
import { PhoneIcon, WhatsAppIcon } from './Icons.jsx';
import { MEMBER_FIELDS, displayAge, memberName } from '../shared/directorySchema.js';
import { dialable } from '../shared/emergencySchema.js';
import { whatsappUrl } from '../shared/whatsapp.js';
import { buildCelebrationIndex, celebrationLabel, celebrationsOn, greetingFor } from '../services/celebrations.js';
import { formatDate, formatPhone, num, txt } from '../utils/format.js';

const MISSING = '—';

function Row({ label, value }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-28 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 leading-snug text-ink wrap-anywhere">{value || MISSING}</dd>
    </div>
  );
}

/**
 * Full details of one directory member. Values are rendered as text (never HTML).
 * Call / WhatsApp open only when tapped.
 */
export function MemberSheet({ member, today, onClose }) {
  const age = displayAge(member, today);
  const tel = dialable(member.phone);
  const todayCelebrations = celebrationsOn(buildCelebrationIndex([member]), today);
  const wa = whatsappUrl(member.phone, todayCelebrations[0] ? greetingFor(todayCelebrations[0]) : '');
  const label = (f) => txt(MEMBER_FIELDS[f].label);

  return (
    <Sheet labelledBy="member-title" onClose={onClose}>
      <div className="px-4 pb-6">
        <h2 id="member-title" className="pt-1 pr-10 font-display text-2xl leading-snug text-maroon">
          {memberName(member)}
        </h2>
        {member.nameHi && member.nameEn && <p className="text-sm text-muted">{member.nameEn}</p>}

        {todayCelebrations.map((c) => (
          <p key={c.kind} className="mt-2 inline-flex rounded-full bg-gold-soft px-3 py-1 text-sm font-semibold text-maroon">
            {c.kind === 'birthday' ? '🎂' : '💐'} आज {celebrationLabel(c, num)} है
          </p>
        ))}

        {(tel || wa) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tel && (
              <a href={`tel:${tel}`} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-maroon px-5 font-semibold text-white">
                <PhoneIcon width={18} height={18} /> कॉल करें
              </a>
            )}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#1f7a43] px-5 font-semibold text-white"
              >
                <WhatsAppIcon width={18} height={18} /> व्हाट्सऐप
              </a>
            )}
          </div>
        )}

        <dl className="mt-3 divide-y divide-line">
          <Row label={label('bloodGroup')} value={member.bloodGroup} />
          <Row label={label('age')} value={age !== null ? `${num(age)} वर्ष` : ''} />
          <Row label={label('dob')} value={member.dob ? formatDate(member.dob) : ''} />
          {member.anniversary && <Row label={label('anniversary')} value={formatDate(member.anniversary)} />}
          <Row label={label('fatherName')} value={member.fatherName} />
          <Row label={label('motherName')} value={member.motherName} />
          <Row label={label('phone')} value={member.phone ? formatPhone(member.phone) : ''} />
          <Row label={label('city')} value={member.city} />
          {member.note && <Row label={label('note')} value={member.note} />}
          <Row label={label('id')} value={member.id} />
        </dl>
      </div>
    </Sheet>
  );
}
