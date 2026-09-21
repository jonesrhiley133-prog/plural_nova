/**
 * Builds the distributable archive for a release.
 *
 * What goes in is the compiled output, not the sources: the server's JavaScript,
 * the built web client, and the package manifests needed to install the handful
 * of runtime dependencies. What stays out is `node_modules` — better-sqlite3 is
 * a native module, so a bundled copy would only work on the machine that built
 * it, and an archive that runs on one operating system is worse than one that
 * says what to install.
 *
 * The result is `dist/pluralnova-<version>.tar.gz` and a checksum beside it.
 *
 *   npm run package
 */

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const name = `pluralnova-${pkg.version}`;

const out = join(root, 'dist');
const staging = join(out, name);

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

console.log(`Building PluralNova ${pkg.version}…`);
run('npm', ['run', 'build']);

// The compiled application.
for (const workspace of ['shared', 'server']) {
  cpSync(join(root, 'packages', workspace, 'dist'), join(staging, 'packages', workspace, 'dist'), {
    recursive: true,
  });
  cpSync(
    join(root, 'packages', workspace, 'package.json'),
    join(staging, 'packages', workspace, 'package.json'),
  );
}
cpSync(join(root, 'packages/web/dist'), join(staging, 'packages/web/dist'), { recursive: true });
cpSync(join(root, 'packages/web/package.json'), join(staging, 'packages/web/package.json'));

// Manifests, so `npm ci --omit=dev` installs exactly what was tested against.
for (const file of ['package.json', 'package-lock.json', 'README.md', '.env.example']) {
  cpSync(join(root, file), join(staging, file));
}
cpSync(join(root, 'docs'), join(staging, 'docs'), { recursive: true });

// Deployment files, so the archive can be run with Docker as well as directly.
for (const file of ['Dockerfile', '.dockerignore', 'docker-compose.yml', 'docker-compose.https.yml']) {
  cpSync(join(root, file), join(staging, file));
}
cpSync(join(root, 'deploy'), join(staging, 'deploy'), { recursive: true });

writeFileSync(
  join(staging, 'INSTALL.md'),
  `# PluralNova ${pkg.version}

This archive holds the compiled application. It does not include
\`node_modules\`, because one of the dependencies is compiled for the machine it
runs on — installing them here is what makes this work on yours.

    npm ci --omit=dev
    npm start

Then open http://localhost:4000.

Before putting it on a phone, read \`docs/DEPLOYING.md\`: a browser only grants
service workers, notifications and "Add to home screen" over HTTPS or
localhost, so reaching this at http://192.168.x.x gives a working website and
not an installable app.

Everything you create lives in \`./data\` — the database, uploads, the session
secret and the push keys. That directory is the thing to back up.
`,
);

console.log('Packing…');
run('tar', ['-czf', join(out, `${name}.tar.gz`), '-C', out, name]);
rmSync(staging, { recursive: true, force: true });

const archive = join(out, `${name}.tar.gz`);
const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
// The same format `sha256sum -c` reads, so verifying is one command.
writeFileSync(join(out, `${name}.tar.gz.sha256`), `${digest}  ${name}.tar.gz\n`);

const size = readFileSync(archive).length;
console.log(`\ndist/${name}.tar.gz  (${Math.round(size / 1024)} KB)`);
console.log(`sha256  ${digest}`);
