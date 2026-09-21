import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

/**
 * Is the data directory going to survive a redeploy?
 *
 * This exists because of how the failure looks without it. PluralNova keeps its
 * database, uploads and push keys as files. Deploy it to a container platform
 * and forget to attach a volume, and everything works — accounts are created,
 * entries are written, nothing errors — right up until the next deploy, when
 * every account silently ceases to exist. Nobody reads a log line about a
 * directory. They read "why is my system gone".
 *
 * A mounted volume is a different filesystem from the image it is mounted into,
 * so comparing device numbers answers most of the question without guessing at
 * platform names or environment variables. It does not answer all of it: a
 * volume nobody named is a different filesystem too, and is very nearly as
 * temporary as no volume at all. Hence the second look at where it came from.
 */

export type StorageKind = 'host' | 'volume' | 'anonymous' | 'ephemeral';

export interface StorageReport {
  kind: StorageKind;
  dataDir: string;
  /** Written to the log when the data may not outlive the container. */
  warning: string | null;
}

/** Whatever is mounted at a path. */
export interface Mount {
  /** The host side of the mount, when the kernel will say, and null when not. */
  source: string | null;
}

/**
 * The two facts this decision rests on, injectable so a test can state them
 * rather than having to be running inside a container to check the branch that
 * matters.
 */
export interface StorageProbes {
  inContainer: () => boolean;
  /** What is mounted at this path, or null when it is part of the image. */
  mountedAt: (path: string) => Mount | null;
}

/**
 * Docker gives a volume nobody named a 64-character hex name. That is the
 * signature worth catching: `VOLUME` in a Dockerfile, or `-v /data` with
 * nothing on the left, quietly produces one, and it is a real filesystem that
 * a device-number check is happy with. It just belongs to one container.
 */
const ANONYMOUS_VOLUME = /\/volumes\/[0-9a-f]{64}\/_data\/?$/;

function inContainer(): boolean {
  if (existsSync('/.dockerenv')) return true;
  try {
    // Set on Fly, Railway, Render, Kubernetes and plain Docker alike.
    return Boolean(process.env['KUBERNETES_SERVICE_HOST']) || existsSync('/run/.containerenv');
  } catch {
    return false;
  }
}

/** mountinfo escapes the characters that would otherwise break its own columns. */
function unescapeField(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  );
}

/**
 * Where a mount came from, given the contents of a mountinfo file.
 *
 * Separate from reading /proc so it can be tested against what a real kernel
 * actually printed, which is the only way to be sure of a format this
 * positional.
 */
export function sourceFromMountinfo(mountinfo: string, path: string): string | null {
  let source: string | null = null;
  for (const line of mountinfo.split('\n')) {
    // 0:id 1:parent 2:major:minor 3:root 4:mountpoint …
    const fields = line.split(' ');
    const root = fields[3];
    const mountPoint = fields[4];
    if (root === undefined || mountPoint === undefined) continue;
    // Later lines win: a mount can be covered by another mounted over it.
    if (unescapeField(mountPoint) === path) source = unescapeField(root);
  }
  return source;
}

/**
 * Absent outside Linux, and absent in some sandboxes, which is why the caller
 * treats null as "no idea" rather than as "nothing mounted".
 */
function mountSource(path: string): string | null {
  try {
    return sourceFromMountinfo(readFileSync('/proc/self/mountinfo', 'utf8'), path);
  } catch {
    return null;
  }
}

function mountedAt(path: string): Mount | null {
  try {
    // A separate device means something was mounted here.
    if (statSync(path).dev === statSync(dirname(path)).dev) return null;
  } catch {
    return null;
  }
  return { source: mountSource(path) };
}

export const realProbes: StorageProbes = { inContainer, mountedAt };

function banner(headline: string, body: string[]): string {
  const width = 65;
  const rule = '─'.repeat(width);
  return [
    '',
    `  ┌${rule}┐`,
    `  │  ${headline.padEnd(width - 2)}│`,
    `  └${rule}┘`,
    '',
    ...body,
    '',
  ].join('\n');
}

export function inspectStorage(probes: StorageProbes = realProbes): StorageReport {
  const dataDir = config.dataDir;

  if (!probes.inContainer()) {
    return { kind: 'host', dataDir, warning: null };
  }

  const mount = probes.mountedAt(dataDir);

  if (mount === null) {
    return {
      kind: 'ephemeral',
      dataDir,
      warning: banner('NOTHING SAVED HERE WILL SURVIVE THE NEXT DEPLOY', [
        `  This looks like a container, and ${dataDir} is part of its image`,
        '  rather than a mounted volume. The database, every account in it,',
        '  uploaded files and the push keys all live there.',
        '',
        '  The app will run. It will look fine. Everything in it disappears',
        '  the next time you deploy.',
        '',
        '  Attach a persistent volume and mount it at this path:',
        '',
        '    Railway   Service -> Settings -> Volumes -> Add volume',
        '    Fly.io    fly volumes create pluralnova_data --size 1',
        '    Render    a disk on the service, mountPath /data',
        '    Docker    -v pluralnova-data:/data',
        '',
        '  Set PLURALNOVA_DATA_DIR to the mount path if it is not this one.',
      ]),
    };
  }

  if (mount.source !== null && ANONYMOUS_VOLUME.test(mount.source)) {
    return {
      kind: 'anonymous',
      dataDir,
      warning: banner('THIS VOLUME HAS NO NAME, AND SO NO SECOND LIFE', [
        `  ${dataDir} is a real volume, so it survives restarting this`,
        '  container. It does not survive replacing it, which is what a',
        '  deploy does: the new container gets a new empty volume, and this',
        '  one is left behind under a name nobody chose.',
        '',
        `    ${mount.source}`,
        '',
        '  Name it, and the next container can be pointed at the same data:',
        '',
        '    docker volume create pluralnova-data',
        '    docker run -v pluralnova-data:/data ...',
        '',
        '  docker-compose.yml in this repository already does this.',
        '',
        '  To keep what is already here, copy it out of the path above',
        '  before replacing the container.',
      ]),
    };
  }

  return { kind: 'volume', dataDir, warning: null };
}
