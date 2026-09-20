import { Router } from 'express';
import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { newId, now } from '@pluralnova/shared';
import { config } from '../config.js';
import { handler, ok } from '../http/respond.js';
import { badRequest, notFound } from '../http/errors.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { createRecord, getRecord } from '../db/repository.js';

/**
 * Media uploads.
 *
 * Files are written to disk and referenced by URL; the database stores metadata
 * only. Type and size are checked from the request rather than trusted from a
 * filename, and the stored name is generated, so an upload cannot choose where
 * it lands or what it is served as.
 */

export const mediaRouter: Router = Router();
mediaRouter.use(requireAuth);

const ALLOWED: Record<string, { extension: string; kind: 'image' | 'video' | 'audio' | 'document' }> = {
  'image/png': { extension: '.png', kind: 'image' },
  'image/jpeg': { extension: '.jpg', kind: 'image' },
  'image/webp': { extension: '.webp', kind: 'image' },
  'image/gif': { extension: '.gif', kind: 'image' },
  'image/avif': { extension: '.avif', kind: 'image' },
  'image/svg+xml': { extension: '.svg', kind: 'image' },
  'video/mp4': { extension: '.mp4', kind: 'video' },
  'video/webm': { extension: '.webm', kind: 'video' },
  'audio/mpeg': { extension: '.mp3', kind: 'audio' },
  'audio/ogg': { extension: '.ogg', kind: 'audio' },
  'audio/wav': { extension: '.wav', kind: 'audio' },
  'application/pdf': { extension: '.pdf', kind: 'document' },
  'text/plain': { extension: '.txt', kind: 'document' },
};

mediaRouter.post(
  '/upload',
  express.raw({ type: () => true, limit: config.maxUploadBytes }),
  handler(async (req, res) => {
    const context = auth(req);
    const mimeType = (req.header('content-type') ?? '').split(';')[0]?.trim() ?? '';
    const allowed = ALLOWED[mimeType];
    if (!allowed) {
      throw badRequest(
        `PluralNova does not accept ${mimeType || 'that kind of file'}. Images, video, audio, PDFs and text files are supported.`,
      );
    }

    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw badRequest('The upload was empty.');
    if (buffer.length > config.maxUploadBytes) {
      throw badRequest(`Files are limited to ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`);
    }

    const id = newId('upl');
    const filename = `${id}${allowed.extension}`;
    await writeFile(join(config.uploadsDir, filename), buffer);

    getDb()
      .prepare(
        'INSERT INTO uploads (id, userId, filename, mimeType, sizeBytes, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, context.user.id, filename, mimeType, buffer.length, now());

    const url = `/uploads/${filename}`;
    const title = (req.header('x-file-name') ?? '').slice(0, 200) || filename;

    // A media record is created alongside the file so the library, the gallery
    // and backup all see it without a second round trip.
    const record = createRecord(
      'mediaItems',
      context.scope,
      {
        title,
        mediaType: allowed.kind,
        url,
        mimeType,
        sizeBytes: buffer.length,
        folder: req.header('x-folder') ?? '',
        tags: [],
        attachmentIds: [],
      },
      { visibility: 'private' },
    );

    ok(res, { id: record.id, url, mediaType: allowed.kind, sizeBytes: buffer.length, title }, 201);
  }),
);

mediaRouter.delete(
  '/:id',
  handler(async (req, res) => {
    const context = auth(req);
    const record = getRecord('mediaItems', context.scope, String(req.params['id']));
    if (!record) throw notFound('That media item');

    const url = String(record['url'] ?? '');
    if (url.startsWith('/uploads/')) {
      const filename = url.slice('/uploads/'.length);
      const row = getDb()
        .prepare('SELECT id FROM uploads WHERE filename = ? AND userId = ?')
        .get(filename, context.user.id) as { id: string } | undefined;
      if (row) {
        await unlink(join(config.uploadsDir, filename)).catch(() => {
          // A file that is already gone is not an error worth failing the delete for.
        });
        getDb().prepare('DELETE FROM uploads WHERE id = ?').run(row.id);
      }
    }

    getDb()
      .prepare('UPDATE "mediaItems" SET "deletedAt" = ?, "updatedAt" = ? WHERE "id" = ? AND "userId" = ?')
      .run(now(), now(), record.id, context.user.id);
    ok(res, { deleted: true });
  }),
);

mediaRouter.get(
  '/usage',
  handler((req, res) => {
    const context = auth(req);
    const row = getDb()
      .prepare('SELECT COUNT(*) AS files, COALESCE(SUM(sizeBytes), 0) AS bytes FROM uploads WHERE userId = ?')
      .get(context.user.id) as { files: number; bytes: number };
    ok(res, { files: row.files, bytes: row.bytes, limitBytes: config.maxUploadBytes });
  }),
);

export { randomUUID, createHash, extname };
