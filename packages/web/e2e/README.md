# End-to-end checks

These drive a real browser against a real build. They exist for the failures a
unit test cannot see: a service worker that never installs, a session that does
not survive going offline, a column that takes the page sideways on a phone.

They are not part of `npm test`, because they need a running server.

```sh
npm run build                 # from the repository root
PLURALNOVA_DATA_DIR=/tmp/pluralnova-e2e PORT=4100 npm start &
npm run test:e2e -w @pluralnova/web
```

`PLURALNOVA_E2E_URL` points them somewhere other than `http://localhost:4100`.
`PLAYWRIGHT_CHROMIUM` points at a Chromium that is already on the machine,
instead of the one Playwright downloads.

Each run registers its own account through the interface, so the checks are
safe against a database with other data in it — but give them a scratch
`PLURALNOVA_DATA_DIR` anyway rather than pointing them at anything real.
