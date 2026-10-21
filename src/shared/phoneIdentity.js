/**
 * Phone number → sign-in identity (shared by the app, the admin portal and the
 * local provisioning script, so all three derive exactly the same values).
 *
 * Members sign in with their 10-digit Indian mobile number and a password.
 * Firebase Auth (Spark plan, no SMS) only offers email + password, so each phone
 * number is mapped to a SYNTHETIC address on a reserved ".invalid" domain
 * (RFC 2606: it can never be registered and never receives mail).
 *
 * Important limitations (see docs/MEMBER_ACCESS.md):
 *   - The synthetic address does NOT prove that someone owns the phone number.
 *     Ownership is checked by the IT Head before approval.
 *   - No email can ever reach it, so Firebase "forgot password" emails are not
 *     used. Password resets are done by the IT Head with the provisioning script.
 */

/** Reserved domain of the synthetic sign-in addresses. Changing it orphans every existing account. */
export const AUTH_DOMAIN = 'maharashtrapradheshmaheshwariyuvasanghatan.invalid';

const toAsciiDigits = (s) => s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));

/**
 * "+91 98765-43210", "098765 43210", "९८७६५४३२१०" → "9876543210".
 * Returns null unless the input is a valid 10-digit Indian mobile number (starts 6–9).
 */
export function normalizeIndianMobile(value) {
  if (value === null || value === undefined) return null;
  const digits = toAsciiDigits(String(typeof value === 'number' ? Math.trunc(value) : value)).replace(/[\s().+-]/g, '');
  const m = /^(?:91|0)?([6-9]\d{9})$/.exec(digits);
  return m ? m[1] : null;
}

/** Synthetic Firebase Auth email for a normalised 10-digit mobile number. */
export function syntheticEmail(phone10) {
  if (!/^[6-9]\d{9}$/.test(phone10 ?? '')) throw new Error('syntheticEmail: a normalised 10-digit mobile number is required');
  return `${phone10}@${AUTH_DOMAIN}`;
}

/** Deterministic Firebase Auth UID for a member account ("p" + 10 digits). */
export function uidForPhone(phone10) {
  if (!/^[6-9]\d{9}$/.test(phone10 ?? '')) throw new Error('uidForPhone: a normalised 10-digit mobile number is required');
  return `p${phone10}`;
}

/** "9876543210" → "98•••••210" for logs and lists that do not need the full number. */
export function maskPhone(phone10) {
  const p = String(phone10 ?? '');
  return p.length === 10 ? `${p.slice(0, 2)}•••••${p.slice(7)}` : '••••••••••';
}
