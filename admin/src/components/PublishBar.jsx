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
      setMessage({ tone: 'error', text: `Failed — the previously published version is still live: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card sticky bottom-2 z-10 space-y-2 p-3">
      {problems.length > 0 && (
        <Notice tone="error">
          Fix before publishing ({problems.length}): {problems.slice(0, 4).join(' · ')}
        </Notice>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xs text-muted">
          {published ? `Published version: ${new Date(published.version).toLocaleString('en-IN')}` : 'Not published yet'}
          {hasUnpublished && ' · There are unpublished changes'}
        </span>
        <Button variant="secondary" disabled={busy || !dirty} onClick={() => run(draftState.save, 'Draft saved (not visible in the app yet).')}>
          Save draft
        </Button>
        <Button disabled={busy || problems.length > 0 || !hasUnpublished} onClick={() => setConfirming(true)}>
          Preview & publish
        </Button>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Publish?"
          busy={busy}
          confirmLabel="Publish"
          onCancel={() => setConfirming(false)}
          onConfirm={() => run(draftState.publish, 'Published! Phones update the next time the app is opened.')}
        >
          <p>These changes will be visible to all app users:</p>
          <ul className="max-h-60 list-none overflow-auto rounded-lg bg-paper p-2 font-mono text-xs">
            {(changes.length ? changes : ['(detail changes)']).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">Earlier versions can be re-published from “History”.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
