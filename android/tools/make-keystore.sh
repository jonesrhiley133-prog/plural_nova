#!/usr/bin/env bash
#
# Creates the signing key this app is updated with, once.
#
# Android accepts an update only when it is signed with the same key as the
# installed app. There is no recovery from losing it: the only way to ship a new
# version would be to uninstall first, and uninstalling takes the app's local
# copy of someone's records with it. So this writes the key, tells you where it
# is, and refuses to overwrite one that already exists.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
keystore="$here/pluralnova.jks"
properties="$here/keystore.properties"
alias="pluralnova"

if [ -f "$keystore" ]; then
  echo "A key already exists at $keystore"
  echo "Delete it only if you are certain no device has this app installed."
  exit 1
fi

if ! command -v keytool >/dev/null 2>&1; then
  echo "keytool is not on PATH. It ships with the JDK." >&2
  exit 1
fi

password="${PLURALNOVA_KEYSTORE_PASSWORD:-}"
if [ -z "$password" ]; then
  if [ -t 0 ]; then
    read -rsp "Choose a password for the signing key: " password; echo
    read -rsp "Again: " confirm; echo
    [ "$password" = "$confirm" ] || { echo "They did not match." >&2; exit 1; }
  else
    # Non-interactive (CI, a script): generate one and print it once.
    password="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)"
    echo "Generated a password, shown once below. Save it with the keystore."
  fi
fi
[ ${#password} -ge 6 ] || { echo "Six characters minimum." >&2; exit 1; }

keytool -genkeypair \
  -keystore "$keystore" \
  -alias "$alias" \
  -keyalg RSA -keysize 4096 \
  -validity 10950 \
  -storepass "$password" -keypass "$password" \
  -dname "CN=PluralNova, OU=Self-hosted, O=PluralNova" \
  >/dev/null

umask 077
cat > "$properties" <<PROPS
# Written by tools/make-keystore.sh. Gitignored, and it must stay that way.
storeFile=pluralnova.jks
storePassword=$password
keyAlias=$alias
keyPassword=$password
PROPS
chmod 600 "$properties" "$keystore"

cat <<DONE

Signing key created.

  key         $keystore
  settings    $properties
  password    $password

Back both files up somewhere you will still have in five years. Every future
update to this app has to be signed with this key; without it the only way to
install a new version is to uninstall the old one, which deletes its data.

Now build:

  ./gradlew assembleRelease

DONE
