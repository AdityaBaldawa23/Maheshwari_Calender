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
      <Card title="Active administrators">
        {error && <Notice tone="error">{error}</Notice>}
        <ul className="divide-y divide-line text-sm">
          {(admins ?? []).map((a) => (
            <li key={a.uid} className="py-2">
              {a.name || '—'} · {a.email || '—'} <span className="block font-mono text-xs text-muted">{a.uid}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Adding / removing administrators">
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>Firebase console → Authentication → Users → “Add user” (email + temporary password). The new admin then uses “Forgot password?” to set their own.</li>
          <li>Copy their User UID.</li>
          <li>
            Firestore → <code>admins</code> collection → Document ID = that UID → fields: <code>active: true</code> (boolean),{' '}
            <code>email</code>, <code>name</code>.
          </li>
          <li>
            To remove: set <code>active: false</code> in that document (or delete it) and disable the account in Authentication.
          </li>
        </ol>
        <p className="mt-2 text-xs text-muted">
          For security this list cannot be changed from the portal — Security Rules let no client modify <code>admins</code>.
          Details: docs/V2_ADMIN.md
        </p>
      </Card>
    </>
  );
}
