import { useEffect, useState } from 'react';
import { Button, Card, ConfirmDialog, Notice } from '../components/ui.jsx';
import { listImports, listPublications, publishDataset, rollbackDirectory } from '../services/api.js';

const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('en-IN') : '—');
const stripMeta = ({ version: _v, schemaVersion: _s, updatedAt: _u, ...rest }) => rest;

/** Import + publication audit trail, with rollback of earlier publications. */
export function HistoryPage({ uid }) {
  const [imports, setImports] = useState(null);
  const [pubs, setPubs] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [rollback, setRollback] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([listImports(), listPublications()])
      .then(([i, p]) => {
        setImports(i);
        setPubs(p);
      })
      .catch((err) => setError(err.message));
  useEffect(() => {
    load();
  }, []);

  const runRollback = async () => {
    setBusy(true);
    try {
      if (rollback.dataset === 'directory') await rollbackDirectory(rollback, uid);
      else await publishDataset(rollback.dataset, stripMeta(rollback.payload), uid);
      setMessage({ tone: 'success', text: `${rollback.dataset}: version ${rollback.version} re-published.` });
      setRollback(null);
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Card title="Publication history">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs text-muted">
              <tr>
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Dataset</th>
                <th className="px-2 py-1">Action</th>
                <th className="px-2 py-1">Version</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(pubs ?? []).map((p) => (
                <tr key={p.docId}>
                  <td className="px-2 py-1 whitespace-nowrap">{when(p.publishedAt)}</td>
                  <td className="px-2 py-1">{p.dataset}</td>
                  <td className="px-2 py-1">
                    {p.action}
                    {(p.recordCount ?? p.meta?.recordCount) !== undefined && ` (${p.recordCount ?? p.meta.recordCount})`}
                    {p.districts && <span className="block text-xs text-muted">{Object.keys(p.districts).length} district(s) changed</span>}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs">{p.version}</td>
                  <td className="px-2 py-1">
                    {(p.districts || p.payload) && (
                      <Button variant="ghost" onClick={() => setRollback(p)}>
                        Re-publish this version
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pubs?.length === 0 && <p className="p-3 text-muted">No publications yet.</p>}
        </div>
      </Card>

      <Card title="Import history">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs text-muted">
              <tr>
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">File</th>
                <th className="px-2 py-1">Mode</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(imports ?? []).map((i) => (
                <tr key={i.importId}>
                  <td className="px-2 py-1 whitespace-nowrap">{when(i.startedAt)}</td>
                  <td className="px-2 py-1">{i.fileName}</td>
                  <td className="px-2 py-1">{i.mode}</td>
                  <td className="px-2 py-1">
                    {i.status}
                    {i.error && <span className="block text-xs text-sunday">{i.error}</span>}
                  </td>
                  <td className="px-2 py-1 text-xs">
                    {i.options?.org ? `${i.options.org} · ` : ''}new {i.summary?.new ?? 0} · updated {i.summary?.update ?? 0} · errors {i.summary?.invalid ?? 0} ·
                    duplicates {i.summary?.duplicate ?? 0} · written {i.written ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {imports?.length === 0 && <p className="p-3 text-muted">No imports yet.</p>}
        </div>
      </Card>

      {rollback && (
        <ConfirmDialog title="Re-publish an earlier version?" busy={busy} onCancel={() => setRollback(null)} onConfirm={runRollback}>
          <p>
            Version {rollback.version} of <strong>{rollback.dataset}</strong> will be shown in the app again.
            {rollback.dataset === 'directory' && ' Each district changed in that publication is switched back to its version then (only the last 3 versions per district can be restored).'}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
