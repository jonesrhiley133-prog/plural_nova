#!/usr/bin/env bash
#
# Gets a fresh checkout ready to work in.
#
# A web session starts from a clone with no node_modules and no build output,
# so the first thing anyone tries — a typecheck, a test, starting the server —
# fails for a reason that has nothing to do with the code. This installs the
# workspace and builds the shared package the other two compile against.
#
# It is deliberately quiet and never fatal: a hook that blocks the session over
# a slow network is worse than one that lets the session start and say why.

set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root" || exit 0

note() { printf 'session-start: %s\n' "$1" >&2; }

if ! command -v npm >/dev/null 2>&1; then
  note "npm is not on PATH; skipping setup"
  exit 0
fi

if [ ! -d node_modules ]; then
  note "installing workspace dependencies"
  if ! npm ci --no-audit --no-fund >/dev/null 2>&1; then
    # A lockfile that has drifted from package.json makes `npm ci` refuse;
    # `npm install` is the right fallback rather than a failed session.
    npm install --no-audit --no-fund >/dev/null 2>&1 || note "dependency install failed"
  fi
fi

# The server and the web client both import @pluralnova/shared from its build
# output, so nothing else typechecks until this exists.
if [ ! -d packages/shared/dist ]; then
  note "building @pluralnova/shared"
  npm run build -w @pluralnova/shared >/dev/null 2>&1 || note "shared build failed"
fi

exit 0
