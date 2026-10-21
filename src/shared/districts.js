/**
 * Maharashtra districts. A member's directory access is limited to ONE
 * district (assigned by the IT Head), and the directory is published as one
 * snapshot per district (districts/{id}), so a phone downloads only its own
 * district — never the whole directory.
 *
 * IDs are stable lowercase slugs (used in Firestore paths and Security Rules);
 * never rename an ID once members are assigned to it.
 */
export const DISTRICTS = [
  { id: 'ahilyanagar', hi: 'अहिल्यानगर', en: 'Ahilyanagar', aliases: ['ahmednagar', 'ahmadnagar', 'nagar', 'अहमदनगर'] },
  { id: 'akola', hi: 'अकोला', en: 'Akola' },
  { id: 'amravati', hi: 'अमरावती', en: 'Amravati' },
  { id: 'beed', hi: 'बीड', en: 'Beed', aliases: ['bid'] },
  { id: 'bhandara', hi: 'भंडारा', en: 'Bhandara' },
  { id: 'buldhana', hi: 'बुलढाणा', en: 'Buldhana', aliases: ['buldana', 'बुलडाणा'] },
  { id: 'chandrapur', hi: 'चंद्रपुर', en: 'Chandrapur', aliases: ['चंद्रपूर'] },
  {
    id: 'chhatrapati-sambhajinagar', hi: 'छत्रपति संभाजीनगर', en: 'Chhatrapati Sambhajinagar',
    aliases: ['aurangabad', 'sambhajinagar', 'chh sambhajinagar', 'औरंगाबाद', 'संभाजीनगर', 'छत्रपती संभाजीनगर'],
  },
  { id: 'dharashiv', hi: 'धाराशिव', en: 'Dharashiv', aliases: ['osmanabad', 'उस्मानाबाद'] },
  { id: 'dhule', hi: 'धुले', en: 'Dhule', aliases: ['धुळे'] },
  { id: 'gadchiroli', hi: 'गढ़चिरौली', en: 'Gadchiroli', aliases: ['गडचिरोली'] },
  { id: 'gondia', hi: 'गोंदिया', en: 'Gondia', aliases: ['gondiya'] },
  { id: 'hingoli', hi: 'हिंगोली', en: 'Hingoli' },
  { id: 'jalgaon', hi: 'जलगांव', en: 'Jalgaon', aliases: ['जळगाव', 'जलगाँव'] },
  { id: 'jalna', hi: 'जालना', en: 'Jalna' },
  { id: 'kolhapur', hi: 'कोल्हापुर', en: 'Kolhapur', aliases: ['कोल्हापूर'] },
  { id: 'latur', hi: 'लातूर', en: 'Latur', aliases: ['लातुर'] },
  { id: 'mumbai-city', hi: 'मुंबई शहर', en: 'Mumbai City', aliases: ['mumbai', 'bombay', 'मुंबई'] },
  { id: 'mumbai-suburban', hi: 'मुंबई उपनगर', en: 'Mumbai Suburban', aliases: ['mumbai suburb', 'मुंबई उपनगरीय'] },
  { id: 'nagpur', hi: 'नागपुर', en: 'Nagpur', aliases: ['नागपूर'] },
  { id: 'nanded', hi: 'नांदेड़', en: 'Nanded', aliases: ['नांदेड'] },
  { id: 'nandurbar', hi: 'नंदुरबार', en: 'Nandurbar' },
  { id: 'nashik', hi: 'नासिक', en: 'Nashik', aliases: ['nasik', 'नाशिक'] },
  { id: 'palghar', hi: 'पालघर', en: 'Palghar' },
  { id: 'parbhani', hi: 'परभणी', en: 'Parbhani', aliases: ['परभनी'] },
  { id: 'pune', hi: 'पुणे', en: 'Pune', aliases: ['poona'] },
  { id: 'raigad', hi: 'रायगढ़', en: 'Raigad', aliases: ['raigarh', 'रायगड'] },
  { id: 'ratnagiri', hi: 'रत्नागिरी', en: 'Ratnagiri' },
  { id: 'sangli', hi: 'सांगली', en: 'Sangli' },
  { id: 'satara', hi: 'सातारा', en: 'Satara' },
  { id: 'sindhudurg', hi: 'सिंधुदुर्ग', en: 'Sindhudurg' },
  { id: 'solapur', hi: 'सोलापुर', en: 'Solapur', aliases: ['sholapur', 'सोलापूर'] },
  { id: 'thane', hi: 'ठाणे', en: 'Thane' },
  { id: 'wardha', hi: 'वर्धा', en: 'Wardha' },
  { id: 'washim', hi: 'वाशिम', en: 'Washim' },
  { id: 'yavatmal', hi: 'यवतमाल', en: 'Yavatmal', aliases: ['yeotmal', 'यवतमाळ'] },
];

export const DISTRICT_IDS = DISTRICTS.map((d) => d.id);
/** Same pattern as firestore.rules uses for district document IDs. */
export const DISTRICT_ID_PATTERN = /^[a-z][a-z-]{1,39}$/;

export const isDistrictId = (id) => DISTRICT_IDS.includes(id);
export const districtLabel = (id, lang = 'hi') => DISTRICTS.find((d) => d.id === id)?.[lang] ?? '';

const key = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\b(district|dist|jilha|zilla|zila)\b\.?/g, '')
    .replace(/(जिला|जिल्हा|ज़िला)/g, '')
    .replace(/[._,()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const INDEX = new Map(
  DISTRICTS.flatMap((d) => [d.id.replace(/-/g, ' '), d.hi, d.en, ...(d.aliases ?? [])].map((name) => [key(name), d.id])),
);

/** "Aurangabad", "जिल्हा सांगली", "Sangli Dist." → district id, or null if unknown. */
export function matchDistrict(text) {
  return INDEX.get(key(text)) ?? null;
}
