import { useState } from 'react';
import { memberName, photoThumb } from '../shared/directorySchema.js';
import { fnv1a } from '../shared/hash.js';

const COLORS = ['bg-maroon', 'bg-saffron', 'bg-vrat', 'bg-national', 'bg-gold', 'bg-[#8b3a62]', 'bg-[#0f766e]', 'bg-[#6d28d9]'];

function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  // Devanagari: first grapheme of the first word; Latin: first letters of first + last word.
  if (/[ऀ-ॿ]/.test(words[0])) return [...words[0]].slice(0, 2).join('');
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

/**
 * Member photo (lazy-loaded thumbnail) with a coloured-initials fallback when
 * there is no photo, it fails to load, or the phone is offline.
 */
export function Avatar({ member, size = 44, className = '' }) {
  const [failed, setFailed] = useState(false);
  const name = memberName(member);
  const src = !failed && member.photo ? photoThumb(member.photo, Math.round(size * 2)) : null;
  const color = COLORS[parseInt(fnv1a(member.id ?? name), 16) % COLORS.length];
  const style = { width: size, height: size };

  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={style}
        className={`shrink-0 rounded-full bg-gold-soft object-cover ring-2 ring-white ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: size * 0.38 }}
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-white ${color} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
