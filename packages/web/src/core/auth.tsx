import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  mergeSettings,
  type AppSettings,
  type PublicUser,
  type StoredRecord,
} from '@pluralnova/shared';
import { ApiRequestError, api, getToken, messageFor, setToken } from './api.js';
import { clearAll } from './localdb.js';
import { recordStore } from './data.js';
import { syncEngine } from './sync.js';

/**
 * Session and settings.
 *
 * The signed-in account, its settings and its systems are one piece of state.
 * Settings are saved to the server and re-read from the response, so what the
 * app shows after a save is what was actually stored — which is the difference
 * between a setting that persists and one that only appears to.
 */

export interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: PublicUser | null;
  settings: AppSettings;
  systems: StoredRecord[];
  activeSystem: StoredRecord | null;
  error: string | null;
}

export interface AuthActions {
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
    mode: 'system' | 'singlet';
    systemName?: string;
  }) => Promise<{ recoveryCode?: string }>;
  startGuest: (days: 7 | 30 | 60 | 90) => Promise<void>;
  claimGuest: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<{ recoveryCode?: string }>;
  signOut: () => Promise<void>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  setActiveSystem: (systemId: string) => Promise<void>;
  setActiveMember: (memberId: string | null, pin?: string) => Promise<void>;
  refresh: () => Promise<void>;
  markOnboarded: () => Promise<void>;
}

const AuthContext = createContext<(AuthState & AuthActions) | null>(null);

const SESSION_KEY = 'pluralnova.session';

interface CachedSession {
  user: PublicUser;
  settings: AppSettings;
  systems: StoredRecord[];
}

/**
 * The last session the server confirmed, kept beside the token it belongs to.
 *
 * Without it, opening an installed PluralNova with no connection would show the
 * sign-in screen: the token is still there, but `/api/auth/me` cannot answer,
 * and an app that logs you out when you go through a tunnel is a bookmark with
 * extra steps. Reading it also removes the sign-in flash on a slow connection.
 */
function readCachedSession(): CachedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CachedSession) : null;
  } catch {
    return null;
  }
}

function writeCachedSession(session: CachedSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage can be blocked. The session then lasts only while the tab is open.
  }
}

interface SessionResponse {
  token: string;
  expiresAt: string;
  user: PublicUser;
  settings: AppSettings;
  systems: StoredRecord[];
  recoveryCode?: string;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>(() => {
    const cached = getToken() ? readCachedSession() : null;
    if (!cached) {
      return {
        status: getToken() ? 'loading' : 'anonymous',
        user: null,
        settings: mergeSettings(null),
        systems: [],
        activeSystem: null,
        error: null,
      };
    }
    // Shown straight away and corrected by the refresh below — which signs the
    // user out if the server rejects the token, and leaves this in place if it
    // simply cannot be reached.
    return {
      status: 'authenticated',
      user: cached.user,
      settings: mergeSettings(cached.settings),
      systems: cached.systems ?? [],
      activeSystem:
        (cached.systems ?? []).find((system) => system.id === cached.user.activeSystemId) ?? null,
      error: null,
    };
  });

  const applySession = useCallback((session: SessionResponse) => {
    setToken(session.token);
    setState({
      status: 'authenticated',
      user: session.user,
      settings: mergeSettings(session.settings),
      systems: session.systems ?? [],
      activeSystem:
        (session.systems ?? []).find((system) => system.id === session.user.activeSystemId) ?? null,
      error: null,
    });
    syncEngine.schedule(300);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setState((current) => ({ ...current, status: 'anonymous' }));
      return;
    }
    try {
      const result = await api.get<{
        user: PublicUser;
        settings: AppSettings;
        systems: StoredRecord[];
      }>('/api/auth/me');
      setState({
        status: 'authenticated',
        user: result.user,
        settings: mergeSettings(result.settings),
        systems: result.systems,
        activeSystem:
          result.systems.find((system) => system.id === result.user.activeSystemId) ?? null,
        error: null,
      });
    } catch (error) {
      // Only an explicit rejection signs the user out. A network failure leaves
      // the session in place so a flaky connection does not log anyone out.
      if (error instanceof ApiRequestError && error.status === 401) {
        setToken(null);
        writeCachedSession(null);
        setState({
          status: 'anonymous',
          user: null,
          settings: mergeSettings(null),
          systems: [],
          activeSystem: null,
          error: null,
        });
        return;
      }
      // Unreachable is not rejected. The confirmed session stays in force and
      // the app runs against its local copy until the connection returns.
      setState((current) => ({
        ...current,
        status: current.user ? 'authenticated' : 'anonymous',
        error: messageFor(error),
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /*
   * The snapshot follows the state rather than being written by each action, so
   * a setting saved, a system switched or a profile selected is all reflected
   * without anywhere new having to remember to do it.
   */
  useEffect(() => {
    if (state.status !== 'authenticated' || !state.user) return;
    writeCachedSession({ user: state.user, settings: state.settings, systems: state.systems });
  }, [state.status, state.user, state.settings, state.systems]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await api.post<SessionResponse>('/api/auth/login', { email, password });
      applySession(session);
    },
    [applySession],
  );

  const register = useCallback<AuthActions['register']>(
    async (input) => {
      const session = await api.post<SessionResponse>('/api/auth/register', input);
      applySession(session);
      return session.recoveryCode ? { recoveryCode: session.recoveryCode } : {};
    },
    [applySession],
  );

  const startGuest = useCallback<AuthActions['startGuest']>(
    async (days) => {
      const session = await api.post<SessionResponse>('/api/auth/guest', { days });
      applySession(session);
    },
    [applySession],
  );

  const claimGuest = useCallback<AuthActions['claimGuest']>(async (input) => {
    const result = await api.post<{ user: PublicUser; recoveryCode?: string }>(
      '/api/auth/claim',
      input,
    );
    setState((current) => ({ ...current, user: result.user }));
    return result.recoveryCode ? { recoveryCode: result.recoveryCode } : {};
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Signing out locally still has to work when the server is unreachable.
    }
    setToken(null);
    writeCachedSession(null);
    await recordStore.clear();
    await clearAll();
    await syncEngine.reset();
    setState({
      status: 'anonymous',
      user: null,
      settings: mergeSettings(null),
      systems: [],
      activeSystem: null,
      error: null,
    });
  }, []);

  /*
   * A drag or a fast key-repeat on something like the theme accent slider
   * calls this many times a second, each a full round trip to the server.
   * Those responses are not guaranteed to land in the order they were sent —
   * two overlapping requests can finish in either order — so applying
   * whichever one *arrives* last can quietly put an earlier value back after
   * a newer one already landed. This tracks which call was *sent* last and
   * only that one is allowed to update state, regardless of arrival order.
   */
  const saveSettingsSeq = useRef(0);

  const saveSettings = useCallback<AuthActions['saveSettings']>(async (patch) => {
    const seq = (saveSettingsSeq.current += 1);
    const result = await api.put<{ settings: AppSettings; user: PublicUser }>(
      '/api/auth/settings',
      patch,
    );
    const settings = mergeSettings(result.settings);
    if (seq === saveSettingsSeq.current) {
      setState((current) => ({ ...current, settings, user: result.user }));
    }
    return settings;
  }, []);

  const setActiveSystem = useCallback(
    async (systemId: string) => {
      await api.post(`/api/system/${systemId}/activate`);
      await recordStore.clear();
      await refresh();
      syncEngine.schedule(0);
    },
    [refresh],
  );

  const setActiveMember = useCallback(async (memberId: string | null, pin?: string) => {
    const result = await api.post<{ activeMemberId: string | null }>('/api/system/active-member', {
      memberId,
      ...(pin ? { pin } : {}),
    });
    setState((current) => ({
      ...current,
      user: current.user ? { ...current.user, activeMemberId: result.activeMemberId } : null,
    }));
  }, []);

  const markOnboarded = useCallback(async () => {
    const result = await api.patch<{ user: PublicUser; settings: AppSettings }>('/api/auth/me', {
      onboarded: true,
    });
    setState((current) => ({
      ...current,
      user: result.user,
      settings: mergeSettings(result.settings),
    }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      signIn,
      register,
      startGuest,
      claimGuest,
      signOut,
      saveSettings,
      setActiveSystem,
      setActiveMember,
      refresh,
      markOnboarded,
    }),
    [
      state,
      signIn,
      register,
      startGuest,
      claimGuest,
      signOut,
      saveSettings,
      setActiveSystem,
      setActiveMember,
      refresh,
      markOnboarded,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState & AuthActions {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

export function useSettings(): AppSettings {
  return useAuth().settings;
}

/** True when the account is in System Mode, which gates the system-only screens. */
export function useSystemMode(): boolean {
  return useAuth().settings.mode === 'system';
}

/** The member records are attributed to by default, if a profile is selected. */
export function useActiveMemberId(): string | null {
  return useAuth().user?.activeMemberId ?? null;
}
