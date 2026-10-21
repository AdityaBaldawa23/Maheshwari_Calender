import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { addMonths, parseKey } from './utils/date.js';
import { useBackButton, useOnResume, useToday } from './hooks/useAppLifecycle.js';
import { notificationService } from './services/notificationService.js';
import { calendarService } from './services/calendarService.js';
import { syncManager } from './services/sync/syncManager.js';
import { AppHeader } from './components/AppHeader.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { VIEW_ORDER } from './constants/views.js';
import { DayDetailSheet } from './components/DayDetailSheet.jsx';
import { closeTopSheet } from './components/Sheet.jsx';
import { PermissionDialog } from './components/PermissionDialog.jsx';
import { NoticePopup } from './components/NoticePopup.jsx';
import { useReminders } from './hooks/useReminders.jsx';
import { CalendarPage } from './pages/CalendarPage.jsx';
import { OccasionsPage } from './pages/OccasionsPage.jsx';
import { EmergencyPage } from './pages/EmergencyPage.jsx';
import { MorePage } from './pages/MorePage.jsx';

// The directory screen (and its search index) loads only when opened.
const DirectoryPage = lazy(() => import('./pages/DirectoryPage.jsx'));

const monthOf = (key) => {
  const { y, m } = parseKey(key);
  return { y, m };
};

export default function App() {
  const today = useToday();
  const [view, setView] = useState('calendar');
  const [moreSection, setMoreSection] = useState(null); // sub-screen inside "अधिक"
  const [turnBack, setTurnBack] = useState(false); // animation direction
  const [month, setMonth] = useState(() => monthOf(today)); // shared by the calendar and occasions tabs
  const [selected, setSelected] = useState(null); // date key whose detail sheet is open
  const { dialog, closeDialog } = useReminders();
  const mainRef = useRef(null);

  // Cloud data: show cached snapshots immediately, then check for updates in the
  // background. The calendar never waits for this (bundled data renders first).
  useEffect(() => {
    const unsubscribe = syncManager.onOccasionsChanged((years) => calendarService.invalidate(years));
    syncManager
      .init()
      .then(() => syncManager.syncAll({ force: true }))
      .catch((err) => console.warn('[sync] startup', err));
    return unsubscribe;
  }, []);
  useOnResume(() => syncManager.syncAll());

  const changeView = useCallback(
    (next) => {
      if (next === view) {
        if (next === 'more') setMoreSection(null);
        return;
      }
      setTurnBack(VIEW_ORDER.indexOf(next) < VIEW_ORDER.indexOf(view));
      setView(next);
      setMoreSection(null);
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

  // Android back: topmost popup (any screen) → sub-screen → calendar tab → exit.
  useBackButton(() => {
    if (closeTopSheet()) return true;
    if (dialog) closeDialog();
    else if (selected) setSelected(null);
    else if (moreSection) setMoreSection(null);
    else if (view !== 'calendar') changeView('calendar');
    else return false;
    return true;
  });

  const monthProps = {
    month,
    onChangeMonth: changeMonth,
    onGoToday: goToday,
    onPickMonth: setMonth,
    isCurrentMonth,
    onSelectDate: openDate,
  };

  return (
    // Full-height column: header, scrollable page area, tab bar. The calendar fills the page area exactly.
    <div className="flex h-dvh flex-col bg-paper">
      <AppHeader />

      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={view} className={`page-in ${turnBack ? 'page-in-reverse' : ''} mx-auto h-full max-w-2xl`}>
          {view === 'calendar' && <CalendarPage today={today} selected={selected} {...monthProps} />}
          {view === 'occasions' && <OccasionsPage {...monthProps} />}
          {view === 'directory' && (
            <Suspense fallback={null}>
              <DirectoryPage today={today} />
            </Suspense>
          )}
          {view === 'emergency' && <EmergencyPage />}
          {view === 'more' && <MorePage today={today} section={moreSection} onOpenSection={setMoreSection} />}
        </div>
      </main>

      <BottomNav view={view} onChange={changeView} />

      {selected && (
        <DayDetailSheet dateKey={selected} today={today} onClose={() => setSelected(null)} onNavigate={openDate} />
      )}
      <PermissionDialog />
      <NoticePopup today={today} />
    </div>
  );
}
