# Changelog

Notable changes to PluralNova. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The Android app's version comes from the same number: `1.2.3` becomes
versionCode `10203`, so the app, the server and the APK are never three
different versions of PluralNova.

## [Unreleased]

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
