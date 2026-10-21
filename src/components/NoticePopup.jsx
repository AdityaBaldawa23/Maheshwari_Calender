import { useEffect, useMemo, useRef, useState } from 'react';
import { useDataset } from '../hooks/useSync.js';
import { notificationService } from '../services/notificationService.js';
import { createPopupStore, noticeNotificationId, popupCandidates } from '../services/noticePopups.js';
import { txt } from '../utils/format.js';
import { Sheet } from './Sheet.jsx';
import { BellIcon } from './Icons.jsx';

const store = createPopupStore();

/**
 * UI customisation — see MINOR_UI_CHANGES.md (Change 3): notices the admin marks as
 * "pop-up" in the portal appear as a notification (like festival reminders) and as
 * an in-app pop-up, once each, after the phone syncs.
 */
export function NoticePopup({ today }) {
  const notices = useDataset('content').snapshot?.data?.notices;
  const [state, setState] = useState(null); // { notified, dismissed }
  const busy = useRef(false);

  useEffect(() => {
    store.load().then(setState);
  }, []);

  const candidates = useMemo(() => (state ? popupCandidates(notices, today, state.dismissed) : []), [notices, today, state]);

  // New pop-up notices → one heads-up notification each (only if notifications are already allowed).
  useEffect(() => {
    if (!state || busy.current) return;
    const fresh = candidates.filter((n) => !state.notified.includes(n.id));
    if (!fresh.length) return;
    busy.current = true;
    (async () => {
      for (const n of fresh) {
        await notificationService.showNotice({ id: noticeNotificationId(n.id), title: txt(n.title), body: txt(n.body) });
      }
      const next = { ...state, notified: [...state.notified, ...fresh.map((n) => n.id)] };
      await store.save(next);
      setState(next);
      busy.current = false;
    })();
  }, [candidates, state]);

  const current = candidates[0];
  if (!current) return null;
  const dismiss = () => {
    const next = { ...state, dismissed: [...state.dismissed, current.id] };
    setState(next);
    store.save(next);
  };

  return (
    <Sheet labelledBy="notice-popup-title" onClose={dismiss}>
      <div className="px-5 pt-2 pb-6">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-saffron-soft text-saffron">
          <BellIcon width={28} height={28} />
        </div>
        <p className="text-center text-xs font-semibold tracking-wide text-muted">समाज सूचना</p>
        <h2 id="notice-popup-title" className="text-center font-display text-2xl text-maroon">
          {txt(current.title)}
        </h2>
        <p className="mt-3 leading-relaxed whitespace-pre-line text-ink/90">{txt(current.body)}</p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 min-h-12 w-full rounded-full bg-maroon px-5 text-lg font-semibold text-white active:bg-maroon-dark"
        >
          ठीक है
        </button>
      </div>
    </Sheet>
  );
}
