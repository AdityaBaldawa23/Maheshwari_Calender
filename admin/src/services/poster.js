/**
 * Birthday / anniversary greeting poster, drawn on a <canvas> in the browser
 * (no server, no external service). 1080×1350 portrait — the size WhatsApp
 * shows best. Only the photo and name change from person to person.
 */
import { photoThumb } from '../../../src/shared/directorySchema.js';

export const POSTER_SIZE = { width: 1080, height: 1350 };

const C = {
  maroonDark: '#4a0f19',
  maroon: '#7a1f2b',
  rust: '#9c3a26',
  gold: '#e0b44c',
  goldSoft: '#f6e7c1',
  cream: '#fffaf0',
  saffron: '#e0701a',
};

const DISPLAY = '"Tiro Devanagari Hindi", "Noto Serif Devanagari", "Nirmala UI", serif';
const SANS = '"Noto Sans Devanagari", "Nirmala UI", "Segoe UI", system-ui, sans-serif';

export const POSTER_TEXT = {
  birthday: { hi: 'जन्मदिन की हार्दिक शुभकामनाएँ', en: 'Happy Birthday', blessing: 'ईश्वर आपको सदा सुखी, स्वस्थ एवं समृद्ध रखे।' },
  anniversary: {
    hi: 'विवाह वर्षगांठ की हार्दिक शुभकामनाएँ',
    en: 'Happy Wedding Anniversary',
    blessing: 'आपका दांपत्य जीवन सदा प्रेम, सुख और समृद्धि से भरा रहे।',
  },
};

/** Loads a CORS-enabled image (Cloudinary allows this) so the canvas can still be exported. */
export function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function ensureFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([document.fonts.load(`64px ${DISPLAY}`, 'शुभकामनाएँ'), document.fonts.load(`48px ${SANS}`, 'नाम')]).catch(() => {});
}

/** Splits text into at most `maxLines` lines that fit `maxWidth` (last line ellipsised). */
export function wrapLines(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`;
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trim()}…`;
    return kept;
  }
  return lines;
}

function fitFont(ctx, text, family, startSize, maxWidth, weight = '') {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size > 20);
}

function petalRing(ctx, cx, cy, radius, count, petal, color) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, petal * 0.42, petal, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function initials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (/[ऀ-ॿ]/.test(words[0])) return [...words[0]].slice(0, 2).join('');
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{kind: 'birthday'|'anniversary', name: string, photoUrl?: string, yearsLabel?: string,
 *          brandHi: string, brandEn: string, message?: string, dateLabel?: string}} opts
 * @returns {Promise<{photoLoaded: boolean}>}
 */
export async function renderPoster(canvas, opts) {
  const { width: W, height: H } = POSTER_SIZE;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const text = POSTER_TEXT[opts.kind] ?? POSTER_TEXT.birthday;
  await ensureFonts();
  const photo = await loadImage(opts.photoUrl ? photoThumb(opts.photoUrl, 720) : null);

  // Background: deep maroon gradient with a warm glow behind the photo.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, C.maroonDark);
  bg.addColorStop(0.55, C.maroon);
  bg.addColorStop(1, C.rust);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 560, 60, W / 2, 560, 560);
  glow.addColorStop(0, 'rgba(255, 214, 120, 0.35)');
  glow.addColorStop(1, 'rgba(255, 214, 120, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Double gold border + toran (scalloped bunting) along the top.
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 6;
  ctx.strokeRect(34, 34, W - 68, H - 68);
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 50, W - 100, H - 100);
  ctx.fillStyle = C.gold;
  for (let x = 70; x < W - 60; x += 44) {
    ctx.beginPath();
    ctx.arc(x, 52, 14, 0, Math.PI);
    ctx.fill();
  }
  // Mango-leaf toran drops.
  ctx.fillStyle = '#2f7d3a';
  for (let x = 92; x < W - 80; x += 88) {
    ctx.beginPath();
    ctx.ellipse(x, 92, 11, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Header: Om + organisation name.
  ctx.textAlign = 'center';
  ctx.fillStyle = C.gold;
  ctx.font = `64px ${DISPLAY}`;
  ctx.fillText('ॐ', W / 2, 190);
  ctx.fillStyle = C.goldSoft;
  fitFont(ctx, opts.brandHi, DISPLAY, 46, W - 200);
  ctx.fillText(opts.brandHi, W / 2, 252);
  if (opts.brandEn) {
    ctx.fillStyle = 'rgba(246, 231, 193, 0.85)';
    fitFont(ctx, opts.brandEn, SANS, 28, W - 220, '600');
    ctx.fillText(opts.brandEn, W / 2, 296);
  }

  // Mandala rings around the photo.
  const cx = W / 2;
  const cy = 560;
  const r = 205;
  petalRing(ctx, cx, cy, r + 70, 32, 26, 'rgba(224, 180, 76, 0.28)');
  petalRing(ctx, cx, cy, r + 38, 24, 18, 'rgba(255, 236, 190, 0.45)');

  // Photo (or initials) in a gold ring.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
  ctx.fillStyle = C.gold;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fillStyle = C.cream;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (photo) {
    const s = Math.max((2 * r) / photo.width, (2 * r) / photo.height);
    const w = photo.width * s;
    const h = photo.height * s;
    ctx.drawImage(photo, cx - w / 2, cy - h / 2, w, h);
  } else {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, C.saffron);
    g.addColorStop(1, C.maroon);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.fillStyle = C.cream;
    ctx.font = `bold 150px ${SANS}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(opts.name), cx, cy + 8);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // Greeting.
  let y = cy + r + 100;
  ctx.fillStyle = C.gold;
  fitFont(ctx, text.hi, DISPLAY, 62, W - 160);
  ctx.fillText(text.hi, W / 2, y);
  y += 58;
  ctx.fillStyle = C.cream;
  ctx.font = `italic 600 40px ${SANS}`;
  ctx.fillText(text.en, W / 2, y);

  // Name (up to two lines).
  y += 92;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 70px ${SANS}`;
  let lines = wrapLines(ctx, opts.name, W - 180, 2);
  if (lines.length > 1) {
    ctx.font = `bold 58px ${SANS}`;
    lines = wrapLines(ctx, opts.name, W - 180, 2);
  }
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lines.length > 1 ? 66 : 76;
  }
  if (opts.yearsLabel) {
    ctx.fillStyle = C.goldSoft;
    ctx.font = `600 36px ${SANS}`;
    ctx.fillText(opts.yearsLabel, W / 2, y);
    y += 50;
  }

  // Blessing / custom message.
  const message = opts.message?.trim() || text.blessing;
  ctx.fillStyle = 'rgba(255, 250, 240, 0.92)';
  ctx.font = `32px ${SANS}`;
  for (const line of wrapLines(ctx, message, W - 220, 2)) {
    ctx.fillText(line, W / 2, y + 8);
    y += 44;
  }

  // Footer.
  ctx.fillStyle = C.gold;
  ctx.fillRect(W / 2 - 160, H - 150, 320, 3);
  ctx.fillStyle = C.goldSoft;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText(`शुभेच्छुक: ${opts.brandHi}`, W / 2, H - 104, W - 160);
  if (opts.dateLabel) {
    ctx.fillStyle = 'rgba(246, 231, 193, 0.75)';
    ctx.font = `24px ${SANS}`;
    ctx.fillText(opts.dateLabel, W / 2, H - 70);
  }
  return { photoLoaded: Boolean(photo) || !opts.photoUrl };
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
