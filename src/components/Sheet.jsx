import { useEffect, useRef } from 'react';
import { CloseIcon } from './Icons.jsx';

/**
 * Accessible bottom sheet / dialog: focuses itself on open, closes on Escape or
 * backdrop tap, restores focus on close. (Android back is handled in App.)
 */
export function Sheet({ labelledBy, onClose, children, closeLabel = 'बंद करें' }) {
  const panel = useRef(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-ink/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="sheet-up safe-bottom relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card shadow-2xl outline-none"
      >
        <div className="sticky top-0 z-10 flex justify-center bg-card pt-2" aria-hidden="true">
          <span className="h-1.5 w-12 rounded-full bg-line" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute top-2 right-2 z-20 grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-paper"
        >
          <CloseIcon />
        </button>
        {children}
      </div>
    </div>
  );
}
