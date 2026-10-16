/**
 * Occasion categories. `marker` is a short symbol shown in the calendar grid so
 * information is never conveyed by colour alone (accessibility requirement).
 * `reminderGroup` maps a category onto the user-facing reminder toggles.
 */
export const CATEGORIES = {
  maheshwari: {
    label: { hi: 'माहेश्वरी समाज', en: 'Maheshwari community' },
    marker: '✦',
    reminderGroup: 'community',
  },
  marwadi: {
    label: { hi: 'मारवाड़ी परंपरा', en: 'Marwadi tradition' },
    marker: '✦',
    reminderGroup: 'community',
  },
  festival: {
    label: { hi: 'त्योहार', en: 'Festival' },
    marker: '●',
    reminderGroup: 'festival',
  },
  vrat: {
    label: { hi: 'व्रत / धार्मिक', en: 'Vrat / religious' },
    marker: '◆',
    reminderGroup: 'vrat',
  },
  jayanti: {
    label: { hi: 'जयंती', en: 'Birth anniversary' },
    marker: '◇',
    reminderGroup: 'community',
  },
  punyatithi: {
    label: { hi: 'पुण्यतिथि', en: 'Death anniversary' },
    marker: '◇',
    reminderGroup: 'community',
  },
  event: {
    label: { hi: 'सामाजिक कार्यक्रम', en: 'Community event' },
    marker: '★',
    reminderGroup: 'community',
  },
  national: {
    label: { hi: 'राष्ट्रीय दिवस', en: 'National day' },
    marker: '▲',
    reminderGroup: 'festival',
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

export const IMPORTANCE_LEVELS = ['high', 'medium', 'low'];

/** User-facing reminder groups (Settings screen toggles). */
export const REMINDER_GROUPS = {
  festival: { hi: 'त्योहार एवं राष्ट्रीय दिवस', en: 'Festivals & national days' },
  community: { hi: 'माहेश्वरी / मारवाड़ी अवसर', en: 'Maheshwari / Marwadi occasions' },
  vrat: { hi: 'व्रत (एकादशी आदि)', en: 'Vrats (Ekadashi etc.)' },
};
