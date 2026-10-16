// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarGrid } from '../src/components/CalendarGrid.jsx';
import { buildMonthGrid } from '../src/utils/date.js';

afterEach(cleanup);

// jsdom lacks PointerEvent; without it fireEvent drops clientX/clientY.
if (!window.PointerEvent) {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? 'touch';
    }
  };
}

const days = {
  '2027-06-12': {
    key: '2027-06-12',
    panchang: { tithi: 9, paksha: 'shukla', maas: 'jyeshtha' },
    occasions: [{ id: 'mahesh-navami', title: { hi: 'महेश नवमी' }, category: 'maheshwari', importance: 'high' }],
  },
  '2027-06-26': { key: '2027-06-26', panchang: { tithi: 15, paksha: 'krishna', maas: 'ashadh' }, occasions: [] },
};

function renderJune({ selected = null, onSelect = vi.fn(), onPrev = vi.fn(), onNext = vi.fn() } = {}) {
  render(
    <CalendarGrid
      weeks={buildMonthGrid(2027, 6)}
      days={days}
      today="2027-06-10"
      selected={selected}
      onSelect={onSelect}
      onPrev={onPrev}
      onNext={onNext}
    />,
  );
  return { onSelect, onPrev, onNext };
}

describe('CalendarGrid', () => {
  it('renders every day of the month as a button', () => {
    renderJune();
    expect(screen.getAllByRole('button')).toHaveLength(30);
  });

  it('marks today with aria-current and a Hindi label', () => {
    renderJune();
    const today = screen.getByRole('button', { current: 'date' });
    expect(today.getAttribute('aria-label')).toMatch(/^आज, १० जून २०२७, गुरुवार/);
  });

  it('describes tithi and occasions for screen readers', () => {
    renderJune();
    expect(screen.getByRole('button', { name: /१२ जून २०२७.*ज्येष्ठ शुक्ल नवमी.*महेश नवमी/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /२६ जून २०२७.*अमावस्या/ })).toBeTruthy();
  });

  it('shows Hindi date numerals, the tithi and the occasion inside the cell', () => {
    renderJune();
    const cell = screen.getByRole('button', { name: /१२ जून २०२७/ });
    expect(cell.textContent).toContain('१२');
    expect(cell.textContent).toContain('शु. नवमी');
    expect(cell.textContent).toContain('महेश नवमी');
    expect(cell.textContent).not.toMatch(/[0-9]/);
  });

  it('reports the tapped date and shows the selected state', () => {
    const { onSelect } = renderJune({ selected: '2027-06-12' });
    fireEvent.click(screen.getByRole('button', { name: /^१५ जून २०२७/ }));
    expect(onSelect).toHaveBeenCalledWith('2027-06-15');
    expect(screen.getByRole('button', { pressed: true }).getAttribute('aria-label')).toMatch(/१२ जून/);
  });

  it('changes month on horizontal swipe but not on vertical scroll', () => {
    const { onPrev, onNext } = renderJune();
    const grid = screen.getByRole('grid').parentElement;
    fireEvent.pointerDown(grid, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(grid, { clientX: 150, clientY: 210 });
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(grid, { clientX: 100, clientY: 200 });
    fireEvent.pointerUp(grid, { clientX: 250, clientY: 205 });
    expect(onPrev).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(grid, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(grid, { clientX: 160, clientY: 400 });
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
