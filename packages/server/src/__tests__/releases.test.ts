import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestClient } from './harness.js';

/**
 * Publishing and finding the Android build.
 *
 * This is the only path an update travels on a self-hosted install: no store,
 * no signing service, just the server saying what the current build is. If the
 * version or the checksum it reports were wrong, phones would either never
 * update or install something that does not match — so both are pinned here.
 */
describe('the published Android build', () => {
  let client: TestClient;
  let releases: string;

  const apk = randomBytes(4096);
  const sha256 = createHash('sha256').update(apk).digest('hex');

  const publish = (manifest: unknown, body: Buffer = apk) => {
    mkdirSync(releases, { recursive: true });
    writeFileSync(join(releases, 'pluralnova.apk'), body);
    writeFileSync(join(releases, 'android.json'), JSON.stringify(manifest));
  };

  beforeAll(async () => {
    client = await createTestApp();
    releases = join(client.dataDir, 'releases');
  });
  afterAll(() => client.close());

  it('says there is nothing to install on a server with no build', async () => {
    const result = await client.request('GET', '/api/app/android');
    expect(result.status).toBe(200);
    expect(result.body.data.release).toBeNull();

    const download = await client.request('GET', '/app/pluralnova.apk');
    expect(download.status).toBe(404);
  });

  it('describes a published build, including a checksum of the actual file', async () => {
    publish({ versionCode: 10000, versionName: '1.0.0', notes: 'First build.' });

    const result = await client.request('GET', '/api/app/android');
    expect(result.body.data.release).toMatchObject({
      versionCode: 10000,
      versionName: '1.0.0',
      notes: 'First build.',
      size: apk.length,
      sha256,
      url: '/app/pluralnova.apk',
    });
  });

  it('is reachable without signing in, because that is how it gets onto a phone', async () => {
    const result = await client.request('GET', '/api/app/android');
    expect(result.status).toBe(200);
    expect(result.body.data.release).not.toBeNull();
  });

  it('notices a newer build without a restart', async () => {
    publish({ versionCode: 10001, versionName: '1.0.1' });

    const result = await client.request('GET', '/api/app/android');
    expect(result.body.data.release.versionCode).toBe(10001);
    expect(result.body.data.release.versionName).toBe('1.0.1');
  });

  it('re-hashes when the file changes under the same name', async () => {
    const replacement = randomBytes(2048);
    publish({ versionCode: 10002, versionName: '1.0.2' }, replacement);

    const result = await client.request('GET', '/api/app/android');
    expect(result.body.data.release.sha256).toBe(
      createHash('sha256').update(replacement).digest('hex'),
    );
    expect(result.body.data.release.size).toBe(replacement.length);
  });

  it('ignores a manifest that is missing what a phone needs to decide', async () => {
    publish({ versionName: '1.0.3' });
    expect((await client.request('GET', '/api/app/android')).body.data.release).toBeNull();

    publish({ versionCode: 10004 });
    expect((await client.request('GET', '/api/app/android')).body.data.release).toBeNull();
  });

  it('ignores a manifest that is not JSON rather than failing the request', async () => {
    mkdirSync(releases, { recursive: true });
    writeFileSync(join(releases, 'pluralnova.apk'), apk);
    writeFileSync(join(releases, 'android.json'), 'not json at all');

    const result = await client.request('GET', '/api/app/android');
    expect(result.status).toBe(200);
    expect(result.body.data.release).toBeNull();
  });

  it('stops offering a build once it is withdrawn', async () => {
    rmSync(releases, { recursive: true, force: true });
    expect((await client.request('GET', '/api/app/android')).body.data.release).toBeNull();
  });
});
