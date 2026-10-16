import { buildMonthGrid } from '../utils/date.js';
import { useMonthData } from '../hooks/useCalendarData.js';
import { CalendarGrid } from '../components/CalendarGrid.jsx';
import { MonthNavigator } from '../components/MonthNavigator.jsx';

/** FRONT page: the month grid fills the whole screen between header and tabs. */
export function CalendarPage({ today, month, selected, onSelectDate, onChangeMonth, onGoToday, isCurrentMonth, onPickMonth }) {
  const monthData = useMonthData(month.y, month.m);
  // Grid structure never waits for data.
  const weeks = monthData?.weeks ?? buildMonthGrid(month.y, month.m);

  return (
    // min-h keeps cells readable on very short screens (the page scrolls instead of squashing).
    <div className="flex h-full min-h-132 flex-col gap-1 px-1.5 pt-1 pb-1.5">
      <MonthNavigator
        y={month.y}
        m={month.m}
        monthData={monthData}
        isCurrentMonth={isCurrentMonth}
        onPrev={() => onChangeMonth(-1)}
        onNext={() => onChangeMonth(1)}
        onToday={onGoToday}
        onPick={onPickMonth}
      />
      <div className="min-h-0 flex-1">
        <CalendarGrid
          weeks={weeks}
          days={monthData?.days}
          today={today}
          selected={selected}
          onSelect={onSelectDate}
          onPrev={() => onChangeMonth(-1)}
          onNext={() => onChangeMonth(1)}
        />
      </div>
    </div>
  );
}
