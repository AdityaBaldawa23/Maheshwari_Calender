/**
 * Build-time configuration (Vite env, see .env.example). The Firebase web API
 * key and project ID are public identifiers, not secrets — security comes from
 * Firestore Security Rules. When unset, the app runs fully offline with bundled
 * data and the directory explains that it is not yet available.
 */
export const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
};

export const remoteEnabled = Boolean(firebaseConfig.projectId);
