import { DEFAULT_MOBILE_TABS, DEFAULT_SINGLET_TABS } from './navigation.js';
import { DEFAULT_THEME, type ThemePreset, type ThemeSettings } from './themes.js';
import type { TermOverrides } from './terminology.js';
import type { AppMode } from './types.js';

/**
 * Account settings.
 *
 * One object, stored once, returned with the session and written back whole.
 * Everything that has historically "not saved" — notification switches,
 * terminology, the chosen mode, dashboard layout — lives here rather than in
 * per-screen local storage, so there is exactly one thing to persist and one
 * thing to restore.
 */

export const NOTIFICATION_CATEGORIES = [
  'messages',
  'friendRequests',
  'fluxActivity',
  'systemChat',
  'polls',
  'events',
  'tasks',
  'fronting',
  'mood',
  'achievements',
  'memberActivity',
  'dataJobs',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationChannelPrefs {
  /** Shown in the in-app notification centre. */
  inApp: boolean;
  /** Delivered as a system notification while the app is open. */
  foreground: boolean;
  /** Delivered by push while the app is closed. */
  push: boolean;
  /** Counts toward the badge on the app icon and the nav. */
  badge: boolean;
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  messages: 'Direct messages',
  friendRequests: 'Friend requests',
  fluxActivity: 'Reactions and comments',
  systemChat: 'System chat',
  polls: 'Polls',
  events: 'Calendar reminders',
  tasks: 'Task reminders',
  fronting: 'Fronting changes',
  mood: 'Mood check-ins',
  achievements: 'Achievements',
  memberActivity: 'Member activity',
  dataJobs: 'Imports and backups',
};

export interface WidgetSetting {
  id: string;
  visible: boolean;
  order: number;
}

export const DASHBOARD_WIDGETS = [
  { id: 'current-front', label: 'Current fronter', systemOnly: true },
  { id: 'quick-front', label: 'Quick front', systemOnly: true },
  { id: 'quick-actions', label: 'Quick actions' },
  { id: 'mood', label: 'Mood' },
  { id: 'system-status', label: 'System status', systemOnly: true },
  { id: 'recent-journal', label: 'Recent journal' },
  { id: 'tasks', label: 'Tasks due' },
  { id: 'calendar', label: 'Today’s calendar' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'wellness', label: 'Wellbeing' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'messages', label: 'Messages' },
  { id: 'friends', label: 'Friends' },
  { id: 'daily-summary', label: 'Daily summary' },
  { id: 'music', label: 'Music' },
  { id: 'headspace', label: 'Headspace', systemOnly: true },
  { id: 'fronting-stats', label: 'Fronting statistics', systemOnly: true },
  { id: 'location', label: 'Location' },
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]['id'];

export interface PrivacyDefaults {
  /** Visibility applied to new records unless the screen says otherwise. */
  defaultVisibility: 'private' | 'system' | 'members' | 'friends' | 'public';
  /** Allow location coordinates to be attached to records at all. */
  allowPreciseLocation: boolean;
  /** Show message previews in notifications. Off means "you have a new message". */
  showMessagePreviews: boolean;
  /** Require the vault PIN again after this many minutes of inactivity. */
  vaultAutoLockMinutes: number;
  /** Require a PIN when switching to a member profile that has one. */
  requireProfilePins: boolean;
}

export interface AppLockSettings {
  /** Minutes of inactivity before the whole app re-locks; also how long an unlock lasts. */
  autoLockMinutes: number;
  /** Re-lock as soon as the app is backgrounded or the tab is hidden, not just after inactivity. */
  lockOnBackground: boolean;
}

/**
 * The account-wide default look for a conversation. A thread with its own
 * `settings.appearance` (see the `conversations`/`systemChatThreads`
 * collections) overrides this; a thread with none falls back to it — so
 * "use for every conversation" is just writing the same object here, not a
 * pass over every existing thread.
 */
export interface ChatAppearance {
  /** Background behind the message list. Null means the theme's own background. */
  wallpaper: string | null;
  /** Null means the theme's accent, same as an unstyled bubble always used. */
  bubbleMine: string | null;
  /** Null means the theme's raised-surface colour. */
  bubbleTheirs: string | null;
  spacing: 'cozy' | 'compact';
}

export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  wallpaper: null,
  bubbleMine: null,
  bubbleTheirs: null,
  spacing: 'cozy',
};

export interface AppSettings {
  mode: AppMode;
  theme: ThemeSettings;
  /** Themes saved, duplicated or imported by this account, alongside the built-in presets. */
  customThemePresets: ThemePreset[];
  terminology: TermOverrides;
  locale: string;
  notifications: Record<NotificationCategory, NotificationChannelPrefs>;
  notificationsEnabled: boolean;
  quietHours: { enabled: boolean; from: string; to: string };
  widgets: WidgetSetting[];
  mobileTabs: string[];
  privacy: PrivacyDefaults;
  /** App-wide lock, separate from the vault and from per-alter profile PINs. */
  appLock: AppLockSettings;
  /** Default conversation look, used by any thread without its own override. */
  chatAppearance: ChatAppearance;
  /** Cuts animation, blur and background effects independently of the theme. */
  performanceMode: boolean;
  /** Skips the atmosphere layer on the login screen for low-end devices. */
  lowEndLogin: boolean;
  achievementsEnabled: boolean;
  achievementToasts: boolean;
  /** Week starts on Monday (1) or Sunday (0). */
  weekStart: 0 | 1;
  timeFormat: '12h' | '24h';
  currency: string;
  /** Which optional life modules the user wants visible at all. */
  hiddenModules: string[];
  /** Cycle tracking is entirely opt-in and its fields are user-named. */
  cycleEnabled: boolean;
  onboardingCompleted: boolean;
  lastBackupAt: string | null;
  syncEnabled: boolean;
}

function defaultNotificationPrefs(): Record<NotificationCategory, NotificationChannelPrefs> {
  const quiet = new Set<NotificationCategory>(['mood', 'memberActivity']);
  const out = {} as Record<NotificationCategory, NotificationChannelPrefs>;
  for (const category of NOTIFICATION_CATEGORIES) {
    const loud = !quiet.has(category);
    out[category] = { inApp: true, foreground: loud, push: loud, badge: loud };
  }
  return out;
}

export function defaultWidgets(mode: AppMode): WidgetSetting[] {
  return DASHBOARD_WIDGETS.filter((w) => mode === 'system' || !('systemOnly' in w && w.systemOnly))
    .map((w, index) => ({ id: w.id, visible: index < 9, order: index }));
}

export function defaultSettings(mode: AppMode = 'system'): AppSettings {
  return {
    mode,
    theme: { ...DEFAULT_THEME },
    customThemePresets: [],
    terminology: {},
    locale: 'en',
    notifications: defaultNotificationPrefs(),
    notificationsEnabled: true,
    quietHours: { enabled: false, from: '22:00', to: '07:00' },
    widgets: defaultWidgets(mode),
    mobileTabs: [...(mode === 'system' ? DEFAULT_MOBILE_TABS : DEFAULT_SINGLET_TABS)],
    privacy: {
      defaultVisibility: 'private',
      allowPreciseLocation: false,
      showMessagePreviews: true,
      vaultAutoLockMinutes: 5,
      requireProfilePins: true,
    },
    appLock: {
      autoLockMinutes: 5,
      lockOnBackground: true,
    },
    chatAppearance: { ...DEFAULT_CHAT_APPEARANCE },
    performanceMode: false,
    lowEndLogin: false,
    achievementsEnabled: true,
    achievementToasts: true,
    weekStart: 1,
    timeFormat: '12h',
    currency: 'USD',
    hiddenModules: [],
    cycleEnabled: false,
    onboardingCompleted: false,
    lastBackupAt: null,
    syncEnabled: true,
  };
}

/**
 * Merges stored settings over the defaults field by field. Anything the stored
 * copy is missing — a category added in a later release, a widget that did not
 * exist yet — falls back to its default instead of arriving as `undefined`.
 */
export function mergeSettings(stored: Partial<AppSettings> | null | undefined): AppSettings {
  const base = defaultSettings(stored?.mode === 'singlet' ? 'singlet' : 'system');
  if (!stored) return base;

  const notifications = { ...base.notifications };
  for (const category of NOTIFICATION_CATEGORIES) {
    const incoming = stored.notifications?.[category];
    if (incoming) notifications[category] = { ...base.notifications[category], ...incoming };
  }

  const knownWidgets = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
  const widgets = Array.isArray(stored.widgets)
    ? stored.widgets.filter((w) => w && knownWidgets.has(w.id as DashboardWidgetId))
    : base.widgets;
  for (const fallback of base.widgets) {
    if (!widgets.some((w) => w.id === fallback.id)) widgets.push({ ...fallback, visible: false });
  }

  const customThemePresets = Array.isArray(stored.customThemePresets)
    ? stored.customThemePresets.filter(
        (preset): preset is ThemePreset =>
          !!preset &&
          typeof preset.id === 'string' &&
          typeof preset.label === 'string' &&
          typeof preset.settings === 'object' &&
          preset.settings !== null,
      )
    : [];

  return {
    ...base,
    ...stored,
    theme: { ...base.theme, ...(stored.theme ?? {}) },
    customThemePresets,
    terminology: stored.terminology ?? {},
    notifications,
    quietHours: { ...base.quietHours, ...(stored.quietHours ?? {}) },
    privacy: { ...base.privacy, ...(stored.privacy ?? {}) },
    appLock: { ...base.appLock, ...(stored.appLock ?? {}) },
    chatAppearance: { ...base.chatAppearance, ...(stored.chatAppearance ?? {}) },
    widgets: widgets.sort((a, b) => a.order - b.order),
    mobileTabs:
      Array.isArray(stored.mobileTabs) && stored.mobileTabs.length >= 3
        ? stored.mobileTabs.slice(0, 5)
        : base.mobileTabs,
    hiddenModules: Array.isArray(stored.hiddenModules) ? stored.hiddenModules : [],
  };
}

/** True when this category may be delivered at all, given the global switches. */
export function notificationAllowed(
  settings: AppSettings,
  category: NotificationCategory,
  channel: keyof NotificationChannelPrefs,
  at: Date = new Date(),
): boolean {
  if (!settings.notificationsEnabled && channel !== 'inApp') return false;
  const prefs = settings.notifications[category];
  if (!prefs?.[channel]) return false;
  if (channel === 'inApp' || channel === 'badge') return true;
  if (!settings.quietHours.enabled) return true;
  return !withinQuietHours(settings.quietHours, at);
}

export function withinQuietHours(
  quietHours: AppSettings['quietHours'],
  at: Date = new Date(),
): boolean {
  const minutes = at.getHours() * 60 + at.getMinutes();
  const from = parseClock(quietHours.from);
  const to = parseClock(quietHours.to);
  if (from === to) return false;
  // Quiet hours usually wrap past midnight, so the range is treated as circular.
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

function parseClock(value: string): number {
  const [h = '0', m = '0'] = value.split(':');
  return Math.min(23, Math.max(0, Number(h))) * 60 + Math.min(59, Math.max(0, Number(m)));
}
