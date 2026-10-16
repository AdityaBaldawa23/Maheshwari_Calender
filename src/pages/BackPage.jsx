import { useEffect, useState } from 'react';
import { calendarRepository } from '../repositories/index.js';
import { txt } from '../utils/format.js';
import { AdCard } from '../components/AdCard.jsx';
import { useDataset } from '../hooks/useSync.js';

/**
 * BACK page — community notices and advertisements. Layout is intentionally
 * simple (a list of cards) so the final design can be swapped in later; all
 * content comes from src/data/notices and src/data/advertisements.
 */
export function BackPage({ today }) {
  const [content, setContent] = useState(null);
  const contentVersion = useDataset('content').snapshot?.meta?.version; // reload when new content is published

  useEffect(() => {
    let cancelled = false;
    Promise.all([calendarRepository.loadNotices(today), calendarRepository.loadAdvertisements(today)]).then(
      ([notices, ads]) => !cancelled && setContent({ notices, ads }),
    );
    return () => {
      cancelled = true;
    };
  }, [today, contentVersion]);

  return (
    <div className="space-y-3">
      <h2 className="px-1 font-display text-2xl text-maroon">समाज सूचना एवं विज्ञापन</h2>

      {content?.notices.length > 0 && <p className="px-1 text-xs font-semibold tracking-wide text-muted">सूचनाएँ</p>}
      {content?.notices.map((n) => (
        <article key={n.id} className="card border-l-4 border-l-saffron p-3">
          <h3 className="font-display text-lg leading-snug text-maroon">{txt(n.title)}</h3>
          <p className="mt-0.5 text-sm leading-relaxed text-ink/90">{txt(n.body)}</p>
        </article>
      ))}

      {content?.ads.length > 0 && (
        <section aria-label="विज्ञापन" className="space-y-3">
          <p className="px-1 text-xs font-semibold tracking-wide text-muted">विज्ञापन</p>
          {content.ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </section>
      )}

      {content && content.notices.length === 0 && content.ads.length === 0 && (
        <p className="card p-4 text-sm text-muted">अभी कोई सूचना नहीं है।</p>
      )}

    </div>
  );
}
