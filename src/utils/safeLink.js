/**
 * Builds a safe href from structured ad link data. Only tel:, https:, mailto:
 * and WhatsApp (wa.me) are possible — never javascript:, file:, intent: etc.
 * Returns null if the value is not acceptable.
 */
export function buildSafeHref(link) {
  if (!link || typeof link.value !== 'string') return null;
  const value = link.value.trim();
  switch (link.type) {
    case 'tel': {
      const digits = value.replace(/[\s()-]/g, '');
      return /^\+?\d{6,15}$/.test(digits) ? `tel:${digits}` : null;
    }
    case 'whatsapp': {
      const digits = value.replace(/\D/g, '');
      return /^\d{8,15}$/.test(digits) ? `https://wa.me/${digits}` : null;
    }
    case 'mailto':
      return /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(value) ? `mailto:${value}` : null;
    case 'https': {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

export const LINK_LABELS = {
  tel: 'कॉल करें',
  whatsapp: 'व्हाट्सऐप करें',
  mailto: 'ईमेल करें',
  https: 'वेबसाइट देखें',
};
