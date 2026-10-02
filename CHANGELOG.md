# Changelog

Notable changes to PluralNova. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The Android app's version comes from the same number: `1.2.3` becomes
versionCode `10203`, so the app, the server and the APK are never three
different versions of PluralNova.

## [Unreleased]

### Added

- **A new Reminders screen for a notification at a time you choose.** A
  title, an optional message, and a time — delivered through the same
  reminder sweep that already handles tasks, events, assignments and
  shifts, and through whichever channels Settings → Notifications has on
  for its own "Reminders" category. Reached from Life in the navigation.
- **The theme can now use a photo for its background.** Settings → Appearance
  gets a new Background image card, using the same upload-or-choose-existing
  flow as every other photo in the app. A fixed scrim sits behind the content
  and in front of the photo regardless of how it's set up, so a bright or
  busy picture can never make the text on top of it hard to read — the two
  controls that are yours to set are how visible the photo itself is and how
  much it's blurred, both live-previewed as you move them. Removing it goes
  straight back to the usual background.
- **Flux grew a photo, a repost, a bookmark, and a reply thread.** The
  composer now takes a photo — snapped or picked from the system's media
  library — alongside a post's words, the same upload flow custom fields
  already use. Every post can be reposted as-is or quoted with words of your
  own, both from a menu next to the existing reaction and comment buttons;
  a quote shows the original post underneath, one level deep, so quoting a
  repost never nests further than that one original. A post can also be
  bookmarked for later — a new Bookmarks page, reached from Flux's own
  header, lists everything saved regardless of which feed tab or scope it
  was found in. Comments can now reply to a specific earlier comment
  instead of only ever the post itself, shown inline as "replying to
  so-and-so" rather than a nested thread. A system's public profile also
  gained a Flux section of its own, showing what that system has actually
  posted, under the exact same visibility rules as the main feed — nothing
  shows there that a visitor couldn't already see in it.
- **Two new custom field types: Image and Gallery.** Image holds one picture
  shown as a thumbnail on the profile; Gallery holds any number, laid out as
  a grid, for things like a reference sheet or a set of fancasts. Both pick
  from the same upload dialog — snap or choose a new photo, or reuse
  anything already in the system's media library — and both appear, grouped
  and labelled, under a new "Media" category alongside the existing field
  types. Custom field groups (the free-text "Physical", "Identity", etc.
  grouping that already existed) are also more reliable now: reordering a
  field within a group can no longer accidentally jump it into a different
  group, and the management screen now visually groups fields the same way
  a member's profile already did, so the two views can't disagree about
  what belongs together.

### Changed

- **Messages are no longer end-to-end encrypted.** Every new message sent
  between accounts is now stored and delivered as plain text — the lock
  icon, the "End-to-end encrypted" / "Not encrypted yet" status, and the
  key-exchange step on opening a conversation are all gone, since none of
  them meant anything once nothing is actually being sealed. Older messages
  sent while encryption still existed are unaffected and still decrypt and
  display normally; nothing about them, or the history itself, changed. A
  long conversation in either Messages or In-Sys Chat also renders
  noticeably lighter now — only the messages actually on screen (plus a
  small buffer) are kept mounted while scrolling, the same way the member
  list already worked, rather than every message in the conversation at
  once.

### Fixed

- **The Android app could report notifications as "on" for a device they
  could no longer actually reach.** Firebase can rotate a device's push
  token on its own — a security-driven refresh on Google's side, not only
  when the app asks for one — and nothing told the server when that
  happened, so it kept sending to a token that no longer worked. The app
  now compares the token it is currently using against the one last given
  to the server every time it checks (including every time the app is
  reopened) and silently re-registers on a mismatch, instead of only ever
  checking once and trusting that forever.
- **Opening a dialog from inside another dialog — picking a photo from the
  Flux composer, say — could close both at once, or close the wrong one, on
  Escape.** Every open dialog listens for Escape independently, and with two
  listening at the same time the outer one (first to start listening) always
  ran first and closed itself, taking the inner one down with it before the
  dialog actually on top ever got a say. Escape now closes only whichever
  dialog is actually on top, and the page stays locked from scrolling until
  the last dialog underneath it closes too.
- **Deleting a flag left it attached to everything it was ever put on.**
  A flag and the records of what it is attached to are stored separately,
  and deleting the flag itself never cleaned up the attachments pointing at
  it. They stopped being shown, but kept accumulating in the database
  forever with nothing to ever clear them out — the flag's own trash icon
  now takes its attachments with it, and the one-time "delete for good"
  action a flag has no screen for yet does too.
- **Reordering a custom field could silently cross into a different
  group.** The "move up"/"move down" buttons on the field-management screen
  worked against the full flat list of fields rather than the fields in the
  field's own group, so a reorder near a group boundary could pull a field
  out of its group without any visible warning. Reordering is now scoped to
  the group a field is actually displayed in.

- **The account itself can now have a picture, a banner and a Markdown bio.**
  Settings → Account gets a profile card above the existing account details —
  entirely separate from a Constellation profile (public, discoverable, has
  its own handle) and from a member's own profile: nothing set here is
  ever sent to another account or shown on either of those. Constellation
  profiles also gain the editor for "custom information" rows — free-form
  labelled fields such as a fandom or a pronoun set — which the server and
  the public profile page already supported but which the owner's own editor
  had no way to actually create, and the bio field there now mentions that it
  too supports Markdown.
- **Real Markdown formatting, almost everywhere text is written.** Bios,
  notes, boundaries, personality/likes/dislikes, journal entries, Flux posts
  and comments, constellation profile bios, and story/character text all now
  render headings, **bold**, *italic*, ~~strikethrough~~, lists, quotes,
  links, images (including a `=300x200` sizing syntax), tables, fenced code
  blocks, checklists, and a `::: grid` container for placing two or more
  things side by side. It's sanitised twice before it ever reaches the
  screen — raw HTML is disabled in the parser itself, then the rendered
  output is filtered again against an explicit list of allowed tags — so a
  script tag or a `javascript:` link typed into someone's bio can never run.
  The custom-field type that already supported a small hand-rolled subset of
  this (bold, italic, code, line breaks) now goes through the same full
  renderer, and a new "Formatting text with Markdown" topic under Help shows
  every supported piece of syntax next to its own live, rendered example.
- **GIF search in both chat features.** The attach button opens a menu —
  Gallery, Camera, GIFs, Files — instead of going straight to a file picker.
  GIFs searches Tenor without Tenor ever seeing who is searching: the server
  proxies the lookup, and sending a result downloads it server-side and
  stores it the same way any other attachment is stored, so it stays usable
  offline and isn't a live link to Tenor's own servers. Optional and off by
  default — without a `PLURALNOVA_TENOR_API_KEY` set, GIFs says so plainly
  and Gallery, Camera and Files all still work.
- **School Life's second phase: extracurriculars, study timers, school
  check-ins, and deeper Journal and Calendar integration.** Track clubs,
  sports and anything else outside of class on their own roster, with hours
  logged against each one over time. Start a timed study session against a
  class the same way clocking in for work or logging a night of sleep
  already work — stop it and the exact duration is remembered, with recent
  sessions shown right on School Life's overview. A quick school-specific
  check-in captures how well today's material landed, how stressed school
  feels, and how heavy the workload is right now — separate from the app's
  existing Wellbeing check-in, which is about the whole system rather than
  school specifically. A journal entry can now optionally point at a class,
  and that class's own page shows every entry linked to it. The Calendar's
  side panel now reads upcoming assignment due dates straight from School
  Life, the same way it already reads birthdays straight from each alter's
  own profile — nothing is copied into the calendar's own event list, so
  editing or completing an assignment in School Life is immediately correct
  here too.
- **The alter editor is simplified.** The standard editor now shows only
  Name, Pronouns, Roles, Origin and Age as text fields, plus the existing
  profile picture, banner, colours and other non-text settings — Roles is
  now a real type-and-enter tag field using the alter's own colour, the
  same as their role chips already do. The Symbol field is retired from the
  UI (existing values are left in place, just no longer shown or editable).
  Every other text field that used to live on the standard editor — species,
  bio, notes, likes, triggers, and the rest — moves into Custom Fields
  instead, copied over automatically the first time a system-mode account
  loads after this update: nothing is deleted, re-answering the same field
  twice for the same alter is impossible, and a field nobody had ever filled
  in isn't invented out of thin air.

### Changed

- **Gallery now opens an actual photo gallery on Android, not the Files
  app.** The attach menu's Gallery option used to fall through to whatever
  generic document chooser the system offered, which on many devices is the
  Files app rather than a photo browser. It now asks for the Android system
  Photo Picker directly — swipeable, dismissed with a swipe down, no files-
  app chrome — on devices that have it, with Camera and Files unaffected.
- **Custom Field groups are more reliable.** Creating or editing a field now
  suggests group names already in use, so "Identity" and "identity" don't
  silently become two separate sections; grouping itself is now
  case-insensitive and trims stray whitespace. The unused "Section header"
  field type is no longer offered when adding a new field.
- **Identity Flags now works like the Media library.** Flags get an actual
  image instead of a short glyph, and the screen is an image-forward gallery
  instead of a plain list. Category and "show on profiles" are dropped from
  the create/edit form (existing values are untouched) — a flag is now just
  a name, a description, an image and a colour.
- **Quick Front is a genuine toggle.** Tapping an already-fronting alter now
  removes just that alter instead of doing nothing, correctly handling
  multiple people fronting together. The Dashboard's fronting card can now
  add or remove a fronter directly, without leaving the page.
- **Wide screens are used on the screens that benefit from it.** Members,
  Calendar, Finances, Stats and School Life's Analytics now use a wider
  column on a desktop or wide monitor. Profile pages, Journal, Settings and
  other reading-width content are unaffected, and nothing changes on a
  phone or tablet — this is a desktop-only expansion of the existing
  mobile-first layout.
- **Text size and UI zoom are now two separate settings instead of one
  disconnected switch.** "Larger text" is retired in favour of a Text Size
  picker (Small/Default/Large/Extra large) that drives every size token app-
  wide — nav, cards, buttons, forms, lists, chat — consistently. A new,
  separate UI Zoom setting scales the entire interface like a browser's own
  zoom, without the bottom nav, FABs or dialogs breaking loose from where
  they belong the way a naive scale transform would.

- **A new School Life category: classes, assignments, and academic analytics
  with a real GPA.** Track classes with your own weighted grading categories
  and meeting days, and assignments with due dates, types and status. A
  grade can live directly on a tracked assignment or be logged entirely on
  its own — whichever fits, and never double-counted when both point at the
  same piece of work. Academic Analytics turns all of it into percentages, a
  GPA computed against a grading scale you configure yourself rather than
  one this app assumes for you, a side-by-side comparison table of every
  class, a trend chart, and a plain, numbers-first note on which class is
  likely worth the most study time right now. Every screen can be scoped to
  the whole system or to one alter, the same as Fronting and Journal
  already work. This is the first phase — extracurriculars, check-ins,
  study timers, and deeper Journal/Calendar integration are still to come.
- **Push notifications now work on the native Android app, not just in a
  browser.** A plain WebView has no Web Push service behind it, so the app
  talks to Firebase Cloud Messaging instead — entirely optional, and off
  until a self-hoster sets up a Firebase project (see the Push notifications
  section of `android/README.md`). With nothing configured, the app works
  exactly as it did before; with it configured, turning on notifications in
  Settings on the phone registers this device the same way a browser
  subscription does, and tapping a notification opens the app to whatever it
  was about. Web Push in a browser, or a PWA installed from Chrome, is
  unaffected either way.
- **A separate switch to turn notifications inside the app off, distinct
  from push.** Settings → Notifications → Globally now has two independent
  switches: one for notifications outside the app (push, as before) and a
  new one for the notification centre and its badge count. Turning either
  off leaves the other exactly as it was.
- **A real numeric keypad on the app lock screen.** PIN entry now works the
  way a phone's own lock screen does — digit dots and a tappable 0-9 grid
  with a backspace key — instead of typing into a text field. A physical
  keyboard still works exactly as before for anyone who would rather type.
- **Direct Messages has its own visual identity, distinct from System
  Chat.** Same conversation list, same composer, same gestures — Direct
  Messages (the end-to-end encrypted, cross-account side of Chat) now reads
  as its own kind of place at a glance, with its own accent carried through
  the tab, unread markers and message bubbles, closer to a dedicated
  messaging app. System Chat (alters talking to each other, internal to the
  account) is completely unaffected and keeps the system's own theme accent
  — the two were already separate collections end to end; this only makes
  that separation visible.
- **A way back to the rest of the app from Chat.** Chat is the one screen
  that takes the full viewport, with no sidebar or bottom nav to fall back
  on — its conversation list had no way out at all before this, short of
  the browser's own back button.
- **Offline edits to different parts of the same record now both survive
  instead of one overwriting the other.** Two devices working apart — a bio
  changed on one, pronouns changed on another — merge cleanly the next time
  either reconnects; only an actual clash, the same field changed in both
  places, gets decided, and it's decided by whichever edit genuinely
  happened later rather than whichever device happened to sync first. If a
  value ever loses that decision it isn't gone: the sync indicator flags it
  for review, showing both versions with the choice to keep either one. An
  edit to something already deleted elsewhere is reported the same clean
  way, rather than being able to bring the record back.
- **Fronting works with no connection at all — switching, ending and clearing
  included, not just Quick Front.** Every fronting action now applies to the
  screen immediately and, if there is nowhere to send it yet, is kept and
  sent the next time a connection is available — the same optimistic
  approach Quick Front already used, now covering the full switch/end/clear/
  co-fronter set the main Fronting flow and the dashboard use. Nothing about
  fronting online changes; offline, none of it waits for a connection that
  isn't there any more.
- **The member directory scrolls smoothly with hundreds of members.** Every
  layout — squares, circles, slim banners, thick banners — now renders only
  the rows near what's on screen instead of the entire list at once, the way
  the rest of the app's screens already treat any list that can get long.
  Long-press multiselect, search, sort and Quick Front all work exactly the
  same; only the number of DOM nodes changes.
- **Long-press multiselect and bulk actions in the member directory.** Press
  and hold any member's card (mouse or touch — both behave the same way) to
  select several at once; a bulk-action bar then offers editing everyone
  selected's bio in one go, adding a custom field to all of them (only the
  field actually filled in changes — anything else already set on each
  member is left exactly as it was), moving them all into an existing or
  brand-new group, or deleting them together with one confirmation naming
  how many. A plain tap still opens a profile as it always has; only a press
  held for half a second enters selection mode.
- **Instant Quick Front from a member's own card or profile.** Tapping the
  bolt icon on a member's directory card or their profile banner fronts them
  immediately — no dialog, no navigating to the Quick Front screen, and no
  loading state, because fronting this way is a local fact applied on the
  spot rather than something worth waiting on a request for. It joins
  whoever is already out rather than replacing them, disables itself once
  that member is already fronting so a second tap can't double it up, and
  updates the dashboard and every other open screen at the same moment. If
  there is no connection yet, the tap still lands and is sent for real the
  next time one is available.
- **The member directory's layout choice is remembered.** Squares, circles,
  slim banners or thick banners — whichever was picked stays picked after
  closing the app, logging out, or switching devices, instead of quietly
  resetting to squares every time the screen opens.
- **Saved places.** A short, one-tap list of the places you go often — home,
  work, anywhere worth naming — on the Locations screen and as a Dashboard
  widget. Tapping one starts a timed visit; a live counter shows how long
  you've been there, ticking by the second, and "Stop" closes it out as an
  ordinary entry in your location history. Add, rename, reorder and delete
  saved places from the same screen. Deleting a saved place never touches
  the visits it already started — the link between them is a convenience,
  not a dependency.
- **Live estimated earnings while clocked in.** Clocking in now asks which
  workplace when there's more than one, then shows elapsed time, that
  workplace's hourly rate (or a shift's own rate override, when it has one),
  and a running estimate of what the shift has earned so far — all updating
  by the second. Every dollar figure across Work is now explicitly labelled
  an estimate, since PluralNova has no way to know about tax, tips, or a rate
  that changed mid-shift. The Work overview also gained a day/week/month
  toggle on estimated earnings, alongside the existing hours-by-day and
  by-workplace charts, and shift-by-shift estimates in the schedule list.
- **A much bigger emotion catalogue, with favourites, custom words and a way
  to browse all of it.** The built-in list grew from 144 to 212 words across
  the same 12 families. The log-an-emotion picker now offers an "All" view
  alongside the existing family filter and search, a starred Favourites
  section above Recently used, and — when a search turns up nothing — an
  inline way to add your own word to one of the 12 families. A custom
  emotion is usable everywhere a built-in one is, immediately.
- **App lock.** An optional 4–8 digit PIN over the whole app, separate from
  your account password, the private vault's own PIN, and any per-alter
  profile PINs. Turn it on from Settings → Privacy. Once set, PluralNova
  shows a lock screen instead of any of your data on launch, whenever the
  app is backgrounded (its own switch, on by default), and after a set
  number of minutes of not using it — nothing behind it is ever fetched
  while it's showing. Devices that support it can register fingerprint or
  face unlock as an alternative to typing the PIN. Forgot the PIN? Your
  account password sets a new one without losing anything. Change or turn
  it off again from the same Settings card, which also needs the current
  PIN.

### Changed

- **In-Sys Chat and Messages are now genuinely separate features, not one
  screen with a tab.** In-Sys Chat — alters talking to each other, internal
  to the account — has moved out of Social and into System, alongside Who's
  There and Fronting, at its own `/system/chat`; Messages — the end-to-end
  encrypted, cross-account side — stays in Social at `/social/messages`,
  with its own conversation list, notifications and unread count that a busy
  In-Sys Chat can no longer affect, or vice versa. The one new piece of UI:
  In-Sys Chat's header avatar is now the *active chatter* — tap it to
  switch, the same active-profile picker Profile Select already uses, in a
  small popover rather than leaving the screen — and it decides whose direct
  and group threads even show up in the list, the way each alter's own
  contact list would. Switching never rewrites anything: a message's sender,
  timestamp and order stay exactly as they were, only which side of the
  screen it renders on changes. Both still look and behave like the same
  familiar chat — bubbles, replies, reactions, attachments, voice messages,
  per-conversation themes — since only the underlying identity and data
  changed, not the visual language they share. Existing conversations,
  groups and message history are untouched, and old `/chat` and `/messages`
  links still open to the right place.

- **Thick banner rows show an actual banner.** The member directory's thick
  layout now renders each member's own banner image (or their accent colour,
  if they haven't set one) behind their name, the same way their profile
  page already does, instead of a plain row with no image at all. Their bio
  no longer appears there — it stays on their profile, where opening it is
  a deliberate choice — and their roles now do, alongside their pronouns and
  current fronting status.

- **The Emotions screen is no longer a separate destination in the nav, the
  bottom bar or the Hub.** Logging an emotion is unaffected — the Dashboard's
  "Log an emotion" quick action and the check-in ritual's own emotion step
  both still open the same picker exactly as before, and the screen itself
  still exists for anyone who navigates to it directly. It's just no longer
  a tile to browse to on its own, since logging was always meant to happen
  from wherever you already are.

- **Timed sessions now track to the exact second instead of rounding to the
  nearest minute.** Fronting, sleep, and clocking in for a shift all store
  the precise start and end timestamps they already had, plus an exact
  duration in seconds — a front that lasted 5 minutes and 45 seconds is
  recorded as 345 seconds, not rounded away to 6 minutes before it's even
  saved. The minute-based figures shown throughout the app are unchanged in
  how they read, but are now derived from that exact number rather than
  being rounded separately, so totals across many short sessions no longer
  drift from the true sum. The live "Clocked in for…" and "Asleep for…"
  counters on Work and Sleep also now tick every second instead of every 30.

### Added

- **Messages now shows typing status and read receipts.** The other person's
  name in a conversation's header switches to "Typing…" while they are
  composing a reply, and your own sent messages carry a small check mark
  that fills in once they have actually opened the conversation — both
  respect the same "let the other side know" setting, and neither does
  anything in System Chat, which has no concept of a separate reader to
  begin with.

### Fixed

- **A setting that failed to save — most commonly while briefly offline —
  looked like it had taken, then reverted the next time the app loaded.**
  Theme changes applied to the screen immediately and then saved in the
  background with nothing checking whether that save actually succeeded;
  a dropped connection left the on-screen change with nothing behind it.
  Every settings save now durably records what it owes the server before
  attempting to send it, retries automatically the moment the connection
  returns, and a theme change that still fails tells you so the same way
  every other setting already did — instead of just quietly not being
  there next time.
- **Profiles in the Members grid rendered their photo by hand instead of
  through the same avatar component the rest of the app already uses
  correctly.** No visible crop difference today, but it was a second,
  separately-maintained copy of the same cropping/centering logic — exactly
  the kind of place a future fix to one would quietly miss the other. The
  grid now uses the shared `Avatar` component like everywhere else, which
  also gained a `fill` mode so a component built for a fixed badge size can
  correctly fill a responsive grid tile too.
- **A post made as a specific alter, or a direct message sent "as" one,
  named that alter to the other person even when the system's own "show
  member list" setting was off.** The public profile page already hid
  members correctly when that setting is off; Flux posts and "send as a
  member" in Messages were a second, ungated path the same information
  could reach someone through. Both now check the same setting — and the
  same per-member "show on profile" opt-out — before ever attaching an
  alter's name to anything another account can see; the post or message
  itself is unaffected, only whose name is on it.
- **The PIN lock could trigger in the middle of actively using the app, on
  both mobile and desktop.** The unlock window was set once when the PIN was
  entered and left to expire on a flat timer, so "lock after N minutes"
  actually meant N minutes since unlocking rather than N minutes of
  inactivity — a long but continuous session got interrupted regardless of
  how actively it was being used. Using the app while already unlocked now
  pushes the window forward, the way an idle timeout is meant to work; a
  window that has genuinely already expired still locks as before. The
  Android app's own background-lock grace period — meant to tell a brief
  file-picker or share-sheet round trip apart from actually leaving the
  app — was also too short at 2 seconds, long enough to fire on an ordinary
  tab switch, and is now 30.
- **Returning from the file picker could leave a chat conversation's layout
  and back button broken.** Opening the Files app, Camera or Photo Picker is
  reported to sometimes kill the Android WebView's renderer process under
  memory pressure, which previously left the page stuck rather than
  recovering — easy to mistake for the message-alignment and back-button
  bugs fixed earlier, since whatever was on screen when it happened simply
  stopped responding. The app now rebuilds the WebView when this happens,
  through the same state-restoring path an ordinary screen rotation already
  uses, so the conversation and its back/forward history come back as they
  were.
- **School Life's screens stacked every section flush against the next, with
  no space between them.** The overview, Classes, a class's own page,
  Assignments and Academic Analytics now have the same visual breathing room
  between their cards, stat tiles and lists that a properly spaced screen
  elsewhere in the app already has — purely a layout fix, nothing about what
  any of these screens show or how the data behind them works has changed.
- **Logging more than one emotion at once created a separate entry for each
  word instead of one entry naming all of them.** Choosing "Happy" and
  "Nervous" together, for instance, used to produce two rows in the log;
  it's now one entry carrying the full selection, the same intensity and
  note you entered once for the whole thing. Existing entries are
  untouched — a row from before this change simply has one emotion, which
  reads exactly as it always has. Everywhere this is counted or broken
  down (the emotions stats page, the daily summary, an alter's own
  "emotions logged" count, the "fifty emotions logged" achievement) now
  counts each named emotion rather than each row, so logging two together
  still counts as two.
- **Signing into a second device could permanently lock the first one out of
  Messages.** Each device published its encryption key under the same
  hardcoded label, so the server kept only the most recently signed-in
  device's key active — every device before it lost the ability to decrypt
  anything new, with no way back short of signing out everywhere and back in
  on just one. Each device now keeps its own key active for as long as it
  keeps using the same one, so devices stop fighting over a single slot;
  sending a message now seals a copy for every device that might need to
  read it — the recipient's and this account's own other devices alike — so
  a conversation stays readable from a phone, a tablet and a desktop all
  signed into the same account at once, and a device already sitting on an
  open conversation picks up a sibling device the moment it signs in rather
  than needing a reload to notice it.
- **Outgoing and incoming chat messages both rendered in the middle of the
  screen instead of on the right and left.** The `mine`/`theirs` alignment
  class was being applied to a bubble nested a level too deep to affect its
  own position — the actual flex item next to it had no class at all. Fixes
  every message kind (text, images, video, voice, replies, forwards) in
  both System Chat and Messages, on mobile and desktop.
- **Role chips used the theme's accent colour for every alter instead of
  each alter's own colour**, on both the profile page and the member list.
- **Chat picker avatars (when starting a new conversation) squashed instead
  of staying round**, from unconstrained flex shrink.
- **The PIN lock could resurface after being removed, or lock unexpectedly
  in the Android app.** Removing a PIN now updates the local cache
  immediately instead of waiting on a status round-trip that could fail and
  fall back to stale data; the background auto-lock now waits briefly before
  locking, so a share sheet or permission prompt in the Android WebView no
  longer triggers it by mistake.
- **Chat's back button could land back on the conversation you just closed**
  instead of wherever you came from, because closing a conversation pushed a
  new history entry instead of replacing the one already there.
- **Long relationship descriptions and similar list rows clipped to one
  line with an ellipsis** instead of wrapping and growing the row.
- **A selected date could display as the previous day, depending on your
  timezone.** Date-only fields (birthdays, journal entries, fronting,
  emotions, and every other plain date across the app) now parse and format
  through one shared, timezone-safe path instead of round-tripping through a
  `Date` object meant for full timestamps.
- **The Dashboard's greeting used the account owner's name instead of the
  active alter's**, in System Mode.
- **Turning off a notification category's "in app" checkbox silently also
  stopped its push notifications, and turning off "push" silently also
  stopped it appearing in the notification centre.** Settings presents all
  four channels — in app, foreground, push, badge — as independent per
  category, but the two were wired together so that disabling either one
  disabled both. Each channel is now genuinely gated on only its own
  checkbox.
- **A wrong app-lock PIN attempt left the failed digits sitting in place.**
  Retrying after an error appended the correct PIN onto the rejected one
  instead of starting fresh, capping out at the maximum length before the
  full correct PIN could be entered on the new keypad. It was there before
  too, just easier to miss when a text field let you see and clear the
  leftover digits by hand.
- **A device's own second offline edit to a record could quietly overwrite —
  or be overwritten by — its first one.** Sync compared a whole record's
  version number rather than the specific field being written, so applying
  one queued edit made the very next one (to a different field, possibly
  from the same device) look stale and get discarded. Conflicts are now
  judged one field at a time.
- **Long-pressing or tapping a thick or slim banner row's name/status text did
  nothing.** The text and avatar sat visually above the row's own full-bleed
  tap target, so a press landing on either — most of the row's area — never
  reached it. Only the trailing quick-front button needed to sit above that
  target; the rest of the row now lets a tap through the way the square and
  circle layouts already did.
- **The active-tab underline and the sidebar/bottom-nav's active colour used
  to snap instead of transitioning.** Both already had a transition rule, but
  a second, later rule with the same specificity was silently replacing it
  and dropping the property that actually moves — the tab's underline colour,
  and the nav items' icon/label colour. Switching tabs and navigating between
  sections now animates the same way the rest of the interface's active
  states already do.
- A heatmap chart (used on the Stats page) rendered each of its rows without
  a key on the outer element, which React warns about on every render past
  a handful of rows.
- Work's earnings estimate always used a workplace's standard hourly rate,
  even for a shift that had been given its own rate override — the override
  existed as a field but nothing read it. It's now used wherever a shift's
  earnings are estimated, individually and in every stats total.
- The rate limiter on sensitive endpoints (sign-in, vault unlock, and now
  app lock) keyed its attempt counter on the request path alone, so two
  different endpoints that both end in the same word — the vault's
  `/unlock` and app lock's own `/unlock` — shared one counter instead of
  each having their own. Guessing one PIN too many times could have quietly
  eaten into the other's attempt budget. It now also keys on which router
  is handling the request.
- The Android app's WebView only showed its "Cannot reach PluralNova" screen
  for a connection failure — DNS, refused, timed out. A host that answers
  with an HTTP error, such as a deleted or misrouted Railway domain serving
  its own "Not Found" page, loaded that page as if it were the app, with no
  retry and no way to change the address. Now treated the same as any other
  failure to reach the server.

## [1.0.14] — 2026-09-24

### Changed

- **The Who's There nav page is gone, replaced by a startup ritual.** Once a
  day, the first thing the app asks a system is the thing it exists to
  answer — who's out — as a quick, dismissible check-in rather than a
  screen you have to remember to visit: a confirm-or-end if someone already
  is, a one-tap way to log it if not. Ending, switching, and browsing who's
  around now live where they already fit — the dashboard's current-front
  card gained inline End, Switch and Clear actions, and the fronting
  tracker and Quick Front cover the rest. The bottom bar's second slot is
  now Fronting instead.

### Fixed

- A member's "Display name" — the one required field on the form — was
  filed under a collapsed "Identity" section along with a dozen optional
  ones, so a brand new member's own name was hidden until that section was
  opened. It's no longer grouped, so it's there from the first tap of "Add
  a member."
- Three of the member-directory card layouts nested a real button (the
  quick-front bolt) inside another element acting as a button (the card
  itself), which is invalid and an accessibility violation. Restructured so
  the card's click-to-open is its own button and the bolt is a sibling
  layered above it — both still independently tappable, neither swallowing
  the other's clicks.

## [1.0.13] — 2026-09-24

### Added

- **Body sensations gets an actual stats view.** Total logged, average
  intensity, the most common area and word, and a ranked breakdown of the
  words that come up most over the last 90 days — the figure's shading
  already showed this at a glance, but there was nowhere to see the numbers
  behind it.
- **Sleep now surfaces what it was already collecting.** Average time to
  fall asleep and a count of nightmare nights (and sleepwalking, when it
  happens) join the existing averages — fields the log form has always had
  but the stats never looked at.
- **Finances shows where income came from, not just where it went.**
  A second ranked breakdown, by category, mirroring the spending one that
  was already there.
- **Work turns hours into pay**, when a workplace has an hourly rate on
  file: an Earnings total alongside hours worked, and a per-workplace figure
  in the workplace breakdown. Two workplaces paying in different currencies
  never get added together into one meaningless total — each keeps its own
  figure, and the combined one only appears when there is exactly one
  currency to combine.

### A note on fitness tracking

Syncing steps or workouts from Google Fit, Health Connect or Apple Health
was looked at and set aside for now: those are native platform APIs a
browser cannot reach, so real integration would mean a from-scratch
Android-only feature (Health Connect) with no equivalent path on iOS at
all, rather than an extension of the app that already exists everywhere
else. Fitness entries stay something you log by hand, honestly, rather than
a sync button that would only half work.

## [1.0.12] — 2026-09-24

### Fixed

- **Closed 30-odd terminology gaps** where a screen said "member," "system,"
  "front" or "fronting" outright instead of asking what to call it. Delete
  confirmations, the "who's this for" chips in Messages/Flux, and several
  page descriptions across Contacts, Characters, Notes, Locations, Work,
  Stats, Subsystems, Backup, Achievements, Constellations and the onboarding
  screens now all resolve through the account's own words.
- **Achievement titles and descriptions now honour your terms too** —
  "Twenty members recorded" becomes "Twenty alters recorded" for an account
  that renamed the term, the same as everywhere else in the app.
- **Notifications and push alerts now carry your terminology as well.**
  Previously only what rendered inside a React component ever resolved
  `{{tokens}}` — a switch notification always said "is fronting" and an
  achievement toast always said "system," regardless of what an account had
  renamed those to. Terminology now resolves once, centrally, for every
  notification's title and body before it is stored or sent, so the fix
  covers future notification text too rather than one string at a time.

## [1.0.11] — 2026-09-24

### Added

- **Daily Summary now says how a day compares**, not just what happened on
  it. Mood, emotions, body sensations, fronting time and sleep are each
  quietly checked against the trailing two weeks — "Mood averaged 9/10
  today, compared to 5/10 over the last two weeks" — and a run of
  consecutive journal days is called out. Every comparison waits for at
  least three days of baseline before saying anything, and the card says
  outright that these are numbers next to other numbers, not a diagnosis.
  There is no AI here, just arithmetic run over data already being kept.

## [1.0.10] — 2026-09-24

### Added

- **Wellbeing opens on three calm, low-stakes things to do**, not a
  dashboard: a guided breathing rhythm (box, 4-7-8, or a plain in-and-out),
  bubble wrap that never runs out, and a walk through the five senses.
  Nothing is timed, scored, or saved anywhere. The mood log and check-in
  trends that used to be the whole page are still there, a tab away.

## [1.0.9] — 2026-09-24

### Fixed

- **Changing the theme now changes the background, not just a few buttons.**
  The page background was a flat, base-only colour with no memory of the
  chosen accent — on the solid surface the app defaults to, that made
  picking a different accent or preset invisible outside a handful of small
  controls. It now carries a light wash of the accent, subtle enough to
  stay calm and cozy rather than glowing, so two systems running different
  presets actually look different at a glance. AMOLED keeps its true black
  regardless, and the accent's contrast against the background is
  re-checked after the tint rather than before, so readability holds.

## [1.0.8] — 2026-09-24

### Added

- **Four ways to browse the member directory.** Squares (the original photo
  tile) and Circles are grid layouts with a column-count picker; Slim
  banners and Thick banners are single-column rows instead, the thick one
  with room for a line or two of bio. All four carry the ringed-avatar
  fronting indicator and the quick-front shortcut.

## [1.0.7] — 2026-09-24

### Added

- **Typed custom fields, with an editor.** A member's custom fields are no
  longer a flat, unlabelled list — each one has a type (short text, a
  rating, a colour, a link, a yes/no, tags, and more), and an editor to add,
  reorder, and remove them. A field can carry a group of its own, and those
  render as their own card on the profile; anything already saved in the old
  shape upgrades to the new one automatically, in memory, the moment it is
  read.
- **System history shows what actually changed, and can put settings back.**
  Entries now carry a category (chips to filter by, alongside the existing
  event-type filter) and, for settings changes, a before-and-after. An
  object-valued setting like the whole theme diffs key by key — "fontFamily:
  lexend → serif" — rather than printing two copies of the object side by
  side. A restorable entry gets a Restore button that puts that one value
  back and logs the reversal as its own entry.

## [1.0.6] — 2026-09-23

### Changed

- **Long forms open short.** A field's `group` — already there on collections
  like sleep, fitness and calendar events — now decides what shows up front
  and what waits behind a fold. The first fields a collection lists (already
  the ones that matter most of the time) are always visible; a named group of
  more particular detail stays collapsed until it is opened, or until the
  record being edited already has something in it, so existing detail is
  never hidden by accident. Calendar's new-event form in particular goes from
  fifteen fields to seven before anyone touches "Repeats" or "Reminders."

## [1.0.5] — 2026-09-23

### Added

- **Start, and it counts itself.** Sleep and Work can now be tracked live —
  tap Start when you fall asleep or clock in, and the header counts the time
  as it passes instead of asking you to remember and type it in later.
  Waking up or clocking out closes the count and opens the same detail form
  as before, in case there is more worth adding.

## [1.0.4] — 2026-09-23

A pass through the app's rough edges: layout bugs users could actually see,
a navigation bar that finally answers to the user, and a fronting flow that
no longer forces a full switch just to add someone.

### Added

- **Choose which tabs show up.** The navigation bar — sidebar and bottom bar
  alike — is now built from a checklist in Settings, so a system can hide
  whatever it doesn't use instead of scrolling past it forever.
- **Every editing page's Save button lives top-right now**, not in a footer
  you have to scroll to find. This is a change to the one shared form
  component every record editor is built on, so it applies everywhere at
  once rather than screen by screen.
- **Member and contact pickers are a real picker.** Fields that used to want
  a free-typed name or a pasted ID are now a tap-to-open dialog listing who
  is actually in the system.
- **Random relationships**, for systems that want their relationship map
  seeded rather than built one link at a time. It reads whatever ages are
  already on file and keeps its suggestions age-appropriate.
- **A clearer way to add someone to the front** instead of always replacing
  whoever is already there — Quick Front now offers both, plus a
  lightning-bolt shortcut on every member's card on the Members page.
- **Lexend, and a choice of it.** The app ships the font itself rather than
  fetching it from Google at runtime, and Settings → Appearance now has a
  Typeface picker for anyone who prefers something else.
- **Change your display name** from Settings → Account. The server has
  supported this for a while; there was just never a button for it.

### Fixed

- Long member names on the Quick Front page no longer spill past the edge
  of their tile.
- The 4- and 5-column layouts on the Members page actually render that many
  columns on a phone now, instead of silently collapsing to fewer.
- The stray accent-colored glow in the top-left corner on mobile — a
  leftover from the glass-era background — is gone now that surfaces
  default to solid.
- The "category" field on editing pages, which nothing downstream ever
  read, has been removed from those forms.
- A member's profile-picture ring now uses that member's own colour and
  sits centered instead of off to one side; flags attached to a profile
  show in the same row as its other tags instead of going missing; the
  whole profile page now picks up a soft tint of the member's colour.
- A member card's accessible name no longer absorbs its quick-front
  button's label, so screen readers announce each control on its own
  instead of one run-together string.

## [1.0.3] — 2026-09-22

Import and export, taken seriously: a live PluralKit connection, six new
readers for trackers this community has actually been migrating from, and a
second export format meant to outlive any one of them.

### Added

- **Connect PluralKit with a token, not a file.** Paste a system token and
  PluralNova pulls members and recent switch history straight from
  PluralKit's own API — nothing to export by hand first, and the token is
  used once and never stored. The file-based `pk;export` import is still
  there for anyone who prefers it, and now carries switch history across too,
  not just members.
- **Six new import sources**, each reading that app's own export shape rather
  than a generic guess: Sheaf, Octocon, Plural Star, PluralSpace, Pluralis
  and PluralConnect.
- **Open Plural (PluralPort) import and export.** PluralNova can now both
  read and write the shared, app-independent format a growing number of
  trackers — Sheaf among them — speak directly, so a copy of a system's data
  stays readable even if PluralNova is not involved.
- **Honesty about what cannot be read yet.** Prism Plural's export is
  encrypted and Ampersand's is not a portable format; rather than pretend
  otherwise, the import screen says so and points at PluralKit when the same
  members exist there too.

## [1.0.1] — 2026-09-21

A design pass, and the bugs it turned up.

### Changed

- **The interface is solid.** Glass is no longer the default: no blur, sheen,
  rim light, glow or starfield. Those were five effects cooperating to imitate
  a material, and the result read as a website being clever — every panel
  competing with whatever was behind it. The treatment is still available to
  anyone who wants it.
- **Navigation is tiles, not rows.** Wherever you choose among many equal
  things — the feature map, the dashboard's quick actions — there is a grid of
  tiles with an icon and a short label. Labels wrap rather than truncate.
- **The accent moved to where it means something**: the icon on a tile and the
  ring on an avatar, rather than a wash over a panel.
- **Who is fronting is a row of faces**, each wearing their own colour, instead
  of a list of rows.
- **Screens no longer print their own name twice.** The heading that repeated
  the bar at the top of the app stays in the document for structure and off the
  page.

### Fixed

- **The settings screen was 262px wider than a phone**, so the section list ran
  off the right edge. A grid item will not shrink below its own content unless
  told to, and the content forcing it was an email address — no spaces to break
  at, so it sat there as one 457-pixel word. The end-to-end check that should
  have caught this only visited the settings index, never its nine sections; it
  visits all of them now.
- **The ring marking who is fronting had never rendered.** The avatar clipped
  its own children to round its image, and the ring sits just outside that box.
- **`prefers-reduced-motion` was overridden** by any effect tier other than
  "full", because a tier sets the motion variable on an attribute selector and
  the preference was set on a bare `:root`.
- Example data could not be added to a registered account, only a guest one,
  although onboarding offered it to everybody.
- The Android setup screen refused addresses that worked: it assumed `http`
  for anything typed without a scheme, read the response body before the status
  so every failure became "nothing answered", and did not follow a redirect
  that changed protocol.

### Added

- The Android build can be given its server address, so the app opens straight
  into it rather than asking on first launch.
- More depth across the records: members, sleep, fitness, locations, contacts,
  calendar, dictionary, journal, polls and work shifts, plus a contact log, fic
  chapters and a playback history. 69 collections, 795 fields.
- `sensitive` fields are now enforced server-side rather than only described.

## [1.0.0] — 2026-09-21

First release.

### The application

- **Fronting** — who is out, co-fronting, switches, durations, history, and
  statistics over any period. "Nobody is fronting" is a recordable state, not a
  gap.
- **Members** — profiles, pronouns, roles, subsystems, relationships, front
  history, per-profile PINs, and an orbit order that is yours to arrange.
- **Life** — journal, notes, tasks, calendar, media, flags, achievements,
  finances, contacts, emergency contacts, locations, work, and a PIN-locked
  vault.
- **Wellbeing** — mood check-ins, 144 emotions across 12 families, body
  sensations, sleep, fitness, cycle tracking, and a daily summary. It describes
  what you recorded and never interprets it.
- **Headspace** — a canvas for mapping inner worlds, with rooms, links and
  residents.
- **Social** — constellations with public handles, friends, a feed, polls, a
  bulletin board, and direct messages encrypted end to end.
- **Creative** — stories with a workspace, characters, fic tracking, music and
  video libraries, a dictionary, and templates.
- **Import and backup** — imports from PluralKit, Simply Plural, a PluralNova
  export, or a CSV. Export every record in one file and restore it into any
  instance; a restore can only ever write into the account doing it.

### How it behaves

- **Offline first.** Records live in the browser's own database and writes go
  through an outbox. An installed PluralNova opens with no connection, accepts
  new entries, and says how many changes are waiting rather than pretending
  they are saved. Sync conflicts are surfaced, never resolved silently.
- **Private by default.** Every generated query carries an owner filter, so
  scoping is a property of the data layer rather than a promise in the
  interface. Messages are sealed in the browser with ECDH and AES-GCM; where a
  key has not been published the message goes in the clear and says so.
- **Your words.** Nothing hardcodes "member", "alter" or "headmate". Terms
  resolve at render time from your own settings, in English or Spanish, both
  complete.
- **Yours to leave.** Export everything at any time, in one file, in a format
  another PluralNova can read.

### Installing

- A progressive web app: installs from any browser, with app shortcuts, push
  notifications and offline launch.
- An Android shell around the same client, distributed and updated from your
  own server rather than a store.
- A container image and a compose file, with automatic HTTPS available through
  Caddy.

[Unreleased]: https://github.com/jonesrhiley133-prog/plural_nova/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jonesrhiley133-prog/plural_nova/releases/tag/v1.0.0
