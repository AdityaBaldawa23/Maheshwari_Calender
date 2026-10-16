import { useEffect, useState } from 'react';
import { Button, Card, ConfirmDialog, Notice } from '../components/ui.jsx';
import { listImports, listPublications, publishDataset, rollbackDirectory } from '../services/api.js';

const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('hi-IN') : '—');
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
      setMessage({ tone: 'success', text: `${rollback.dataset}: संस्करण ${rollback.version} पुनः प्रकाशित।` });
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
      <Card title="प्रकाशन इतिहास (Publications)">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs text-muted">
              <tr>
                <th className="px-2 py-1">समय</th>
                <th className="px-2 py-1">डेटा</th>
                <th className="px-2 py-1">कार्य</th>
                <th className="px-2 py-1">संस्करण</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(pubs ?? []).map((p) => (
                <tr key={p.docId}>
                  <td className="px-2 py-1 whitespace-nowrap">{when(p.publishedAt)}</td>
                  <td className="px-2 py-1">{p.dataset}</td>
                  <td className="px-2 py-1">{p.action}{p.meta?.recordCount !== undefined && ` (${p.meta.recordCount})`}</td>
                  <td className="px-2 py-1 font-mono text-xs">{p.version}</td>
                  <td className="px-2 py-1">
                    {(p.meta || p.payload) && (
                      <Button variant="ghost" onClick={() => setRollback(p)}>
                        यह संस्करण पुनः प्रकाशित करें
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pubs?.length === 0 && <p className="p-3 text-muted">अभी कोई प्रकाशन नहीं।</p>}
        </div>
      </Card>

      <Card title="आयात इतिहास (Imports)">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs text-muted">
              <tr>
                <th className="px-2 py-1">समय</th>
                <th className="px-2 py-1">फ़ाइल</th>
                <th className="px-2 py-1">प्रकार</th>
                <th className="px-2 py-1">स्थिति</th>
                <th className="px-2 py-1">सारांश</th>
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
                    नए {i.summary?.new ?? 0} · अपडेट {i.summary?.update ?? 0} · त्रुटि {i.summary?.invalid ?? 0} · दोहराव {i.summary?.duplicate ?? 0} ·
                    लिखे {i.written ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {imports?.length === 0 && <p className="p-3 text-muted">अभी कोई आयात नहीं।</p>}
        </div>
      </Card>

      {rollback && (
        <ConfirmDialog title="पिछला संस्करण पुनः प्रकाशित करें?" busy={busy} onCancel={() => setRollback(null)} onConfirm={runRollback}>
          <p>
            <strong>{rollback.dataset}</strong> का संस्करण {rollback.version} फिर से सभी ऐप उपयोगकर्ताओं को दिखेगा।
            {rollback.dataset === 'directory' && ' (केवल पिछले 3 निर्देशिका संस्करण पुनः प्राप्त किए जा सकते हैं।)'}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
