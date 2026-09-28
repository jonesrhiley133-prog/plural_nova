# PluralNova for Android

A small native shell around the PluralNova web app. It is not a second
implementation: the same client runs in the system WebView, so the service
worker, the local database, offline launch and sync all behave exactly as they
do in a browser.

What the shell adds is what a browser does for free and a WebView does not —
the back button, file downloads for backup export, file pickers for media and
import, links that are not PluralNova opening in a real browser, and an error
screen that names the address instead of showing `ERR_CONNECTION_REFUSED`.

## Pointing it at your own server

PluralNova is self-hosted, so the app cannot know where your server is and asks
on first launch. For a build made for one known server that is a question with
exactly one possible answer, so the address can be baked in and the screen
never appears:

```sh
./gradlew assembleRelease -Ppluralnova.serverUrl=https://yours.up.railway.app
```

Or set `PLURALNOVA_SERVER_URL` in the environment. In CI, set a repository
secret of that name, or pass the address when running the **Android** workflow
by hand — the run summary says which of the two happened.

Leaving it unset keeps the setup screen, which is what a build for anybody else
needs.

**Changing it later** still works either way: the menu's *change server* option
clears the stored address and asks again, and once somebody has chosen for
themselves the baked-in address stops overriding them.


## Building it

You need a JDK 17 or newer and the Android SDK. Nothing else — the Gradle
wrapper fetches its own Gradle. If Gradle cannot find the SDK, point it at
yours with `echo "sdk.dir=$HOME/Android/Sdk" > local.properties`.

**Make the signing key first.** Do this before building anything, even to try
it out:

```sh
./tools/make-keystore.sh
```

Android accepts an update only when it is signed with the same key as the
installed app, and there is no way back from losing that key: the only route to
a new version would be uninstalling, which deletes the app's local copy of your
records. The script writes `pluralnova.jks` and `keystore.properties`, both
gitignored. Back them up somewhere you will still have in five years.

Then:

```sh
./gradlew assembleRelease    # app/build/outputs/apk/release/app-release.apk
```

`assembleDebug` also works and is signed with the same key, so a debug install
can later be updated by a release build rather than having to be removed first.
`assembleRelease` stops with an explanation if no key exists, rather than
producing an APK that cannot be installed.

Install it over a cable with `adb install -r <apk>`, or just open the server's
Settings → About page on the phone and download it.

## Version numbers

The version comes from the repository's `package.json` — the same place the web
app and the server read it. The versionCode is derived from it (`1.2.3` becomes
`10203`), because Android refuses any APK whose versionCode is not higher than
the installed one. Bumping the npm version is the only thing to remember.

## Building it without an Android SDK

If you do not have the SDK installed, **Actions** → **Android** → **Run
workflow** on GitHub builds it and attaches the APK to the run. That job also
runs on every change under `android/`, so the Kotlin is compiled by something
even when nobody is cutting a release.

## Publishing an update

The server that runs PluralNova also hands out the app:

```sh
./tools/publish.sh                  # into ../data, the server's default
./tools/publish.sh /srv/pluralnova  # or wherever PLURALNOVA_DATA_DIR points
```

That builds a signed release and copies it, with a small manifest, into
`<data>/releases/`. From then on:

- a phone with the app installed is offered the update next time it opens,
  downloads it, checks it against the checksum the server published, and hands
  it to the system installer;
- a phone without it can download from `/app/pluralnova.apk`, which the web
  app links to under Settings → About.

Android will ask once for permission to install apps from PluralNova; the app
sends you to the right settings screen when that happens.

Nothing here is required. A server that has never published a build simply says
there is nothing to install, and the download card stays hidden.

## First run

PluralNova is self-hosted, so the app asks where yours is — `192.168.1.10:4000`
or `https://pluralnova.example.com`. The address is checked against the
server's health endpoint before it is kept, so a wrong address says so instead
of showing a blank screen. You can change it later from the error screen.

Cleartext `http://` is permitted, because running the server on your own
machine and reaching it over your own network is the normal case. The setup
screen warns you if the address is neither https nor local, since a password
would otherwise cross the open internet unencrypted.

## Icons

Generated from the same artwork as the web app's, so the two cannot drift:

```sh
npm run icons:android -w @pluralnova/web
```

## Push notifications

Web push does not work in a plain WebView — there is no browser push service
behind it — so this app talks to Firebase Cloud Messaging instead. That needs
a Firebase project, which is a Google account only you can create; nothing
here can do it for you. Skip this section entirely and the app still works
exactly as described above, just without native push — in-app notifications,
the notification centre and badges are unaffected either way, and turning
push off entirely is its own setting under Settings → Notifications.

Two pieces, both optional and independent of each other:

**The app needs to know your Firebase project**, so a phone can obtain a
token at all:

1. Create a project at the [Firebase console](https://console.firebase.google.com)
   (the free Spark plan is enough).
2. Add an Android app to it with application ID `com.pluralnova.app`.
3. Download the `google-services.json` it offers you and save it as
   `android/app/google-services.json`. It is read at build time, gitignored,
   and safe to keep only on your own machine — this repository never sees it.
4. Build as usual. The build log says plainly whether it found the file or is
   building without Firebase.

**The server needs to be able to send to that project**, so pushes actually
go out:

1. In the Firebase console, go to Project Settings → Service Accounts →
   Generate new private key. That downloads a second, different JSON file —
   this one is a real secret, unlike the app's own `google-services.json`.
2. Put it somewhere the server can read, e.g. `<data>/firebase-credentials.json`
   next to the database.
3. Set `PLURALNOVA_FIREBASE_CREDENTIALS` to that path (a relative path
   resolves inside `PLURALNOVA_DATA_DIR`) and restart the server.

With both in place, a phone that turns on notifications in Settings gets a
real Android notification, tapping it opens the app to whatever it was about.
Without either one, that same phone falls back to nothing rather than an
error — Settings says notifications could not be set up, same as a browser
that has push blocked. Web push for anyone using the site in a browser, or
installed from Chrome, never depends on any of this.
