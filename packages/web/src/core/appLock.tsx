import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { api, messageFor } from './api.js';
import { useAuth } from './auth.js';

/**
 * The app-wide lock.
 *
 * One provider, mounted once above the routes, so "lock now" from Settings and
 * the gate that decides whether to render a screen at all are the same piece of
 * state — pressing it locks the app immediately rather than only updating a card.
 * Separate from the vault (`/api/vault/*`) and from per-alter profile PINs
 * (`setActiveMember` in `core/auth.tsx`).
 */

export interface AppLockStatus {
  configured: boolean;
  unlocked: boolean;
  unlockedUntil: string | null;
  biometricRegistered: boolean;
  biometricLabels: string[];
}

export type AppLockState = 'checking' | 'locked' | 'unlocked';

const CACHE_KEY = 'pluralnova.appLockCache';

interface CachedAppLock {
  configured: boolean;
  unlockedUntil: string | null;
}

/**
 * The last confirmed answer, kept beside the session cache in `core/auth.tsx`
 * for the same reason: offline is not the same as locked. Only the fact that a
 * PIN exists and the timestamp it is valid until are cached — never a raw
 * "unlocked" flag — so a stale cache can only ever fall back to the same
 * time-bound window a real unlock already established, not grant a new one.
 */
function readCachedAppLock(): CachedAppLock | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedAppLock) : null;
  } catch {
    return null;
  }
}

function writeCachedAppLock(cache: CachedAppLock): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage can be blocked; the fallback below then defaults to open.
  }
}

export interface AppLockContextValue {
  state: AppLockState;
  status: AppLockStatus | null;
  error: string | null;
  refresh: () => Promise<void>;
  setup: (pin: string, currentPin?: string) => Promise<void>;
  unlock: (pin: string) => Promise<void>;
  lock: () => Promise<void>;
  removePin: (pin: string) => Promise<void>;
  recoverWithPassword: (accountPassword: string, newPin: string) => Promise<void>;
  biometricSupported: boolean;
  registerBiometric: (label?: string) => Promise<void>;
  removeBiometric: () => Promise<void>;
  authenticateBiometric: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: { children: ReactNode }): JSX.Element {
  const { status: authStatus, settings } = useAuth();
  const active = authStatus === 'authenticated';

  const [status, setStatus] = useState<AppLockStatus | null>(null);
  const [state, setState] = useState<AppLockState>('checking');
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((result: AppLockStatus) => {
    setStatus(result);
    setState(result.configured && !result.unlocked ? 'locked' : 'unlocked');
    setError(null);
    writeCachedAppLock({ configured: result.configured, unlockedUntil: result.unlockedUntil });
  }, []);

  const refresh = useCallback(async () => {
    if (!active) return;
    try {
      const result = await api.get<AppLockStatus>('/api/app-lock/status');
      apply(result);
    } catch (cause) {
      setError(messageFor(cause));
      // Offline is not the same as locked: a PIN can only be verified by the
      // server, so with no connection this falls back to the last confirmed
      // answer instead of gating an app that may never have had a PIN set at
      // all — the offline-launch failure this app was built not to have.
      const cached = readCachedAppLock();
      const stillWithinWindow = Boolean(
        cached?.unlockedUntil && cached.unlockedUntil > new Date().toISOString(),
      );
      setState(cached?.configured && !stillWithinWindow ? 'locked' : 'unlocked');
      setStatus(
        (previous) =>
          previous ?? {
            configured: cached?.configured ?? false,
            unlocked: !cached?.configured || stillWithinWindow,
            unlockedUntil: cached?.unlockedUntil ?? null,
            biometricRegistered: false,
            biometricLabels: [],
          },
      );
    }
  }, [active, apply]);

  useEffect(() => {
    if (!active) {
      setStatus(null);
      setState('checking');
      return;
    }
    setState('checking');
    void refresh();
    // Intentionally only on mount/login: a settings change should not by
    // itself flip the gate mid-session, only the actions below should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Re-checks exactly when the server's flat unlock window runs out, instead
  // of polling for it.
  useEffect(() => {
    if (!status?.unlockedUntil) return;
    const remaining = Date.parse(status.unlockedUntil) - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => void refresh(), remaining + 1000);
    return () => window.clearTimeout(timer);
  }, [status?.unlockedUntil, refresh]);

  // Read via refs inside the listener below so it is added once per session
  // rather than re-subscribed on every render, while still seeing current values.
  const statusRef = useRef(status);
  statusRef.current = status;
  const lockOnBackgroundRef = useRef(settings.appLock.lockOnBackground);
  lockOnBackgroundRef.current = settings.appLock.lockOnBackground;

  useEffect(() => {
    if (!active) return;
    const onVisibility = (): void => {
      if (document.visibilityState !== 'hidden') return;
      if (!lockOnBackgroundRef.current) return;
      const current = statusRef.current;
      if (!current?.configured || !current.unlocked) return;
      setState('locked');
      setStatus((prev) => (prev ? { ...prev, unlocked: false, unlockedUntil: null } : prev));
      // Best-effort: the flat window would otherwise still run out on its
      // own, and the next status check reconciles either way.
      void api.post('/api/app-lock/lock').catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [active]);

  const setup = useCallback(
    async (pin: string, currentPin?: string) => {
      await api.post('/api/app-lock/setup', currentPin ? { pin, currentPin } : { pin });
      await refresh();
    },
    [refresh],
  );

  const unlock = useCallback(
    async (pin: string) => {
      await api.post('/api/app-lock/unlock', { pin });
      await refresh();
    },
    [refresh],
  );

  const lock = useCallback(async () => {
    await api.post('/api/app-lock/lock');
    await refresh();
  }, [refresh]);

  const removePin = useCallback(
    async (pin: string) => {
      await api.delete('/api/app-lock/pin', undefined, { body: { pin } });
      await refresh();
    },
    [refresh],
  );

  const recoverWithPassword = useCallback(
    async (accountPassword: string, newPin: string) => {
      await api.post('/api/app-lock/recover', { accountPassword, newPin });
      await refresh();
    },
    [refresh],
  );

  const registerBiometric = useCallback(
    async (label?: string) => {
      const optionsJSON = await api.post<PublicKeyCredentialCreationOptionsJSON>(
        '/api/app-lock/webauthn/register-options',
      );
      let response;
      try {
        response = await startRegistration({ optionsJSON });
      } catch {
        throw new Error('That device did not complete registration.');
      }
      await api.post('/api/app-lock/webauthn/register', { response, label });
      await refresh();
    },
    [refresh],
  );

  const removeBiometric = useCallback(async () => {
    await api.delete('/api/app-lock/webauthn');
    await refresh();
  }, [refresh]);

  const authenticateBiometric = useCallback(async () => {
    const optionsJSON = await api.post<PublicKeyCredentialRequestOptionsJSON>(
      '/api/app-lock/webauthn/auth-options',
    );
    let response;
    try {
      response = await startAuthentication({ optionsJSON });
    } catch {
      throw new Error('That was not confirmed on this device.');
    }
    await api.post('/api/app-lock/webauthn/authenticate', { response });
    await refresh();
  }, [refresh]);

  const value: AppLockContextValue = {
    state,
    status,
    error,
    refresh,
    setup,
    unlock,
    lock,
    removePin,
    recoverWithPassword,
    biometricSupported: browserSupportsWebAuthn(),
    registerBiometric,
    removeBiometric,
    authenticateBiometric,
  };

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const context = useContext(AppLockContext);
  if (!context) throw new Error('useAppLock must be used inside <AppLockProvider>.');
  return context;
}
