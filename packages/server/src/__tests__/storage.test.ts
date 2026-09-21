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
    const report = inspect({ inContainer: () => false, isMountPoint: () => false });

    expect(report.kind).toBe('host');
    expect(report.warning).toBeNull();
  });

  it('warns when a container is writing into its own image', async () => {
    const inspect = await load();
    const report = inspect({ inContainer: () => true, isMountPoint: () => false });

    expect(report.kind).toBe('ephemeral');
    expect(report.warning).toContain('NOTHING SAVED HERE WILL SURVIVE');
    // Saying what is wrong is half of it; the warning has to say what to do.
    expect(report.warning).toContain('Railway');
    expect(report.warning).toContain('fly volumes create');
    expect(report.warning).toContain('PLURALNOVA_DATA_DIR');
  });

  it('stays quiet in a container when the directory is a mounted volume', async () => {
    const inspect = await load();
    const report = inspect({ inContainer: () => true, isMountPoint: () => true });

    expect(report.kind).toBe('volume');
    expect(report.warning).toBeNull();
  });

  it('names the directory it is worried about, so the fix is unambiguous', async () => {
    const inspect = await load();
    const report = inspect({ inContainer: () => true, isMountPoint: () => false });

    expect(report.dataDir).toBe(dataDir);
    expect(report.warning).toContain(report.dataDir);
  });
});
