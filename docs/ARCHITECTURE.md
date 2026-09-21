# How PluralNova is put together

PluralNova is a private management system for plural systems: who is around,
how things are going, and everything else a system wants to keep. It is one
npm workspace with three packages.

```
packages/shared   the domain — what a record is, what the words mean
packages/server   Express + SQLite, one owner filter on every read
packages/web      React, offline-first, installable
```

`shared` knows nothing about either of the others. `server` and `web` both
depend on it and never on each other, so a rule written once is enforced on
both sides of the network.

## The collection registry

Sixty-five collections are declared as data — nineteen about the system,
twenty about daily life, twelve creative, ten social, four for work — and each
one names its fields, their kinds, their validation, whether the collection is
scoped to an account or to a system, and whether records in it can ever be
shared.

Almost everything else is derived from that:

| Derived from the registry | Where |
| --- | --- |
| `CREATE TABLE` and the additive migrations | `server/src/db/ddl.ts` |
| Scoped CRUD endpoints for 54 collections | `server/src/routes/records.ts` |
| Validation, on both the client and the server | `shared/src/validation.ts` |
| The backup file's contents (64 collections) | `shared/src/backup.ts` |
| Forms, list screens and the local cache | `web/src/ui/RecordForm.tsx`, `CollectionScreen.tsx` |

This is the reason the app has sixty-odd screens without sixty-odd copies of
the same file. Adding a field to a collection gives it a column, a migration,
validation on both sides, a form control, a place in the backup and a slot in
the local store — from one line.

Eleven collections are marked `serverManaged`. Their tables are still
generated, backed up and synced; only the open write endpoints are withheld,
because those rows cross account boundaries and their rules live in code
rather than in a scope filter.

## Scoping is the security model

Every generated statement carries an owner filter. `scopeClause()` in
`server/src/db/repository.ts` adds `"userId" = ?`, and `"systemId" = ?` as
well for system-scoped collections. There is no code path in the server that
reads a record table without it, which is what makes "private by default"
a property of the data layer rather than a promise in the interface.

Restoring a backup rewrites `userId` and `systemId` to the restoring account,
so a backup file can never insert rows belonging to somebody else.

## Offline is the normal case

The client keeps records in IndexedDB and writes through an outbox. A write
lands locally first, shows immediately, and is sent when there is a
connection; the header says how many changes are waiting rather than
pretending they are saved.

Sync is delta-based. When the same record changed in two places the conflict
is surfaced, never resolved silently — the app does not get to decide which
version of somebody's day was the real one.

The service worker serves navigations network-first and falls back to the
cached shell, so an installed PluralNova opens with no connection at all.
The confirmed session is cached beside its token, so an offline launch stays
signed in; only a 401 from the server ends a session.

## Things that are deliberately not generic

Some screens carry real behaviour and are written out in full: fronting and
co-fronting, the emotion picker over 144 emotions in 12 families, the
headspace canvas, the calendar, messaging, and the import centre. The
registry-driven form covers the screens where a form is genuinely all that is
needed, and stops where it would start lying about what the screen does.

## Messages are encrypted or they say they are not

Each device generates an ECDH P-256 key pair in the browser and publishes only
the public half. Bodies are sealed with AES-GCM against the derived shared
secret, so the server stores ciphertext it cannot read. When the other side
has published no key there is nothing to encrypt to: the message goes in the
clear and the interface says "Not encrypted", because a padlock over plaintext
is worse than no padlock.

Ordering is the server's job. Each message gets a monotonic `sequence` within
its thread, assigned inside a transaction; the client renders oldest to newest
and de-duplicates replays by `clientId`.

## Words belong to the system using the app

Nothing in the interface hardcodes "member", "alter" or "headmate". Strings
carry `{{member}}`, `{{Members}}`, `{{system}}` and the rest, resolved at
render time against the account's own terminology. Changing the word in
settings changes it everywhere at once, including the words with irregular
plurals.

## Theming

Colours are CSS custom properties written to the root element at runtime, with
`data-base`, `data-surface` and `data-effects` carrying the parts of a theme
that change behaviour rather than colour. A custom accent that would be
unreadable against its own background is repaired to meet contrast rather than
honoured as typed. The resolved tokens are mirrored to `localStorage` and
replayed by a script in `index.html`, so the app never paints the wrong
background on launch.

## Charts

Charts are drawn as SVG by hand — no chart library — from a palette checked
against PluralNova's own surfaces for contrast and for how the colours
separate under the common kinds of colour blindness. Every chart also has a
table view, because a chart is the only channel some readers do not have.

## Tests

| Suite | What it covers |
| --- | --- |
| `packages/shared` | the registry, terminology, themes, backup format, emotions |
| `packages/server` | auth, scoped CRUD, fronting, social, messaging, backup round-trips |
| `packages/web` | encryption, theming, the derived form, and the flows with a history of losing data |
| `packages/web/e2e` | a real browser against a real build: every route, phone width, offline launch |

The end-to-end checks need a running server and are not part of `npm test`.
See `packages/web/e2e/README.md`.
