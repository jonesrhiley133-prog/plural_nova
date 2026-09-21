# Security

PluralNova holds a system's private records — journals, health notes, messages,
a vault. A vulnerability here is not an inconvenience, so please report one
rather than demonstrating it.

## Reporting

Use GitHub's private reporting:
**[Report a vulnerability](https://github.com/jonesrhiley133-prog/plural_nova/security/advisories/new)**.
That reaches the maintainer without the report being public first.

Please do not open a public issue for anything that would let one account read
another's data, bypass sign-in, or execute code on a server.

Useful things to include: what you did, what happened, what you expected, and
the version or commit. A proof of concept against your own instance is welcome;
please do not test against anybody else's.

## What is in scope

Anything in this repository: the server, the web client, the Android shell, and
the container and deployment files.

Out of scope, because they are the operator's to configure: the machine
PluralNova runs on, the reverse proxy in front of it, and the decision to put
an instance on the public internet at all.

## What the design already assumes

These are deliberate, and reports of them are duplicates rather than findings:

- **Scoping is the security model.** Every generated query filters by owner.
  A path that reads a record table without one is a real bug — please report
  that.
- **A backup restore only ever writes into the account restoring it.** Owner
  fields are rewritten on the way in, so a crafted backup file cannot insert
  rows belonging to somebody else.
- **Message encryption is real, or absent and labelled.** Private keys stay in
  the browser. Where the other side has published no key, the message is sent
  in the clear and the interface says "Not encrypted" — a padlock over
  plaintext would be worse than no padlock.
- **Cleartext HTTP is permitted** for the common case of a server on your own
  network. The Android setup screen warns when an address is neither HTTPS nor
  local. An operator choosing HTTP on the public internet is a configuration
  decision, not a vulnerability in this code.
- **Password reset codes are returned in the API response** when no mail
  transport is configured. This is refused when `NODE_ENV=production`.

## Keeping an instance safe

- Put it behind HTTPS. It is also what makes it installable — see
  [`docs/DEPLOYING.md`](docs/DEPLOYING.md).
- Back up your data directory and keep it private: it holds the database, the
  session secret and the push keys.
- Update by pulling and rebuilding. The database migrates itself forward and
  never drops anything automatically.
