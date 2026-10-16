#!/usr/bin/env node
/**
 * Validates every bundled data file. Exits with code 1 on any error, so
 * `npm run build` (which runs this first) refuses to ship malformed data.
 *
 *   npm run validate-data             # errors fail, warnings are printed
 *   npm run validate-data -- --strict # warnings fail too (use before a Play Store release)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateAdsFile,
  validateCalendarFile,
  validateNoticesFile,
  validateOccasionsFile,
  validateRecurringFile,
} from './lib/validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data');
const strict = process.argv.includes('--strict');

let errorCount = 0;
let warningCount = 0;

function readJson(relPath) {
  try {
    return { data: JSON.parse(readFileSync(join(dataDir, relPath), 'utf8')) };
  } catch (err) {
    return { error: `cannot read/parse: ${err.message}` };
  }
}

function check(relPath, validate) {
  const { data, error } = readJson(relPath);
  const { errors, warnings } = error ? { errors: [error], warnings: [] } : validate(data);
  errorCount += errors.length;
  warningCount += warnings.length;
  const status = errors.length ? '✗' : warnings.length ? '!' : '✓';
  console.log(`${status} src/data/${relPath}`);
  errors.slice(0, 50).forEach((e) => console.log(`    ERROR   ${e}`));
  if (errors.length > 50) console.log(`    … and ${errors.length - 50} more errors`);
  warnings.slice(0, 10).forEach((w) => console.log(`    warning ${w}`));
  if (warnings.length > 10) console.log(`    … and ${warnings.length - 10} more warnings`);
}

const yearFiles = (dir) =>
  readdirSync(join(dataDir, dir))
    .filter((f) => /^\d{4}\.json$/.test(f))
    .map((f) => Number(f.slice(0, 4)))
    .sort();

const calendarYears = yearFiles('calendar');
const occasionYears = yearFiles('occasions');

if (calendarYears.length === 0) {
  console.log('✗ no calendar files found in src/data/calendar');
  errorCount++;
}
for (const year of calendarYears) check(`calendar/${year}.json`, (d) => validateCalendarFile(d, year));
for (const year of occasionYears) check(`occasions/${year}.json`, (d) => validateOccasionsFile(d, year));
check('occasions/recurring.json', validateRecurringFile);
check('advertisements/ads.json', (d) => validateAdsFile(d, (img) => existsSync(join(root, 'public', img))));
check('notices/notices.json', validateNoticesFile);

for (const year of calendarYears.filter((y) => !occasionYears.includes(y))) {
  console.log(`! occasions/${year}.json is missing (calendar for ${year} exists)`);
  warningCount++;
}
for (const year of occasionYears.filter((y) => !calendarYears.includes(y))) {
  console.log(`✗ calendar/${year}.json is missing (occasions for ${year} exist)`);
  errorCount++;
}

console.log(`\n${errorCount} error(s), ${warningCount} warning(s)`);
if (errorCount > 0 || (strict && warningCount > 0)) {
  console.log(strict && errorCount === 0 ? 'Failing because --strict treats warnings as errors.' : 'Data validation FAILED.');
  process.exit(1);
}
