import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import './index.css';
import App from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { SettingsProvider } from './hooks/useSettings.jsx';
import { RemindersProvider } from './hooks/useReminders.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <RemindersProvider>
          <App />
        </RemindersProvider>
      </SettingsProvider>
    </ErrorBoundary>
  </StrictMode>,
);

if (Capacitor.isNativePlatform()) {
  // Light icons on the maroon header colour; hide the splash once React has painted
  // (the two-logo loader from index.html is then visible until it fades out below).
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#7A1F2B' }).catch(() => {});
  requestAnimationFrame(() => SplashScreen.hide().catch(() => {}));
}

// Opening loader (MINOR_UI_CHANGES.md, Change 2): shown for a short moment so the
// logos and credit can be seen, then faded out. The calendar is already rendered behind it.
const LOADER_MIN_MS = 1200;
const loader = document.getElementById('boot-loader');
if (loader) {
  setTimeout(() => {
    loader.classList.add('boot-hide');
    setTimeout(() => loader.remove(), 400);
  }, Math.max(0, LOADER_MIN_MS - performance.now()));
}
