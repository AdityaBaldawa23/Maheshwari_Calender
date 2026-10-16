import { describe, expect, it } from 'vitest';
import {
  cellTithiLabel, formatDate, formatDateTime, formatTime, fullTithiLabel, lunarMonthsLabel, monthYearLabel,
  samvatLabel, toHindiDigits, txt,
} from '../src/utils/format.js';

describe('Hindi formatting', () => {
  it('converts digits to Devanagari', () => {
    expect(toHindiDigits('2026-10-12 07:05')).toBe('२०२६-१०-१२ ०७:०५');
    expect(toHindiDigits(1234567890)).toBe('१२३४५६७८९०');
  });

  it('formats full tithi labels', () => {
    expect(fullTithiLabel({ maas: 'jyeshtha', paksha: 'shukla', tithi: 9 })).toBe('ज्येष्ठ शुक्ल नवमी');
    expect(fullTithiLabel({ maas: 'kartik', paksha: 'krishna', tithi: 15 })).toBe('कार्तिक कृष्ण अमावस्या');
    expect(fullTithiLabel({ maas: 'jyeshtha', adhik: true, paksha: 'shukla', tithi: 15 })).toBe('अधिक ज्येष्ठ शुक्ल पूर्णिमा');
    expect(fullTithiLabel({ maas: 'ashwin', paksha: 'shukla', tithi: 1 }, 'en')).toBe('Ashwin Shukla Pratipada');
  });

  it('formats calendar-cell tithi labels', () => {
    expect(cellTithiLabel({ paksha: 'shukla', tithi: 9 })).toBe('शु. नवमी');
    expect(cellTithiLabel({ paksha: 'krishna', tithi: 14 })).toBe('कृ. चतुर्दशी');
    expect(cellTithiLabel({ paksha: 'krishna', tithi: 15 })).toBe('अमावस्या');
  });

  it('formats dates, months and samvat with Hindi digits', () => {
    expect(formatDate('2027-10-11')).toBe('११ अक्टूबर २०२७');
    expect(formatDate('2027-10-11', 'en')).toBe('11 October 2027');
    expect(monthYearLabel(2026, 10)).toBe('अक्टूबर २०२६');
    expect(samvatLabel([2083])).toBe('वि.सं. २०८३');
  });

  it('formats times with a Hindi day period and Hindi digits', () => {
    expect(formatTime('06:36')).toBe('सुबह ६:३६');
    expect(formatTime('13:05')).toBe('दोपहर १:०५');
    expect(formatTime('19:12')).toBe('शाम ७:१२');
    expect(formatTime('00:30')).toBe('रात १२:३०');
    expect(formatTime('19:12', 'en')).toBe('7:12 PM');
  });

  it('formats tithi start/end with an explicit date', () => {
    expect(formatDateTime('2026-10-09T21:37')).toBe('९ अक्टूबर, रात ९:३७');
    expect(formatDateTime('2026-10-10T05:10')).toBe('१० अक्टूबर, सुबह ५:१०');
    expect(formatDateTime(undefined)).toBe('');
  });

  it('joins lunar months and falls back to Hindi', () => {
    expect(lunarMonthsLabel([{ maas: 'ashwin', adhik: false }, { maas: 'kartik', adhik: false }])).toBe('आश्विन – कार्तिक');
    expect(txt({ hi: 'नमस्ते' }, 'en')).toBe('नमस्ते');
  });
});
