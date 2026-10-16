import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { ChevronLeft, ChevronRight } from './Icons.jsx';
import { monthName, num } from '../utils/format.js';

/** Jump to any month/year. Years without bundled panchang still open (dates only). */
export function MonthPicker({ y, m, onPick, onClose }) {
  const [year, setYear] = useState(y);

  return (
    <Sheet labelledBy="month-picker-title" onClose={onClose}>
      <div className="px-4 pb-6">
        <h2 id="month-picker-title" className="sr-only">
          महीना और वर्ष चुनें
        </h2>
        <div className="flex items-center justify-center gap-2 pt-1 pr-10 pl-10">
          <button
            type="button"
            onClick={() => setYear((v) => v - 1)}
            aria-label="पिछला वर्ष"
            className="grid h-11 w-11 place-items-center rounded-full text-maroon active:bg-gold-soft"
          >
            <ChevronLeft />
          </button>
          <span className="min-w-24 text-center font-display text-2xl text-maroon" aria-live="polite">
            {num(year)}
          </span>
          <button
            type="button"
            onClick={() => setYear((v) => v + 1)}
            aria-label="अगला वर्ष"
            className="grid h-11 w-11 place-items-center rounded-full text-maroon active:bg-gold-soft"
          >
            <ChevronRight />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
            const current = year === y && month === m;
            return (
              <button
                key={month}
                type="button"
                onClick={() => {
                  onPick({ y: year, m: month });
                  onClose();
                }}
                aria-pressed={current}
                className={`min-h-12 rounded-xl border text-base ${
                  current ? 'border-maroon bg-maroon text-white' : 'border-line bg-paper text-ink active:bg-gold-soft'
                }`}
              >
                {monthName(month)}
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
