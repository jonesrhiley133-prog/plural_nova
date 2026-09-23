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
  items: readonly NavItem[];
}

export const NAVIGATION: readonly NavCategory[] = [
  {
    id: 'home',
    label: 'Home',
    icon: 'home',
    items: [
      { id: 'dashboard', path: '/', label: 'Dashboard', icon: 'home', primary: true, description: 'Your day at a glance.' },
      { id: 'whos-there', path: '/whos-there', label: "Who's there", icon: 'front', primary: true, systemOnly: true, description: 'Who is fronting right now.' },
      { id: 'quick-front', path: '/quick-front', label: 'Quick front', icon: 'bolt', systemOnly: true, quickAction: true, description: 'Log a front in one step.' },
      { id: 'daily-summary', path: '/daily-summary', label: 'Daily summary', icon: 'summary', description: 'Everything recorded on a given day.' },
      { id: 'search', path: '/search', label: 'Search', icon: 'search', keywords: ['find', 'global'] },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: 'system',
    systemOnly: true,
    items: [
      { id: 'members', path: '/members', label: 'Members', icon: 'member', primary: true, systemOnly: true, quickAction: true },
      { id: 'profile-select', path: '/profiles', label: 'Profile select', icon: 'profiles', systemOnly: true, description: 'Pick who is using the app.' },
      { id: 'organize', path: '/organize', label: 'Organise', icon: 'organize', systemOnly: true, keywords: ['groups', 'folders', 'sort'] },
      { id: 'subsystems', path: '/subsystems', label: 'Subsystems', icon: 'subsystem', systemOnly: true },
      { id: 'fronting', path: '/fronting', label: 'Fronting', icon: 'front', systemOnly: true, keywords: ['front tracker', 'timeline'] },
      { id: 'stats', path: '/stats', label: 'Stats', icon: 'stats', systemOnly: true, keywords: ['analytics', 'charts'] },
      { id: 'journal', path: '/journal', label: 'Journal', icon: 'journal', primary: true, quickAction: true },
      { id: 'system-chat', path: '/system-chat', label: 'System chat', icon: 'chat', systemOnly: true },
      { id: 'bulletin', path: '/bulletin', label: 'Bulletin board', icon: 'bulletin', systemOnly: true },
      { id: 'polls', path: '/polls', label: 'Polls', icon: 'poll', systemOnly: true, quickAction: true },
      { id: 'relationships', path: '/relationships', label: 'Relationships', icon: 'relationship', systemOnly: true },
      { id: 'headspace', path: '/headspace', label: 'Headspace mapper', icon: 'headspace', systemOnly: true },
      { id: 'system-history', path: '/system-history', label: 'System history', icon: 'history', systemOnly: true },
      { id: 'achievements', path: '/achievements', label: 'Achievements', icon: 'achievement' },
      { id: 'flags', path: '/flags', label: 'Flags', icon: 'flag' },
    ],
  },
  {
    id: 'life',
    label: 'Life',
    icon: 'life',
    items: [
      { id: 'calendar', path: '/calendar', label: 'Calendar', icon: 'calendar', primary: true, quickAction: true },
      { id: 'tasks', path: '/tasks', label: 'Tasks', icon: 'task', primary: true, quickAction: true },
      { id: 'notes', path: '/notes', label: 'Notes', icon: 'note', quickAction: true },
      { id: 'contacts', path: '/contacts', label: 'Contacts', icon: 'contact' },
      { id: 'emergency', path: '/emergency', label: 'Emergency contacts', icon: 'emergency' },
      { id: 'locations', path: '/locations', label: 'Locations', icon: 'location' },
      { id: 'sleep', path: '/sleep', label: 'Sleep', icon: 'sleep' },
      { id: 'wellbeing', path: '/wellbeing', label: 'Wellbeing', icon: 'wellbeing', quickAction: true },
      { id: 'emotions', path: '/emotions', label: 'Emotions', icon: 'emotion', quickAction: true },
      { id: 'body-map', path: '/body-map', label: 'Body sensations', icon: 'body' },
      { id: 'emotion-insights', path: '/emotion-insights', label: 'Emotion insights', icon: 'insight' },
      { id: 'cycle', path: '/cycle', label: 'Cycle & wellness', icon: 'cycle' },
      { id: 'fitness', path: '/fitness', label: 'Fitness', icon: 'fitness' },
      { id: 'finances', path: '/finances', label: 'Finances', icon: 'finance' },
      { id: 'work', path: '/work', label: 'Work', icon: 'work' },
    ],
  },
  {
    id: 'social',
    label: 'Social',
    icon: 'social',
    items: [
      { id: 'constellations', path: '/constellations', label: 'Constellations', icon: 'constellation' },
      { id: 'friends', path: '/friends', label: 'Friends', icon: 'friend', badge: 'friendRequests' },
      { id: 'flux', path: '/flux', label: 'Flux', icon: 'flux', primary: true, badge: 'flux' },
      { id: 'messages', path: '/messages', label: 'Messages', icon: 'message', primary: true, badge: 'messages' },
    ],
  },
  {
    id: 'create',
    label: 'Create',
    icon: 'create',
    items: [
      { id: 'media', path: '/media', label: 'Media library', icon: 'media' },
      { id: 'music', path: '/music', label: 'Music', icon: 'music' },
      { id: 'video', path: '/video', label: 'Video', icon: 'video' },
      { id: 'characters', path: '/characters', label: 'Characters', icon: 'character' },
      { id: 'stories', path: '/stories', label: 'Story builder', icon: 'story' },
      { id: 'fics', path: '/fics', label: 'Fic tracker', icon: 'fic' },
      { id: 'resources', path: '/resources', label: 'Resources', icon: 'resource' },
      { id: 'dictionary', path: '/dictionary', label: 'Dictionary', icon: 'dictionary' },
      { id: 'templates', path: '/templates', label: 'My templates', icon: 'template' },
    ],
  },
  {
    id: 'more',
    label: 'More',
    icon: 'more',
    items: [
      { id: 'notifications', path: '/notifications', label: 'Notifications', icon: 'notification', badge: 'notifications' },
      { id: 'vault', path: '/vault', label: 'Private vault', icon: 'vault' },
      { id: 'backup', path: '/backup', label: 'Backup & restore', icon: 'backup' },
      { id: 'import', path: '/import', label: 'Import', icon: 'import' },
      { id: 'settings', path: '/settings', label: 'Settings', icon: 'settings' },
      { id: 'features', path: '/features', label: 'Features', icon: 'features' },
      { id: 'help', path: '/help', label: 'Help', icon: 'help' },
    ],
  },
];

export const ALL_NAV_ITEMS: readonly NavItem[] = NAVIGATION.flatMap((c) =>
  c.items.map((item) => ({ ...item, systemOnly: item.systemOnly || c.systemOnly })),
);

export function navItemsForMode(mode: AppMode): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) => mode === 'system' || !item.systemOnly);
}

/**
 * Nav items a system never sees `hiddenModules` hide, because there would be
 * no way back: `dashboard` is the app's own index route, and `settings` is
 * where `hiddenModules` itself is edited.
 */
export const ALWAYS_VISIBLE_NAV_IDS: readonly string[] = ['dashboard', 'settings'];

export function categoriesForMode(mode: AppMode, hidden: readonly string[] = []): NavCategory[] {
  const hiddenSet = new Set(hidden);
  return NAVIGATION.filter((c) => mode === 'system' || !c.systemOnly)
    .map((c) => ({
      ...c,
      items: c.items.filter(
        (i) => (mode === 'system' || !i.systemOnly) && (!hiddenSet.has(i.id) || ALWAYS_VISIBLE_NAV_IDS.includes(i.id)),
      ),
    }))
    .filter((c) => c.items.length > 0);
}

/** Default bottom-bar layout. Users can replace any slot from settings. */
export const DEFAULT_MOBILE_TABS: readonly string[] = [
  'dashboard',
  'whos-there',
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
  { id: 'journal', label: 'New journal entry', icon: 'journal', path: '/journal?new=1' },
  { id: 'mood', label: 'Log a mood', icon: 'mood', path: '/wellbeing?new=mood' },
  { id: 'emotion', label: 'Log an emotion', icon: 'emotion', path: '/emotions?new=1' },
  { id: 'note', label: 'New note', icon: 'note', path: '/notes?new=1' },
  { id: 'task', label: 'New task', icon: 'task', path: '/tasks?new=1' },
  { id: 'event', label: 'New event', icon: 'calendar', path: '/calendar?new=1' },
  { id: 'member', label: 'Add a member', icon: 'member', path: '/members?new=1', systemOnly: true },
  { id: 'poll', label: 'New poll', icon: 'poll', path: '/polls?new=1', systemOnly: true },
];
