import { useEffect, useRef } from 'react';

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-display text-xl text-maroon">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const VARIANTS = {
  primary: 'bg-maroon text-white hover:bg-maroon-dark disabled:opacity-50',
  secondary: 'border border-maroon text-maroon hover:bg-gold-soft disabled:opacity-50',
  danger: 'bg-sunday text-white hover:opacity-90 disabled:opacity-50',
  ghost: 'text-maroon underline disabled:opacity-50',
};

export function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-full px-4 text-sm font-semibold ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, error, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && !error && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      {error && (
        <span className="mt-0.5 block text-xs text-sunday" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  'w-full min-h-10 rounded-lg border border-line bg-white px-3 text-ink focus:border-maroon focus:outline-none';

export function TextInput({ invalid, className = '', ...props }) {
  return <input className={`${inputClass} ${invalid ? 'border-sunday' : ''} ${className}`} {...props} />;
}

export function Notice({ tone = 'info', children }) {
  const tones = {
    info: 'bg-gold-soft/50 border-gold/50',
    error: 'bg-saffron-soft border-sunday/40',
    success: 'bg-green-50 border-vrat/40',
  };
  return <div className={`rounded-xl border px-3 py-2 text-sm leading-relaxed ${tones[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

/**
 * Confirmation dialog. With `confirmText`, the admin must type it exactly
 * (used for destructive bulk actions).
 */
export function ConfirmDialog({ title, children, confirmLabel = 'Confirm', danger, confirmText, onConfirm, onCancel, busy }) {
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  const ok = () => {
    if (confirmText && inputRef.current?.value.trim() !== confirmText) {
      inputRef.current?.focus();
      return;
    }
    onConfirm();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-lg p-5 outline-none">
        <h2 className="font-display text-xl text-maroon">{title}</h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink">{children}</div>
        {confirmText && (
          <Field label={`Type ${confirmText} to confirm`}>
            <TextInput ref={inputRef} autoComplete="off" />
          </Field>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={ok} disabled={busy}>
            {busy ? 'Please wait…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StatusPill({ status }) {
  const map = {
    new: ['New', 'bg-green-100 text-vrat'],
    update: ['Update', 'bg-gold-soft text-maroon'],
    unchanged: ['Unchanged', 'bg-paper text-muted'],
    invalid: ['Error', 'bg-saffron-soft text-sunday'],
    duplicate: ['Duplicate', 'bg-saffron-soft text-saffron'],
    skipped: ['Skipped', 'bg-paper text-muted'],
    active: ['Active', 'bg-green-100 text-vrat'],
    inactive: ['Inactive', 'bg-paper text-muted'],
  };
  const [label, cls] = map[status] ?? [status, 'bg-paper text-muted'];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>{label}</span>;
}

/** Triggers a browser download of text content. */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Validation messages are written "हिंदी — English" (shared with the Hindi app);
 * the English-first portal shows the English part.
 */
export function en(message) {
  if (typeof message !== 'string') return '';
  const i = message.lastIndexOf(' — ');
  return i >= 0 ? message.slice(i + 3) : message;
}
