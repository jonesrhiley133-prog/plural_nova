import { applyTerminology, type Terminology } from './terminology.js';

/**
 * The string catalogue.
 *
 * Every visible string in the app resolves through here. Two rules make that
 * worth the indirection:
 *
 *   1. A string is never written inline in a component, so a translator sees the
 *      whole surface in one place.
 *   2. Anything that refers to people or the system uses a terminology token
 *      (`{{member}}`, `{{Members}}`, `{{fronting}}`) instead of a fixed word, so
 *      changing terminology in settings changes the whole app rather than one
 *      screen.
 *
 * Missing keys fall back to English, then to the key itself — never to blank.
 */

export type StringKey = keyof typeof EN;
export type StringTable = Partial<Record<string, string>>;

export const EN = {
  // — Chrome ————————————————————————————————————————————————
  'app.tagline': 'A private constellation for your {{system}}.',
  'app.loading': 'Loading…',
  'app.offline': 'Offline — changes are saved here and will sync when you reconnect.',
  'app.syncing': 'Syncing…',
  'app.synced': 'All changes saved',
  'app.syncFailed': 'Sync paused',
  'app.retry': 'Retry',
  'app.pendingChanges': '{count} change(s) waiting to sync',

  // — Common actions ————————————————————————————————————————
  'action.save': 'Save',
  'action.saving': 'Saving…',
  'action.cancel': 'Cancel',
  'action.close': 'Close',
  'action.delete': 'Delete',
  'action.edit': 'Edit',
  'action.create': 'Create',
  'action.add': 'Add',
  'action.done': 'Done',
  'action.back': 'Back',
  'action.next': 'Next',
  'action.skip': 'Skip',
  'action.confirm': 'Confirm',
  'action.search': 'Search',
  'action.filter': 'Filter',
  'action.sort': 'Sort',
  'action.clear': 'Clear',
  'action.select': 'Select',
  'action.duplicate': 'Duplicate',
  'action.archive': 'Archive',
  'action.restore': 'Restore',
  'action.export': 'Export',
  'action.import': 'Import',
  'action.viewAll': 'View all',
  'action.more': 'More',
  'action.undo': 'Undo',
  'action.pin': 'Pin',
  'action.unpin': 'Unpin',
  'action.refresh': 'Refresh',
  'action.openSettings': 'Open settings',

  // — Auth ——————————————————————————————————————————————————
  'auth.welcome': 'Welcome to PluralNova',
  'auth.welcomeBody':
    'A private place to keep track of your {{system}} — who is around, how things are going, and everything else you want to hold onto.',
  'auth.signIn': 'Sign in',
  'auth.signUp': 'Create an account',
  'auth.signOut': 'Sign out',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.confirmPassword': 'Confirm password',
  'auth.displayName': 'What should we call you?',
  'auth.forgotPassword': 'Forgotten your password?',
  'auth.resetPassword': 'Reset password',
  'auth.resetSent': 'If that email has an account, a reset code is on its way.',
  'auth.resetCode': 'Reset code',
  'auth.newPassword': 'New password',
  'auth.recovery': 'Account recovery',
  'auth.recoveryBody': 'Use a recovery code you saved when you created the account.',
  'auth.guestMode': 'Explore with demo data',
  'auth.guestBody':
    'A complete example {{system}} you can look around. Nothing is sent anywhere, and you can turn it into a real account later.',
  'auth.accountRequired': 'This needs an account',
  'auth.accountRequiredBody':
    'Signing in keeps your data on your devices in sync and lets you use the social features. Your {{journal}}, members and history stay private either way.',
  'auth.noAccount': 'No account yet?',
  'auth.haveAccount': 'Already have an account?',
  'auth.invalidCredentials': 'That email and password do not match.',
  'auth.emailTaken': 'There is already an account with that email.',
  'auth.deleteAccount': 'Delete account',
  'auth.deleteAccountBody':
    'This permanently removes your account and everything in it. Export a backup first if you want to keep anything.',

  // — Onboarding ————————————————————————————————————————————
  'onboarding.privacyTitle': 'What PluralNova does with your data',
  'onboarding.privacyBody':
    'Everything you write is private by default and stored under your account. Nothing is shared until you choose to share it, and you can export or delete all of it at any time.',
  'onboarding.featuresTitle': 'What is in here',
  'onboarding.modeTitle': 'How do you want to use PluralNova?',
  'onboarding.modeSystem': 'System Mode',
  'onboarding.modeSystemBody':
    'Track members, {{fronting}}, relationships and everything that comes with being a {{system}}.',
  'onboarding.modeSinglet': 'Singlet Mode',
  'onboarding.modeSingletBody':
    'Hide the {{system}}-specific features and keep the journalling, planning and wellbeing tools.',
  'onboarding.profileTitle': 'Tell us about your {{system}}',
  'onboarding.membersTitle': 'Add your first {{members}}',
  'onboarding.membersBody': 'You can skip this and add people whenever you like.',
  'onboarding.themeTitle': 'Choose how it looks',
  'onboarding.notificationsTitle': 'Notifications',
  'onboarding.notificationsBody':
    'Reminders for events, tasks and messages. You choose which ones, and you can change it later.',
  'onboarding.terminologyTitle': 'Your words',
  'onboarding.terminologyBody':
    'PluralNova uses whatever words you use. Change any of these now or later in settings — it applies everywhere in the app.',
  'onboarding.finishTitle': 'You are set up',
  'onboarding.demoData': 'Add example data I can delete later',

  // — Dashboard —————————————————————————————————————————————
  'dashboard.title': 'Dashboard',
  'dashboard.greeting': 'Hello, {name}',
  'dashboard.customise': 'Customise dashboard',
  'dashboard.noWidgets': 'No widgets are switched on yet.',
  'dashboard.quickActions': 'Quick actions',

  // — Fronting ——————————————————————————————————————————————
  'front.whosThere': "Who's there",
  'front.current': 'Currently {{fronting}}',
  'front.noOne': 'Nobody is marked as {{fronting}}',
  'front.noOneBody': 'That is a valid state — record it, or leave it blank until you know.',
  'front.cofronting': 'Co-{{fronting}}',
  'front.recent': 'Recently {{fronting}}',
  'front.notFronting': 'Not {{fronting}}',
  'front.since': 'Since {time}',
  'front.forDuration': 'for {duration}',
  'front.quickFront': 'Quick {{front}}',
  'front.start': 'Start {{fronting}}',
  'front.end': 'End {{front}}',
  'front.switch': 'Record a {{switch}}',
  'front.clear': 'Clear the {{front}}',
  'front.unknown': 'Unknown',
  'front.unknownBody': 'Record that someone was {{fronting}} without naming them.',
  'front.selectMembers': 'Who is {{fronting}}?',
  'front.addCofronter': 'Add a {{cofronter}}',
  'front.activeSince': 'Active since {time}',
  'front.logged': '{{Front}} recorded',
  'front.ended': '{{Front}} ended after {duration}',
  'front.editEvent': 'Edit this {{front}}',
  'front.duplicateWarning': 'There is already an open {{front}}. End it first, or record this as a co-{{front}}.',

  // — Members ———————————————————————————————————————————————
  'members.title': '{{Members}}',
  'members.empty': 'No {{members}} yet',
  'members.emptyBody':
    'Add someone, bring people in from a backup, or carry on without a roster — the rest of the app works either way.',
  'members.create': 'Add a {{member}}',
  'members.import': 'Import {{members}}',
  'members.continueWithout': 'Continue as a {{system}}',
  'members.profile': 'Profile',
  'members.overview': 'Overview',
  'members.identity': 'Identity',
  'members.about': 'About',
  'members.interests': 'Interests',
  'members.boundaries': 'Boundaries',
  'members.statistics': 'Statistics',
  'members.deleteConfirm':
    'Delete {name}? Their {{journal}} entries, {{fronting}} history and relationships stay, but they will no longer be listed. This moves them to the trash for 30 days.',
  'members.count': '{count} {{members}}',

  // — Profile select ————————————————————————————————————————
  'profiles.title': "Who's using PluralNova?",
  'profiles.subtitle': 'Pick a profile. You can switch at any time.',
  'profiles.system': 'Whole {{system}}',
  'profiles.enterPin': 'Enter {name}’s PIN',
  'profiles.wrongPin': 'That PIN is not right.',
  'profiles.manage': 'Manage profiles',

  // — Journal ———————————————————————————————————————————————
  'journal.title': '{{Journal}}',
  'journal.empty': 'Nothing written yet',
  'journal.emptyBody': 'The first entry is the hardest. It can be one line.',
  'journal.new': 'New entry',
  'journal.writtenBy': 'Written by',
  'journal.wholeSystem': 'The whole {{system}}',
  'journal.private': 'Only me',

  // — Generic list/detail ——————————————————————————————————
  'list.empty': 'Nothing here yet',
  'list.emptyBody': 'Add the first one to get started.',
  'list.searchPlaceholder': 'Search {label}…',
  'list.resultCount': '{count} result(s)',
  'list.noResults': 'No matches',
  'list.noResultsBody': 'Try a different search, or clear the filters.',
  'list.loadMore': 'Load more',
  'list.showing': 'Showing {shown} of {total}',
  'list.untitled': 'Untitled',

  // — Errors ————————————————————————————————————————————————
  'error.title': 'Something went wrong',
  'error.generic': 'That did not work. Nothing was changed.',
  'error.network': 'Could not reach PluralNova. Your changes are saved on this device.',
  'error.notFound': 'That is not here any more.',
  'error.notFoundBody': 'It may have been deleted, or the link may be out of date.',
  'error.forbidden': 'You do not have access to that.',
  'error.loadMessages': 'Unable to load messages',
  'error.loadFailed': 'Unable to load {label}',
  'error.saveFailed': 'Unable to save {label}',
  'error.vaultLocked': 'The vault is locked',
  'error.rateLimited': 'Too many attempts. Try again in a moment.',
  'error.serverDown': 'PluralNova is not responding. This is on our side, not yours.',
  'error.reportDetails': 'Technical details',

  // — Confirmations —————————————————————————————————————————
  'confirm.deleteTitle': 'Delete {label}?',
  'confirm.deleteBody': 'It moves to the trash and can be restored for 30 days.',
  'confirm.permanentTitle': 'Delete {label} permanently?',
  'confirm.permanentBody': 'This cannot be undone.',
  'confirm.typeToConfirm': 'Type {word} to confirm',

  // — Wellbeing —————————————————————————————————————————————
  'wellbeing.title': 'Wellbeing',
  'wellbeing.disclaimer':
    'These are your own notes, not an assessment. PluralNova describes what you recorded and nothing more.',
  'wellbeing.checkIn': 'Check in',
  'emotions.title': 'Emotions',
  'emotions.choose': 'What is it closest to?',
  'emotions.intensity': 'How strong is it?',
  'emotions.context': 'What is going on?',
  'emotions.who': 'Who is this for?',
  'emotions.saved': 'Recorded',
  'body.title': 'Body sensations',
  'body.choose': 'Where in the body?',
  'body.whatKind': 'What does it feel like?',

  // — Social ————————————————————————————————————————————————
  'social.friends': 'Friends',
  'social.requests': 'Requests',
  'social.addFriend': 'Add friend',
  'social.accept': 'Accept',
  'social.decline': 'Decline',
  'social.remove': 'Remove friend',
  'social.block': 'Block',
  'social.unblock': 'Unblock',
  'social.mute': 'Mute',
  'social.messageRequest': 'Message request',
  'social.sendMessage': 'Send a message',
  'social.postAs': 'Posting as',
  'social.newPost': 'New post',
  'social.noPosts': 'Nothing in the feed yet',
  'social.noPostsBody': 'Posts from you and the systems you follow show up here.',
  'social.profilePrivate': 'This profile is private',
  'social.messagePlaceholder': 'Write a message…',
  'social.encrypted': 'Encrypted end to end',
  'social.notEncrypted': 'Not encrypted',
  'social.messageFailed': 'Not sent',
  'social.messageFailedBody': 'Tap to try again. Nothing was lost.',

  // — Notifications —————————————————————————————————————————
  'notifications.title': 'Notifications',
  'notifications.empty': 'Nothing new',
  'notifications.emptyBody': 'Reminders, messages and activity show up here.',
  'notifications.markAllRead': 'Mark all as read',
  'notifications.settings': 'Notification settings',
  'notifications.enable': 'Turn on notifications',
  'notifications.blocked': 'Your browser is blocking notifications for PluralNova.',
  'notifications.blockedBody': 'Allow them in your browser or system settings, then try again.',

  // — Data ——————————————————————————————————————————————————
  'backup.title': 'Backup & restore',
  'backup.export': 'Export everything',
  'backup.exportBody': 'One file with every record in your account. Keep it somewhere safe.',
  'backup.restore': 'Restore from a backup',
  'backup.restoreBody': 'Preview what is in a file before anything is written.',
  'backup.lastBackup': 'Last backup {when}',
  'backup.never': 'You have not exported a backup yet.',
  'import.title': 'Import',
  'import.summary': 'Imported {imported}, skipped {skipped}, {failed} could not be read.',
  'import.partial': 'Some records could not be imported. Everything else was kept.',

  // — Settings ——————————————————————————————————————————————
  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.terminology': 'Terminology',
  'settings.notifications': 'Notifications',
  'settings.privacy': 'Privacy',
  'settings.accessibility': 'Accessibility',
  'settings.performance': 'Performance',
  'settings.account': 'Account',
  'settings.data': 'Your data',
  'settings.about': 'About',
  'settings.mode': 'Mode',
  'settings.saved': 'Saved',

  // — Empty/loading —————————————————————————————————————————
  'state.loading': 'Loading {label}…',
  'state.offlineOnly': 'Shown from this device. Reconnect for the latest.',
} as const;

/** A second locale, kept partial on purpose: the fallback path is exercised in tests. */
export const ES: StringTable = {
  'action.save': 'Guardar',
  'action.cancel': 'Cancelar',
  'action.delete': 'Eliminar',
  'action.edit': 'Editar',
  'action.create': 'Crear',
  'action.add': 'Añadir',
  'action.close': 'Cerrar',
  'action.search': 'Buscar',
  'action.done': 'Hecho',
  'action.back': 'Atrás',
  'action.next': 'Siguiente',
  'auth.signIn': 'Iniciar sesión',
  'auth.signUp': 'Crear una cuenta',
  'auth.signOut': 'Cerrar sesión',
  'auth.email': 'Correo electrónico',
  'auth.password': 'Contraseña',
  'dashboard.title': 'Panel',
  'front.whosThere': '¿Quién está?',
  'front.current': 'Ahora al {{front}}',
  'journal.title': '{{Journal}}',
  'list.empty': 'Todavía no hay nada aquí',
  'notifications.title': 'Notificaciones',
  'settings.title': 'Ajustes',
  'error.generic': 'No ha funcionado. No se ha cambiado nada.',
};

export interface LocaleDef {
  code: string;
  label: string;
  table: StringTable;
  /** Percentage of English keys covered — shown in settings so the gap is honest. */
  coverage: number;
}

function coverageOf(table: StringTable): number {
  const total = Object.keys(EN).length;
  const covered = Object.keys(EN).filter((key) => table[key] !== undefined).length;
  return Math.round((covered / total) * 100);
}

export const LOCALES: readonly LocaleDef[] = [
  { code: 'en', label: 'English', table: EN as unknown as StringTable, coverage: 100 },
  { code: 'es', label: 'Español', table: ES, coverage: coverageOf(ES) },
];

export function localeTable(code: string): StringTable {
  return LOCALES.find((l) => l.code === code)?.table ?? (EN as unknown as StringTable);
}

const PARAM = /\{(\w+)\}/g;

export interface TranslateOptions {
  locale?: string;
  terms?: Terminology;
  params?: Record<string, string | number>;
}

/**
 * Resolves a key to a finished string: locale table → English → the key itself,
 * then terminology tokens, then `{param}` substitution. A missing parameter
 * leaves its placeholder visible rather than printing "undefined".
 */
export function translate(key: string, options: TranslateOptions = {}): string {
  const table = localeTable(options.locale ?? 'en');
  const raw = table[key] ?? (EN as Record<string, string>)[key] ?? key;
  const withTerms = options.terms ? applyTerminology(raw, options.terms) : raw;
  if (!options.params) return withTerms;
  return withTerms.replace(PARAM, (match, name: string) => {
    const value = options.params?.[name];
    return value === undefined ? match : String(value);
  });
}

/** Simple English pluralisation for counted labels: `1 entry`, `4 entries`. */
export function pluralise(count: number, one: string, other?: string): string {
  return count === 1 ? one : other ?? `${one}s`;
}

/** Replaces "(s)" in a catalogue string with the right form for `count`. */
export function withCount(template: string, count: number): string {
  return template.replace(/\(s\)/g, count === 1 ? '' : 's').replace('{count}', String(count));
}
