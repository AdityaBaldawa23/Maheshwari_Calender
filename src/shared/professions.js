/**
 * Broad profession categories for the directory (stored as the category `id`).
 * Kept deliberately general so every member fits one; the optional free-text
 * `professionDetail` holds specifics (e.g. "Turmeric commission agent").
 *
 * `keywords` let spreadsheet imports map free text ("Software Engineer",
 * "CA", "हल्दी व्यापारी") to a category. Matching is case-insensitive.
 */
export const PROFESSIONS = [
  { id: 'software-it', en: 'Software / IT professional', hi: 'सॉफ़्टवेयर / आईटी', keywords: ['software', 'it', 'i.t', 'developer', 'programmer', 'coder', 'web', 'app developer', 'data scien', 'data analyst', 'tech', 'computer', 'cyber', 'devops', 'cloud', 'सॉफ्टवेयर', 'आईटी', 'कंप्यूटर'] },
  { id: 'engineer', en: 'Engineer (non-IT)', hi: 'इंजीनियर', keywords: ['engineer', 'engg', 'mechanical', 'civil engineer', 'electrical', 'electronics engineer', 'chemical engineer', 'इंजीनियर', 'अभियंता'] },
  { id: 'doctor-health', en: 'Doctor / Healthcare', hi: 'डॉक्टर / स्वास्थ्य सेवा', keywords: ['doctor', 'dr.', 'mbbs', 'md', 'cardio', 'physician', 'specialist', 'gynec', 'pediatric', 'ortho', 'radiolog', 'surgeon', 'dentist', 'physio', 'nurse', 'ayurved', 'homeopath', 'hospital', 'clinic', 'pathology', 'डॉक्टर', 'चिकित्सक', 'वैद्य'] },
  { id: 'pharmacy', en: 'Pharmacy / Medical store', hi: 'फार्मेसी / मेडिकल', keywords: ['pharma', 'chemist', 'medical store', 'drug', 'फार्मेसी', 'मेडिकल'] },
  { id: 'ca', en: 'Chartered Accountant (CA)', hi: 'चार्टर्ड अकाउंटेंट (CA)', keywords: ['chartered accountant', 'c.a', 'ca', 'सीए', 'चार्टर्ड'] },
  { id: 'cs', en: 'Company Secretary (CS)', hi: 'कंपनी सेक्रेटरी (CS)', keywords: ['company secretary', 'c.s', 'cs', 'सीएस'] },
  { id: 'cma-tax', en: 'Cost Accountant / Tax consultant', hi: 'कॉस्ट अकाउंटेंट / कर सलाहकार', keywords: ['cma', 'icwa', 'cost accountant', 'tax', 'gst', 'accountant', 'accounts', 'auditor', 'कर सलाहकार', 'लेखाकार'] },
  { id: 'banking-finance', en: 'Banking, Finance & Insurance', hi: 'बैंकिंग, वित्त एवं बीमा', keywords: ['bank', 'finance', 'financial', 'insurance', 'lic', 'investment', 'mutual fund', 'stock', 'share market', 'broker', 'trader (stock', 'loan', 'बैंक', 'बीमा', 'वित्त'] },
  { id: 'legal', en: 'Lawyer / Legal', hi: 'वकील / विधि', keywords: ['lawyer', 'advocate', 'legal', 'law', 'judge', 'notary', 'वकील', 'अधिवक्ता'] },
  { id: 'education', en: 'Teacher / Professor / Education', hi: 'शिक्षक / शिक्षा', keywords: ['teacher', 'professor', 'lecturer', 'tutor', 'coaching', 'school', 'college', 'education', 'principal', 'शिक्षक', 'अध्यापक', 'प्राध्यापक'] },
  { id: 'government', en: 'Government service', hi: 'सरकारी सेवा', keywords: ['government', 'govt', 'ias', 'ips', 'officer', 'railway', 'police', 'army', 'defence', 'psu', 'सरकारी', 'शासकीय'] },
  { id: 'architecture', en: 'Architect / Interior designer', hi: 'आर्किटेक्ट / इंटीरियर', keywords: ['architect', 'interior', 'आर्किटेक्ट'] },
  { id: 'agri-trade', en: 'Turmeric (Haldi) / Agri-commodity trade', hi: 'हल्दी / कृषि उपज व्यापार', keywords: ['haldi', 'turmeric', 'grain', 'commodity', 'commission agent', 'adat', 'aadat', 'dalal', 'market yard', 'apmc', 'jaggery', 'gul', 'raisin', 'bedana', 'हल्दी', 'अनाज', 'आढ़त', 'आडत'] },
  { id: 'textile', en: 'Textile & Garments', hi: 'कपड़ा / वस्त्र', keywords: ['textile', 'cloth', 'garment', 'saree', 'fabric', 'tailor', 'boutique', 'कपड़ा', 'वस्त्र', 'साड़ी'] },
  { id: 'jewellery', en: 'Jewellery / Gold & Silver', hi: 'सराफ़ा / ज्वेलरी', keywords: ['jewel', 'gold', 'silver', 'sarafa', 'saraf', 'सराफ', 'ज्वेलर'] },
  { id: 'industry', en: 'Industry / Manufacturing', hi: 'उद्योग / निर्माण', keywords: ['industr', 'manufactur', 'factory', 'mill', 'plant', 'udyog', 'उद्योग', 'फैक्ट्री'] },
  { id: 'construction', en: 'Builder / Real estate / Construction', hi: 'बिल्डर / रियल एस्टेट', keywords: ['builder', 'real estate', 'construction', 'contractor', 'developer (real', 'property', 'बिल्डर', 'ठेकेदार'] },
  { id: 'transport', en: 'Transport & Logistics', hi: 'ट्रांसपोर्ट / लॉजिस्टिक्स', keywords: ['transport', 'logistic', 'courier', 'travel', 'tours', 'cargo', 'ट्रांसपोर्ट'] },
  { id: 'automobile', en: 'Automobile / Vehicle dealership', hi: 'ऑटोमोबाइल', keywords: ['automobile', 'auto', 'vehicle', 'car', 'tyre', 'garage', 'spare parts', 'ऑटोमोबाइल'] },
  { id: 'food-hospitality', en: 'Hotel, Restaurant & Food', hi: 'होटल / खान-पान', keywords: ['hotel', 'restaurant', 'cafe', 'catering', 'sweet', 'mithai', 'bakery', 'food', 'dairy', 'होटल', 'मिठाई'] },
  { id: 'trading', en: 'Trader / Wholesale / Distributor', hi: 'व्यापारी / थोक / वितरक', keywords: ['trader', 'trading', 'wholesale', 'distributor', 'dealer', 'agency', 'supplier', 'merchant', 'व्यापार', 'व्यापारी', 'थोक'] },
  { id: 'retail', en: 'Shop / Retail / Showroom', hi: 'दुकान / रिटेल / शोरूम', keywords: ['shop', 'retail', 'showroom', 'store', 'mart', 'kirana', 'grocery', 'किराना', 'stationery', 'hardware', 'electrical shop', 'mobile shop', 'दुकान'] },
  { id: 'agriculture', en: 'Agriculture / Farming', hi: 'कृषि / खेती', keywords: ['farmer', 'farming', 'agricultur', 'agri', 'शेती', 'खेती', 'कृषि', 'किसान'] },
  { id: 'media-marketing', en: 'Media, Design & Marketing', hi: 'मीडिया / डिज़ाइन / मार्केटिंग', keywords: ['media', 'design', 'marketing', 'advertis', 'photograph', 'video', 'printing', 'press', 'journalist', 'event', 'मीडिया'] },
  { id: 'private-job', en: 'Private job / Corporate employee', hi: 'निजी नौकरी', keywords: ['private', 'job', 'service', 'employee', 'executive', 'manager', 'corporate', 'नौकरी'] },
  { id: 'self-employed', en: 'Self-employed / Consultant', hi: 'स्वरोज़गार / सलाहकार', keywords: ['self employed', 'self-employed', 'consultant', 'freelance', 'own business', 'business', 'businessman', 'व्यवसाय', 'स्वरोजगार'] },
  { id: 'student', en: 'Student', hi: 'विद्यार्थी', keywords: ['student', 'studying', 'विद्यार्थी', 'छात्र'] },
  { id: 'homemaker', en: 'Homemaker', hi: 'गृहिणी', keywords: ['homemaker', 'housewife', 'house wife', 'गृहिणी'] },
  { id: 'retired', en: 'Retired', hi: 'सेवानिवृत्त', keywords: ['retired', 'pension', 'सेवानिवृत्त'] },
  { id: 'other', en: 'Other', hi: 'अन्य', keywords: ['other', 'अन्य'] },
];

export const PROFESSION_IDS = PROFESSIONS.map((p) => p.id);
const BY_ID = new Map(PROFESSIONS.map((p) => [p.id, p]));

export const professionLabel = (id, lang = 'hi') => BY_ID.get(id)?.[lang] ?? '';

const DEVANAGARI = /[ऀ-ॿ]/;
const escapeRe = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Keyword matchers. Latin keywords must start at a word boundary ("ca" ≠ "mca");
 * short ones (≤4 letters) must also end at one ("ca" ≠ "cardiologist"), longer
 * ones may be prefixes ("industr" → "industries"). Devanagari keywords match anywhere.
 */
const MATCHERS = PROFESSIONS.map((p) => ({
  id: p.id,
  tests: p.keywords.map((k) => {
    const kw = k.toLowerCase();
    if (DEVANAGARI.test(kw)) return (t) => t.includes(kw);
    const end = kw.replace(/[^a-z]/g, '').length <= 4 ? '(?![a-z])' : '';
    const re = new RegExp(`(?:^|[^a-z])${escapeRe(kw)}${end}`);
    return (t) => re.test(t);
  }),
}));

/**
 * Maps spreadsheet text to a category id: exact id / English / Hindi label first,
 * then the first category (specific before generic) with a matching keyword.
 * Returns null if nothing matches.
 */
export function matchProfession(text) {
  if (typeof text !== 'string') return null;
  const t = text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (const p of PROFESSIONS) {
    if (t === p.id || t === p.en.toLowerCase() || t === p.hi) return p.id;
  }
  return MATCHERS.find((m) => m.tests.some((test) => test(t)))?.id ?? null;
}


/**
 * True when the text is just a name for the category (its label, id or one of
 * its keywords, e.g. "Housewife", "CA") — i.e. it adds no detail worth keeping.
 */
export function isCategoryName(id, text) {
  const p = BY_ID.get(id);
  if (!p || typeof text !== 'string') return false;
  const clean = (s) => s.normalize('NFC').toLowerCase().replace(/[.\s]+/g, ' ').trim();
  const t = clean(text);
  const names = [p.id, p.en, p.hi, ...p.keywords].map(clean);
  return names.includes(t);
}
