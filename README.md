# PluralNova

PluralNova is a private, customizable space for plural systems to organize
system members, track fronting and emotions, journal, communicate, manage daily
life, and explore detailed insights. Built with flexible profiles,
personalization, accessibility, and comprehensive data ownership in mind.

It runs as an installable app that works offline, stores everything under one
account you control, and never asks a system to describe itself in somebody
else's words.

## Running it

```sh
npm install
npm run build
npm start          # http://localhost:4000
```

That serves the API and the built client from one origin. Nothing else needs
setting up: the database and the push keys are created on first run, under
`data/`.

To keep it running, `docker compose up -d --build`. To host it somewhere,
PluralNova needs a persistent disk and a process that stays up — Railway,
Fly.io, Render or any VPS. It cannot run on Vercel or another serverless
platform: it keeps a SQLite database on disk and holds WebSocket connections.

One thing worth knowing before you put it on a phone: a browser only grants a
page a service worker, push notifications and "Add to home screen" over
**HTTPS or localhost**. Reaching PluralNova at `http://192.168.x.x` gives you a
working website and not an installable app.
[`docs/DEPLOYING.md`](docs/DEPLOYING.md) covers the two straightforward ways
round that, along with backups and updates.

For development, two processes:

```sh
npm run dev:server   # :4000
npm run dev:web      # :5173, proxying /api to the server
```

### Configuration

Everything has a working default. The ones worth knowing:

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `4000` | |
| `PLURALNOVA_DATA_DIR` | `./data` | database, uploads, keys and published app builds |
| `PLURALNOVA_SERVE_WEB` | `true` | serve the built client from the API origin |
| `PLURALNOVA_CORS` | localhost dev origins | comma separated |
| `PLURALNOVA_MAIL_FROM` | unset | without it, reset codes come back in the response outside production |
| `PLURALNOVA_MAX_UPLOAD` | 25 MB | per file |

Set `NODE_ENV=production` before exposing it to anything.

## Checks

```sh
npm run typecheck
npm test              # shared, server and web unit suites
npm run build
```

The end-to-end checks drive a real browser against a real build and need a
running server, so they are separate — see
[`packages/web/e2e/README.md`](packages/web/e2e/README.md).

## Layout

```
packages/shared    the domain: 65 collections, terminology, themes, backup format
packages/server    Express + SQLite, scoped CRUD, realtime, push, backup
packages/web       React client: 60 screens, offline-first, installable
```

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how those fit together
and why the app is built the way it is.
[`docs/DEPLOYING.md`](docs/DEPLOYING.md) is how to run it,
[`docs/RELEASING.md`](docs/RELEASING.md) how to cut a version, and
[`CHANGELOG.md`](CHANGELOG.md) what has changed.

## Android

PluralNova installs from any browser as a PWA, which is the simplest way to get
it onto a phone. There is also a native shell in [`android/`](android/) for
people who would rather install an APK:

```sh
cd android
./tools/make-keystore.sh     # once — Android updates require a stable key
./gradlew assembleRelease
./tools/publish.sh           # serves it from your own server
```

It hosts the same web client in a WebView, so offline launch, the local
database and sync all behave identically. Publishing puts the APK on your
server: phones with it installed are offered the update, phones without it can
download it from Settings → About. See [`android/README.md`](android/README.md)
for the details and the one thing the shell cannot do (push).

## Icons

The app icons — web, PWA and Android launcher alike — are generated from one
description of the artwork, so no two versions can drift apart:

```sh
npm run icons -w @pluralnova/web          # web and PWA
npm run icons:android -w @pluralnova/web  # Android launcher
```

The output is committed; a clean checkout builds without running either.

## Your data

Everything is private by default. Export the whole account — every collection,
in one file — from Backup, and restore it into any PluralNova instance. A
restore only ever writes into the account doing the restoring.

## Licence

Proprietary — all rights reserved. See [LICENSE](LICENSE). Your own data is
yours, and exportable in full at any time.
