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
  'journal.subtitle': 'Your thoughts, your space.',
  'journal.empty': 'Nothing written yet',
  'journal.emptyBody': 'The first entry is the hardest. It can be one line.',
  'journal.new': 'New entry',
  'journal.writtenBy': 'Written by',
  'journal.wholeSystem': 'The whole {{system}}',
  'journal.allEntries': 'All entries',
  'journal.myEntries': 'My entries',
  'journal.membersTab': '{{Members}}',
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
  'social.encryptedFromHere': 'Encrypted from here on',
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
  /*
   * Complete, so the locale picker is not advertising a language the app only
   * half speaks.
   *
   * Terminology tokens are left exactly as they are — `{{member}}` resolves to
   * whatever word a system chose, in whatever language they chose it, and a
   * translation that replaced one with a fixed Spanish noun would quietly undo
   * that. Phrasing avoids gendering people where Spanish would normally force
   * it, for the same reason the tokens exist: the app does not get to decide
   * how somebody refers to themselves.
   */

  'app.tagline': 'Una constelación privada para tu {{system}}.',
  'app.loading': 'Cargando…',
  'app.offline': 'Sin conexión — los cambios se guardan aquí y se sincronizarán al reconectar.',
  'app.syncing': 'Sincronizando…',
  'app.synced': 'Todos los cambios guardados',
  'app.syncFailed': 'Sincronización en pausa',
  'app.retry': 'Reintentar',
  'app.pendingChanges': '{count} cambio(s) esperando a sincronizarse',
  'action.save': 'Guardar',
  'action.saving': 'Guardando…',
  'action.cancel': 'Cancelar',
  'action.close': 'Cerrar',
  'action.delete': 'Eliminar',
  'action.edit': 'Editar',
  'action.create': 'Crear',
  'action.add': 'Añadir',
  'action.done': 'Hecho',
  'action.back': 'Atrás',
  'action.next': 'Siguiente',
  'action.skip': 'Omitir',
  'action.confirm': 'Confirmar',
  'action.search': 'Buscar',
  'action.filter': 'Filtrar',
  'action.sort': 'Ordenar',
  'action.clear': 'Limpiar',
  'action.select': 'Seleccionar',
  'action.duplicate': 'Duplicar',
  'action.archive': 'Archivar',
  'action.restore': 'Restaurar',
  'action.export': 'Exportar',
  'action.import': 'Importar',
  'action.viewAll': 'Ver todo',
  'action.more': 'Más',
  'action.undo': 'Deshacer',
  'action.pin': 'Fijar',
  'action.unpin': 'Dejar de fijar',
  'action.refresh': 'Actualizar',
  'action.openSettings': 'Abrir ajustes',
  'auth.welcome': 'Te damos la bienvenida a PluralNova',
  'auth.welcomeBody': 'Un lugar privado para llevar la cuenta de tu {{system}}: quién anda por aquí, cómo va todo y cualquier otra cosa que quieras conservar.',
  'auth.signIn': 'Iniciar sesión',
  'auth.signUp': 'Crear una cuenta',
  'auth.signOut': 'Cerrar sesión',
  'auth.email': 'Correo electrónico',
  'auth.password': 'Contraseña',
  'auth.confirmPassword': 'Confirmar contraseña',
  'auth.displayName': '¿Cómo te llamamos?',
  'auth.forgotPassword': '¿Has olvidado la contraseña?',
  'auth.resetPassword': 'Restablecer contraseña',
  'auth.resetSent': 'Si ese correo tiene una cuenta, el código de restablecimiento va en camino.',
  'auth.resetCode': 'Código de restablecimiento',
  'auth.newPassword': 'Contraseña nueva',
  'auth.recovery': 'Recuperar la cuenta',
  'auth.recoveryBody': 'Usa un código de recuperación que guardaste al crear la cuenta.',
  'auth.guestMode': 'Explorar con datos de ejemplo',
  'auth.guestBody': 'Un {{system}} de ejemplo completo para mirar con calma. No se envía nada a ninguna parte y luego puedes convertirlo en una cuenta real.',
  'auth.accountRequired': 'Esto necesita una cuenta',
  'auth.accountRequiredBody': 'Iniciar sesión mantiene tus datos sincronizados entre dispositivos y te permite usar las funciones sociales. Tu {{journal}}, los miembros y el historial siguen siendo privados en cualquier caso.',
  'auth.noAccount': '¿Aún no tienes cuenta?',
  'auth.haveAccount': '¿Ya tienes una cuenta?',
  'auth.invalidCredentials': 'Ese correo y esa contraseña no coinciden.',
  'auth.emailTaken': 'Ya existe una cuenta con ese correo.',
  'auth.deleteAccount': 'Eliminar la cuenta',
  'auth.deleteAccountBody': 'Esto borra tu cuenta y todo lo que contiene, de forma permanente. Exporta una copia de seguridad antes si quieres conservar algo.',
  'onboarding.privacyTitle': 'Qué hace PluralNova con tus datos',
  'onboarding.privacyBody': 'Todo lo que escribes es privado de forma predeterminada y se guarda en tu cuenta. No se comparte nada hasta que tú decidas compartirlo, y puedes exportarlo o eliminarlo todo cuando quieras.',
  'onboarding.featuresTitle': 'Qué hay aquí dentro',
  'onboarding.modeTitle': '¿Cómo quieres usar PluralNova?',
  'onboarding.modeSystem': 'Modo Sistema',
  'onboarding.modeSystemBody': 'Lleva la cuenta de los miembros, del {{fronting}}, de las relaciones y de todo lo que implica ser un {{system}}.',
  'onboarding.modeSinglet': 'Modo Individual',
  'onboarding.modeSingletBody': 'Oculta las funciones propias de un {{system}} y conserva las de diario, organización y bienestar.',
  'onboarding.profileTitle': 'Cuéntanos sobre tu {{system}}',
  'onboarding.membersTitle': 'Añade tus primeros {{members}}',
  'onboarding.membersBody': 'Puedes omitir esto y añadir gente cuando te apetezca.',
  'onboarding.themeTitle': 'Elige cómo se ve',
  'onboarding.notificationsTitle': 'Notificaciones',
  'onboarding.notificationsBody': 'Recordatorios de eventos, tareas y mensajes. Tú eliges cuáles, y puedes cambiarlo más adelante.',
  'onboarding.terminologyTitle': 'Vuestras palabras',
  'onboarding.terminologyBody': 'PluralNova usa las palabras que uséis vosotros. Cambia cualquiera de estas ahora o más tarde en los ajustes: se aplican en toda la aplicación.',
  'onboarding.finishTitle': 'Todo listo',
  'onboarding.demoData': 'Añadir datos de ejemplo que pueda borrar luego',
  'dashboard.title': 'Panel',
  'dashboard.greeting': 'Hola, {name}',
  'dashboard.customise': 'Personalizar el panel',
  'dashboard.noWidgets': 'Todavía no hay ningún widget activado.',
  'dashboard.quickActions': 'Acciones rápidas',
  'front.whosThere': '¿Quién está?',
  'front.current': 'Ahora en {{fronting}}',
  'front.noOne': 'Nadie está marcado como {{fronting}}',
  'front.noOneBody': 'Ese es un estado válido: regístralo, o déjalo en blanco hasta que lo sepáis.',
  'front.cofronting': 'Co-{{fronting}}',
  'front.recent': 'Recientemente en {{fronting}}',
  'front.notFronting': 'No está en {{fronting}}',
  'front.since': 'Desde {time}',
  'front.forDuration': 'durante {duration}',
  'front.quickFront': 'Registro rápido de {{front}}',
  'front.start': 'Empezar {{fronting}}',
  'front.end': 'Terminar el {{front}}',
  'front.switch': 'Registrar un {{switch}}',
  'front.clear': 'Vaciar el {{front}}',
  'front.unknown': 'Sin identificar',
  'front.unknownBody': 'Registra que alguien estaba en {{fronting}} sin decir quién.',
  'front.selectMembers': '¿Quién está en {{fronting}}?',
  'front.addCofronter': 'Añadir un {{cofronter}}',
  'front.activeSince': 'Activo desde {time}',
  'front.logged': '{{Front}} registrado',
  'front.ended': '{{Front}} terminado tras {duration}',
  'front.editEvent': 'Editar este {{front}}',
  'front.duplicateWarning': 'Ya hay un {{front}} abierto. Termínalo primero, o registra este como un co-{{front}}.',
  'members.title': '{{Members}}',
  'members.empty': 'Todavía no hay {{members}}',
  'members.emptyBody': 'Añade a alguien, tráete gente desde una copia de seguridad, o sigue sin una lista: el resto de la aplicación funciona igual.',
  'members.create': 'Añadir un {{member}}',
  'members.import': 'Importar {{members}}',
  'members.continueWithout': 'Seguir como {{system}}',
  'members.profile': 'Perfil',
  'members.overview': 'Resumen',
  'members.identity': 'Identidad',
  'members.about': 'Acerca de',
  'members.interests': 'Intereses',
  'members.boundaries': 'Límites',
  'members.statistics': 'Estadísticas',
  'members.deleteConfirm': '¿Eliminar a {name}? Sus entradas del {{journal}}, su historial de {{fronting}} y sus relaciones se conservan, pero dejará de aparecer en la lista. Esto lo mueve a la papelera durante 30 días.',
  'members.count': '{count} {{members}}',
  'profiles.title': '¿Quién está usando PluralNova?',
  'profiles.subtitle': 'Elige un perfil. Puedes cambiar cuando quieras.',
  'profiles.system': 'Todo el {{system}}',
  'profiles.enterPin': 'Introduce el PIN de {name}',
  'profiles.wrongPin': 'Ese PIN no es correcto.',
  'profiles.manage': 'Gestionar perfiles',
  'journal.title': '{{Journal}}',
  'journal.subtitle': 'Tus pensamientos, tu espacio.',
  'journal.empty': 'Todavía no hay nada escrito',
  'journal.emptyBody': 'La primera entrada es la más difícil. Puede ser una sola línea.',
  'journal.new': 'Entrada nueva',
  'journal.writtenBy': 'Escrito por',
  'journal.wholeSystem': 'Todo el {{system}}',
  'journal.allEntries': 'Todas las entradas',
  'journal.myEntries': 'Mis entradas',
  'journal.membersTab': '{{Members}}',
  'journal.private': 'Solo yo',
  'list.empty': 'Todavía no hay nada aquí',
  'list.emptyBody': 'Añade el primero para empezar.',
  'list.searchPlaceholder': 'Buscar en {label}…',
  'list.resultCount': '{count} resultado(s)',
  'list.noResults': 'Sin coincidencias',
  'list.noResultsBody': 'Prueba con otra búsqueda, o quita los filtros.',
  'list.loadMore': 'Cargar más',
  'list.showing': 'Mostrando {shown} de {total}',
  'list.untitled': 'Sin título',
  'error.title': 'Algo ha ido mal',
  'error.generic': 'No ha funcionado. No se ha cambiado nada.',
  'error.network': 'No se ha podido contactar con PluralNova. Tus cambios están guardados en este dispositivo.',
  'error.notFound': 'Esto ya no está aquí.',
  'error.notFoundBody': 'Puede que se haya eliminado, o que el enlace esté anticuado.',
  'error.forbidden': 'No tienes acceso a eso.',
  'error.loadMessages': 'No se han podido cargar los mensajes',
  'error.loadFailed': 'No se ha podido cargar {label}',
  'error.saveFailed': 'No se ha podido guardar {label}',
  'error.vaultLocked': 'La caja fuerte está cerrada',
  'error.rateLimited': 'Demasiados intentos. Inténtalo de nuevo en un momento.',
  'error.serverDown': 'PluralNova no responde. El problema es nuestro, no tuyo.',
  'error.reportDetails': 'Detalles técnicos',
  'confirm.deleteTitle': '¿Eliminar {label}?',
  'confirm.deleteBody': 'Se mueve a la papelera y se puede restaurar durante 30 días.',
  'confirm.permanentTitle': '¿Eliminar {label} de forma permanente?',
  'confirm.permanentBody': 'Esto no se puede deshacer.',
  'confirm.typeToConfirm': 'Escribe {word} para confirmar',
  'wellbeing.title': 'Bienestar',
  'wellbeing.disclaimer': 'Esto son tus propias notas, no una evaluación. PluralNova describe lo que has registrado y nada más.',
  'wellbeing.checkIn': 'Registrar cómo estás',
  'emotions.title': 'Emociones',
  'emotions.choose': '¿A qué se parece más?',
  'emotions.intensity': '¿Con cuánta fuerza?',
  'emotions.context': '¿Qué está pasando?',
  'emotions.who': '¿Para quién es esto?',
  'emotions.saved': 'Registrado',
  'body.title': 'Sensaciones del cuerpo',
  'body.choose': '¿En qué parte del cuerpo?',
  'body.whatKind': '¿Cómo se siente?',
  'social.friends': 'Amistades',
  'social.requests': 'Solicitudes',
  'social.addFriend': 'Añadir amistad',
  'social.accept': 'Aceptar',
  'social.decline': 'Rechazar',
  'social.remove': 'Quitar de amistades',
  'social.block': 'Bloquear',
  'social.unblock': 'Desbloquear',
  'social.mute': 'Silenciar',
  'social.messageRequest': 'Solicitud de mensaje',
  'social.sendMessage': 'Enviar un mensaje',
  'social.postAs': 'Publicando como',
  'social.newPost': 'Publicación nueva',
  'social.noPosts': 'Todavía no hay nada en el muro',
  'social.noPostsBody': 'Aquí aparecen las publicaciones tuyas y de los sistemas que sigues.',
  'social.profilePrivate': 'Este perfil es privado',
  'social.messagePlaceholder': 'Escribe un mensaje…',
  'social.encrypted': 'Cifrado de extremo a extremo',
  'social.notEncrypted': 'Sin cifrar',
  'social.encryptedFromHere': 'Cifrado a partir de aquí',
  'social.messageFailed': 'No enviado',
  'social.messageFailedBody': 'Toca para reintentar. No se ha perdido nada.',
  'notifications.title': 'Notificaciones',
  'notifications.empty': 'Nada nuevo',
  'notifications.emptyBody': 'Aquí aparecen los recordatorios, los mensajes y la actividad.',
  'notifications.markAllRead': 'Marcar todo como leído',
  'notifications.settings': 'Ajustes de notificaciones',
  'notifications.enable': 'Activar las notificaciones',
  'notifications.blocked': 'Tu navegador está bloqueando las notificaciones de PluralNova.',
  'notifications.blockedBody': 'Permítelas en los ajustes del navegador o del sistema, y vuelve a intentarlo.',
  'backup.title': 'Copias de seguridad',
  'backup.export': 'Exportarlo todo',
  'backup.exportBody': 'Un archivo con todos los registros de tu cuenta. Guárdalo en un sitio seguro.',
  'backup.restore': 'Restaurar desde una copia',
  'backup.restoreBody': 'Mira lo que hay en el archivo antes de escribir nada.',
  'backup.lastBackup': 'Última copia {when}',
  'backup.never': 'Todavía no has exportado ninguna copia de seguridad.',
  'import.title': 'Importar',
  'import.summary': 'Importados {imported}, omitidos {skipped}, {failed} no se han podido leer.',
  'import.partial': 'Algunos registros no se han podido importar. Todo lo demás se ha conservado.',
  'settings.title': 'Ajustes',
  'settings.appearance': 'Apariencia',
  'settings.terminology': 'Terminología',
  'settings.notifications': 'Notificaciones',
  'settings.privacy': 'Privacidad',
  'settings.accessibility': 'Accesibilidad',
  'settings.performance': 'Rendimiento',
  'settings.account': 'Cuenta',
  'settings.data': 'Tus datos',
  'settings.about': 'Acerca de',
  'settings.mode': 'Modo',
  'settings.saved': 'Guardado',
  'state.loading': 'Cargando {label}…',
  'state.offlineOnly': 'Mostrado desde este dispositivo. Reconecta para ver lo último.',
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
