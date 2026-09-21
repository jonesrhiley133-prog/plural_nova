import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Set before the first import of the config module, which resolves the data
// directory once at load rather than per call.
const root = mkdtempSync(join(tmpdir(), 'pluralnova-storage-'));
const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });
process.env['PLURALNOVA_DATA_DIR'] = dataDir;

const NAMED = '/var/lib/docker/volumes/pluralnova-data/_data';
const ANONYMOUS =
  '/var/lib/docker/volumes/52dd8e1a6e2feefd5da75e10de8b208bc17f4792c51f828042d3055c83e6e2d2/_data';

/**
 * The check that stops somebody losing every account they made.
 *
 * Deploying to a container platform without attaching a volume produces an app
 * that works perfectly until the next deploy, at which point everything in it
 * is gone. There is no error to notice, so the only defence is saying so at
 * startup — and a warning that cries wolf on an ordinary laptop would be
 * ignored by the time it mattered.
 */
describe('storage detection', () => {
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env['PLURALNOVA_DATA_DIR'];
  });

  const load = async () => (await import('../storage.js')).inspectStorage;

  it('says nothing on a machine that is not a container', async () => {
    const inspect = await load();
    const report = inspect({ inContainer: () => false, mountedAt: () => null });

    expect(report.kind).toBe('host');
    expect(report.warning).toBeNull();
  });

  it('warns when a container is writing into its own image', async () => {
    const inspect = await load();
    const report = inspect({ inContainer: () => true, mountedAt: () => null });

    expect(report.kind).toBe('ephemeral');
    expect(report.warning).toContain('NOTHING SAVED HERE WILL SURVIVE');
    // Saying what is wrong is half of it; the warning has to say what to do.
    expect(report.warning).toContain('Railway');
    expect(report.warning).toContain('fly volumes create');
    expect(report.warning).toContain('PLURALNOVA_DATA_DIR');
  });

  it('stays quiet in a container when the directory is a named volume', async () => {
    const inspect = await load();
    const report = inspect({ inContainer: () => true, mountedAt: () => ({ source: NAMED }) });

    expect(report.kind).toBe('volume');
    expect(report.warning).toBeNull();
  });

  /**
   * The bug this check was written to catch, and originally did not.
   *
   * `VOLUME` in a Dockerfile makes Docker invent a volume when nobody asked for
   * one. It is a genuine filesystem on its own device, so the first version of
   * this call reported it as a mounted volume and said nothing — in exactly the
   * case it exists for. Found by running the container, not by a test.
   */
  it('warns about a volume nobody named, which a device check calls a volume', async () => {
    const inspect = await load();
    const report = inspect({ inContainer: () => true, mountedAt: () => ({ source: ANONYMOUS }) });

    expect(report.kind).toBe('anonymous');
    expect(report.warning).toContain('NO NAME');
    // The path is the only way to get the data back, so it has to be printed.
    expect(report.warning).toContain(ANONYMOUS);
    expect(report.warning).toContain('docker volume create');
  });

  it('keeps quiet when it cannot tell where a mount came from', async () => {
    const inspect = await load();
    const report = inspect({ inContainer: () => true, mountedAt: () => ({ source: null }) });

    // Something is mounted; the platform just will not say what. Guessing here
    // would put the banner in front of every Fly and Render deploy that is
    // correctly configured, and a warning nobody believes protects nobody.
    expect(report.kind).toBe('volume');
    expect(report.warning).toBeNull();
  });

  it('names the directory it is worried about, so the fix is unambiguous', async () => {
    const inspect = await load();
    const report = inspect({ inContainer: () => true, mountedAt: () => null });

    expect(report.dataDir).toBe(dataDir);
    expect(report.warning).toContain(report.dataDir);
  });
});

/**
 * Real output, copied from `/proc/self/mountinfo` inside two containers started
 * from this repository's image — one with `-v pluralnova-data:/data` and one
 * with nothing, which is how Docker was caught inventing the second volume.
 */
describe('reading mountinfo', () => {
  const load = async () => (await import('../storage.js')).sourceFromMountinfo;

  const REAL = [
    '103 76 254:0 /var/lib/docker/overlay2/f3/diff / rw,relatime master:1 - ext4 /dev/vda rw',
    `121 103 254:0 ${ANONYMOUS} /data rw,relatime master:1 - ext4 /dev/vda rw,resv_strict`,
    '124 103 0:52 / /proc rw,nosuid,nodev,noexec,relatime - proc proc rw',
  ].join('\n');

  it('finds the source of the mount at a path', async () => {
    const source = await load();
    expect(source(REAL, '/data')).toBe(ANONYMOUS);
  });

  it('returns null for a path nothing is mounted on', async () => {
    const source = await load();
    expect(source(REAL, '/elsewhere')).toBeNull();
  });

  it('takes the last mount when one is stacked over another', async () => {
    const source = await load();
    const stacked = `${REAL}\n200 103 254:0 ${NAMED} /data rw,relatime - ext4 /dev/vda rw`;
    expect(source(stacked, '/data')).toBe(NAMED);
  });

  it('decodes the octal escapes mountinfo uses for awkward paths', async () => {
    const source = await load();
    const spaced = '150 103 254:0 /var/lib/docker/volumes/my\\040volume/_data /data rw - ext4 x rw';
    expect(source(spaced, '/data')).toBe('/var/lib/docker/volumes/my volume/_data');
  });

  it('ignores lines too short to be a mount', async () => {
    const source = await load();
    expect(source('\n\nnot a mountinfo line\n', '/data')).toBeNull();
  });
});
