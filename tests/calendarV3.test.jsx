// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { CalendarGrid } from '../src/components/CalendarGrid.jsx';
import { adjacentMonthKey, buildMonthGrid } from '../src/utils/date.js';
import { sanitizeSettings } from '../src/services/settings.js';
import { buildYearContext, easterSunday, generateOccasionsYear } from '../scripts/lib/generate.mjs';
import { calendarService } from '../src/services/calendarService.js';

afterEach(cleanup);

const days = {
  '2026-11-08': { key: '2026-11-08', panchang: { tithi: 15, paksha: 'krishna', maas: 'kartik' }, occasions: [{ id: 'diwali', title: { hi: 'दीपावली' }, category: 'festival', importance: 'high', holiday: true }] },
  '2026-11-11': { key: '2026-11-11', panchang: { tithi: 2, paksha: 'shukla', maas: 'kartik' }, occasions: [{ id: 'bhai-dooj', title: { hi: 'भाई दूज' }, category: 'festival', importance: 'medium' }] },
};

const renderNov = (lang) =>
  render(<CalendarGrid weeks={buildMonthGrid(2026, 11)} days={days} today="2026-11-20" selected={null} onSelect={() => {}} lang={lang} />);

describe('calendar grid', () => {
  it('shows Hindi numerals and weekdays by default, English when chosen', () => {
    renderNov('hi');
    expect(screen.getAllByRole('rowheader')[0].textContent).toBe('रवि');
    expect(screen.getByRole('button', { name: /^८ नवंबर २०२६/ }).textContent).toContain('८');
    cleanup();
    renderNov('en');
    expect(screen.getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    const diwali = screen.getByRole('button', { name: /^8 November 2026, Sunday/ });
    expect(diwali.textContent).toMatch(/^8/);
    expect(screen.getByRole('button', { name: /Today|आज/ }).textContent).toContain('Today');
  });

  it('marks public holidays (red date + tint + label for screen readers)', () => {
    renderNov('hi');
    const diwali = screen.getByRole('button', { name: /^८ नवंबर २०२६/ });
    expect(diwali.getAttribute('aria-label')).toContain('सार्वजनिक अवकाश');
    expect(diwali.className).toContain('bg-tint-holiday');
    expect(diwali.querySelector('.text-holiday')).toBeTruthy();
    const bhaiDooj = screen.getByRole('button', { name: /^११ नवंबर/ });
    expect(bhaiDooj.getAttribute('aria-label')).not.toContain('अवकाश');
  });

  it('fills empty boxes with faint adjacent-month dates without adding rows', () => {
    renderNov('hi');
    const ghosts = document.querySelectorAll('[role="gridcell"][aria-hidden="true"]');
    // November 2026: starts Sunday, 30 days → 5 week-columns, 35 boxes, 5 empty at the end (1–5 Dec).
    expect(ghosts).toHaveLength(5);
    expect([...ghosts].map((g) => g.textContent).sort()).toEqual(['१', '२', '३', '४', '५']);
    expect(screen.getAllByRole('button')).toHaveLength(30);
  });

  it('computes adjacent-month dates for leading and trailing boxes', () => {
    const oct = buildMonthGrid(2026, 10); // starts Thursday
    expect(adjacentMonthKey(oct, 0, 0)).toBe('2026-09-27');
    expect(adjacentMonthKey(oct, 0, 3)).toBe('2026-09-30');
    const last = oct.length - 1;
    expect(adjacentMonthKey(buildMonthGrid(2027, 2), buildMonthGrid(2027, 2).length - 1, 6)).toBe('2027-03-06');
    expect(last).toBe(4);
  });

  it('keeps the date-language setting safe', () => {
    expect(sanitizeSettings({ dateLang: 'en' }).dateLang).toBe('en');
    expect(sanitizeSettings({ dateLang: 'fr' }).dateLang).toBe('hi');
    expect(sanitizeSettings(null).dateLang).toBe('hi');
  });
});

describe('holidays', () => {
  it('computes Easter (Good Friday is two days earlier)', () => {
    expect([2025, 2026, 2027, 2028].map(easterSunday)).toEqual(['2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16']);
  });

  it('generates festival holidays for 2026', () => {
    const rules = JSON.parse(readFileSync('scripts/festival-rules.json', 'utf8'));
    const occ = generateOccasionsYear(buildYearContext(2026), rules).occasions.filter((o) => o.holiday);
    const byId = Object.fromEntries(occ.map((o) => [o.id, o.date]));
    expect(byId).toMatchObject({
      'good-friday': '2026-04-03',
      diwali: '2026-11-08',
      'govardhan-puja': '2026-11-09',
      'mahavir-jayanti': '2026-03-31',
      'buddha-purnima': '2026-05-01',
      'guru-nanak-jayanti': '2026-11-24',
      holi: '2026-03-04',
    });
  });

  it('marks fixed national/Maharashtra holidays from recurring data', async () => {
    for (const [date, id] of [['2027-01-26', 'republic-day'], ['2027-05-01', 'maharashtra-day'], ['2027-12-25', 'christmas'], ['2027-02-19', 'shivaji-jayanti']]) {
      const o = (await calendarService.getOccasionsForDate(date)).find((x) => x.id === id);
      expect(o?.holiday, id).toBe(true);
    }
  });
});
