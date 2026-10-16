import { useCallback, useEffect, useRef, useState } from 'react';
import { addMonths, parseKey } from './utils/date.js';
import { useBackButton, useToday } from './hooks/useAppLifecycle.js';
import { notificationService } from './services/notificationService.js';
import { AppHeader } from './components/AppHeader.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { VIEW_ORDER } from './constants/views.js';
import { DayDetailSheet } from './components/DayDetailSheet.jsx';
import { PermissionDialog } from './components/PermissionDialog.jsx';
import { useReminders } from './hooks/useReminders.jsx';
import { CalendarPage } from './pages/CalendarPage.jsx';
import { OccasionsPage } from './pages/OccasionsPage.jsx';
import { BackPage } from './pages/BackPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';

const monthOf = (key) => {
  const { y, m } = parseKey(key);
  return { y, m };
};

export default function App() {
  const today = useToday();
  const [view, setView] = useState('calendar');
  const [turnBack, setTurnBack] = useState(false); // animation direction
  const [month, setMonth] = useState(() => monthOf(today)); // shared by the calendar and occasions tabs
  const [selected, setSelected] = useState(null); // date key whose detail sheet is open
  const { dialog, closeDialog } = useReminders();
  const mainRef = useRef(null);

  const changeView = useCallback(
    (next) => {
      if (next === view) return;
      setTurnBack(VIEW_ORDER.indexOf(next) < VIEW_ORDER.indexOf(view));
      setView(next);
      if (mainRef.current) mainRef.current.scrollTop = 0;
    },
    [view],
  );

  const openDate = useCallback((key) => {
    setSelected(key);
    setMonth(monthOf(key));
  }, []);

  const goToday = useCallback(() => setMonth(monthOf(today)), [today]);
  const changeMonth = useCallback((delta) => setMonth((m) => addMonths(m, delta)), []);
  const { y: todayY, m: todayM } = monthOf(today);
  const isCurrentMonth = month.y === todayY && month.m === todayM;

  // Tapping a reminder notification opens that date.
  useEffect(
    () =>
      notificationService.onReminderTapped((date) => {
        if (!parseKey(date)) return;
        setView('calendar');
        openDate(date);
      }),
    [openDate],
  );

  // Android back: close dialog → close sheet → return to calendar → exit.
  useBackButton(() => {
    if (dialog) closeDialog();
    else if (selected) setSelected(null);
    else if (view !== 'calendar') changeView('calendar');
    else return false;
    return true;
  });

  const monthProps = { month, onChangeMonth: changeMonth, onGoToday: goToday, isCurrentMonth, onSelectDate: openDate };

  return (
    // Full-height column: header, scrollable page area, tab bar. The calendar fills the page area exactly.
    <div className="flex h-dvh flex-col bg-paper">
      <AppHeader />

      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={view} className={`page-in ${turnBack ? 'page-in-reverse' : ''} mx-auto h-full max-w-lg`}>
          {view === 'calendar' && <CalendarPage today={today} selected={selected} {...monthProps} />}
          {view === 'occasions' && <OccasionsPage {...monthProps} />}
          {view === 'back' && (
            <div className="px-4 py-3">
              <BackPage today={today} onFlip={() => changeView('calendar')} />
            </div>
          )}
          {view === 'settings' && (
            <div className="px-4 py-3">
              <SettingsPage />
            </div>
          )}
        </div>
      </main>

      <BottomNav view={view} onChange={changeView} />

      {selected && (
        <DayDetailSheet dateKey={selected} today={today} onClose={() => setSelected(null)} onNavigate={openDate} />
      )}
      <PermissionDialog />
    </div>
  );
}
