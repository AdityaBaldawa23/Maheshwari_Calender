/**
 * Synchronised datasets. Each one knows how to (1) read its tiny version
 * document, (2) download a full payload only when the version changed, and
 * (3) verify the payload before it may replace the cached copy.
 *
 * Firestore documents:
 *   districts/{id} (+ chunks)       member directory of ONE district — readable only by members
 *                                   the IT Head approved for that district (signed in, ID token)
 *   Public-read, admin-write:
 *   published/emergency            4 contacts, police/ambulance/fire, 4 hospitals
 *   published/content               advertisements + notices
 *   published/calendar              { version, years: { "2027": <version>, … } }
 *   published/occasions_<year>      { version, year, verified, occasions: [...] }
 */
import { chunkId, verifyDirectorySnapshot } from '../../shared/snapshot.js';
import { checkEmergencyDoc } from '../../shared/emergencySchema.js';
import { checkAdvertisement, checkNotice, checkOccasion } from '../../utils/validators.js';

const isVersion = (v) => Number.isInteger(v) && v > 0;

/**
 * The approved member's district directory (cached under the name 'directory').
 * `token` is the member's Firebase ID token. Security Rules refuse every other
 * district, so even a modified app cannot download more than its own district.
 */
export function districtDirectoryDataset(district, token) {
  return {
    name: 'directory',
    async fetchMeta(remote) {
      const meta = await remote.getDoc(`districts/${district}`, { token });
      return meta && isVersion(meta.version) && meta.district === district ? meta : null;
    },
    async fetchPayload(remote, meta) {
      const paths = Array.from({ length: meta.chunkCount }, (_, i) => `districts/${district}/chunks/${chunkId(meta.version, i)}`);
      const chunks = [];
      // Batches of 100 documents per request keep requests small and quick.
      for (let i = 0; i < paths.length; i += 100) chunks.push(...(await remote.getDocs(paths.slice(i, i + 100), { token })));
      if (chunks.some((c) => !c)) throw new Error('directory: a chunk is missing (publication in progress?)');
      const result = verifyDirectorySnapshot(meta, chunks);
      if (!result.ok) throw new Error(`directory: ${result.error}`);
      return result.members;
    },
  };
}

export const emergencyDataset = {
  name: 'emergency',
  async fetchMeta(remote) {
    const doc = await remote.getDoc('published/emergency');
    return doc && isVersion(doc.version) ? doc : null;
  },
  async fetchPayload(_remote, doc) {
    const problems = checkEmergencyDoc(doc);
    if (problems.length) throw new Error(`emergency: ${problems[0]}`);
    return { contacts: doc.contacts, services: doc.services, hospitals: doc.hospitals };
  },
};

export const contentDataset = {
  name: 'content',
  async fetchMeta(remote) {
    const doc = await remote.getDoc('published/content');
    return doc && isVersion(doc.version) ? doc : null;
  },
  async fetchPayload(_remote, doc) {
    const ads = Array.isArray(doc.ads) ? doc.ads : [];
    const notices = Array.isArray(doc.notices) ? doc.notices : [];
    const bad = [...ads.map(checkAdvertisement), ...notices.map(checkNotice)].find((p) => p.length);
    if (bad) throw new Error(`content: ${bad[0]}`);
    return { ads, notices };
  },
};

/** Calendar index: which years have admin-published occasions, and at which version. */
export const calendarIndexDataset = {
  name: 'calendar-index',
  async fetchMeta(remote) {
    const doc = await remote.getDoc('published/calendar');
    return doc && isVersion(doc.version) ? doc : null;
  },
  async fetchPayload(_remote, doc) {
    const years = {};
    for (const [year, version] of Object.entries(doc.years ?? {})) {
      if (/^\d{4}$/.test(year) && isVersion(version)) years[year] = version;
    }
    return years;
  },
};

export function occasionsDataset(year) {
  return {
    name: `occasions-${year}`,
    async fetchMeta(remote) {
      const doc = await remote.getDoc(`published/occasions_${year}`);
      return doc && isVersion(doc.version) && doc.year === year ? doc : null;
    },
    async fetchPayload(_remote, doc) {
      const occasions = Array.isArray(doc.occasions) ? doc.occasions : null;
      if (!occasions) throw new Error(`occasions ${year}: list missing`);
      const bad = occasions.map((o) => checkOccasion(o, year)).find((p) => p.length);
      if (bad) throw new Error(`occasions ${year}: ${bad[0]}`);
      const keys = new Set();
      for (const o of occasions) {
        const k = `${o.id}|${o.date}`;
        if (keys.has(k)) throw new Error(`occasions ${year}: duplicate ${k}`);
        keys.add(k);
      }
      return { occasions, verified: doc.verified === true };
    },
  };
}
