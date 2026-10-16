import { describe, expect, it } from 'vitest';
import { buildSafeHref } from '../src/utils/safeLink.js';

describe('buildSafeHref (advertisement links)', () => {
  it.each([
    [{ type: 'tel', value: '+91 98765 43210' }, 'tel:+919876543210'],
    [{ type: 'whatsapp', value: '+91-98765-43210' }, 'https://wa.me/919876543210'],
    [{ type: 'mailto', value: 'info@example.com' }, 'mailto:info@example.com'],
    [{ type: 'https', value: 'https://example.com/shop' }, 'https://example.com/shop'],
  ])('allows %j', (link, href) => expect(buildSafeHref(link)).toBe(href));

  it.each([
    [{ type: 'https', value: 'javascript:alert(1)' }],
    [{ type: 'https', value: 'http://example.com' }],
    [{ type: 'https', value: 'https://user:pass@example.com' }],
    [{ type: 'javascript', value: 'alert(1)' }],
    [{ type: 'tel', value: '12' }],
    [{ type: 'mailto', value: 'a@b.com?bcc=x@y.com' }],
    [undefined],
  ])('rejects %j', (link) => expect(buildSafeHref(link)).toBeNull());
});
