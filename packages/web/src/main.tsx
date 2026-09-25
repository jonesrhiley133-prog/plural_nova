import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { registerServiceWorker } from './core/serviceWorker.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/chat.css';
// Last, so the motion rules win ties without reaching for !important.
import './styles/motion.css';

const container = document.getElementById('root');
if (!container) throw new Error('The root element is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * The service worker is what makes this an installable application rather than
 * a bookmark: offline launch, background push, and the shortcuts the platform
 * shows on a long press. Registration failing is not fatal — the app then runs
 * as an ordinary page.
 */
registerServiceWorker();
