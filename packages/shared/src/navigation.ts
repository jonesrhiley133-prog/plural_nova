import type { AppMode } from './types.js';

/**
 * The navigation map.
 *
 * One declaration drives the desktop sidebar, the mobile bottom bar, the "jump
 * to" search, the app shortcuts in the web manifest and the customisation
 * screen — so a route can never exist in one of those and be missing from
 * another.
 */

export interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: string;
  /** Hidden in Singlet Mode. */
  systemOnly?: boolean;
  /** Offered as a bottom-bar slot on mobile. */
  primary?: boolean;
  /** Shown in the quick-action sheet. */
  quickAction?: boolean;
  description?: string;
  /** Badge source, if this item can show an unread count. */
  badge?: 'notifications' | 'messages' | 'friendRequests' | 'flux';
  keywords?: readonly string[];
}

export interface NavCategory {
  id: string;
  label: string;
  icon: string;
  systemOnly?: boolean;
  /** Context colour for this category — used by the sidebar and tiles. */
  color?: string;
  items: readonly NavItem[];
}

export const NAVIGATION: readonly NavCategory[] = [
  {
    id: 'main',
    label: 'Main',
    icon: 'home',
    color: '#8b5cf6',
    items: [
      { id: 'dashboard', path: '/', label: 'Home', icon: 'home', primary: true, description: 'Your day at a glance.' },
      { id: 'bulletin', path: '/bulletin', label: 'Bulletin Board', icon: 'bulletin', systemOnly: true },
      { id: 'stories', path: '/stories', label: 'Story Builder', icon: 'story' },
      { id: 'journal', path: '/journal', label: 'Journal', icon: 'journal', primary: true, quickAction: true },
      { id: 'organize', path: '/organize', label: 'Organize', icon: 'organize', systemOnly: true, keywords: ['groups', 'folders', 'sort'] },
      { id: 'headspace', path: '/headspace', label: 'Headspace', icon: 'headspace', systemOnly: true },
    ],
  },
  {
    id: 'daily',
    label: 'Daily',
    icon: 'calendar',
    color: '#3b82f6',
    items: [
      { id: 'tasks', path: '/tasks', label: 'Tasks', icon: 'task', primary: true, quickAction: true },
      { id: 'notes', path: '/notes', label: 'Notes', icon: 'note', quickAction: true },
      { id: 'daily-summary', path: '/daily-summary', label: 'Daily Summary', icon: 'summary', description: 'Everything recorded on a given day.' },
      { id: 'calendar', path: '/calendar', label: 'Calendar', icon: 'calendar', primary: true, quickAction: true },
      { id: 'media', path: '/media', label: 'Media', icon: 'media' },
      { id: 'flags', path: '/flags', label: 'Flag Library', icon: 'flag' },
    ],
  },
  {
    id: 'constellation',
    label: 'Constellation',
    icon: 'system',
    systemOnly: true,
    color: '#ec4899',
    items: [
      { id: 'system-chat', path: '/system-chat', label: 'System Chat', icon: 'chat', systemOnly: true },
      { id: 'members', path: '/members', label: '{{Members}}', icon: 'member', primary: true, systemOnly: true, quickAction: true },
      { id: 'fronting', path: '/fronting', label: '{{Front}}', icon: 'front', systemOnly: true, keywords: ['front tracker', 'timeline'] },
      { id: 'relationships', path: '/relationships', label: 'Relationships', icon: 'relationship', systemOnly: true },
      { id: 'stats', path: '/stats', label: 'Stats', icon: 'stats', systemOnly: true, keywords: ['analytics', 'charts'] },
      { id: 'system-history', path: '/system-history', label: 'Constellation History', icon: 'history', systemOnly: true },
      { id: 'profile-select', path: '/profiles', label: 'Profile Select', icon: 'profiles', systemOnly: true, description: 'Pick who is using the app.' },
      { id: 'subsystems', path: '/subsystems', label: '{{Subsystems}}', icon: 'subsystem', systemOnly: true },
    ],
  },
  {
    id: 'social',
    label: 'Social',
    icon: 'social',
    color: '#10b981',
    items: [
      { id: 'friends', path: '/friends', label: 'Friends', icon: 'friend', badge: 'friendRequests' },
      { id: 'constellations', path: '/constellations', label: 'Constellations', icon: 'constellation' },
      { id: 'flux', path: '/flux', label: 'Flux', icon: 'flux', primary: true, badge: 'flux' },
      { id: 'messages', path: '/messages', label: 'Messages', icon: 'message', primary: true, badge: 'messages' },
    ],
  },
  {
    id: 'polls',
    label: 'Polls',
    icon: 'poll',
    systemOnly: true,
    color: '#f59e0b',
    items: [
      { id: 'polls', path: '/polls', label: 'Polls', icon: 'poll', systemOnly: true, quickAction: true },
    ],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: 'contact',
    color: '#14b8a6',
    items: [
      { id: 'contacts', path: '/contacts', label: 'Contacts', icon: 'contact' },
      { id: 'emergency', path: '/emergency', label: 'Emergency Contacts', icon: 'emergency' },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    icon: 'achievement',
    color: '#f43f5e',
    items: [
      { id: 'achievements', path: '/achievements', label: 'Achievements', icon: 'achievement' },
      { id: 'wellbeing', path: '/wellbeing', label: 'Wellbeing', icon: 'wellbeing', quickAction: true },
      { id: 'fitness', path: '/fitness', label: 'Fitness', icon: 'fitness' },
      { id: 'cycle', path: '/cycle', label: 'Cycle & Wellness', icon: 'cycle' },
      { id: 'sleep', path: '/sleep', label: 'Sleep', icon: 'sleep' },
      { id: 'emotion-insights', path: '/emotion-insights', label: 'Emotion Insights', icon: 'insight' },
      { id: 'emotions', path: '/emotions', label: 'Emotions', icon: 'emotion', quickAction: true },
      { id: 'body-map', path: '/body-map', label: 'Body Sensations', icon: 'body' },
    ],
  },
  {
    id: 'life',
    label: 'Life',
    icon: 'life',
    color: '#6366f1',
    items: [
      { id: 'finances', path: '/finances', label: 'Finances', icon: 'finance' },
      { id: 'work', path: '/work', label: 'Work', icon: 'work' },
      { id: 'fics', path: '/fics', label: 'Fic Tracker', icon: 'fic' },
      { id: 'music', path: '/music', label: 'Music', icon: 'music' },
      { id: 'dictionary', path: '/dictionary', label: 'Dictionary', icon: 'dictionary' },
      { id: 'resources', path: '/resources', label: 'Resources', icon: 'resource' },
      { id: 'locations', path: '/locations', label: 'Locations', icon: 'location' },
      { id: 'video', path: '/video', label: 'Video', icon: 'video' },
      { id: 'characters', path: '/characters', label: 'Characters', icon: 'character' },
      { id: 'templates', path: '/templates', label: 'Templates', icon: 'template' },
    ],
  },
  {
    id: 'you',
    label: 'You',
    icon: 'more',
    color: '#94a3b8',
    items: [
      { id: 'backup', path: '/backup', label: 'Backup & Restore', icon: 'backup' },
      { id: 'help', path: '/help', label: 'Help', icon: 'help' },
      { id: 'settings', path: '/settings', label: 'Settings', icon: 'settings' },
      { id: 'notifications', path: '/notifications', label: 'Notifications', icon: 'notification', badge: 'notifications' },
      { id: 'vault', path: '/vault', label: 'Private Vault', icon: 'vault' },
      { id: 'import', path: '/import', label: 'Import', icon: 'import' },
      { id: 'features', path: '/features', label: 'Features', icon: 'features' },
    ],
  },
];

export const ALL_NAV_ITEMS: readonly NavItem[] = NAVIGATION.flatMap((c) =>
  c.items.map((item) => ({ ...item, systemOnly: item.systemOnly || c.systemOnly })),
);

export function navItemsForMode(mode: AppMode): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) => mode === 'system' || !item.systemOnly);
}

export function categoriesForMode(mode: AppMode): NavCategory[] {
  return NAVIGATION.filter((c) => mode === 'system' || !c.systemOnly)
    .map((c) => ({ ...c, items: c.items.filter((i) => mode === 'system' || !i.systemOnly) }))
    .filter((c) => c.items.length > 0);
}

/** Default bottom-bar layout. Users can replace any slot from settings. */
export const DEFAULT_MOBILE_TABS: readonly string[] = [
  'dashboard',
  'fronting',
  'journal',
  'tasks',
  'more',
];

export const DEFAULT_SINGLET_TABS: readonly string[] = [
  'dashboard',
  'journal',
  'tasks',
  'calendar',
  'more',
];

export function findNavItem(id: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => item.id === id);
}

export function findNavItemByPath(path: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => item.path === path);
}

/** Actions offered by the floating quick-action button and the app shortcuts. */
export const QUICK_ACTIONS: readonly {
  id: string;
  label: string;
  icon: string;
  path: string;
  systemOnly?: boolean;
}[] = [
  { id: 'front', label: 'Log a front', icon: 'front', path: '/quick-front', systemOnly: true },
  { id: 'whos-there', label: "Who's there", icon: 'front', path: '/whos-there', systemOnly: true },
  { id: 'journal', label: 'New journal entry', icon: 'journal', path: '/journal?new=1' },
  { id: 'mood', label: 'Log a mood', icon: 'mood', path: '/wellbeing?new=mood' },
  { id: 'emotion', label: 'Log an emotion', icon: 'emotion', path: '/emotions?new=1' },
  { id: 'note', label: 'New note', icon: 'note', path: '/notes?new=1' },
  { id: 'task', label: 'New task', icon: 'task', path: '/tasks?new=1' },
  { id: 'event', label: 'New event', icon: 'calendar', path: '/calendar?new=1' },
  { id: 'member', label: 'Add a member', icon: 'member', path: '/members?new=1', systemOnly: true },
  { id: 'poll', label: 'New poll', icon: 'poll', path: '/polls?new=1', systemOnly: true },
];
