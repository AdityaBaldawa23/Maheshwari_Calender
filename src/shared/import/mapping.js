/**
 * Spreadsheet header → member field mapping. Admins can override any guess in
 * the portal; this only provides sensible defaults for common Hindi/English headers.
 */

/** Import targets. `name` auto-detects Hindi (Devanagari) vs English per row. */
export const IMPORT_TARGETS = {
  id: { hi: 'सदस्य क्रमांक', en: 'Member ID' },
  name: { hi: 'नाम (स्वतः हिंदी/अंग्रेज़ी)', en: 'Name (auto Hindi/English)' },
  nameHi: { hi: 'नाम (हिंदी)', en: 'Name (Hindi)' },
  nameEn: { hi: 'नाम (अंग्रेज़ी)', en: 'Name (English)' },
  dob: { hi: 'जन्म तिथि', en: 'Date of birth' },
  age: { hi: 'आयु', en: 'Age' },
  anniversary: { hi: 'विवाह वर्षगांठ', en: 'Anniversary' },
  bloodGroup: { hi: 'रक्त समूह', en: 'Blood group' },
  fatherName: { hi: 'पिता का नाम', en: "Father's name" },
  motherName: { hi: 'माता का नाम', en: "Mother's name" },
  phone: { hi: 'संपर्क नंबर', en: 'Contact number' },
  city: { hi: 'शहर / स्थान', en: 'City / locality' },
  district: { hi: 'जिला', en: 'District' },
  photo: { hi: 'फ़ोटो लिंक', en: 'Photo URL' },
  profession: { hi: 'व्यवसाय', en: 'Profession' },
  professionDetail: { hi: 'व्यवसाय विवरण', en: 'Profession details' },
  designation: { hi: 'पद', en: 'Designation' },
  publicNote: { hi: 'सार्वजनिक टिप्पणी', en: 'Public note' },
  adminNote: { hi: 'आंतरिक टिप्पणी (प्रकाशित नहीं)', en: 'Internal note (not published)' },
};

const ALIASES = {
  id: ['member id', 'memberid', 'member no', 'member number', 'id', 'sr id', 'सदस्य क्रमांक', 'सदस्य आईडी', 'सदस्य संख्या', 'आईडी'],
  name: ['name', 'full name', 'member name', 'नाम', 'पूरा नाम', 'सदस्य का नाम'],
  nameHi: ['name hindi', 'hindi name', 'name in hindi', 'नाम हिंदी', 'हिंदी नाम', 'नाम हिन्दी'],
  nameEn: ['name english', 'english name', 'name in english', 'नाम अंग्रेज़ी', 'नाम अंग्रेजी', 'अंग्रेजी नाम'],
  dob: ['dob', 'date of birth', 'birth date', 'birthdate', 'd o b', 'जन्म तिथि', 'जन्मतिथि', 'जन्म दिनांक', 'जन्मदिन'],
  age: ['age', 'आयु', 'उम्र', 'वय'],
  anniversary: ['anniversary', 'marriage anniversary', 'wedding anniversary', 'anniversary date', 'marriage date', 'wedding date', 'विवाह वर्षगांठ', 'वर्षगांठ', 'विवाह तिथि', 'शादी की सालगिरह'],
  bloodGroup: ['blood group', 'bloodgroup', 'blood', 'blood grp', 'रक्त समूह', 'ब्लड ग्रुप', 'रक्तगट'],
  fatherName: ['father', 'father name', 'fathers name', 'father s name', 'पिता', 'पिता का नाम', 'पिताजी का नाम', 'वडिलांचे नाव'],
  motherName: ['mother', 'mother name', 'mothers name', 'mother s name', 'माता', 'माता का नाम', 'माताजी का नाम', 'आईचे नाव'],
  phone: ['phone', 'mobile', 'mobile no', 'mobile number', 'contact', 'contact no', 'contact number', 'phone number', 'मोबाइल', 'मोबाईल', 'फ़ोन', 'फोन', 'संपर्क', 'संपर्क नंबर', 'मोबाइल नंबर'],
  city: ['city', 'locality', 'place', 'town', 'village', 'area', 'address', 'शहर', 'गाँव', 'गांव', 'स्थान', 'पता', 'नगर'],
  district: ['district', 'dist', 'district name', 'jilha', 'zilla', 'जिला', 'ज़िला', 'जिल्हा'],
  photo: ['photo', 'photo url', 'photo link', 'image', 'image url', 'image link', 'picture', 'pic', 'profile photo', 'cloudinary', 'फोटो', 'फ़ोटो', 'चित्र'],
  profession: ['profession', 'occupation', 'business', 'work', 'job', 'profession category', 'व्यवसाय', 'पेशा', 'व्यापार', 'काम', 'नौकरी'],
  professionDetail: ['profession details', 'profession detail', 'occupation details', 'business details', 'business name', 'firm', 'firm name', 'company', 'company name', 'व्यवसाय विवरण', 'फर्म', 'फर्म का नाम'],
  designation: ['designation', 'post', 'position', 'role', 'committee post', 'पद', 'पदनाम', 'दायित्व'],
  publicNote: ['note', 'notes', 'public note', 'remark', 'remarks', 'टिप्पणी'],
  adminNote: ['internal note', 'admin note', 'private note', 'आंतरिक टिप्पणी'],
};

/** "Father's Name:" → "father s name"; Devanagari kept, case/punctuation/space normalised. */
export function normalizeHeader(h) {
  return String(h ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[_.:'’()[\]{}#*\-/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Serial-number columns ("N", "No", "Sr No", "क्रम") are NOT member IDs: they change
 * whenever the sheet is sorted or rows are added, so they are always ignored.
 */
export const SERIAL_HEADERS = ['n', 'no', 'nos', 'sr', 'sr no', 'srno', 's no', 'sno', 'sl no', 'serial', 'serial no', 'serial number', 'क्र', 'क्रम', 'क्रमांक', 'अनु क्र', 'अनुक्रमांक'];
const SERIAL_SET = new Set(SERIAL_HEADERS.map((h) => normalizeHeader(h)));
export const isSerialHeader = (h) => {
  const n = normalizeHeader(h);
  return n !== '' && SERIAL_SET.has(n);
};

const ALIAS_INDEX = new Map(
  Object.entries(ALIASES).flatMap(([target, list]) => list.map((alias) => [normalizeHeader(alias), target])),
);

/**
 * Suggests a mapping { columnIndex: target | null }. Each target is used at most
 * once (first matching column wins); unknown headers map to null (ignored).
 */
export function suggestMapping(headers) {
  const used = new Set();
  const mapping = {};
  headers.forEach((h, i) => {
    const target = isSerialHeader(h) ? null : (ALIAS_INDEX.get(normalizeHeader(h)) ?? null);
    if (target && !used.has(target)) {
      mapping[i] = target;
      used.add(target);
    } else {
      mapping[i] = null;
    }
  });
  return mapping;
}

/** Problems with a mapping chosen by the admin. */
export function checkMapping(mapping) {
  const targets = Object.values(mapping).filter(Boolean);
  const problems = [];
  const dupes = targets.filter((t, i) => targets.indexOf(t) !== i);
  if (dupes.length) problems.push(`एक ही फ़ील्ड दो कॉलम में: ${[...new Set(dupes)].join(', ')} — each field may be mapped once`);
  if (!targets.some((t) => t === 'name' || t === 'nameHi' || t === 'nameEn')) problems.push('नाम का कॉलम चुनें — map at least one name column');
  return problems;
}

/** First non-empty row is the header; returns { headers, dataRows: [{ rowNumber, cells }] }. */
export function splitHeader(rows) {
  const isEmptyRow = (r) => !r || r.every((c) => c === null || c === undefined || String(c).trim() === '');
  const headerIndex = rows.findIndex((r) => !isEmptyRow(r));
  if (headerIndex < 0) return { headers: [], dataRows: [] };
  const headers = rows[headerIndex].map((h) => String(h ?? '').trim());
  const dataRows = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    if (!isEmptyRow(rows[i])) dataRows.push({ rowNumber: i + 1, cells: rows[i] }); // 1-based, as in Excel
  }
  return { headers, dataRows };
}
