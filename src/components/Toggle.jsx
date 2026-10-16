/** Large, accessible on/off switch with a visible text state (not colour only). */
export function Toggle({ checked, onChange, label, description, disabled = false, id }) {
  const descId = description ? `${id}-desc` : undefined;
  return (
    <div className={`flex items-center gap-3 py-2 ${disabled ? 'opacity-55' : ''}`}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block leading-snug font-medium text-ink">
          {label}
        </label>
        {description && (
          <p id={descId} className="text-xs leading-snug text-muted">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-8 w-[4.25rem] shrink-0 items-center rounded-full border-2 transition-colors ${
          checked ? 'border-maroon bg-maroon' : 'border-line bg-paper'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute text-[0.65rem] font-semibold ${checked ? 'left-2 text-white' : 'right-2 text-muted'}`}
        >
          {checked ? 'चालू' : 'बंद'}
        </span>
        <span
          aria-hidden="true"
          className={`absolute h-6 w-6 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[2.35rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
