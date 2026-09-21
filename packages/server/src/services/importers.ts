import { newId, now, type StoredRecord } from '@pluralnova/shared';
import type { Scope } from '../db/repository.js';

/**
 * Import adapters.
 *
 * External formats change without warning, so each source is an adapter behind
 * one interface rather than a branch inside the import route. An adapter that
 * cannot read a row records why and carries on; a source that disappears can be
 * fixed or retired without touching anything else.
 */

export interface ImportProblem {
  index: number;
  reason: string;
  name?: string;
}

export interface ImportResult {
  sourceLabel: string;
  records: Record<string, StoredRecord[]>;
  problems: ImportProblem[];
}

export interface ImportSource {
  id: string;
  label: string;
  description: string;
  /** What the user needs to give us. */
  accepts: 'json' | 'csv';
  instructions: string;
  collections: string[];
}

type Adapter = (payload: unknown, scope: Scope) => ImportResult;

function baseRow(scope: Scope, prefix: string, overrides: Record<string, unknown>): StoredRecord {
  const timestamp = now();
  return {
    id: newId(prefix),
    userId: scope.userId,
    systemId: scope.systemId,
    memberId: null,
    visibility: 'system',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: 1,
    ...overrides,
  } as StoredRecord;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const key of ['members', 'data', 'items', 'records', 'results']) {
      const nested = (value as Record<string, unknown>)[key];
      if (Array.isArray(nested)) return nested;
    }
  }
  return [];
}

function text(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return typeof value === 'string' ? value : String(value);
}

/** PluralKit exports: members with names, pronouns, colour, description, birthday. */
const pluralKit: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const source = (payload ?? {}) as Record<string, unknown>;
  const list = asArray(source['members'] ?? payload);

  list.forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['display_name'] ?? row['name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const colour = text(row['color']);
    members.push(
      baseRow(scope, 'mem', {
        name,
        pronouns: text(row['pronouns']),
        bio: text(row['description']),
        color: colour ? (colour.startsWith('#') ? colour : `#${colour}`) : '',
        avatarUrl: text(row['avatar_url']),
        bannerUrl: text(row['banner']),
        birthday: text(row['birthday']).slice(0, 10),
        tags: [],
        roles: [],
        interests: [],
        identityLabels: [],
        frontStatus: 'nearby',
        frontCount: 0,
        frontMinutes: 0,
        orbitOrder: index,
        customFields: row['proxy_tags'] ? { 'Proxy tags': JSON.stringify(row['proxy_tags']) } : null,
        privacy: { showOnProfile: row['privacy'] !== 'private' },
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  return { sourceLabel: 'PluralKit', records, problems };
};

/** Simply Plural exports: members plus optional front history. */
const simplyPlural: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const frontEvents: StoredRecord[] = [];
  const source = (payload ?? {}) as Record<string, unknown>;

  const memberIdMap = new Map<string, string>();
  asArray(source['members'] ?? payload).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const content = (row['content'] ?? row) as Record<string, unknown>;
    const name = text(content['name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const record = baseRow(scope, 'mem', {
      name,
      pronouns: text(content['pronouns']),
      bio: text(content['desc']),
      color: text(content['color']),
      avatarUrl: text(content['avatarUrl']),
      tags: [],
      roles: [],
      interests: [],
      identityLabels: [],
      frontStatus: 'nearby',
      frontCount: 0,
      frontMinutes: 0,
      orbitOrder: index,
    });
    const externalId = text(row['id'] ?? content['id']);
    if (externalId) memberIdMap.set(externalId, record.id);
    members.push(record);
  });

  asArray(source['frontHistory']).forEach((entry, index) => {
    const row = (entry as Record<string, unknown>)['content'] ?? entry;
    const content = row as Record<string, unknown>;
    const memberId = memberIdMap.get(text(content['member']));
    const startedAt = Number(content['startTime']);
    if (!memberId || !Number.isFinite(startedAt)) {
      problems.push({ index, reason: 'Front entry did not match a member that was imported.' });
      return;
    }
    const endedAt = Number(content['endTime']);
    frontEvents.push(
      baseRow(scope, 'fev', {
        memberId,
        coFronterIds: [],
        startedAt: new Date(startedAt).toISOString(),
        endedAt: Number.isFinite(endedAt) && endedAt > 0 ? new Date(endedAt).toISOString() : null,
        durationMinutes:
          Number.isFinite(endedAt) && endedAt > startedAt
            ? Math.round((endedAt - startedAt) / 60000)
            : null,
        activity: '',
        location: '',
        mood: '',
        note: text(content['customStatus']),
        tags: [],
        statusType: 'fronting',
        unknownFronter: 0,
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length) records['members'] = members;
  if (frontEvents.length) records['frontEvents'] = frontEvents;
  return { sourceLabel: 'Simply Plural', records, problems };
};

/** A PluralNova export of a single collection, as produced by the export screen. */
const pluralNovaCollection: Adapter = (payload, scope) => {
  const source = (payload ?? {}) as Record<string, unknown>;
  const collection = text(source['collection']);
  const rows = asArray(source['records']);
  const problems: ImportProblem[] = [];
  if (!collection) {
    return {
      sourceLabel: 'PluralNova export',
      records: {},
      problems: [{ index: 0, reason: 'This file does not say which collection it holds.' }],
    };
  }
  const records = rows
    .map((row, index) => {
      if (!row || typeof row !== 'object') {
        problems.push({ index, reason: 'Entry was not a record.' });
        return null;
      }
      return { ...(row as StoredRecord), userId: scope.userId, systemId: scope.systemId };
    })
    .filter((row): row is StoredRecord => row !== null);
  return { sourceLabel: 'PluralNova export', records: { [collection]: records }, problems };
};

/** Generic CSV, already parsed to rows by the client, mapped onto any collection. */
const genericCsv: Adapter = (payload, scope) => {
  const source = (payload ?? {}) as Record<string, unknown>;
  const collection = text(source['collection'], 'notes');
  const mapping = (source['mapping'] ?? {}) as Record<string, string>;
  const rows = asArray(source['rows']);
  const problems: ImportProblem[] = [];

  const records = rows
    .map((entry, index) => {
      const row = entry as Record<string, unknown>;
      const mapped: Record<string, unknown> = {};
      for (const [field, column] of Object.entries(mapping)) {
        if (column && row[column] !== undefined) mapped[field] = row[column];
      }
      if (Object.keys(mapped).length === 0) {
        problems.push({ index, reason: 'No mapped columns had a value in this row.' });
        return null;
      }
      const prefix = collection.slice(0, 3).toLowerCase();
      return baseRow(scope, prefix, mapped);
    })
    .filter((row): row is StoredRecord => row !== null);

  const out: Record<string, StoredRecord[]> = {};
  if (records.length > 0) out[collection] = records;
  return { sourceLabel: 'CSV file', records: out, problems };
};

const ADAPTERS: Record<string, Adapter> = {
  pluralkit: pluralKit,
  'simply-plural': simplyPlural,
  'pluralnova-collection': pluralNovaCollection,
  csv: genericCsv,
};

export const IMPORT_SOURCES: readonly ImportSource[] = [
  {
    id: 'pluralkit',
    label: 'PluralKit',
    description: 'Members, pronouns, descriptions, colours, avatars and birthdays.',
    accepts: 'json',
    instructions: 'Run `pk;export` in Discord and upload the JSON file it sends you.',
    collections: ['members'],
  },
  {
    id: 'simply-plural',
    label: 'Simply Plural',
    description: 'Members and, when the export includes it, front history.',
    accepts: 'json',
    instructions: 'Settings → Import/Export → Export, then upload the JSON file.',
    collections: ['members', 'frontEvents'],
  },
  {
    id: 'pluralnova-collection',
    label: 'PluralNova collection export',
    description: 'A single collection exported from PluralNova.',
    accepts: 'json',
    instructions: 'Use a file downloaded from Backup → Export a single collection.',
    collections: ['any'],
  },
  {
    id: 'csv',
    label: 'CSV file',
    description: 'Any spreadsheet. You choose which column goes to which field.',
    accepts: 'csv',
    instructions: 'Upload a CSV with a header row, then map the columns.',
    collections: ['any'],
  },
];

export function listImportSources(): readonly ImportSource[] {
  return IMPORT_SOURCES;
}

export function importFromExternal(source: string, payload: unknown, scope: Scope): ImportResult {
  const adapter = ADAPTERS[source];
  if (!adapter) {
    return {
      sourceLabel: source,
      records: {},
      problems: [{ index: 0, reason: `PluralNova does not know how to read a ${source} export yet.` }],
    };
  }
  try {
    return adapter(payload, scope);
  } catch (error) {
    // A malformed file is an expected outcome, not a server fault: report it
    // and leave everything already stored untouched.
    return {
      sourceLabel: source,
      records: {},
      problems: [
        {
          index: 0,
          reason:
            error instanceof Error
              ? `That file could not be read: ${error.message}`
              : 'That file could not be read.',
        },
      ],
    };
  }
}
