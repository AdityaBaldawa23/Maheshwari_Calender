import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Admin portal: a separate web app (Firebase Hosting). It shares schemas and
// validators from ../src/shared but is never bundled into the Android app.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com",
  "frame-src https://*.firebaseapp.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  base: '/',
  // Separate pre-bundle cache so the app and portal dev servers can run side by side.
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-admin', import.meta.url)),
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'inject-csp',
      apply: 'build',
      transformIndexHtml: (html) =>
        html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  ],
  build: {
    outDir: fileURLToPath(new URL('../dist-admin', import.meta.url)),
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase') ? 'firebase' : undefined) },
    },
  },
  server: { port: 5174 },
});
