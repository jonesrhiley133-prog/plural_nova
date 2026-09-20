import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';

const container = document.getElementById('root');
if (!container) throw new Error('The root element is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * The service worker is what makes this an installable application rather than
 * a bookmark: offline caching, background push, and the shortcuts the platform
 * shows on a long press. Registration failing is not fatal — the app runs as a
 * normal page.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.info('[pluralnova] service worker unavailable:', error);
    });
  });
}
