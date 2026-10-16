// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { buildEmergencyView, bundledServices } from '../src/repositories/emergencyRepository.js';
import {
  CONTACT_SLOTS, EMERGENCY_SCHEMA_VERSION, HOSPITAL_SLOTS, checkEmergencyDoc, dialable, emptyContact, emptyHospital,
  isConfigured, safeMapUrl,
} from '../src/shared/emergencySchema.js';

let datasetState = { snapshot: null, status: 'idle', loaded: true };
vi.mock('../src/hooks/useSync.js', () => ({ useDataset: () => datasetState }));
const { EmergencyPage } = await import('../src/pages/EmergencyPage.jsx');

afterEach(cleanup);

const doc = (patch = {}) => ({
  version: 1,
  schemaVersion: EMERGENCY_SCHEMA_VERSION,
  contacts: [1, 2, 3, 4].map(emptyContact),
  hospitals: [1, 2, 3, 4].map(emptyHospital),
  services: bundledServices,
  ...patch,
});

describe('emergency schema', () => {
  it('requires exactly four contact and four hospital slots', () => {
    expect(checkEmergencyDoc(doc())).toEqual([]);
    expect(checkEmergencyDoc(doc({ contacts: [emptyContact(1)] })).join()).toMatch(/exactly 4 contact/);
    expect(checkEmergencyDoc(doc({ hospitals: [] })).join()).toMatch(/exactly 4 hospital/);
  });

  it('active entries need a name and a dialable number; maps must be https', () => {
    const contacts = [{ ...emptyContact(1), active: true, name: 'अध्यक्ष' }, ...doc().contacts.slice(1)];
    expect(checkEmergencyDoc(doc({ contacts })).join()).toMatch(/valid phone/);
    const hospitals = [{ ...emptyHospital(1), active: true, name: 'H', phone: '0233 2345678', mapUrl: 'javascript:alert(1)' }, ...doc().hospitals.slice(1)];
    expect(checkEmergencyDoc(doc({ hospitals })).join()).toMatch(/https/);
  });

  it('dial and map helpers only accept safe values', () => {
    expect(dialable('0233-234 5678')).toBe('02332345678');
    expect(dialable('call me')).toBeNull();
    expect(safeMapUrl('https://maps.google.com/?q=x')).toBe('https://maps.google.com/?q=x');
    expect(safeMapUrl('http://maps.google.com')).toBeNull();
    expect(isConfigured({ active: true, name: 'X', phone: '' })).toBe(false);
  });

  it('bundled police / ambulance / fire numbers are present and not marked verified', () => {
    expect(bundledServices.map((s) => [s.id, s.phone])).toEqual([
      ['police', '112'],
      ['ambulance', '108'],
      ['fire', '101'],
    ]);
    expect(bundledServices.every((s) => s.verification.status !== 'verified' && s.verification.sources.length > 0)).toBe(true);
  });

  it('offline/first launch view: services available, slots honestly unconfigured', () => {
    const view = buildEmergencyView(null);
    expect(view.source).toBe('bundled');
    expect(view.contacts).toHaveLength(CONTACT_SLOTS);
    expect(view.hospitals).toHaveLength(HOSPITAL_SLOTS);
    expect(view.contacts.some(isConfigured)).toBe(false);
  });
});

describe('EmergencyPage', () => {
  it('shows call links only for services and configured slots — no invented numbers', () => {
    datasetState = { snapshot: null, status: 'offline', loaded: true };
    render(<EmergencyPage />);
    const tels = [...document.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href'));
    expect(tels.sort()).toEqual(['tel:100', 'tel:101', 'tel:108', 'tel:112', 'tel:112', 'tel:112'].sort());
    expect(screen.getAllByText(/जल्द जोड़ी जाएगी/)).toHaveLength(2);
    expect(document.querySelector('a[href^="http"]')).toBeNull(); // no directions without a destination
  });

  it('renders configured contacts and hospitals from the cached published snapshot', () => {
    const contacts = [{ ...emptyContact(1), active: true, name: 'संगठन अध्यक्ष', role: 'अध्यक्ष', phone: '+919800000001' }, ...doc().contacts.slice(1)];
    const hospitals = [
      { ...emptyHospital(1), active: true, name: 'सिविल अस्पताल', phone: '02332345678', mapUrl: 'https://maps.google.com/?q=civil' },
      ...doc().hospitals.slice(1),
    ];
    datasetState = { snapshot: { meta: { version: 2 }, data: { contacts, hospitals, services: bundledServices }, savedAt: new Date().toISOString() }, status: 'current', loaded: true };
    render(<EmergencyPage />);
    expect(screen.getByText('संगठन अध्यक्ष')).toBeTruthy();
    expect(document.querySelector('a[href="tel:+919800000001"]')).toBeTruthy();
    const directions = document.querySelector('a[href="https://maps.google.com/?q=civil"]');
    expect(directions.getAttribute('rel')).toContain('noopener');
    expect(screen.getAllByText(/३ और संपर्क/)).toHaveLength(2); // 3 contact + 3 hospital slots still empty
  });
});
