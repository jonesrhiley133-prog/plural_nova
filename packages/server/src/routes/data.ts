import { Router } from 'express';
import {
  APP_VERSION,
  BACKUP_COLLECTIONS,
  createBackup,
  migrateBackup,
  newId,
  now,
  suggestedFilename,
  validateBackup,
  type BackupFile,
  type ConflictStrategy,
  type StoredRecord,
} from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { badRequest } from '../http/errors.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { allRecords } from '../db/repository.js';
import { readSettings, toPublicUser, updateUser } from '../auth/users.js';
import { restoreCollections } from '../services/restore.js';
import { refreshMemberCount } from '../services/systems.js';
import { historyPhrases, recordHistory } from '../services/history.js';
import { checkAchievements } from '../services/achievements.js';
import { importFromExternal, listImportSources } from '../services/importers.js';

/**
 * Backup, restore, import and export.
 *
 * The rule this file exists to keep: a user can always take everything with
 * them, and nothing they bring back destroys what is already here. Restores
 * merge by default, previews run before writes, and a failed row is reported
 * rather than swallowed.
 */

export const dataRouter: Router = Router();
dataRouter.use(requireAuth);

dataRouter.get(
  '/backup',
  handler(async (req, res) => {
    const context = auth(req);
    const includeSocial = req.query['social'] !== 'false';

    const collections: Record<string, StoredRecord[]> = {};
    for (const collection of BACKUP_COLLECTIONS) {
      if (!includeSocial && collection.area === 'social') continue;
      const rows = allRecords(collection.name, context.scope);
      if (rows.length > 0) collections[collection.name] = rows;
    }

    const backup = createBackup({
      account: {
        displayName: context.user.displayName,
        email: context.user.email,
        mode: context.settings.mode,
        activeSystemId: context.user.activeSystemId,
      },
      settings: context.settings as unknown as Record<string, unknown>,
      collections,
      appVersion: APP_VERSION,
      ...(typeof req.query['notes'] === 'string' ? { notes: req.query['notes'] } : {}),
    });

    const serialised = JSON.stringify(backup);
    getDb()
      .prepare(
        `INSERT INTO backups (id, userId, createdAt, sizeBytes, recordCount, formatVersion, checksum, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId('bkp'),
        context.user.id,
        backup.createdAt,
        serialised.length,
        Object.values(collections).reduce((sum, rows) => sum + rows.length, 0),
        backup.version,
        backup.checksum,
        backup.notes ?? null,
      );

    updateUser(context.user.id, {
      settings: JSON.stringify({ ...context.settings, lastBackupAt: backup.createdAt }),
    });
    await checkAchievements(context.scope);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${suggestedFilename()}"`);
    res.send(serialised);
  }),
);

dataRouter.get(
  '/backups',
  handler((req, res) => {
    const context = auth(req);
    const rows = getDb()
      .prepare('SELECT * FROM backups WHERE userId = ? ORDER BY createdAt DESC LIMIT 50')
      .all(context.user.id);
    ok(res, { backups: rows, lastBackupAt: context.settings.lastBackupAt });
  }),
);

/** Validates a file and reports exactly what a restore would do. Writes nothing. */
dataRouter.post(
  '/restore/preview',
  handler((req, res) => {
    const file = (req.body as { backup?: unknown }).backup ?? req.body;
    const validation = validateBackup(file);
    ok(res, {
      ...validation,
      collections: validation.preview,
      canRestore: validation.valid,
    });
  }),
);

dataRouter.post(
  '/restore',
  handler(async (req, res) => {
    const context = auth(req);
    const body = req.body as {
      backup?: unknown;
      strategy?: ConflictStrategy;
      collections?: string[];
      includeSettings?: boolean;
    };

    const raw = body.backup ?? body;
    const validation = validateBackup(raw);
    if (!validation.valid) {
      throw badRequest(
        validation.errors[0] ?? 'That backup cannot be read.',
        Object.fromEntries(validation.errors.map((message, index) => [`error${index}`, message])),
      );
    }

    const migrated = migrateBackup(raw as BackupFile);
    const strategy: ConflictStrategy = body.strategy ?? 'merge';
    const report = restoreCollections(
      context.scope,
      migrated.collections,
      strategy,
      body.collections ?? [],
    );

    if (body.includeSettings !== false && migrated.settings) {
      updateUser(context.user.id, {
        settings: JSON.stringify({ ...context.settings, ...(migrated.settings as object) }),
      });
    }
    if (context.scope.systemId) refreshMemberCount(context.user.id, context.scope.systemId);
    recordHistory(context.scope, {
      eventType: 'data.restored',
      summary: historyPhrases.restored(report.imported + report.updated),
    });
    await checkAchievements(context.scope);

    ok(res, {
      report,
      warnings: validation.warnings,
      settingsRestored: body.includeSettings !== false,
    });
  }),
);

dataRouter.get(
  '/export/:collection',
  handler((req, res) => {
    const context = auth(req);
    const name = String(req.params['collection']);
    const collection = BACKUP_COLLECTIONS.find((c) => c.name === name);
    if (!collection) throw badRequest('That is not something that can be exported on its own.');

    const rows = allRecords(collection.name, context.scope);
    const format = req.query['format'] === 'csv' ? 'csv' : 'json';

    if (format === 'csv') {
      const columns = ['id', ...collection.fields.map((f) => f.name), 'createdAt', 'updatedAt'];
      const escape = (value: unknown): string => {
        if (value === null || value === undefined) return '';
        const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const csv = [
        columns.join(','),
        ...rows.map((row) => columns.map((column) => escape(row[column])).join(',')),
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="pluralnova-${name}.csv"`);
      res.send(csv);
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pluralnova-${name}.json"`);
    res.send(JSON.stringify({ collection: name, exportedAt: now(), records: rows }, null, 2));
  }),
);

dataRouter.get(
  '/import/sources',
  handler((_req, res) => {
    ok(res, { sources: listImportSources() });
  }),
);

/**
 * Import from another app's export.
 *
 * Every source is handled by an adapter that returns records plus a list of
 * things it could not read. A malformed row is skipped and named; it never
 * aborts the import and it never overwrites something that is already here.
 */
dataRouter.post(
  '/import',
  handler(async (req, res) => {
    const context = auth(req);
    const { source, payload, strategy } = req.body as {
      source?: string;
      payload?: unknown;
      strategy?: ConflictStrategy;
    };
    if (!source) throw badRequest('Choose what the file came from.');
    if (payload === undefined) throw badRequest('No file contents were received.');

    const result = importFromExternal(source, payload, context.scope);
    if (result.records && Object.keys(result.records).length > 0) {
      const report = restoreCollections(
        context.scope,
        result.records,
        strategy ?? 'skipExisting',
      );
      if (context.scope.systemId) refreshMemberCount(context.user.id, context.scope.systemId);
      recordHistory(context.scope, {
        eventType: 'data.imported',
        summary: historyPhrases.imported(report.imported),
        note: `From ${result.sourceLabel}`,
      });
      await checkAchievements(context.scope);
      ok(res, { report, problems: result.problems, sourceLabel: result.sourceLabel });
      return;
    }

    ok(res, {
      report: { imported: 0, updated: 0, skipped: 0, failed: 0, byCollection: {}, problems: [] },
      problems: result.problems,
      sourceLabel: result.sourceLabel,
    });
  }),
);

/** Re-seeds the demo account, for a guest who wants to start the tour again. */
dataRouter.post(
  '/demo/reset',
  handler(async (req, res) => {
    const context = auth(req);
    if (context.user.isGuest !== 1) {
      throw badRequest('Demo data can only be reset on a guest account.');
    }
    const { buildDemoData } = await import('@pluralnova/shared');
    const days = ([7, 30, 60, 90] as const).includes(Number(req.body?.days) as 7 | 30 | 60 | 90)
      ? (Number(req.body.days) as 7 | 30 | 60 | 90)
      : 30;
    const data = buildDemoData({
      userId: context.user.id,
      systemId: context.scope.systemId ?? '',
      days,
    });
    const report = restoreCollections(context.scope, data, 'replace');
    if (context.scope.systemId) refreshMemberCount(context.user.id, context.scope.systemId);
    ok(res, { report, days });
  }),
);

dataRouter.get(
  '/account',
  handler((req, res) => {
    const context = auth(req);
    const counts: Record<string, number> = {};
    for (const collection of BACKUP_COLLECTIONS) {
      const total = allRecords(collection.name, context.scope).length;
      if (total > 0) counts[collection.name] = total;
    }
    ok(res, {
      user: toPublicUser(context.user),
      settings: readSettings(context.user),
      counts,
      totalRecords: Object.values(counts).reduce((sum, n) => sum + n, 0),
    });
  }),
);
