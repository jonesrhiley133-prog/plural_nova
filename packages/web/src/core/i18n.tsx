import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  LOCALES,
  resolveTerminology,
  translate,
  withCount,
  type Terminology,
} from '@pluralnova/shared';
import { useAuth } from './auth.js';

/**
 * Localisation and terminology.
 *
 * One hook resolves both: the chosen locale picks the string, the account's
 * terminology fills in the words for people and the system. Because every
 * screen goes through `t()`, changing "member" to "headmate" in settings
 * changes it everywhere at once rather than on the page that happened to be
 * written with a variable.
 */

interface I18nContextValue {
  locale: string;
  terms: Terminology;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Resolves a string that already contains terminology tokens. */
  term: (text: string) => string;
  /** `tc('list.resultCount', n)` handles the "(s)" in counted strings. */
  tc: (key: string, count: number, params?: Record<string, string | number>) => string;
  locales: typeof LOCALES;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const { settings } = useAuth();

  const terms = useMemo(() => resolveTerminology(settings.terminology), [settings.terminology]);
  const locale = settings.locale || 'en';

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(key, { locale, terms, ...(params ? { params } : {}) }),
    [locale, terms],
  );

  const term = useCallback(
    (text: string) => translate(text, { locale, terms }),
    [locale, terms],
  );

  const tc = useCallback(
    (key: string, count: number, params?: Record<string, string | number>) =>
      withCount(translate(key, { locale, terms, params: { ...params, count } }), count),
    [locale, terms],
  );

  const value = useMemo(
    () => ({ locale, terms, t, term, tc, locales: LOCALES }),
    [locale, terms, t, term, tc],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>.');
  return context;
}

/** The common case: `const t = useT()`. */
export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}

/** Formats a date in the user's locale and their 12/24-hour preference. */
export function useDateFormat(): {
  date: (value: string | Date) => string;
  time: (value: string | Date) => string;
  dateTime: (value: string | Date) => string;
  relative: (value: string | Date) => string;
} {
  const { locale } = useI18n();
  const { settings } = useAuth();
  const hour12 = settings.timeFormat === '12h';

  return useMemo(
    () => ({
      date: (value) =>
        new Date(value).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      time: (value) => new Date(value).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12 }),
      dateTime: (value) =>
        new Date(value).toLocaleString(locale, {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
          hour12,
        }),
      relative: (value) => formatRelative(new Date(value), locale),
    }),
    [locale, hour12],
  );
}

function formatRelative(date: Date, locale: string): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(Math.round(seconds), 'second');
}
