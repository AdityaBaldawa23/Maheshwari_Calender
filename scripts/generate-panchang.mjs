#!/usr/bin/env node
/**
 * Generates panchang + festival data for one or more years.
 *
 *   npm run generate-panchang -- 2028            # writes files that do not exist yet
 *   npm run generate-panchang -- 2028 2029
 *   npm run generate-panchang -- 2028 --force    # overwrite (DISCARDS manual edits!)
 *
 * Output:
 *   src/data/calendar/<year>.json   daily tithi / paksha / maas / sunrise / sunset
 *   src/data/occasions/<year>.json  festivals + ekadashis placed by rule
 *
 * Existing files are never overwritten without --force, so manual corrections
 * made after verification are safe.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildYearContext, generateCalendarYear, generateOccasionsYear } from './lib/generate.mjs';
import { formatCalendarJson, formatOccasionsJson } from './lib/format.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const years = args.filter((a) => /^\d{4}$/.test(a)).map(Number);

if (years.length === 0) {
  console.error('Usage: npm run generate-panchang -- <year> [<year> …] [--force]');
  process.exit(1);
}

const rules = JSON.parse(readFileSync(join(root, 'scripts/festival-rules.json'), 'utf8'));

function writeIfAllowed(path, content) {
  if (existsSync(path) && !force) {
    console.log(`  skip  ${path} (exists — use --force to overwrite)`);
    return;
  }
  writeFileSync(path, content, 'utf8');
  console.log(`  wrote ${path}`);
}

for (const year of years) {
  console.log(`Generating ${year}…`);
  const ctx = buildYearContext(year);
  writeIfAllowed(join(root, `src/data/calendar/${year}.json`), formatCalendarJson(generateCalendarYear(ctx)));
  writeIfAllowed(join(root, `src/data/occasions/${year}.json`), formatOccasionsJson(generateOccasionsYear(ctx, rules)));
}
console.log('Done. Remember: verify against a trusted panchang, then run `npm run validate-data`.');
