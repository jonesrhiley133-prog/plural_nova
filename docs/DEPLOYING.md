# Getting PluralNova running

PluralNova is self-hosted. There is no account on anybody else's server and no
company in the middle — you run it, on a machine you control, and it holds your
data there. This is how.

## The one decision that shapes everything: HTTPS

Browsers only give a page a service worker, push notifications and "Add to home
screen" on a **secure origin**, which means `https://` or `localhost`. Nothing
else counts — not `http://192.168.1.10:4000`, not a hostname on your own
network.

So opening PluralNova over plain `http` on your network gives you a working
website, and none of the app: it will not install, it will not open offline,
and it will not notify you. Everything else works.

That leaves three honest choices:

| You want | Do this | Installable |
| --- | --- | --- |
| A look around | Run it locally, open `localhost` | Yes, on that machine |
| It on your phone, private to your devices | **Tailscale** | Yes |
| It on your phone, reachable anywhere | **A domain + Caddy** | Yes |

Tailscale is the one to reach for first. It gives you real HTTPS without
putting a private record of your system on the public internet.

---

## 1. Try it, on one machine

Needs [Node.js](https://nodejs.org) 20.12 or newer. Nothing else.

```sh
git clone https://github.com/jonesrhiley133-prog/plural_nova.git
cd plural_nova
npm install
npm run build
npm start
```

Open <http://localhost:4000>. Create an account, or press **Explore with demo
data** to look around a fully populated example system first — that account is
real and yours, and you can delete it or turn it into a permanent one later.

Everything lives in `./data`: the database, uploads, your session secret and
the push keys. That directory *is* your PluralNova.

## 2. Keep it running, with Docker

For a machine that should serve it all the time — an old laptop, a home server,
a Raspberry Pi, a cheap VPS.

```sh
cp .env.example .env     # optional; every setting has a working default
docker compose up -d --build
```

Now it survives reboots and restarts if it crashes. Your data is in a Docker
volume named `pluralnova-data`, which outlives the container.

Reachable at `http://<that machine>:4000` — a working website, not yet an
installable app. Keep going.

## 3. Private HTTPS with Tailscale (recommended)

[Tailscale](https://tailscale.com) puts your devices on a private network only
they can reach, and will issue a real HTTPS certificate for a machine on it.
Free for personal use.

Install it on the server and on your phone, then on the server:

```sh
tailscale serve --bg 4000
tailscale serve status        # prints your https:// address
```

That prints something like `https://homeserver.tailnet-name.ts.net`. Open it on
your phone — signed in to the same Tailscale account — and it is a secure
origin. Install it, and notifications work.

Nothing is exposed to the internet. Your phone reaches the server through
Tailscale wherever you are.

Set `PLURALNOVA_BIND=127.0.0.1` in `.env` and restart, so the only way in is
through Tailscale.

## 4. Public HTTPS with a domain

If you want it reachable without Tailscale — to share a constellation with
friends, say.

You need a domain, a DNS `A` record pointing at the machine, and ports 80 and
443 open to it.

```sh
PLURALNOVA_DOMAIN=nova.example.com \
PLURALNOVA_ACME_EMAIL=you@example.com \
PLURALNOVA_BIND=127.0.0.1 \
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```

Caddy gets a certificate from Let's Encrypt on first start and renews it
without being asked. Give it a minute, then open `https://nova.example.com`.

Before you do this, be clear with yourself about what changes: a machine on the
public internet gets scanned constantly. PluralNova requires an account for
every record and rate-limits sign-in attempts, but the safest version of this
app is the one nobody else can reach.

---

## Backing up

Two independent ways, and they cover different failures:

**From inside the app** — Settings → Backup → *Export everything*. One file
with every record in your account, which restores into any PluralNova. Do this
before anything you are unsure about. It is the only backup that survives you
moving to a different server.

**The data directory** — copy `./data` (or the Docker volume) somewhere else.
This covers the whole instance: every account, the push keys, uploaded media.

```sh
# Docker: copy the volume out to a dated archive
docker run --rm -v pluralnova-data:/data -v "$PWD:/out" alpine \
  tar czf "/out/pluralnova-$(date +%F).tar.gz" -C /data .
```

Stop the container first if you want a guaranteed-consistent copy of the
database.

## Updating

```sh
git pull
npm install && npm run build   # or: docker compose up -d --build
```

The database migrates itself on start: new tables and columns are added, and
nothing is ever dropped automatically. Take a backup first anyway.

## The Android app

Optional — PluralNova installs from any browser as a PWA, which is simpler.
If you want an APK, see [`../android/README.md`](../android/README.md). The
short version:

```sh
cd android
./tools/make-keystore.sh    # once, and keep the key forever
./tools/publish.sh          # builds and publishes it to your own server
```

Then Settings → About on the phone has a download link, and the app updates
itself from your server after that.

---

## When something is wrong

**"It works on the server but not from my phone."** Almost always the HTTPS
rule above. Check the address bar starts with `https://` or is `localhost`.

**No "Install" or "Add to home screen" option.** Same cause. Chrome's
DevTools → Application → Manifest will say which requirement is unmet.

**Notifications never arrive.** They need HTTPS, and permission granted in the
browser, and the category switched on in Settings → Notifications. Use *Send a
test* there to check the chain.

**Port 4000 is already taken.** Set `PORT` in `.env`, or `PLURALNOVA_PORT` for
Docker.

**`npm start` says it cannot find the client.** Run `npm run build` first — the
server serves the built client, and there is nothing to serve until it exists.

**Everything disappeared after a Docker rebuild.** The volume was removed —
`docker compose down -v` deletes it. Restore from a backup, and use
`docker compose down` without `-v` in future.

**A reset code never arrives by email.** There is no mail transport configured
by default, so outside production the code comes back in the API response
instead. Set `PLURALNOVA_MAIL_FROM` only when you have one wired up.
