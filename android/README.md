# PluralNova for Android

A small native shell around the PluralNova web app. It is not a second
implementation: the same client runs in the system WebView, so the service
worker, the local database, offline launch and sync all behave exactly as they
do in a browser.

What the shell adds is what a browser does for free and a WebView does not —
the back button, file downloads for backup export, file pickers for media and
import, links that are not PluralNova opening in a real browser, and an error
screen that names the address instead of showing `ERR_CONNECTION_REFUSED`.

## Building it

You need a JDK 17 or newer and the Android SDK. Nothing else — the Gradle
wrapper fetches its own Gradle.

```sh
cd android
./gradlew assembleDebug
```

The APK lands at `app/build/outputs/apk/debug/app-debug.apk`. It is signed with
the standard debug key, which is fine for installing on your own devices:

```sh
adb install app/build/outputs/apk/debug/app-debug.apk
```

If Gradle cannot find the SDK, point it at yours:

```sh
echo "sdk.dir=$HOME/Android/Sdk" > local.properties
```

### A signed release build

Create a key once:

```sh
keytool -genkeypair -v -keystore pluralnova.jks -alias pluralnova \
  -keyalg RSA -keysize 4096 -validity 10000
```

Then a `keystore.properties` beside it — both are gitignored:

```properties
storeFile=pluralnova.jks
storePassword=…
keyAlias=pluralnova
keyPassword=…
```

```sh
./gradlew assembleRelease
```

Without that file `assembleRelease` produces an unsigned APK, which will not
install. Use `assembleDebug` unless you actually need a release build.

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

## What is not here

Push notifications. Web push does not work in a plain WebView — Android
delivery needs Firebase Cloud Messaging, which means a Google project and a
service account. In-app notifications work; the notification centre and badges
are unaffected. Installing the PWA from Chrome gives you real push today, which
is the reason to prefer it if push matters to you.
