#!/usr/bin/env bash
#
# Builds a signed release and publishes it to a PluralNova server, which is how
# an installed app finds out there is a new one.
#
# The version is not passed in: it comes from package.json, the same place the
# Gradle build reads it, so the APK and the thing announcing it cannot disagree.
#
#   ./tools/publish.sh                 # publishes into ../data (the server default)
#   ./tools/publish.sh /srv/pluralnova # or wherever PLURALNOVA_DATA_DIR points

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="$(cd "$here/.." && pwd)"
data_dir="${1:-$repo/data}"
releases="$data_dir/releases"

if [ ! -f "$here/keystore.properties" ]; then
  echo "No signing key. Run ./tools/make-keystore.sh first — an unsigned APK will not install." >&2
  exit 1
fi

version="$(grep -m1 '"version"' "$repo/package.json" | sed -E 's/.*"version" *: *"([^"]+)".*/\1/')"
[ -n "$version" ] || { echo "Could not read the version from package.json" >&2; exit 1; }

# The same arithmetic as app/build.gradle.kts: 1.2.3 -> 10203.
IFS='.' read -r major minor patch <<< "${version%%-*}"
version_code=$(( major * 10000 + minor * 100 + patch ))

echo "Building PluralNova $version (versionCode $version_code)…"
(cd "$here" && ./gradlew --quiet assembleRelease)

apk="$here/app/build/outputs/apk/release/app-release.apk"
[ -f "$apk" ] || { echo "Expected an APK at $apk" >&2; exit 1; }

mkdir -p "$releases"
# Copied to a temporary name first so the server never serves half a file.
cp "$apk" "$releases/.pluralnova.apk.incoming"
mv "$releases/.pluralnova.apk.incoming" "$releases/pluralnova.apk"

notes="${PLURALNOVA_RELEASE_NOTES:-}"
if [ -n "$notes" ]; then
  notes_json=",\"notes\":\"$(printf '%s' "$notes" | sed 's/\\/\\\\/g; s/"/\\"/g')\""
else
  notes_json=""
fi

cat > "$releases/android.json" <<JSON
{"versionCode":$version_code,"versionName":"$version"$notes_json}
JSON

size="$(wc -c < "$releases/pluralnova.apk" | tr -d ' ')"
cat <<DONE

Published to $releases

  version     $version (code $version_code)
  size        $(( size / 1024 )) KB

Anyone running this build will be offered the update next time they open the
app. A new install can download it from your server at /app/pluralnova.apk.
DONE
