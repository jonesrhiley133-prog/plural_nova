#!/bin/sh
#
# Hand the data directory to the user the server runs as, then become that user.
#
# A volume arrives owned by whatever created it, and on Railway, Fly, Render and
# Kubernetes that is root. The image's own /data is given to `node` at build
# time, but a mount covers that directory completely, so build-time ownership
# says nothing about the directory the server will actually open. The only
# moment the truth is knowable is now, and fixing it needs a privilege the
# server must not keep.
#
# Hence the shape the Postgres and Redis images use for the same reason: start
# as root, correct the one thing only root can correct, drop to `node`, exec.
# The server itself never runs as root. Running it as root would be the easy
# version of this and is not worth what it costs.
set -e

DATA_DIR="${PLURALNOVA_DATA_DIR:-/data}"

if [ "$(id -u)" = '0' ]; then
  mkdir -p "$DATA_DIR"

  # Recurse only when the directory itself is owned by somebody else, which
  # means a freshly mounted volume or a deploy that ran as another user. In the
  # steady state — every restart after the first — this is a single stat, not a
  # walk of every file somebody has ever uploaded.
  if [ "$(stat -c '%u' "$DATA_DIR")" != "$(id -u node)" ]; then
    echo "[pluralnova] taking ownership of $DATA_DIR for the node user"
    chown -R node:node "$DATA_DIR"
  fi

  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

# Already unprivileged, because the platform or a --user flag said so. There is
# nothing to correct and no way to correct it; if the directory is not writable
# the server says so itself, which is a better error than one from here.
exec "$@"
