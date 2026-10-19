# Profession categories

Audience: administrators preparing member sheets.

Every member gets **one** broad category (used by the app's व्यवसाय filter). The original wording from the sheet is kept as *profession details* when it adds information (e.g. "Haldi trader", "Software Engineer at TCS").

In the Excel/CSV **Profession** column you can write the category name or any common wording; it is matched automatically (the import preview shows the result). Text that matches nothing is stored as **Other**, keeping the original wording, and is flagged with a warning so you can correct it.

| # | Category (English) | श्रेणी (हिंदी) | Code | Example words recognised |
| --- | --- | --- | --- | --- |
| 1 | Software / IT professional | सॉफ़्टवेयर / आईटी | `software-it` | software, it, i.t, developer, programmer, coder |
| 2 | Engineer (non-IT) | इंजीनियर | `engineer` | engineer, engg, mechanical, civil engineer, electrical, electronics engineer |
| 3 | Doctor / Healthcare | डॉक्टर / स्वास्थ्य सेवा | `doctor-health` | doctor, dr., mbbs, md, cardio, physician |
| 4 | Pharmacy / Medical store | फार्मेसी / मेडिकल | `pharmacy` | pharma, chemist, medical store, drug |
| 5 | Chartered Accountant (CA) | चार्टर्ड अकाउंटेंट (CA) | `ca` | chartered accountant, c.a, ca |
| 6 | Company Secretary (CS) | कंपनी सेक्रेटरी (CS) | `cs` | company secretary, c.s, cs |
| 7 | Cost Accountant / Tax consultant | कॉस्ट अकाउंटेंट / कर सलाहकार | `cma-tax` | cma, icwa, cost accountant, tax, gst, accountant |
| 8 | Banking, Finance & Insurance | बैंकिंग, वित्त एवं बीमा | `banking-finance` | bank, finance, financial, insurance, lic, investment |
| 9 | Lawyer / Legal | वकील / विधि | `legal` | lawyer, advocate, legal, law, judge, notary |
| 10 | Teacher / Professor / Education | शिक्षक / शिक्षा | `education` | teacher, professor, lecturer, tutor, coaching, school |
| 11 | Government service | सरकारी सेवा | `government` | government, govt, ias, ips, officer, railway |
| 12 | Architect / Interior designer | आर्किटेक्ट / इंटीरियर | `architecture` | architect, interior |
| 13 | Turmeric (Haldi) / Agri-commodity trade | हल्दी / कृषि उपज व्यापार | `agri-trade` | haldi, turmeric, grain, commodity, commission agent, adat |
| 14 | Textile & Garments | कपड़ा / वस्त्र | `textile` | textile, cloth, garment, saree, fabric, tailor |
| 15 | Jewellery / Gold & Silver | सराफ़ा / ज्वेलरी | `jewellery` | jewel, gold, silver, sarafa, saraf |
| 16 | Industry / Manufacturing | उद्योग / निर्माण | `industry` | industr, manufactur, factory, mill, plant, udyog |
| 17 | Builder / Real estate / Construction | बिल्डर / रियल एस्टेट | `construction` | builder, real estate, construction, contractor, developer (real, property |
| 18 | Transport & Logistics | ट्रांसपोर्ट / लॉजिस्टिक्स | `transport` | transport, logistic, courier, travel, tours, cargo |
| 19 | Automobile / Vehicle dealership | ऑटोमोबाइल | `automobile` | automobile, auto, vehicle, car, tyre, garage |
| 20 | Hotel, Restaurant & Food | होटल / खान-पान | `food-hospitality` | hotel, restaurant, cafe, catering, sweet, mithai |
| 21 | Trader / Wholesale / Distributor | व्यापारी / थोक / वितरक | `trading` | trader, trading, wholesale, distributor, dealer, agency |
| 22 | Shop / Retail / Showroom | दुकान / रिटेल / शोरूम | `retail` | shop, retail, showroom, store, mart, kirana |
| 23 | Agriculture / Farming | कृषि / खेती | `agriculture` | farmer, farming, agricultur, agri |
| 24 | Media, Design & Marketing | मीडिया / डिज़ाइन / मार्केटिंग | `media-marketing` | media, design, marketing, advertis, photograph, video |
| 25 | Private job / Corporate employee | निजी नौकरी | `private-job` | private, job, service, employee, executive, manager |
| 26 | Self-employed / Consultant | स्वरोज़गार / सलाहकार | `self-employed` | self employed, self-employed, consultant, freelance, own business, business |
| 27 | Student | विद्यार्थी | `student` | student, studying |
| 28 | Homemaker | गृहिणी | `homemaker` | homemaker, housewife, house wife |
| 29 | Retired | सेवानिवृत्त | `retired` | retired, pension |
| 30 | Other | अन्य | `other` | other |

Matching is case-insensitive and word-aware ("CA" matches *CA* but not *Cardiologist*; "MCA student" → Student). Specific categories are checked before generic ones ("Jewellery shop" → Jewellery, not Shop). To add keywords or categories, edit `src/shared/professions.js` (keep existing codes unchanged once data is published).
