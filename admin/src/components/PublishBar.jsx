import { useState } from 'react';
import { Button, ConfirmDialog, Notice } from './ui.jsx';

/** Save-draft / preview-and-publish controls shared by the draft-based editors. */
export function PublishBar({ draftState, changes }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const { problems, dirty, hasUnpublished, published } = draftState;

  const run = async (fn, ok) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'success', text: ok });
      setConfirming(false);
    } catch (err) {
      setMessage({ tone: 'error', text: `असफल — पिछला प्रकाशित संस्करण यथावत है: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card sticky bottom-2 z-10 space-y-2 p-3">
      {problems.length > 0 && (
        <Notice tone="error">
          प्रकाशन से पहले ठीक करें ({problems.length}): {problems.slice(0, 4).join(' · ')}
        </Notice>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xs text-muted">
          {published ? `प्रकाशित संस्करण: ${new Date(published.version).toLocaleString('hi-IN')}` : 'अभी प्रकाशित नहीं'}
          {hasUnpublished && ' · अप्रकाशित बदलाव हैं'}
        </span>
        <Button variant="secondary" disabled={busy || !dirty} onClick={() => run(draftState.save, 'ड्राफ़्ट सहेजा गया (ऐप में अभी नहीं दिखेगा)।')}>
          ड्राफ़्ट सहेजें
        </Button>
        <Button disabled={busy || problems.length > 0 || !hasUnpublished} onClick={() => setConfirming(true)}>
          पूर्वावलोकन एवं प्रकाशन
        </Button>
      </div>
      {confirming && (
        <ConfirmDialog
          title="प्रकाशित करें?"
          busy={busy}
          confirmLabel="प्रकाशित करें"
          onCancel={() => setConfirming(false)}
          onConfirm={() => run(draftState.publish, 'प्रकाशित! ऐप अगली बार खुलने/लौटने पर अपडेट लेगा।')}
        >
          <p>ये बदलाव सभी ऐप उपयोगकर्ताओं को दिखेंगे:</p>
          <ul className="max-h-60 list-none overflow-auto rounded-lg bg-paper p-2 font-mono text-xs">
            {(changes.length ? changes : ['(विवरण बदलाव)']).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">पिछला संस्करण “इतिहास” से पुनः प्रकाशित किया जा सकता है।</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
