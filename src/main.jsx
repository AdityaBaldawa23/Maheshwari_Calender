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
  // Light icons on the maroon header colour; hide the splash once React has painted.
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#7A1F2B' }).catch(() => {});
  requestAnimationFrame(() => SplashScreen.hide().catch(() => {}));
}
