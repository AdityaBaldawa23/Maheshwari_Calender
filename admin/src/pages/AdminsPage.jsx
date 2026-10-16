import { useEffect, useState } from 'react';
import { Card, Notice } from '../components/ui.jsx';
import { listAdmins } from '../services/api.js';

/** Read-only roster + the documented provisioning procedure (admins are added in the Firebase console). */
export function AdminsPage() {
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    listAdmins().then(setAdmins).catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <Card title="सक्रिय व्यवस्थापक">
        {error && <Notice tone="error">{error}</Notice>}
        <ul className="divide-y divide-line text-sm">
          {(admins ?? []).map((a) => (
            <li key={a.uid} className="py-2">
              {a.name || '—'} · {a.email || '—'} <span className="block font-mono text-xs text-muted">{a.uid}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="व्यवस्थापक जोड़ना / हटाना">
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>Firebase console → Authentication → Users → “Add user” (ईमेल + अस्थायी पासवर्ड)। नया व्यक्ति लॉगिन के बाद पासवर्ड बदले।</li>
          <li>उसका User UID कॉपी करें।</li>
          <li>
            Firestore → <code>admins</code> collection → Document ID = वही UID → फ़ील्ड: <code>active: true</code> (boolean),{' '}
            <code>email</code>, <code>name</code>।
          </li>
          <li>
            हटाने के लिए: उसी दस्तावेज़ में <code>active: false</code> करें (या दस्तावेज़ हटाएँ) और Authentication में खाता Disable करें।
          </li>
        </ol>
        <p className="mt-2 text-xs text-muted">
          सुरक्षा कारण से यह सूची पोर्टल से नहीं बदली जा सकती — Security Rules किसी भी क्लाइंट को <code>admins</code> बदलने नहीं देते।
          विवरण: docs/V2_ADMIN.md
        </p>
      </Card>
    </>
  );
}
