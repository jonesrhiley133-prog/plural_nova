import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Defaults to localhost so `npm run dev:web` works unchanged outside Docker.
// In the Base44 dev compose the web service sets PLURALNOVA_DEV_API to the
// server container's address.
const apiTarget = process.env.PLURALNOVA_DEV_API ?? 'http://localhost:4000';

// Gracefully handle the brief ECONNREFUSED window when the API server
// restarts (e.g. tsx watch picking up shared/dist changes).  Instead of
// logging a scary proxy error, return a 502 so the client can retry.
const onProxyError = (proxy: { on: (event: string, handler: (...args: never[]) => void) => void }) => {
  proxy.on('error', (err: NodeJS.ErrnoException, _req: never, res: { writeHead?: (status: number, headers: Record<string, string>) => void; end?: (data: string) => void; headersSent?: boolean }) => {
    if ((err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') && res?.writeHead && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server is restarting, please retry.' }));
    }
  });
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      // The dev server talks to the API on the same origin the built app will,
      // so nothing behaves differently once it is bundled.
      '/api': { target: apiTarget, changeOrigin: true, configure: onProxyError },
      '/uploads': { target: apiTarget, changeOrigin: true, configure: onProxyError },
      '/realtime': { target: apiTarget.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Splitting the router and the shared domain layer keeps the initial
        // payload small on the slow connections this app is meant to work on.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          domain: ['@pluralnova/shared'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
} as never);
