import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './styles.css';

if (import.meta.env.DEV) {
  void navigator.serviceWorker?.getRegistrations().then((registrations) =>
    Promise.all(registrations.map((registration) => registration.unregister())),
  );
  void window.caches?.keys().then((cacheNames) =>
    Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName))),
  );
} else {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
