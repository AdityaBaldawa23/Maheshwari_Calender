import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons.jsx';

/**
 * Open sheets, topmost last. Lets the Android back button close the top sheet
 * first, whichever screen opened it.
 */
const openSheets = [];

/** Closes the topmost open sheet. Returns true if one was open. */
export function closeTopSheet() {
  const top = openSheets[openSheets.length - 1];
  if (!top) return false;
  top.current();
  return true;
}

/**
 * Accessible bottom sheet / dialog. Rendered into <body> through a portal so it
 * always covers the whole screen. (Inside the animated, scrolling page container
 * a `position: fixed` element is positioned relative to that container instead.)
 * Focuses itself on open, closes on Escape, backdrop tap or Android back,
 * restores focus on close, and locks background scrolling.
 */
export function Sheet({ labelledBy, onClose, children, closeLabel = 'बंद करें' }) {
  const panel = useRef(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const entry = close;
    openSheets.push(entry);
    const previouslyFocused = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && openSheets[openSheets.length - 1] === entry) close.current();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      openSheets.splice(openSheets.indexOf(entry), 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-ink/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="sheet-up safe-bottom relative max-h-[88dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-card shadow-2xl outline-none"
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
    </div>,
    document.body,
  );
}
