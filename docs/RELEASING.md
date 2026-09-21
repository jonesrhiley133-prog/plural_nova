# Cutting a release

A release is a tag. Everything else follows from pushing it.

```sh
# 1. Set the version. The Android versionCode is derived from it, so this is
#    the only place it is written down.
npm version 1.1.0 --no-git-tag-version

# 2. Describe it. Move the Unreleased notes into a section for this version.
$EDITOR CHANGELOG.md

# 3. Commit, tag, push.
git commit -am "PluralNova 1.1.0"
git tag -a v1.1.0 -m "PluralNova 1.1.0"
git push origin main --follow-tags
```

`.github/workflows/release.yml` then:

1. **Refuses** if the tag and `package.json` disagree — a mismatch would ship
   an APK whose versionCode cannot update the one before it.
2. Builds, typechecks and runs every test.
3. Packs `pluralnova-<version>.tar.gz` with a SHA-256 beside it.
4. Publishes a container image to `ghcr.io/<owner>/plural_nova`, for amd64 and
   arm64, so a Raspberry Pi is a place this runs.
5. Builds a signed APK, if the signing secrets are set. Without them there is
   simply no APK in the release — see below.
6. Creates the GitHub Release, with the changelog section as its notes and
   everything above attached.

## Version numbers

`1.2.3` means:

- **major** — a change that needs something of you: a manual migration step, a
  configuration change, dropped support for something.
- **minor** — new features, upgrade freely.
- **patch** — fixes only.

The database migrates itself forward on start, adding tables and columns and
never dropping anything, so an upgrade does not normally need you to do
anything but restart.

## Signing the Android app

The APK is optional, and it only appears in a release when four repository
secrets exist. Without them the job logs a notice and the rest of the release
proceeds.

| Secret | What it is |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 android/pluralnova.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | from `android/keystore.properties` |
| `ANDROID_KEY_ALIAS` | `pluralnova`, unless you changed it |
| `ANDROID_KEY_PASSWORD` | from `android/keystore.properties` |

Create the key once with `android/tools/make-keystore.sh`, then:

```sh
base64 -w0 android/pluralnova.jks   # paste as ANDROID_KEYSTORE_BASE64
```

Android accepts an update only when it is signed with the same key as the
installed app, so this key has to be the same one forever. Keep it somewhere
you will still have it in five years, and keep it out of the repository — it is
gitignored for that reason.

## Getting an APK without cutting a release

**Actions** → **Android** → **Run workflow**. It builds a signed release APK
when the signing secrets are set, a debug one when they are not, and attaches
it to the run for download.

The same workflow runs automatically whenever anything under `android/` changes,
which is the only thing in this repository that compiles the Kotlin — the main
CI job does not touch it.

## Building the archive yourself

```sh
npm run package
```

Produces `dist/pluralnova-<version>.tar.gz` plus its checksum. The archive is
the compiled application without `node_modules`: one of the dependencies is
compiled for the machine it runs on, so it is installed on extraction rather
than shipped.

```sh
tar -xzf pluralnova-1.0.0.tar.gz
cd pluralnova-1.0.0
npm ci --omit=dev
npm start
```
