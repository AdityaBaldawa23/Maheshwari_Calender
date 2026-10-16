import { describe, expect, it } from 'vitest';
import { buildMonthEvents } from '../src/services/monthEvents.js';
import { calendarService } from '../src/services/calendarService.js';

const day = (key, panchang, occasions = []) => ({ key, panchang, occasions });

describe('buildMonthEvents', () => {
  it('lists Purnima/Amavasya once (vriddhi), with start/end, before occasions on the same day', () => {
    const amavasya = { tithi: 15, paksha: 'krishna', maas: 'kartik', tithiStart: '2027-06-03T10:00', tithiEnd: '2027-06-04T12:00' };
    const monthData = {
      days: {
        '2027-06-04': day('2027-06-04', amavasya, [{ id: 'x', title: { hi: 'पर्व' } }]),
        '2027-06-05': day('2027-06-05', { tithi: 1, paksha: 'shukla', maas: 'ashadh' }),
        '2027-06-18': day('2027-06-18', { tithi: 15, paksha: 'shukla', maas: 'ashadh', tithiStart: '2027-06-17T20:00', tithiEnd: '2027-06-19T07:00' }),
        '2027-06-19': day('2027-06-19', { tithi: 15, paksha: 'shukla', maas: 'ashadh', tithiStart: '2027-06-17T20:00', tithiEnd: '2027-06-19T07:00' }),
      },
    };
    const events = buildMonthEvents(monthData);
    expect(events.map((e) => [e.dateKey, e.type])).toEqual([
      ['2027-06-04', 'moon'],
      ['2027-06-04', 'occasion'],
      ['2027-06-18', 'moon'],
    ]);
    expect(events[0]).toMatchObject({ paksha: 'krishna', start: '2027-06-03T10:00', end: '2027-06-04T12:00' });
  });

  it('includes a kshaya Purnima/Amavasya with its own times', () => {
    const monthData = {
      days: {
        '2027-01-10': day('2027-01-10', {
          tithi: 14, paksha: 'krishna', maas: 'magh',
          kshaya: { tithi: 15, paksha: 'krishna', start: '2027-01-10T07:30', end: '2027-01-11T06:50' },
        }),
      },
    };
    expect(buildMonthEvents(monthData)).toEqual([
      { dateKey: '2027-01-10', type: 'moon', paksha: 'krishna', start: '2027-01-10T07:30', end: '2027-01-11T06:50' },
    ]);
  });

  it('returns [] while data is loading', () => expect(buildMonthEvents(null)).toEqual([]));

  it('finds every Purnima and Amavasya of a real month with times', async () => {
    const events = buildMonthEvents(await calendarService.getCalendarForMonth(2026, 10));
    const moons = events.filter((e) => e.type === 'moon');
    expect(moons.map((e) => [e.dateKey, e.paksha])).toEqual([
      ['2026-10-10', 'krishna'],
      ['2026-10-26', 'shukla'],
    ]);
    expect(moons[0]).toMatchObject({ start: '2026-10-09T21:37', end: '2026-10-10T21:21' });
  });
});
