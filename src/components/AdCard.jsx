import { useState } from 'react';
import { txt } from '../utils/format.js';
import { buildSafeHref, LINK_LABELS } from '../utils/safeLink.js';
import { LinkIcon, PhoneIcon } from './Icons.jsx';

/** One advertisement. Text only is fine; a missing/broken image is simply hidden. */
export function AdCard({ ad }) {
  const [imageFailed, setImageFailed] = useState(false);
  const href = buildSafeHref(ad.link);
  const showImage = ad.image && !imageFailed;

  return (
    <article className="card overflow-hidden">
      {showImage && (
        <img
          src={ad.image}
          alt={txt(ad.title)}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="aspect-[2/1] w-full bg-gold-soft object-cover"
        />
      )}
      <div className="p-3">
        {ad.sponsor && <p className="text-xs font-semibold tracking-wide text-muted">{txt(ad.sponsor)}</p>}
        <h3 className="font-display text-lg leading-snug text-maroon">{txt(ad.title)}</h3>
        {ad.description && <p className="mt-0.5 text-sm leading-relaxed text-ink/85">{txt(ad.description)}</p>}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-maroon px-4 text-sm font-semibold text-white"
          >
            {ad.link.type === 'tel' ? <PhoneIcon width={16} height={16} /> : <LinkIcon width={16} height={16} />}
            {LINK_LABELS[ad.link.type]}
          </a>
        )}
      </div>
    </article>
  );
}
