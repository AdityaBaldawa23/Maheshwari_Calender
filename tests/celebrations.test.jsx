// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { whatsappNumber, whatsappUrl } from '../src/shared/whatsapp.js';
import {
  buildCelebrationIndex, celebrationCountsForMonth, celebrationLabel, celebrationsOn,
} from '../src/services/celebrations.js';
import { num } from '../src/utils/format.js';
import { MemberSheet } from '../src/components/MemberSheet.jsx';
import { Sheet, closeTopSheet } from '../src/components/Sheet.jsx';

afterEach(cleanup);

// Synthetic members only.
const members = [
  { id: 'M1', nameEn: 'Ram Test', dob: '1990-10-18', phone: '+919800000001', anniversary: '2015-02-03' },
  { id: 'M2', nameHi: 'सीता परीक्षण', dob: '2000-02-29', phone: '02332345678' },
  { id: 'M3', nameEn: 'Gopal Sample', anniversary: '2026-10-18', phone: '9800000003' }, // married today
  { id: 'M4', nameEn: 'Future Wedding', anniversary: '2027-10-18' },
];

describe('WhatsApp links', () => {
  it('builds the api.whatsapp.com link for Indian mobiles in any stored form', () => {
    expect(whatsappUrl('+918983985787')).toBe('https://api.whatsapp.com/send/?phone=918983985787&text=&type=phone_number&app_absent=0');
    expect(whatsappNumber('8983985787')).toBe('918983985787');
    expect(whatsappNumber('+91 89839 85787')).toBe('918983985787');
    expect(whatsappNumber('+4915112345678')).toBe('4915112345678');
  });
  it('gives no link for landlines or invalid numbers', () => {
    expect(whatsappUrl('02332345678')).toBeNull();
    expect(whatsappUrl('12345')).toBeNull();
    expect(whatsappUrl(undefined)).toBeNull();
  });
  it('encodes a greeting', () => {
    expect(whatsappUrl('9800000001', 'जन्मदिन मुबारक')).toContain(`&text=${encodeURIComponent('जन्मदिन मुबारक')}&`);
  });
});

describe('birthdays and anniversaries (computed locally)', () => {
  const index = buildCelebrationIndex(members);

  it('finds birthdays and anniversaries on a date with completed years', () => {
    const today = celebrationsOn(index, '2026-10-18');
    expect(today.map((c) => [c.member.id, c.kind, c.years])).toEqual([['M1', 'birthday', 36]]);
    expect(celebrationLabel(today[0], num)).toBe('३६वाँ जन्मदिन');
    const feb3 = celebrationsOn(index, '2027-02-03');
    expect(feb3.map((c) => [c.member.id, c.kind, c.years])).toEqual([['M1', 'anniversary', 12]]);
    expect(celebrationLabel(feb3[0], num)).toBe('१२वीं विवाह वर्षगांठ');
  });

  it('skips the wedding day itself and future dates', () => {
    expect(celebrationsOn(index, '2026-10-18').some((c) => c.member.id === 'M3')).toBe(false);
    expect(celebrationsOn(index, '2027-10-18').map((c) => c.member.id).sort()).toEqual(['M1', 'M3']); // M4 is 0 years
  });

  it('celebrates 29 February birthdays on 28 February in non-leap years', () => {
    expect(celebrationsOn(index, '2027-02-28').map((c) => c.member.id)).toEqual(['M2']);
    expect(celebrationsOn(index, '2028-02-28')).toEqual([]);
    expect(celebrationsOn(index, '2028-02-29').map((c) => c.member.id)).toEqual(['M2']);
  });

  it('counts celebrations per day for calendar markers', () => {
    expect(celebrationCountsForMonth(index, 2026, 10)).toEqual({ '2026-10-18': 1 });
    expect(celebrationCountsForMonth(new Map(), 2026, 10)).toEqual({});
  });

  it('indexes 10,000 members quickly', () => {
    const big = Array.from({ length: 10000 }, (_, i) => ({ id: `M${i}`, nameEn: `P${i}`, dob: `19${50 + (i % 50)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}` }));
    const start = performance.now();
    const bigIndex = buildCelebrationIndex(big);
    celebrationCountsForMonth(bigIndex, 2026, 10);
    expect(performance.now() - start).toBeLessThan(300);
  });
});

describe('member popup', () => {
  it('renders over the whole screen (portal into <body>), with Call and WhatsApp for the member', () => {
    const { container } = render(
      <div style={{ transform: 'translateX(0)' }}>
        <MemberSheet member={members[0]} today="2026-10-18" onClose={() => {}} />
      </div>,
    );
    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false); // not trapped inside the transformed page
    expect(document.body.contains(dialog)).toBe(true);
    const links = within(dialog).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'tel:+919800000001',
      `https://api.whatsapp.com/send/?phone=919800000001&text=${encodeURIComponent('जन्मदिन की हार्दिक शुभकामनाएँ! 🎂🙏')}&type=phone_number&app_absent=0`,
    ]);
    expect(links[1].getAttribute('rel')).toContain('noopener');
    expect(within(dialog).getByText(/आज ३६वाँ जन्मदिन है/)).toBeTruthy();
    expect(within(dialog).getByText('+९१ ९८००० ००००१')).toBeTruthy();
  });

  it('shows no WhatsApp button for a landline', () => {
    render(<MemberSheet member={members[1]} today="2026-10-18" onClose={() => {}} />);
    const hrefs = within(screen.getByRole('dialog')).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['tel:02332345678']);
  });

  it('Android back closes the topmost popup first', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Sheet labelledBy="a" onClose={outer}>
          <p id="a">outer</p>
        </Sheet>
        <Sheet labelledBy="b" onClose={inner}>
          <p id="b">inner</p>
        </Sheet>
      </>,
    );
    expect(closeTopSheet()).toBe(true);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(2); // Escape also targets only the top sheet
    expect(outer).not.toHaveBeenCalled();
    cleanup();
    expect(closeTopSheet()).toBe(false);
  });
});
