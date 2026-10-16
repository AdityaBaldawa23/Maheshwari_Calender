import { useDataset } from '../hooks/useSync.js';
import { buildEmergencyView } from '../repositories/emergencyRepository.js';
import { dialable, isConfigured, safeMapUrl } from '../shared/emergencySchema.js';
import { num } from '../utils/format.js';
import { MapPinIcon, PhoneIcon } from '../components/Icons.jsx';

const STALE_AFTER_DAYS = 180;

/** A deliberate dial link (the user must tap; nothing is called automatically). */
function CallLink({ number, label, primary = false }) {
  const tel = dialable(number);
  if (!tel) return null;
  return (
    <a
      href={`tel:${tel}`}
      aria-label={`${label} — ${num(number)} पर कॉल करें`}
      className={`inline-flex min-h-12 items-center gap-2 rounded-full px-4 font-semibold ${
        primary ? 'bg-maroon text-white' : 'border border-maroon text-maroon'
      }`}
    >
      <PhoneIcon width={18} height={18} />
      <span className="text-lg">{num(number)}</span>
    </a>
  );
}

function ServiceCard({ service }) {
  if (!service.active) return null;
  return (
    <li className="card flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl leading-snug text-maroon">{service.name}</p>
        {service.jurisdiction && <p className="text-xs text-muted">{num(service.jurisdiction)}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <CallLink number={service.phone} label={service.name} primary />
        <CallLink number={service.altPhone} label={service.name} />
      </div>
    </li>
  );
}

function PersonCard({ entry, kind }) {
  const map = kind === 'hospital' ? safeMapUrl(entry.mapUrl) : null;
  return (
    <li className="card space-y-2 p-3">
      <div>
        <p className="font-semibold leading-snug text-ink">{entry.name}</p>
        {entry.role && <p className="text-sm text-muted">{entry.role}</p>}
        {(entry.address || entry.city) && (
          <p className="text-sm text-ink/85">{[entry.address, entry.city].filter(Boolean).join(', ')}</p>
        )}
        {entry.description && <p className="text-sm text-ink/85">{entry.description}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <CallLink number={entry.phone} label={entry.name} primary />
        {kind === 'hospital' && entry.emergencyPhone && (
          <span className="inline-flex items-center gap-1">
            <span className="text-xs text-muted">आपातकालीन विभाग</span>
            <CallLink number={entry.emergencyPhone} label={`${entry.name} आपातकालीन विभाग`} />
          </span>
        )}
        <CallLink number={entry.altPhone} label={entry.name} />
        {map && (
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-1 rounded-full border border-line px-4 font-semibold text-ink"
          >
            <MapPinIcon width={18} height={18} /> रास्ता
          </a>
        )}
      </div>
    </li>
  );
}

function Section({ title, entries, kind }) {
  const configured = entries.filter(isConfigured);
  const missing = entries.length - configured.length;
  return (
    <section aria-labelledby={`sec-${kind}`} className="space-y-2">
      <h3 id={`sec-${kind}`} className="px-1 font-display text-lg text-maroon">
        {title}
      </h3>
      {configured.length > 0 && (
        <ul className="space-y-2">
          {configured.map((e) => (
            <PersonCard key={e.slot} entry={e} kind={kind} />
          ))}
        </ul>
      )}
      {missing > 0 && (
        <p className="rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted">
          {configured.length === 0 ? 'अभी जानकारी उपलब्ध नहीं है — जल्द जोड़ी जाएगी।' : `${num(missing)} और संपर्क जल्द जोड़े जाएँगे।`}
        </p>
      )}
    </section>
  );
}

/** "आपातकालीन संपर्क" — works offline (bundled service numbers + last downloaded contacts). */
export function EmergencyPage() {
  const state = useDataset('emergency');
  const view = buildEmergencyView(state.snapshot);
  const unconfirmed = view.services.some((s) => s.active && s.verification?.status !== 'verified');
  const ageDays = view.savedAt ? (Date.now() - new Date(view.savedAt).getTime()) / 86400000 : null;

  return (
    <div className="space-y-4 px-3 py-2">
      <h2 className="px-1 font-display text-2xl text-maroon">आपातकालीन संपर्क</h2>

      <section aria-labelledby="sec-services" className="space-y-2">
        <h3 id="sec-services" className="sr-only">
          पुलिस, एम्बुलेंस, अग्निशमन
        </h3>
        <ul className="space-y-2">
          {view.services.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </ul>
        {unconfirmed && (
          <p className="px-1 text-xs leading-relaxed text-muted">
            ये राष्ट्रीय/राज्य आपातकालीन नंबर हैं (११२ सभी आपात स्थितियों के लिए)। स्थानीय आधिकारिक पुष्टि लंबित।
          </p>
        )}
      </section>

      <Section title="समाज के विशेष संपर्क" entries={view.contacts} kind="contact" />
      <Section title="अस्पताल" entries={view.hospitals} kind="hospital" />

      {ageDays !== null && ageDays > STALE_AFTER_DAYS && (
        <p role="note" className="rounded-xl bg-saffron-soft px-3 py-2 text-sm text-ink">
          यह जानकारी {num(Math.floor(ageDays))} दिन से अपडेट नहीं हुई है — पुरानी हो सकती है। इंटरनेट से जुड़कर ऐप खोलें।
        </p>
      )}
    </div>
  );
}
