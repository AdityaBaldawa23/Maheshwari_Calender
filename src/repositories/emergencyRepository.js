/**
 * Emergency screen data: the admin-published document when one has been
 * downloaded, otherwise bundled defaults (official service numbers + empty,
 * clearly "unconfigured" community/hospital slots). Always available offline.
 */
import bundled from '../data/emergency/services.json';
import { CONTACT_SLOTS, HOSPITAL_SLOTS, emptyContact, emptyHospital } from '../shared/emergencySchema.js';

const pad = (list, count, makeEmpty) =>
  Array.from({ length: count }, (_, i) => ({ ...makeEmpty(i + 1), ...(list?.[i] ?? {}), slot: i + 1 }));

/**
 * @param {{meta: object, data: {contacts, services, hospitals}, savedAt: string} | null} snapshot
 */
export function buildEmergencyView(snapshot) {
  const data = snapshot?.data;
  return {
    source: data ? 'published' : 'bundled',
    updatedAt: snapshot?.meta?.updatedAt ?? null,
    savedAt: snapshot?.savedAt ?? null,
    contacts: pad(data?.contacts, CONTACT_SLOTS, emptyContact),
    hospitals: pad(data?.hospitals, HOSPITAL_SLOTS, emptyHospital),
    services: data?.services?.length ? data.services : bundled.services,
  };
}

export const bundledServices = bundled.services;
