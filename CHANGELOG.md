# Changelog

Notable changes to PluralNova. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The Android app's version comes from the same number: `1.2.3` becomes
versionCode `10203`, so the app, the server and the APK are never three
different versions of PluralNova.

## [Unreleased]

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
