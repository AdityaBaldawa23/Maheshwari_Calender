/**
 * WhatsApp chat links (opened only when the user taps the button).
 * Format: https://api.whatsapp.com/send/?phone=91XXXXXXXXXX&text=&type=phone_number&app_absent=0
 *
 * Only numbers that can have WhatsApp get a link: Indian mobiles (+91 6–9xxxxxxxxx,
 * also written without +91) and other international numbers stored with a "+".
 * Landlines (0233…) return null, so no button is shown.
 */
export function whatsappNumber(phone) {
  if (typeof phone !== 'string' && typeof phone !== 'number') return null;
  const raw = String(phone).replace(/[\s().-]/g, '');
  let m;
  if ((m = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(raw))) return `91${m[1]}`;
  if ((m = /^\+(\d{8,15})$/.exec(raw)) && !raw.startsWith('+91')) return m[1];
  return null;
}

export function whatsappUrl(phone, text = '') {
  const number = whatsappNumber(phone);
  if (!number) return null;
  return `https://api.whatsapp.com/send/?phone=${number}&text=${encodeURIComponent(text)}&type=phone_number&app_absent=0`;
}
