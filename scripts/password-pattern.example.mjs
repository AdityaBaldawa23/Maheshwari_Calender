/**
 * TEMPLATE — copy to scripts/local/password-pattern.mjs (git-ignored) on the IT
 * Head's computer and implement the organisation's EXISTING password pattern
 * there, exactly as already agreed. Do not change the pattern, and never commit
 * the real file: anyone who knows the pattern and a member's details could sign
 * in as that member.
 *
 * The provisioning script calls passwordFor() when it creates an account or
 * resets a password. The result is passed straight to Firebase Authentication
 * (which stores only a salted hash); it is never logged or written to Firestore.
 *
 * @param {object} member
 * @param {string} member.phone      normalised 10-digit mobile number, e.g. "9876543210"
 * @param {string} member.name       name from the access record
 * @param {string|null} member.memberId  linked master record id, if any
 * @param {string} member.district   assigned district id
 * @param {object|null} member.member    the linked master record (members/{memberId}), if any
 * @returns {string} the password (Firebase requires at least 6 characters)
 */
export function passwordFor(member) {
  void member;
  throw new Error('Implement the existing password pattern in scripts/local/password-pattern.mjs');
}
