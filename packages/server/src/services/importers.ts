import { newId, now, type StoredRecord } from '@pluralnova/shared';
import type { Scope } from '../db/repository.js';

/**
 * Import adapters.
 *
 * External formats change without warning, so each source is an adapter behind
 * one interface rather than a branch inside the import route. An adapter that
 * cannot read a row records why and carries on; a source that disappears can be
 * fixed or retired without touching anything else.
 *
 * A source with no genuinely readable export (its own backup is encrypted, or
 * simply is not a portable format) still gets an entry, so the picker tells the
 * truth about it instead of just not mentioning it — its adapter explains why
 * and points at a real path (usually PluralKit, if the two are linked) rather
 * than guessing at bytes it cannot make sense of.
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
  /** What the user needs to give us. `token` prompts for a pasted key instead of a file. */
  accepts: 'json' | 'csv' | 'token';
  instructions: string;
  collections: string[];
}

type Adapter = (payload: unknown, scope: Scope) => ImportResult | Promise<ImportResult>;

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

function hexColor(value: unknown): string {
  const colour = text(value);
  if (!colour) return '';
  return colour.startsWith('#') ? colour : `#${colour}`;
}

/** Refuses anything that is not a link a browser would actually load as an image. */
function looksLikeImageUrl(value: string): boolean {
  return /^(https?:\/\/|data:image\/|\/)/i.test(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry)).filter(Boolean);
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/* ------------------------------------------------------------------------ *
 * PluralKit — shared by the file export and the live token import, since a
 * member and a switch mean the same thing whichever way they arrived.
 * ------------------------------------------------------------------------ */

type MappedMember = { record: StoredRecord; externalId: string } | { problem: ImportProblem };

function mapPluralKitMember(row: Record<string, unknown>, index: number, orbitOrder: number, scope: Scope): MappedMember {
  const name = text(row['display_name'] ?? row['name']).trim();
  if (!name) return { problem: { index, reason: 'No name on this entry, so it was skipped.' } };

  const avatar = text(row['avatar_url']);
  const banner = text(row['banner']);
  const privacyRaw = row['privacy'];
  const visibility = plainObject(privacyRaw) ? text(plainObject(privacyRaw)?.['visibility']) : text(privacyRaw);

  const record = baseRow(scope, 'mem', {
    name,
    pronouns: text(row['pronouns']),
    bio: text(row['description']),
    color: hexColor(row['color']),
    avatarUrl: looksLikeImageUrl(avatar) ? avatar : '',
    bannerUrl: looksLikeImageUrl(banner) ? banner : '',
    birthday: text(row['birthday']).slice(0, 10),
    tags: [],
    roles: [],
    interests: [],
    identityLabels: [],
    frontStatus: 'nearby',
    frontCount: 0,
    frontMinutes: 0,
    orbitOrder,
    customFields: row['proxy_tags'] ? { 'Proxy tags': JSON.stringify(row['proxy_tags']) } : null,
    privacy: { showOnProfile: visibility !== 'private' },
  });
  return { record, externalId: text(row['id'] ?? row['uuid']) };
}

/** PluralKit switches are point-in-time events; a front lasts until the next one starts. */
function mapPluralKitSwitches(switches: unknown, memberIdMap: Map<string, string>, scope: Scope): StoredRecord[] {
  const list = asArray(switches)
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => Number.isFinite(Date.parse(text(entry['timestamp']))))
    .sort((a, b) => Date.parse(text(a['timestamp'])) - Date.parse(text(b['timestamp'])));

  const events: StoredRecord[] = [];
  list.forEach((entry, index) => {
    const memberIds = asArray(entry['members'])
      .map((id) => memberIdMap.get(text(id)))
      .filter((id): id is string => Boolean(id));
    if (memberIds.length === 0) return;

    const startedAt = new Date(text(entry['timestamp'])).toISOString();
    const next = list[index + 1];
    const endedAt = next ? new Date(text(next['timestamp'])).toISOString() : null;
    const [memberId, ...coFronterIds] = memberIds;

    events.push(
      baseRow(scope, 'fev', {
        memberId,
        coFronterIds,
        startedAt,
        endedAt,
        durationMinutes: endedAt ? Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000) : null,
        activity: '',
        location: '',
        mood: '',
        note: '',
        tags: [],
        statusType: 'fronting',
        unknownFronter: 0,
      }),
    );
  });
  return events;
}

/** PluralKit exports: members with names, pronouns, colour, description, birthday, switches. */
const pluralKit: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const memberIdMap = new Map<string, string>();
  const source = (payload ?? {}) as Record<string, unknown>;
  const list = asArray(source['members'] ?? payload);

  list.forEach((entry, index) => {
    const mapped = mapPluralKitMember(entry as Record<string, unknown>, index, index, scope);
    if ('problem' in mapped) {
      problems.push(mapped.problem);
      return;
    }
    members.push(mapped.record);
    if (mapped.externalId) memberIdMap.set(mapped.externalId, mapped.record.id);
  });

  const frontEvents = mapPluralKitSwitches(source['switches'], memberIdMap, scope);

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  return { sourceLabel: 'PluralKit', records, problems };
};

const PLURALKIT_API = 'https://api.pluralkit.me/v2';

/** A live pull from PluralKit's own API — the token is used once and never stored. */
const pluralKitToken: Adapter = async (payload, scope) => {
  const label = 'PluralKit';
  const token = text((payload as Record<string, unknown> | null)?.['token']).trim();
  if (!token) {
    return { sourceLabel: label, records: {}, problems: [{ index: 0, reason: 'No system token was given.' }] };
  }

  let membersRes: Response;
  let switchesRes: Response;
  try {
    const headers = { Authorization: token };
    [membersRes, switchesRes] = await Promise.all([
      fetch(`${PLURALKIT_API}/systems/@me/members`, { headers }),
      fetch(`${PLURALKIT_API}/systems/@me/switches?limit=100`, { headers }),
    ]);
  } catch {
    return {
      sourceLabel: label,
      records: {},
      problems: [{ index: 0, reason: 'PluralKit could not be reached. Check the connection and try again.' }],
    };
  }

  if (membersRes.status === 401 || membersRes.status === 403) {
    return {
      sourceLabel: label,
      records: {},
      problems: [
        { index: 0, reason: 'That token was not accepted. Message the PluralKit bot `pk;token` in Discord for a fresh one.' },
      ],
    };
  }
  if (!membersRes.ok) {
    return {
      sourceLabel: label,
      records: {},
      problems: [{ index: 0, reason: `PluralKit returned an error (status ${membersRes.status}).` }],
    };
  }

  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const memberIdMap = new Map<string, string>();

  const membersJson: unknown = await membersRes.json();
  asArray(membersJson).forEach((entry, index) => {
    const mapped = mapPluralKitMember(entry as Record<string, unknown>, index, index, scope);
    if ('problem' in mapped) {
      problems.push(mapped.problem);
      return;
    }
    members.push(mapped.record);
    if (mapped.externalId) memberIdMap.set(mapped.externalId, mapped.record.id);
  });

  const switchesJson: unknown = switchesRes.ok ? await switchesRes.json() : [];
  const frontEvents = mapPluralKitSwitches(switchesJson, memberIdMap, scope);

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  return { sourceLabel: label, records, problems };
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

/** Sheaf's own export: `{ members: [...], fronts: [...] }`, decrypted at export time. */
const sheaf: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const memberIdMap = new Map<string, string>();
  const source = (payload ?? {}) as Record<string, unknown>;

  asArray(source['members'] ?? payload).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['name'] ?? row['display_name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const avatar = text(row['avatar_url']);
    const record = baseRow(scope, 'mem', {
      name,
      pronouns: text(row['pronouns']),
      bio: text(row['description'] ?? row['note']),
      color: hexColor(row['color']),
      avatarUrl: looksLikeImageUrl(avatar) ? avatar : '',
      birthday: text(row['birthday']).slice(0, 10),
      icon: text(row['emoji']).slice(0, 8),
      tags: [],
      roles: [],
      interests: [],
      identityLabels: [],
      frontStatus: 'nearby',
      frontCount: 0,
      frontMinutes: 0,
      orbitOrder: index,
    });
    members.push(record);
    const externalId = text(row['id']);
    if (externalId) memberIdMap.set(externalId, record.id);
  });

  const frontEvents: StoredRecord[] = [];
  asArray(source['fronts']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const memberId = memberIdMap.get(text(row['member_id'] ?? row['memberId'] ?? row['member']));
    const startedAt = Date.parse(text(row['started_at'] ?? row['start'] ?? row['timestamp']));
    if (!memberId || !Number.isFinite(startedAt)) {
      problems.push({ index, reason: 'A fronting entry did not match a member that was imported.' });
      return;
    }
    const endedAt = Date.parse(text(row['ended_at'] ?? row['end']));
    frontEvents.push(
      baseRow(scope, 'fev', {
        memberId,
        coFronterIds: [],
        startedAt: new Date(startedAt).toISOString(),
        endedAt: Number.isFinite(endedAt) ? new Date(endedAt).toISOString() : null,
        durationMinutes:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.round((endedAt - startedAt) / 60000) : null,
        activity: '',
        location: '',
        mood: '',
        note: text(row['note']),
        tags: [],
        statusType: 'fronting',
        unknownFronter: 0,
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  return { sourceLabel: 'Sheaf', records, problems };
};

/** Octocon's full export: `{ alters: [{ id, name, pronouns, description, color, avatar_url, ... }] }`. */
const octocon: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const source = (payload ?? {}) as Record<string, unknown>;

  asArray(source['alters'] ?? payload).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const avatar = text(row['avatar_url']);
    members.push(
      baseRow(scope, 'mem', {
        name,
        pronouns: text(row['pronouns']),
        bio: text(row['description']),
        color: hexColor(row['color']),
        avatarUrl: looksLikeImageUrl(avatar) ? avatar : '',
        tags: [],
        roles: [],
        interests: [],
        identityLabels: [],
        frontStatus: 'nearby',
        frontCount: 0,
        frontMinutes: 0,
        orbitOrder: index,
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  return { sourceLabel: 'Octocon', records, problems };
};

/** Plural Star's category-selective JSON export. Avatars/banners are stripped, so blank is expected. */
const pluralStar: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const source = (payload ?? {}) as Record<string, unknown>;

  asArray(source['members'] ?? payload).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const avatar = text(row['avatar']);
    const banner = text(row['banner']);
    const roleRaw = row['role'];
    const roles = Array.isArray(roleRaw) ? stringArray(roleRaw) : text(roleRaw) ? [text(roleRaw)] : [];
    const customFields = plainObject(row['customFields']);
    const sortOrder = row['sortOrder'];

    members.push(
      baseRow(scope, 'mem', {
        name,
        pronouns: text(row['pronouns']),
        bio: text(row['description']),
        color: hexColor(row['color']),
        avatarUrl: looksLikeImageUrl(avatar) ? avatar : '',
        bannerUrl: looksLikeImageUrl(banner) ? banner : '',
        tags: stringArray(row['tags']),
        roles,
        interests: [],
        identityLabels: [],
        frontStatus: 'nearby',
        frontCount: 0,
        frontMinutes: 0,
        orbitOrder: typeof sortOrder === 'number' ? sortOrder : index,
        customFields,
        archived: row['archived'] === true,
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  return { sourceLabel: 'Plural Star', records, problems };
};

/** PluralSpace's per-alter export: `{ name, display_name, pronouns, role: [...], avatar_path, ... }`. */
const pluralSpace: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const source = (payload ?? {}) as Record<string, unknown>;

  asArray(source['members'] ?? source['alters'] ?? payload).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['name'] ?? row['display_name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const avatar = text(row['avatar_path'] ?? row['avatar_media_path']);

    members.push(
      baseRow(scope, 'mem', {
        name,
        pronouns: text(row['pronouns']),
        bio: text(row['description']),
        color: hexColor(row['color']),
        avatarUrl: looksLikeImageUrl(avatar) ? avatar : '',
        tags: [],
        roles: stringArray(row['role']),
        interests: [],
        identityLabels: [],
        frontStatus: 'nearby',
        frontCount: 0,
        frontMinutes: 0,
        orbitOrder: index,
        archived: row['is_archived'] === true,
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  return { sourceLabel: 'PluralSpace', records, problems };
};

/**
 * Open Plural / PluralPort v0.1 — a shared interchange format rather than one
 * app's own shape. Avatars and banners are referenced by an asset id rather
 * than a URL, so they are resolved against the file's own `assets` list.
 */
const openPlural: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const memberIdMap = new Map<string, string>();
  const source = (payload ?? {}) as Record<string, unknown>;
  const list = asArray(source['members']);
  const assets = asArray(source['assets']).map((asset) => asset as Record<string, unknown>);

  if (!('openplural_version' in source) && !('members' in source)) {
    problems.push({
      index: 0,
      reason: 'This does not look like an Open Plural (PluralPort) export — no openplural_version or members field was found.',
    });
  }

  const resolveAsset = (id: unknown): string => {
    const key = text(id);
    if (!key) return '';
    const asset = assets.find((candidate) => text(candidate['id']) === key);
    const url = text(asset?.['url'] ?? asset?.['uri'] ?? asset?.['href'] ?? asset?.['data_url']);
    return looksLikeImageUrl(url) ? url : '';
  };

  const resolveBirthday = (value: unknown): string => {
    if (typeof value === 'string') return value.slice(0, 10);
    const row = plainObject(value);
    if (!row) return '';
    const direct = text(row['value'] ?? row['date']);
    if (direct) return direct.slice(0, 10);
    const { year, month, day } = row;
    if (typeof year === 'number' && typeof month === 'number' && typeof day === 'number') {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return '';
  };

  list.forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['name'] ?? row['display_name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const sortOrder = row['sort_order'];
    const record = baseRow(scope, 'mem', {
      name,
      pronouns: text(row['pronouns']),
      bio: text(row['description']),
      color: hexColor(row['color']),
      avatarUrl: resolveAsset(row['avatar_asset_id']),
      bannerUrl: resolveAsset(row['banner_asset_id']),
      birthday: resolveBirthday(row['birthday']),
      tags: [],
      roles: [],
      interests: [],
      identityLabels: [],
      frontStatus: 'nearby',
      frontCount: 0,
      frontMinutes: 0,
      orbitOrder: typeof sortOrder === 'number' ? sortOrder : index,
      archived: row['archived'] === true,
    });
    members.push(record);
    const externalId = text(row['id']);
    if (externalId) memberIdMap.set(externalId, record.id);
  });

  const frontEvents: StoredRecord[] = [];
  asArray(source['front_periods']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const memberId = memberIdMap.get(text(row['member_id']));
    const startedAt = Date.parse(text(row['started_at'] ?? row['start']));
    if (!memberId || !Number.isFinite(startedAt)) {
      problems.push({ index, reason: 'A fronting period did not match a member that was imported.' });
      return;
    }
    const endedAt = Date.parse(text(row['ended_at'] ?? row['end']));
    frontEvents.push(
      baseRow(scope, 'fev', {
        memberId,
        coFronterIds: asArray(row['co_member_ids'])
          .map((id) => memberIdMap.get(text(id)))
          .filter((id): id is string => Boolean(id)),
        startedAt: new Date(startedAt).toISOString(),
        endedAt: Number.isFinite(endedAt) ? new Date(endedAt).toISOString() : null,
        durationMinutes:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.round((endedAt - startedAt) / 60000) : null,
        activity: '',
        location: '',
        mood: '',
        note: '',
        tags: [],
        statusType: 'fronting',
        unknownFronter: 0,
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  return { sourceLabel: 'Open Plural', records, problems };
};

/**
 * A best-effort reader for a source PluralNova does not have a confirmed
 * export format for. It looks for the field names every tracker in this space
 * tends to use and says plainly when nothing recognisable turned up, rather
 * than claiming support it cannot back up.
 */
function genericMemberAdapter(sourceLabel: string): Adapter {
  return (payload, scope) => {
    const source = (payload ?? {}) as Record<string, unknown>;
    const list = asArray(source['members'] ?? source['alters'] ?? payload);

    if (list.length === 0) {
      return {
        sourceLabel,
        records: {},
        problems: [
          {
            index: 0,
            reason: `No recognisable members were found in this file. PluralNova does not have a confirmed export format for ${sourceLabel} yet — if the file has a members or alters list, let us know its shape so exact support can be added.`,
          },
        ],
      };
    }

    const problems: ImportProblem[] = [];
    const members: StoredRecord[] = [];
    list.forEach((entry, index) => {
      const row = entry as Record<string, unknown>;
      const name = text(row['name'] ?? row['display_name'] ?? row['displayName']).trim();
      if (!name) {
        problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
        return;
      }
      const avatar = text(row['avatar_url'] ?? row['avatarUrl'] ?? row['avatar']);
      members.push(
        baseRow(scope, 'mem', {
          name,
          pronouns: text(row['pronouns']),
          bio: text(row['description'] ?? row['bio'] ?? row['desc']),
          color: hexColor(row['color'] ?? row['colour']),
          avatarUrl: looksLikeImageUrl(avatar) ? avatar : '',
          tags: [],
          roles: [],
          interests: [],
          identityLabels: [],
          frontStatus: 'nearby',
          frontCount: 0,
          frontMinutes: 0,
          orbitOrder: index,
        }),
      );
    });

    const records: Record<string, StoredRecord[]> = {};
    if (members.length > 0) records['members'] = members;
    return { sourceLabel, records, problems };
  };
}

const pluralis = genericMemberAdapter('Pluralis');
const pluralConnect = genericMemberAdapter('PluralConnect');

/** Prism's own export is an encrypted container — there is nothing in it PluralNova can read. */
const prismPlural: Adapter = () => ({
  sourceLabel: 'Prism Plural',
  records: {},
  problems: [
    {
      index: 0,
      reason:
        "Prism's export is end-to-end encrypted and can only be opened inside Prism. If this system is linked to PluralKit under Prism's sync settings, use the PluralKit import above instead — it carries the same members.",
    },
  ],
});

/** Ampersand's only export is a self-backup, not a format meant to be read elsewhere. */
const ampersand: Adapter = () => ({
  sourceLabel: 'Ampersand',
  records: {},
  problems: [
    {
      index: 0,
      reason:
        "Ampersand's backup (.ampar) is a self-contained format for restoring into Ampersand itself, not one other apps can read yet. If the same members also exist in PluralKit, Simply Plural or Octocon, import from one of those instead.",
    },
  ],
});

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
  'pluralkit-token': pluralKitToken,
  pluralkit: pluralKit,
  'simply-plural': simplyPlural,
  sheaf,
  octocon,
  'plural-star': pluralStar,
  pluralspace: pluralSpace,
  openplural: openPlural,
  pluralis,
  pluralconnect: pluralConnect,
  'prism-plural': prismPlural,
  ampersand,
  'pluralnova-collection': pluralNovaCollection,
  csv: genericCsv,
};

export const IMPORT_SOURCES: readonly ImportSource[] = [
  {
    id: 'pluralkit-token',
    label: 'PluralKit — connect with a token',
    description: 'Pulls members and recent switch history straight from PluralKit. Nothing to export by hand.',
    accepts: 'token',
    instructions:
      'Message the PluralKit bot `pk;token` in Discord and paste what it sends back. The token is used once for this import and is never stored.',
    collections: ['members', 'frontEvents'],
  },
  {
    id: 'pluralkit',
    label: 'PluralKit — file export',
    description: 'Members, pronouns, descriptions, colours, avatars, birthdays and switch history.',
    accepts: 'json',
    instructions: 'Run `pk;export` in Discord and upload the JSON file it sends you.',
    collections: ['members', 'frontEvents'],
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
    id: 'sheaf',
    label: 'Sheaf',
    description: 'Members, descriptions, colours and fronting history.',
    accepts: 'json',
    instructions: 'Settings → Export → Sync JSON, then upload the file it downloads.',
    collections: ['members', 'frontEvents'],
  },
  {
    id: 'octocon',
    label: 'Octocon',
    description: 'Alters, pronouns, descriptions, colours and avatars.',
    accepts: 'json',
    instructions: 'Settings → Export data, then upload the JSON file it gives you.',
    collections: ['members'],
  },
  {
    id: 'plural-star',
    label: 'Plural Star',
    description: 'Members, roles, colours and custom fields.',
    accepts: 'json',
    instructions: 'Export → choose Members (and anything else you want) → JSON, then upload the file.',
    collections: ['members'],
  },
  {
    id: 'pluralspace',
    label: 'PluralSpace',
    description: 'Members, pronouns, roles and descriptions.',
    accepts: 'json',
    instructions: 'Use the migration export from your PluralSpace account settings and upload the JSON file.',
    collections: ['members'],
  },
  {
    id: 'openplural',
    label: 'Open Plural (PluralPort)',
    description: 'The shared, app-independent format some trackers — Sheaf among them — can export directly.',
    accepts: 'json',
    instructions:
      'If your app can export as "PluralPort" or "Open Plural", upload that file. It is designed to move between apps without losing anything.',
    collections: ['members', 'frontEvents'],
  },
  {
    id: 'pluralis',
    label: 'Pluralis',
    description: 'Best-effort: reads common fields like name, pronouns, description and colour.',
    accepts: 'json',
    instructions:
      'Export your data from Pluralis if it offers one, then upload the file. PluralNova does not have a confirmed export format for Pluralis yet, so say if the file does not come through correctly and it can be extended.',
    collections: ['members'],
  },
  {
    id: 'pluralconnect',
    label: 'PluralConnect',
    description: 'Best-effort: reads common fields like name, pronouns, description and colour.',
    accepts: 'json',
    instructions:
      'Download your data from Account & data, then upload the file here. PluralNova does not have a confirmed export format for PluralConnect yet, so say if the file does not come through correctly and it can be extended.',
    collections: ['members'],
  },
  {
    id: 'prism-plural',
    label: 'Prism Plural',
    description: "Prism's own export is encrypted and cannot be opened here — see below for a working path.",
    accepts: 'json',
    instructions:
      "Prism's own export is end-to-end encrypted and cannot be read outside Prism. If this system is linked to PluralKit in Prism's settings, use the PluralKit import above instead.",
    collections: [],
  },
  {
    id: 'ampersand',
    label: 'Ampersand',
    description: 'Not yet portable to other apps — see below for what to do if the same members exist elsewhere.',
    accepts: 'json',
    instructions:
      "Ampersand's backup (.ampar) is only readable by Ampersand itself. If the same members exist in PluralKit, Simply Plural or Octocon, import from one of those instead.",
    collections: [],
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

export async function importFromExternal(source: string, payload: unknown, scope: Scope): Promise<ImportResult> {
  const adapter = ADAPTERS[source];
  if (!adapter) {
    return {
      sourceLabel: source,
      records: {},
      problems: [{ index: 0, reason: `PluralNova does not know how to read a ${source} export yet.` }],
    };
  }
  try {
    return await adapter(payload, scope);
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
