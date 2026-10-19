/**
 * Community organisations whose member directories the app shows (परिवार sub-tabs).
 * Each member record belongs to one organisation (`org`). A person active in two
 * organisations appears in each one's list (each organisation maintains its own sheet).
 * Records published before organisations existed count as Yuva Sangathan.
 */
export const ORGANIZATIONS = [
  { id: 'yuva', hi: 'युवा संगठन', en: 'Yuva Sangathan' },
  { id: 'mahasabha', hi: 'महासभा', en: 'Maha Sabha' },
  { id: 'mahila', hi: 'महिला संगठन', en: 'Mahila Sangathan' },
  { id: 'pragati', hi: 'प्रगति मंडल', en: 'Pragati Mandal' },
];

export const ORG_IDS = ORGANIZATIONS.map((o) => o.id);
export const DEFAULT_ORG = 'yuva';
export const orgOf = (member) => (ORG_IDS.includes(member?.org) ? member.org : DEFAULT_ORG);
export const orgLabel = (id, lang = 'hi') => ORGANIZATIONS.find((o) => o.id === id)?.[lang] ?? '';
