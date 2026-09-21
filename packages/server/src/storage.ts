import { existsSync, statSync } from 'node:fs';
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
 * so comparing device numbers answers the question without guessing at platform
 * names or environment variables.
 */

export type StorageKind = 'host' | 'volume' | 'ephemeral';

export interface StorageReport {
  kind: StorageKind;
  dataDir: string;
  /** Written to the log when the data will not outlive the container. */
  warning: string | null;
}

/**
 * The two facts this decision rests on, injectable so a test can state them
 * rather than having to be running inside a container to check the branch that
 * matters.
 */
export interface StorageProbes {
  inContainer: () => boolean;
  isMountPoint: (path: string) => boolean;
}

function inContainer(): boolean {
  if (existsSync('/.dockerenv')) return true;
  try {
    // Set on Fly, Railway, Render, Kubernetes and plain Docker alike.
    return Boolean(process.env['KUBERNETES_SERVICE_HOST']) || existsSync('/run/.containerenv');
  } catch {
    return false;
  }
}

function isMountPoint(path: string): boolean {
  try {
    const here = statSync(path);
    const above = statSync(dirname(path));
    // A separate device means something was mounted here.
    return here.dev !== above.dev;
  } catch {
    return false;
  }
}

export const realProbes: StorageProbes = { inContainer, isMountPoint };

export function inspectStorage(probes: StorageProbes = realProbes): StorageReport {
  const dataDir = config.dataDir;

  if (!probes.inContainer()) {
    return { kind: 'host', dataDir, warning: null };
  }

  if (probes.isMountPoint(dataDir)) {
    return { kind: 'volume', dataDir, warning: null };
  }

  return {
    kind: 'ephemeral',
    dataDir,
    warning: [
      '',
      '  ┌─────────────────────────────────────────────────────────────────┐',
      '  │  NOTHING SAVED HERE WILL SURVIVE THE NEXT DEPLOY                │',
      '  └─────────────────────────────────────────────────────────────────┘',
      '',
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
      '',
    ].join('\n'),
  };
}
