import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { firebaseConfigured } from './firebase.js';
import { AuthProvider } from './auth.jsx';
import { AdminApp } from './App.jsx';

function SetupNeeded() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="card space-y-2 p-5 text-sm leading-relaxed">
        <h1 className="font-display text-2xl text-maroon">Firebase configuration required</h1>
        <p>
          Fill in <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_PROJECT_ID</code>,{' '}
          <code>VITE_FIREBASE_AUTH_DOMAIN</code> and <code>VITE_FIREBASE_APP_ID</code> in <code>.env.local</code>, then rebuild the portal.
        </p>
        <p>See docs/V2_ADMIN.md → “Firebase project setup”.</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {firebaseConfigured ? (
      <AuthProvider>
        <AdminApp />
      </AuthProvider>
    ) : (
      <SetupNeeded />
    )}
  </StrictMode>,
);
