import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The dev server talks to the API on the same origin the built app will,
      // so nothing behaves differently once it is bundled.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
      '/realtime': { target: 'ws://localhost:4000', ws: true },
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
