#!/usr/bin/env node
/**
 * Creates / enables / disables member sign-in accounts to match the IT Head's
 * decisions in the admin portal ("Member access"). Run on the IT Head's computer:
 *
 *   npm run provision                              dry run — shows what would change
 *   npm run provision -- --apply                   performs the changes
 *   npm run provision -- --reset 98XXXXXXXX        dry run of a password reset (after verifying the person)
 *   npm run provision -- --reset 98XXXXXXXX --apply
 *
 * Requirements (see docs/MEMBER_ACCESS.md):
 *   - GOOGLE_APPLICATION_CREDENTIALS = path to a service-account key stored OUTSIDE
 *     this repository (the script refuses keys inside it). Never commit or share it.
 *   - FIREBASE_PROJECT_ID (or --project <id>).
 *   - scripts/local/password-pattern.mjs (git-ignored) exporting passwordFor(member),
 *     implementing the organisation's existing, unchanged password pattern.
 *     Template: scripts/password-pattern.example.mjs
 *
 * For tests against the local emulators set FIREBASE_AUTH_EMULATOR_HOST and
 * FIRESTORE_EMULATOR_HOST (no credentials needed).
 *
 * Output and the local log (scripts/local/provisioning-log.jsonl, git-ignored)
 * contain masked phone numbers and actions only — never passwords.
 */
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { provisionMembers, resetMemberPassword } from './lib/provision.mjs';
import { normalizeIndianMobile } from '../src/shared/phoneIdentity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = resolve(ROOT, 'scripts/local');
const HOOK = resolve(LOCAL, 'password-pattern.mjs');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const apply = flag('--apply');
const projectId = option('--project') ?? process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT;
const emulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);
if (!projectId) fail('Set FIREBASE_PROJECT_ID or pass --project <id>.');

if (!emulator) {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) fail('Set GOOGLE_APPLICATION_CREDENTIALS to the service-account key file (stored outside this folder).');
  if (!existsSync(keyPath)) fail('The GOOGLE_APPLICATION_CREDENTIALS file does not exist.');
  if (!relative(ROOT, resolve(keyPath)).startsWith('..')) fail('The service-account key is inside the project folder. Move it outside the repository first.');
}
if (!existsSync(HOOK)) fail('Missing scripts/local/password-pattern.mjs — copy scripts/password-pattern.example.mjs and implement the existing pattern.');

const { passwordFor } = await import(pathToFileURL(HOOK).href);
if (typeof passwordFor !== 'function') fail('scripts/local/password-pattern.mjs must export a function passwordFor(member).');

const app = initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const auth = getAuth(app);
const db = getFirestore(app);

// UIDs contain the full phone number, so they are never written to the log.
const safe = ({ uid: _uid, ...rest }) => rest;

function log(entry) {
  mkdirSync(LOCAL, { recursive: true });
  appendFileSync(resolve(LOCAL, 'provisioning-log.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), projectId, apply, ...entry })}\n`);
}

console.log(`${apply ? 'APPLYING' : 'DRY RUN (add --apply to make changes)'} — project ${projectId}${emulator ? ' (emulator)' : ''}`);

const resetPhone = option('--reset');
if (resetPhone !== undefined) {
  const phone = normalizeIndianMobile(resetPhone);
  if (!phone) fail('--reset needs a valid 10-digit mobile number.');
  const result = await resetMemberPassword({ auth, db, passwordFor, phone, apply });
  console.log(`${result.action.padEnd(10)} ${result.phone}${result.note ? `  (${result.note})` : ''}`);
  if (apply) log({ reset: safe(result) });
  process.exit(result.action === 'reset' ? 0 : 1);
}

const { results, summary } = await provisionMembers({ auth, db, passwordFor, apply });
for (const r of results.filter((x) => x.action !== 'none')) {
  console.log(`${r.action.padEnd(15)} ${r.phone}${r.note ? `  (${r.note})` : ''}`);
}
console.log('Summary:', Object.entries(summary).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing to do');
if (apply) log({ summary, results: results.filter((x) => x.action !== 'none').map(safe) });
process.exit(results.some((r) => ['error', 'conflict'].includes(r.action)) ? 2 : 0);
