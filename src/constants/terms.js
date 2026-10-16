/**
 * Bilingual vocabulary. Calendar data stores *codes* (e.g. tithi 9, paksha
 * "shukla", maas "jyeshtha"); the UI resolves them here. V1 renders Hindi only,
 * but every term already carries English so a language switch needs no data change.
 */

export const GREGORIAN_MONTHS = [
  { hi: 'जनवरी', en: 'January' },
  { hi: 'फ़रवरी', en: 'February' },
  { hi: 'मार्च', en: 'March' },
  { hi: 'अप्रैल', en: 'April' },
  { hi: 'मई', en: 'May' },
  { hi: 'जून', en: 'June' },
  { hi: 'जुलाई', en: 'July' },
  { hi: 'अगस्त', en: 'August' },
  { hi: 'सितंबर', en: 'September' },
  { hi: 'अक्टूबर', en: 'October' },
  { hi: 'नवंबर', en: 'November' },
  { hi: 'दिसंबर', en: 'December' },
];

export const WEEKDAYS = [
  { hi: 'रविवार', en: 'Sunday', short: { hi: 'रवि', en: 'Sun' } },
  { hi: 'सोमवार', en: 'Monday', short: { hi: 'सोम', en: 'Mon' } },
  { hi: 'मंगलवार', en: 'Tuesday', short: { hi: 'मंगल', en: 'Tue' } },
  { hi: 'बुधवार', en: 'Wednesday', short: { hi: 'बुध', en: 'Wed' } },
  { hi: 'गुरुवार', en: 'Thursday', short: { hi: 'गुरु', en: 'Thu' } },
  { hi: 'शुक्रवार', en: 'Friday', short: { hi: 'शुक्र', en: 'Fri' } },
  { hi: 'शनिवार', en: 'Saturday', short: { hi: 'शनि', en: 'Sat' } },
];

/** Tithi names by number within a paksha (1–14). 15 depends on the paksha. */
export const TITHIS = {
  1: { hi: 'प्रतिपदा', en: 'Pratipada' },
  2: { hi: 'द्वितीया', en: 'Dwitiya' },
  3: { hi: 'तृतीया', en: 'Tritiya' },
  4: { hi: 'चतुर्थी', en: 'Chaturthi' },
  5: { hi: 'पंचमी', en: 'Panchami' },
  6: { hi: 'षष्ठी', en: 'Shashthi' },
  7: { hi: 'सप्तमी', en: 'Saptami' },
  8: { hi: 'अष्टमी', en: 'Ashtami' },
  9: { hi: 'नवमी', en: 'Navami' },
  10: { hi: 'दशमी', en: 'Dashami' },
  11: { hi: 'एकादशी', en: 'Ekadashi' },
  12: { hi: 'द्वादशी', en: 'Dwadashi' },
  13: { hi: 'त्रयोदशी', en: 'Trayodashi' },
  14: { hi: 'चतुर्दशी', en: 'Chaturdashi' },
};

export const PURNIMA = { hi: 'पूर्णिमा', en: 'Purnima' };
export const AMAVASYA = { hi: 'अमावस्या', en: 'Amavasya' };

export const PAKSHAS = {
  shukla: { hi: 'शुक्ल', en: 'Shukla', full: { hi: 'शुक्ल पक्ष', en: 'Shukla Paksha' } },
  krishna: { hi: 'कृष्ण', en: 'Krishna', full: { hi: 'कृष्ण पक्ष', en: 'Krishna Paksha' } },
};

/** Lunar months in order, starting from Chaitra. */
export const MAAS_ORDER = [
  'chaitra',
  'vaishakh',
  'jyeshtha',
  'ashadh',
  'shravan',
  'bhadrapad',
  'ashwin',
  'kartik',
  'margashirsha',
  'paush',
  'magh',
  'phalgun',
];

export const MAAS = {
  chaitra: { hi: 'चैत्र', en: 'Chaitra' },
  vaishakh: { hi: 'वैशाख', en: 'Vaishakh' },
  jyeshtha: { hi: 'ज्येष्ठ', en: 'Jyeshtha' },
  ashadh: { hi: 'आषाढ़', en: 'Ashadh' },
  shravan: { hi: 'श्रावण', en: 'Shravan' },
  bhadrapad: { hi: 'भाद्रपद', en: 'Bhadrapad' },
  ashwin: { hi: 'आश्विन', en: 'Ashwin' },
  kartik: { hi: 'कार्तिक', en: 'Kartik' },
  margashirsha: { hi: 'मार्गशीर्ष', en: 'Margashirsha' },
  paush: { hi: 'पौष', en: 'Paush' },
  magh: { hi: 'माघ', en: 'Magh' },
  phalgun: { hi: 'फाल्गुन', en: 'Phalgun' },
};

export const ADHIK = { hi: 'अधिक', en: 'Adhik' };

export const PAKSHA_KEYS = Object.keys(PAKSHAS);
export const MAAS_KEYS = MAAS_ORDER;
