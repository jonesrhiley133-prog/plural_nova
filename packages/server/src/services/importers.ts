import { newId, now, type CustomFieldType, type StoredRecord } from '@pluralnova/shared';
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
 * Custom fields, groups and journal entries — shared across every adapter
 * below that has something to say about "everyone answers this the same
 * way", "these members belong together" or "an entry, not just a fact",
 * rather than three subtly different bespoke versions per source.
 * ------------------------------------------------------------------------ */

/** Coerces a source app's own type label onto one PluralNova already renders. */
function mapCustomFieldType(raw: unknown): CustomFieldType {
  const value = text(raw).toLowerCase().replace(/[\s_-]/g, '');
  const table: Record<string, CustomFieldType> = {
    text: 'text',
    string: 'text',
    shorttext: 'text',
    longtext: 'longText',
    markdown: 'markdown',
    number: 'number',
    int: 'number',
    integer: 'number',
    float: 'number',
    bool: 'checkbox',
    boolean: 'checkbox',
    toggle: 'checkbox',
    date: 'date',
    daterange: 'text',
    month: 'text',
    year: 'text',
    monthyear: 'text',
    monthday: 'text',
    timestamp: 'datetime',
    datetime: 'datetime',
    color: 'color',
    select: 'choice',
    choice: 'choice',
    radio: 'radio',
    multiselect: 'multiSelect',
    checklist: 'checklist',
    tags: 'tags',
  };
  return table[value] ?? 'text';
}

/** A value read from a source export, serialised the way PluralNova stores one. */
function serializeCustomFieldValue(value: unknown, type: CustomFieldType): string {
  if (value === null || value === undefined) return '';
  if (type === 'multiSelect' || type === 'tags' || type === 'checklist') {
    return JSON.stringify(stringArray(Array.isArray(value) ? value : [value]));
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return text(value);
}

interface FieldDefSpec {
  externalId: string;
  label: string;
  type: unknown;
  group?: string;
  sortOrder?: number;
  options?: unknown;
}

/**
 * One `customFieldDefinitions` row per spec, plus a map from the source
 * app's own field id back to the new definition (and the type it was
 * resolved to, so a value can be serialised the same way as its field).
 */
function buildCustomFieldDefinitions(
  specs: FieldDefSpec[],
  scope: Scope,
): { records: StoredRecord[]; idMap: Map<string, { id: string; type: CustomFieldType }> } {
  const records: StoredRecord[] = [];
  const idMap = new Map<string, { id: string; type: CustomFieldType }>();
  specs.forEach((spec, index) => {
    const label = spec.label.trim();
    if (!label) return;
    const type = mapCustomFieldType(spec.type);
    const options = Array.isArray(spec.options) ? spec.options : plainObject(spec.options);
    const record = baseRow(scope, 'cfd', {
      label,
      type,
      group: spec.group ?? '',
      options,
      sortOrder: spec.sortOrder ?? index,
    });
    records.push(record);
    if (spec.externalId) idMap.set(spec.externalId, { id: record.id, type });
  });
  return { records, idMap };
}

/** A member's answers, in the `{ definitionId, value }[]` shape the app reads back. */
function buildCustomFieldValues(
  entries: { fieldExternalId: string; value: unknown }[],
  idMap: Map<string, { id: string; type: CustomFieldType }>,
): { definitionId: string; value: string }[] {
  const out: { definitionId: string; value: string }[] = [];
  for (const entry of entries) {
    const definition = idMap.get(entry.fieldExternalId);
    if (!definition) continue;
    const value = serializeCustomFieldValue(entry.value, definition.type);
    if (value !== '') out.push({ definitionId: definition.id, value });
  }
  return out;
}

/** One `memberGroups` row per spec, plus a map from the source app's own group id. */
function buildGroupRecords(
  specs: { externalId: string; name: string; description?: unknown; color?: unknown; sortOrder?: number }[],
  scope: Scope,
): { records: StoredRecord[]; idMap: Map<string, string> } {
  const records: StoredRecord[] = [];
  const idMap = new Map<string, string>();
  specs.forEach((spec, index) => {
    const name = spec.name.trim();
    if (!name) return;
    const record = baseRow(scope, 'grp', {
      name,
      description: text(spec.description),
      color: hexColor(spec.color),
      sortOrder: spec.sortOrder ?? index,
    });
    records.push(record);
    if (spec.externalId) idMap.set(spec.externalId, record.id);
  });
  return { records, idMap };
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
        durationSeconds: endedAt ? Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000) : null,
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

/**
 * PluralKit groups are flat — no nesting, unlike PluralNova's subsystems — so
 * they land in `memberGroups`. A group lists its own members inline in a full
 * `pk;export`; the live API returns the same shape from `?with_members=true`,
 * and simply has nothing to link when a caller leaves that off.
 */
function mapPluralKitGroups(
  groupsRaw: unknown,
  members: StoredRecord[],
  memberIdMap: Map<string, string>,
  scope: Scope,
): StoredRecord[] {
  const byNewId = new Map(members.map((member) => [member.id, member]));
  const { records: groups, idMap: groupIdMap } = buildGroupRecords(
    asArray(groupsRaw).map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        externalId: text(row['id'] ?? row['uuid']),
        name: text(row['name'] ?? row['display_name']),
        description: row['description'],
        color: row['color'],
      };
    }),
    scope,
  );

  asArray(groupsRaw).forEach((entry) => {
    const row = entry as Record<string, unknown>;
    const groupId = groupIdMap.get(text(row['id'] ?? row['uuid']));
    if (!groupId) return;
    asArray(row['members']).forEach((id) => {
      const memberId = memberIdMap.get(text(id));
      const member = memberId ? byNewId.get(memberId) : undefined;
      if (member) member['groupId'] = groupId;
    });
  });

  return groups;
}

/** PluralKit exports: members with names, pronouns, colour, description, birthday, switches, groups. */
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
  const groups = mapPluralKitGroups(source['groups'], members, memberIdMap, scope);

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  if (groups.length > 0) records['memberGroups'] = groups;
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
  let groupsRes: Response;
  try {
    const headers = { Authorization: token };
    [membersRes, switchesRes, groupsRes] = await Promise.all([
      fetch(`${PLURALKIT_API}/systems/@me/members`, { headers }),
      fetch(`${PLURALKIT_API}/systems/@me/switches?limit=100`, { headers }),
      fetch(`${PLURALKIT_API}/systems/@me/groups?with_members=true`, { headers }),
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

  const groupsJson: unknown = groupsRes.ok ? await groupsRes.json() : [];
  const groups = mapPluralKitGroups(groupsJson, members, memberIdMap, scope);

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  if (groups.length > 0) records['memberGroups'] = groups;
  return { sourceLabel: label, records, problems };
};

/**
 * Simply Plural's Firebase-shaped documents sometimes wrap their real fields
 * in a `content` object rather than holding them directly — true of members,
 * front history and everything else below, so every reader here checks both.
 */
function simplyPluralRow(entry: unknown): Record<string, unknown> {
  const row = entry as Record<string, unknown>;
  return (plainObject(row['content']) ?? row) as Record<string, unknown>;
}

/** Simply Plural exports: members, front history, groups, custom fields and notes. */
const simplyPlural: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const frontEvents: StoredRecord[] = [];
  const source = (payload ?? {}) as Record<string, unknown>;

  const { records: fieldDefinitions, idMap: fieldIdMap } = buildCustomFieldDefinitions(
    asArray(source['customFields']).map((entry) => {
      const content = simplyPluralRow(entry);
      return {
        externalId: text((entry as Record<string, unknown>)['_id'] ?? content['id']),
        label: text(content['name']),
        type: content['type'],
        sortOrder: Number(content['order']),
      };
    }),
    scope,
  );

  const memberIdMap = new Map<string, string>();
  asArray(source['members'] ?? payload).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const content = simplyPluralRow(entry);
    const name = text(content['name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    // `info` holds each answer keyed by custom field id — as a map on most
    // exports seen, but handled as a list of `{id, value}` pairs too, since
    // that is the shape Simply Plural uses for `customFields` itself.
    const info = content['info'];
    const infoEntries: { fieldExternalId: string; value: unknown }[] = plainObject(info)
      ? Object.entries(plainObject(info)!).map(([fieldExternalId, value]) => ({ fieldExternalId, value }))
      : asArray(info).map((item) => {
          const pair = item as Record<string, unknown>;
          return { fieldExternalId: text(pair['id'] ?? pair['field']), value: pair['value'] };
        });

    const record = baseRow(scope, 'mem', {
      name,
      pronouns: text(content['pronouns']),
      bio: text(content['desc']),
      color: hexColor(content['color']),
      avatarUrl: looksLikeImageUrl(text(content['avatarUrl'])) ? text(content['avatarUrl']) : '',
      tags: [],
      roles: [],
      interests: [],
      identityLabels: [],
      frontStatus: 'nearby',
      frontCount: 0,
      frontMinutes: 0,
      orbitOrder: index,
      archived: content['archived'] === true || content['isArchived'] === true,
      customFieldValues: buildCustomFieldValues(infoEntries, fieldIdMap),
    });
    const externalId = text(row['id'] ?? row['_id'] ?? content['id']);
    if (externalId) memberIdMap.set(externalId, record.id);
    members.push(record);
  });

  const { records: groups, idMap: groupIdMap } = buildGroupRecords(
    asArray(source['groups']).map((entry) => {
      const row = entry as Record<string, unknown>;
      const content = simplyPluralRow(entry);
      return {
        externalId: text(row['id'] ?? row['_id'] ?? content['id']),
        name: text(content['name']),
        description: content['desc'],
        color: content['color'],
      };
    }),
    scope,
  );
  asArray(source['groups']).forEach((entry) => {
    const row = entry as Record<string, unknown>;
    const content = simplyPluralRow(entry);
    const groupId = groupIdMap.get(text(row['id'] ?? row['_id'] ?? content['id']));
    if (!groupId) return;
    asArray(content['members']).forEach((memberExternalId) => {
      const memberId = memberIdMap.get(text(memberExternalId));
      const member = memberId ? members.find((candidate) => candidate.id === memberId) : undefined;
      if (member) member['groupId'] = groupId;
    });
  });

  asArray(source['frontHistory']).forEach((entry, index) => {
    const content = simplyPluralRow(entry);
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
        durationSeconds:
          Number.isFinite(endedAt) && endedAt > startedAt
            ? Math.floor((endedAt - startedAt) / 1000)
            : null,
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

  const journalEntries: StoredRecord[] = [];
  asArray(source['notes']).forEach((entry, index) => {
    const content = simplyPluralRow(entry);
    const title = text(content['title']).trim();
    const body = text(content['note']);
    if (!title && !body) {
      problems.push({ index, reason: 'This note had neither a title nor a body, so it was skipped.' });
      return;
    }
    const memberId = memberIdMap.get(text(content['member'])) ?? null;
    const dateValue = Number(content['date']);
    journalEntries.push(
      baseRow(scope, 'jrn', {
        memberId,
        title,
        body,
        entryDate: Number.isFinite(dateValue) ? new Date(dateValue).toISOString() : now(),
        tags: [],
        privacy: 'private',
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length) records['members'] = members;
  if (frontEvents.length) records['frontEvents'] = frontEvents;
  if (groups.length) records['memberGroups'] = groups;
  if (fieldDefinitions.length) records['customFieldDefinitions'] = fieldDefinitions;
  if (journalEntries.length) records['journalEntries'] = journalEntries;
  return { sourceLabel: 'Simply Plural', records, problems };
};

/**
 * Sheaf's own export: `{ members, fronts, groups, tags, custom_fields,
 * journals }`, decrypted at export time. A front's `member_ids` is a list —
 * Sheaf records co-fronting directly rather than one entry per co-fronter.
 */
const sheaf: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const memberIdMap = new Map<string, string>();
  const source = (payload ?? {}) as Record<string, unknown>;

  const { records: fieldDefinitions, idMap: fieldIdMap } = buildCustomFieldDefinitions(
    asArray(source['custom_fields']).map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return {
        externalId: text(row['id']),
        label: text(row['name']),
        type: row['field_type'],
        sortOrder: Number(row['order']) || index,
        options: row['options'],
      };
    }),
    scope,
  );
  // Sheaf nests each field's answers inside the field definition rather than
  // inside the member, so the values have to be collected by member first.
  const valuesByMember = new Map<string, { fieldExternalId: string; value: unknown }[]>();
  asArray(source['custom_fields']).forEach((entry) => {
    const row = entry as Record<string, unknown>;
    const fieldExternalId = text(row['id']);
    asArray(row['values']).forEach((valueEntry) => {
      const value = valueEntry as Record<string, unknown>;
      const memberExternalId = text(value['member_id']);
      if (!memberExternalId) return;
      const wrapped = plainObject(value['value']);
      const list = valuesByMember.get(memberExternalId) ?? [];
      list.push({ fieldExternalId, value: wrapped ? wrapped['v'] : value['value'] });
      valuesByMember.set(memberExternalId, list);
    });
  });

  asArray(source['members'] ?? payload).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['name'] ?? row['display_name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const avatar = text(row['avatar_url']);
    const externalId = text(row['id']);
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
      customFieldValues: buildCustomFieldValues(valuesByMember.get(externalId) ?? [], fieldIdMap),
    });
    members.push(record);
    if (externalId) memberIdMap.set(externalId, record.id);
  });

  const { records: groups, idMap: groupIdMap } = buildGroupRecords(
    asArray(source['groups']).map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return {
        externalId: text(row['id']),
        name: text(row['name']),
        description: row['description'],
        color: row['color'],
        sortOrder: index,
      };
    }),
    scope,
  );
  asArray(source['groups']).forEach((entry) => {
    const row = entry as Record<string, unknown>;
    const groupId = groupIdMap.get(text(row['id']));
    if (!groupId) return;
    asArray(row['member_ids']).forEach((id) => {
      const memberId = memberIdMap.get(text(id));
      const member = memberId ? members.find((candidate) => candidate.id === memberId) : undefined;
      if (member) member['groupId'] = groupId;
    });
  });

  // Sheaf's tags are a flatter, unstructured concept than groups — they land
  // directly in each tagged member's own `tags` field rather than becoming a
  // whole extra collection just to hold a label.
  asArray(source['tags']).forEach((entry) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['name']).trim();
    if (!name) return;
    asArray(row['member_ids']).forEach((id) => {
      const memberId = memberIdMap.get(text(id));
      const member = memberId ? members.find((candidate) => candidate.id === memberId) : undefined;
      if (member) member['tags'] = [...stringArray(member['tags']), name];
    });
  });

  const frontEvents: StoredRecord[] = [];
  asArray(source['fronts']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    // `member_ids` is the real, current shape — a front lists everyone
    // fronting at once rather than needing one entry per co-fronter — but a
    // singular `member_id`/`memberId`/`member` is read the same way in case
    // of an older export or a hand-built one.
    const rawIds = asArray(row['member_ids']);
    const memberIds = (rawIds.length ? rawIds : [row['member_id'] ?? row['memberId'] ?? row['member']])
      .map((id) => memberIdMap.get(text(id)))
      .filter((id): id is string => Boolean(id));
    const startedAt = Date.parse(text(row['started_at'] ?? row['start'] ?? row['timestamp']));
    if (memberIds.length === 0 || !Number.isFinite(startedAt)) {
      problems.push({ index, reason: 'A fronting entry did not match a member that was imported.' });
      return;
    }
    const [memberId, ...coFronterIds] = memberIds;
    const endedAt = Date.parse(text(row['ended_at'] ?? row['end']));
    frontEvents.push(
      baseRow(scope, 'fev', {
        memberId,
        coFronterIds,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: Number.isFinite(endedAt) ? new Date(endedAt).toISOString() : null,
        durationSeconds:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.floor((endedAt - startedAt) / 1000) : null,
        durationMinutes:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.round((endedAt - startedAt) / 60000) : null,
        activity: '',
        location: '',
        mood: '',
        note: text(row['note'] ?? row['custom_status']),
        tags: [],
        statusType: 'fronting',
        unknownFronter: 0,
      }),
    );
  });

  const journalEntries: StoredRecord[] = [];
  asArray(source['journals']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const title = text(row['title']).trim();
    const body = text(row['body']);
    if (!title && !body) {
      problems.push({ index, reason: 'This journal entry had neither a title nor a body, so it was skipped.' });
      return;
    }
    const memberId = memberIdMap.get(text(row['member_id'])) ?? null;
    const authorIds = asArray(row['author_member_ids'])
      .map((id) => memberIdMap.get(text(id)))
      .filter((id): id is string => Boolean(id));
    const entryDate = Date.parse(text(row['created_at']));
    journalEntries.push(
      baseRow(scope, 'jrn', {
        memberId,
        title,
        body,
        entryDate: Number.isFinite(entryDate) ? new Date(entryDate).toISOString() : now(),
        authorIds,
        tags: [],
        privacy: row['visibility'] === 'public' ? 'public' : 'private',
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  if (groups.length > 0) records['memberGroups'] = groups;
  if (fieldDefinitions.length > 0) records['customFieldDefinitions'] = fieldDefinitions;
  if (journalEntries.length > 0) records['journalEntries'] = journalEntries;
  return { sourceLabel: 'Sheaf', records, problems };
};

/**
 * Octocon's full export: `{ user: { fields: [...] }, alters: [...], fronts:
 * [...], tags: [...] }`. Octocon's own export genuinely has no journal, even
 * though the app itself has one — there is nothing to read here for it.
 */
const octocon: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const memberIdMap = new Map<string, string>();
  const source = (payload ?? {}) as Record<string, unknown>;
  const user = plainObject(source['user']) ?? {};

  const { records: fieldDefinitions, idMap: fieldIdMap } = buildCustomFieldDefinitions(
    asArray(user['fields']).map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return { externalId: text(row['id']), label: text(row['name']), type: row['type'], sortOrder: index };
    }),
    scope,
  );

  asArray(source['alters'] ?? payload).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const avatar = text(row['avatar_url']);
    const valueEntries = asArray(row['fields']).map((item) => {
      const field = item as Record<string, unknown>;
      return { fieldExternalId: text(field['id']), value: field['value'] };
    });
    const record = baseRow(scope, 'mem', {
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
      customFieldValues: buildCustomFieldValues(valueEntries, fieldIdMap),
    });
    members.push(record);
    const externalId = text(row['id']);
    if (externalId) memberIdMap.set(externalId, record.id);
  });

  // Octocon's tags are closer to a flat label than a whole grouping, so — as
  // with Sheaf's — they land in each tagged member's own `tags` field.
  asArray(source['tags']).forEach((entry) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['name']).trim();
    if (!name) return;
    asArray(row['alters']).forEach((id) => {
      const memberId = memberIdMap.get(text(id));
      const member = memberId ? members.find((candidate) => candidate.id === memberId) : undefined;
      if (member) member['tags'] = [...stringArray(member['tags']), name];
    });
  });

  const frontEvents: StoredRecord[] = [];
  asArray(source['fronts']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const memberId = memberIdMap.get(text(row['alter_id']));
    const startedAt = Date.parse(text(row['time_start']));
    if (!memberId || !Number.isFinite(startedAt)) {
      problems.push({ index, reason: 'A fronting entry did not match a member that was imported.' });
      return;
    }
    const endedAt = Date.parse(text(row['time_end']));
    frontEvents.push(
      baseRow(scope, 'fev', {
        memberId,
        coFronterIds: [],
        startedAt: new Date(startedAt).toISOString(),
        endedAt: Number.isFinite(endedAt) ? new Date(endedAt).toISOString() : null,
        durationSeconds:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.floor((endedAt - startedAt) / 1000) : null,
        durationMinutes:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.round((endedAt - startedAt) / 60000) : null,
        activity: '',
        location: '',
        mood: '',
        note: text(row['comment']),
        tags: [],
        statusType: 'fronting',
        unknownFronter: 0,
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  if (fieldDefinitions.length > 0) records['customFieldDefinitions'] = fieldDefinitions;
  return { sourceLabel: 'Octocon', records, problems };
};

/**
 * Plural Star's category-selective JSON export: `{ members, frontHistory,
 * journal, groups, customFieldDefs, avatars, banners, ... }`. Avatars and
 * banners are kept out of each member and stored separately, keyed by member
 * id, since choosing not to export images is one of the category toggles.
 */
const pluralStar: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const memberIdMap = new Map<string, string>();
  const source = (payload ?? {}) as Record<string, unknown>;
  const avatars = plainObject(source['avatars']) ?? {};
  const banners = plainObject(source['banners']) ?? {};

  const { records: fieldDefinitions, idMap: fieldIdMap } = buildCustomFieldDefinitions(
    asArray(source['customFieldDefs']).map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return {
        externalId: text(row['id']),
        label: text(row['name']),
        type: row['type'],
        sortOrder: typeof row['sortOrder'] === 'number' ? row['sortOrder'] : index,
      };
    }),
    scope,
  );

  const { records: groups, idMap: groupIdMap } = buildGroupRecords(
    asArray(source['groups']).map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return { externalId: text(row['id']), name: text(row['name']), color: row['color'], sortOrder: index };
    }),
    scope,
  );

  asArray(source['members'] ?? payload).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const externalId = text(row['id']);
    const name = text(row['name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    // Held on the member on some exports, or only in the separate top-level
    // dictionary on others — whichever one actually has something.
    const avatar = text(row['avatar'] ?? avatars[externalId]);
    const banner = text(row['banner'] ?? banners[externalId]);
    const roleRaw = row['role'];
    const roles = Array.isArray(roleRaw) ? stringArray(roleRaw) : text(roleRaw) ? [text(roleRaw)] : [];
    const sortOrder = row['sortOrder'];
    const valueEntries = asArray(row['customFields']).map((item) => {
      const field = item as Record<string, unknown>;
      return { fieldExternalId: text(field['fieldId']), value: field['value'] };
    });
    const groupId = groupIdMap.get(text(asArray(row['groupIds'])[0] ?? row['groupId']));

    const record = baseRow(scope, 'mem', {
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
      customFieldValues: buildCustomFieldValues(valueEntries, fieldIdMap),
      groupId: groupId ?? null,
      archived: row['archived'] === true,
    });
    members.push(record);
    if (externalId) memberIdMap.set(externalId, record.id);
  });

  const frontEvents: StoredRecord[] = [];
  asArray(source['frontHistory']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const memberIds = asArray(row['memberIds'])
      .map((id) => memberIdMap.get(text(id)))
      .filter((id): id is string => Boolean(id));
    const startedAt = Number(row['startTime']);
    if (memberIds.length === 0 || !Number.isFinite(startedAt)) {
      problems.push({ index, reason: 'A front history entry did not match a member that was imported.' });
      return;
    }
    const [memberId, ...primaryCoFronters] = memberIds;
    // `coFrontIds`/`coConsciousIds` name a finer distinction than PluralNova
    // draws — both land as ordinary co-fronters rather than being dropped.
    const coFronterIds = [
      ...new Set([
        ...primaryCoFronters,
        ...asArray(row['coFrontIds']).map((id) => memberIdMap.get(text(id))),
        ...asArray(row['coConsciousIds']).map((id) => memberIdMap.get(text(id))),
      ]),
    ].filter((id): id is string => Boolean(id));
    const endedAt = Number(row['endTime']);
    frontEvents.push(
      baseRow(scope, 'fev', {
        memberId,
        coFronterIds,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: Number.isFinite(endedAt) && endedAt > 0 ? new Date(endedAt).toISOString() : null,
        durationSeconds:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.floor((endedAt - startedAt) / 1000) : null,
        durationMinutes:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.round((endedAt - startedAt) / 60000) : null,
        activity: '',
        // frontEvents has no plain-text location — only `locationIds`,
        // references into a separate collection this import has no member of
        // its own to point at — so a location the source gave as free text
        // rides along in the note instead of being silently dropped.
        mood: text(row['mood']),
        note: [text(row['location']) && `Location: ${text(row['location'])}`, text(row['note'])]
          .filter(Boolean)
          .join(' — '),
        tags: [],
        statusType: 'fronting',
        unknownFronter: 0,
      }),
    );
  });

  const journalEntries: StoredRecord[] = [];
  asArray(source['journal']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const title = text(row['title']).trim();
    const body = text(row['body']);
    if (!title && !body) {
      problems.push({ index, reason: 'This journal entry had neither a title nor a body, so it was skipped.' });
      return;
    }
    const authorIds = asArray(row['authorIds'])
      .map((id) => memberIdMap.get(text(id)))
      .filter((id): id is string => Boolean(id));
    const timestamp = Number(row['timestamp']);
    journalEntries.push(
      baseRow(scope, 'jrn', {
        memberId: authorIds[0] ?? null,
        title,
        body,
        entryDate: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : now(),
        authorIds,
        tags: stringArray(row['hashtags']),
        privacy: 'private',
        isSensitive: Boolean(row['password']),
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  if (groups.length > 0) records['memberGroups'] = groups;
  if (fieldDefinitions.length > 0) records['customFieldDefinitions'] = fieldDefinitions;
  if (journalEntries.length > 0) records['journalEntries'] = journalEntries;
  return { sourceLabel: 'Plural Star', records, problems };
};

/**
 * PluralSpace's GDPR migration export: a `.zip` of `manifest.json`,
 * `data.json` and a `media/` directory — this reads `data.json`, whose keys
 * are `{ system, members, fronts, journal_entries, member_groups,
 * custom_fields, chat_channels, polls, thoughts, media_files }`. Avatar and
 * banner paths point into the zip's own `media/` folder rather than being
 * URLs, so — same as Plural Star, the app this one was renamed to — they
 * come through blank from the JSON alone.
 */
const pluralSpace: Adapter = (payload, scope) => {
  const problems: ImportProblem[] = [];
  const members: StoredRecord[] = [];
  const memberIdMap = new Map<string, string>();
  const source = (payload ?? {}) as Record<string, unknown>;

  const { records: fieldDefinitions, idMap: fieldIdMap } = buildCustomFieldDefinitions(
    asArray(source['custom_fields']).map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return {
        externalId: text(row['id']),
        label: text(row['name']),
        type: row['is_multiple'] === true ? 'multiselect' : row['field_type'],
        sortOrder: index,
        options: row['values'],
      };
    }),
    scope,
  );

  const { records: groups, idMap: groupIdByName } = buildGroupRecords(
    asArray(source['member_groups']).map((entry, index) => {
      const row = entry as Record<string, unknown>;
      const name = text(row['name']);
      // Keyed by name below, since that is how a member's own `groups`
      // list references one — PluralSpace never gives it a stable id there.
      return { externalId: name, name, description: row['description'], color: row['color'], sortOrder: index };
    }),
    scope,
  );

  asArray(source['members'] ?? source['alters'] ?? payload).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const name = text(row['name'] ?? row['display_name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const avatar = text(row['avatar_path'] ?? row['avatar_media_path']);
    const valuesRaw = row['custom_field_values'];
    const valueEntries: { fieldExternalId: string; value: unknown }[] = plainObject(valuesRaw)
      ? Object.entries(plainObject(valuesRaw)!).map(([fieldExternalId, value]) => ({ fieldExternalId, value }))
      : asArray(valuesRaw).map((item) => {
          const pair = item as Record<string, unknown>;
          return { fieldExternalId: text(pair['id'] ?? pair['field_id']), value: pair['value'] };
        });
    const groupName = asArray(row['groups'])[0];
    const record = baseRow(scope, 'mem', {
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
      customFieldValues: buildCustomFieldValues(valueEntries, fieldIdMap),
      groupId: groupName ? (groupIdByName.get(text(groupName)) ?? null) : null,
    });
    members.push(record);
    const externalId = text(row['id']);
    if (externalId) memberIdMap.set(externalId, record.id);
  });

  const frontEvents: StoredRecord[] = [];
  asArray(source['fronts']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const memberId = memberIdMap.get(text(row['member_id']));
    const startedAt = Date.parse(text(row['started_at']));
    if (!memberId || !Number.isFinite(startedAt)) {
      problems.push({ index, reason: 'A fronting entry did not match a member that was imported.' });
      return;
    }
    const endedAt = Date.parse(text(row['ended_at']));
    frontEvents.push(
      baseRow(scope, 'fev', {
        memberId,
        coFronterIds: [],
        startedAt: new Date(startedAt).toISOString(),
        endedAt: Number.isFinite(endedAt) ? new Date(endedAt).toISOString() : null,
        durationSeconds:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.floor((endedAt - startedAt) / 1000) : null,
        durationMinutes:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.round((endedAt - startedAt) / 60000) : null,
        activity: '',
        location: '',
        mood: '',
        note: text(row['comment']),
        tags: [],
        statusType: 'fronting',
        unknownFronter: 0,
      }),
    );
  });

  const journalEntries: StoredRecord[] = [];
  asArray(source['journal_entries']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const title = text(row['title']).trim();
    const body = text(row['content']);
    if (!title && !body) {
      problems.push({ index, reason: 'This journal entry had neither a title nor a body, so it was skipped.' });
      return;
    }
    // Entries name whoever they are about as `{id, name}` snapshots rather
    // than a single owning member — the first one that matches becomes the
    // entry's owner, and the rest are recorded as co-authors.
    const memberIds = asArray(row['members'])
      .map((snapshot) => memberIdMap.get(text((snapshot as Record<string, unknown>)['id'])))
      .filter((id): id is string => Boolean(id));
    const entryDate = Date.parse(text(row['date'] ?? row['created_at']));
    journalEntries.push(
      baseRow(scope, 'jrn', {
        memberId: memberIds[0] ?? null,
        title,
        body,
        entryDate: Number.isFinite(entryDate) ? new Date(entryDate).toISOString() : now(),
        authorIds: memberIds,
        tags: [],
        // PluralSpace's numeric visibility level has no documented meaning
        // here beyond 0 being the default — anything else is treated as the
        // more private end rather than guessed at.
        privacy: Number(row['visibility_level']) > 0 ? 'system' : 'private',
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  if (groups.length > 0) records['memberGroups'] = groups;
  if (fieldDefinitions.length > 0) records['customFieldDefinitions'] = fieldDefinitions;
  if (journalEntries.length > 0) records['journalEntries'] = journalEntries;
  return { sourceLabel: 'PluralSpace', records, problems };
};

/**
 * Open Plural / PluralPort v0.1 — a shared interchange format rather than one
 * app's own shape, covering every module the spec defines: members, groups,
 * taxonomy (roles/tags/identity labels), custom fields, notes (journal) and
 * fronting periods with their per-member mood/location/note. Avatars and
 * banners are referenced by an asset id rather than a URL, so they are
 * resolved against the file's own `assets` list.
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
    if (!asset) return '';
    // `uri` is the spec's own field; `url`/`href`/`data_url` cover exports
    // (PluralNova's own OpenPlural export among them) written before that
    // was pinned down.
    const direct = text(asset['uri'] ?? asset['url'] ?? asset['href'] ?? asset['data_url']);
    if (looksLikeImageUrl(direct)) return direct;
    const dataUri = text(asset['data_uri']);
    if (looksLikeImageUrl(dataUri)) return dataUri;
    const base64 = text(asset['data_base64']);
    const mime = text(asset['mime_type'], 'image/png');
    return base64 ? `data:${mime};base64,${base64}` : '';
  };

  const resolveBirthday = (value: unknown): string => {
    const row = plainObject(value);
    // Birthday is `{ value, precision, year_visible }`, not a bare string —
    // `value` alone is still whatever precision the source actually knew.
    const raw = row ? text(row['value']) : text(value);
    return raw.replace(/^--/, '').slice(0, 10);
  };

  // Roles, tags, identity labels and "source" are all the same idea in the
  // spec — a term of some `kind`, assigned to a member — but PluralNova
  // already has a named field for each, so an assignment is sorted onto the
  // one that matches rather than piling everything into one generic list.
  const termsById = new Map(
    asArray(source['taxonomy_terms']).map((entry) => {
      const row = entry as Record<string, unknown>;
      return [text(row['id']), row] as const;
    }),
  );
  const termsByMember = new Map<string, { kind: string; name: string }[]>();
  asArray(source['taxonomy_assignments']).forEach((entry) => {
    const row = entry as Record<string, unknown>;
    if (row['subject_type'] !== 'member') return;
    const term = termsById.get(text(row['term_id']));
    if (!term) return;
    const subjectId = text(row['subject_id']);
    const list = termsByMember.get(subjectId) ?? [];
    list.push({ kind: text(term['kind']), name: text(term['name']) });
    termsByMember.set(subjectId, list);
  });

  const { records: fieldDefinitions, idMap: fieldIdMap } = buildCustomFieldDefinitions(
    asArray(source['custom_fields']).map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return {
        externalId: text(row['id']),
        label: text(row['name']),
        type: row['field_type'],
        sortOrder: typeof row['sort_order'] === 'number' ? row['sort_order'] : index,
        options: row['options'],
      };
    }),
    scope,
  );
  const valuesByMember = new Map<string, { fieldExternalId: string; value: unknown }[]>();
  asArray(source['custom_field_values']).forEach((entry) => {
    const row = entry as Record<string, unknown>;
    if (row['subject_type'] !== 'member') return;
    const subjectId = text(row['subject_id']);
    const list = valuesByMember.get(subjectId) ?? [];
    list.push({ fieldExternalId: text(row['field_id']), value: row['value'] });
    valuesByMember.set(subjectId, list);
  });

  const { records: groups, idMap: groupIdMap } = buildGroupRecords(
    asArray(source['groups']).map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return {
        externalId: text(row['id']),
        name: text(row['name']),
        description: row['description'],
        color: row['color'],
        sortOrder: typeof row['sort_order'] === 'number' ? row['sort_order'] : index,
      };
    }),
    scope,
  );
  const groupIdByMember = new Map<string, string>();
  asArray(source['group_memberships']).forEach((entry) => {
    const row = entry as Record<string, unknown>;
    const groupId = groupIdMap.get(text(row['group_id']));
    const memberExternalId = text(row['member_id']);
    if (groupId && memberExternalId && !groupIdByMember.has(memberExternalId)) {
      groupIdByMember.set(memberExternalId, groupId);
    }
  });

  list.forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const externalId = text(row['id']);
    const name = text(row['name'] ?? row['display_name']).trim();
    if (!name) {
      problems.push({ index, reason: 'No name on this entry, so it was skipped.' });
      return;
    }
    const sortOrder = row['sort_order'];
    const terms = termsByMember.get(externalId) ?? [];
    const byKind = (kind: string): string[] => terms.filter((term) => term.kind === kind).map((term) => term.name);

    const record = baseRow(scope, 'mem', {
      name,
      pronouns: text(row['pronouns']),
      bio: text(row['description']),
      color: hexColor(row['color']),
      avatarUrl: resolveAsset(row['avatar_asset_id']),
      bannerUrl: resolveAsset(row['banner_asset_id']),
      birthday: resolveBirthday(row['birthday']),
      age: text(row['age']),
      tags: byKind('tag'),
      roles: byKind('role'),
      interests: [],
      identityLabels: byKind('identity'),
      source: byKind('source')[0] ?? '',
      frontStatus: 'nearby',
      frontCount: 0,
      frontMinutes: 0,
      orbitOrder: typeof sortOrder === 'number' ? sortOrder : index,
      archived: row['archived'] === true,
      customFieldValues: buildCustomFieldValues(valuesByMember.get(externalId) ?? [], fieldIdMap),
      groupId: groupIdByMember.get(externalId) ?? null,
    });
    members.push(record);
    if (externalId) memberIdMap.set(externalId, record.id);
  });

  const frontEvents: StoredRecord[] = [];
  asArray(source['front_periods']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    // `assignments[]` is the spec's own shape; a flat `member_id` plus
    // `co_member_ids` (PluralNova's own exporter, before this file matched
    // the spec precisely) is read as a single implicit assignment.
    const assignments: Record<string, unknown>[] = asArray(row['assignments']).length
      ? asArray(row['assignments']).map((item) => item as Record<string, unknown>)
      : (
          [
            { member_id: row['member_id'] },
            ...asArray(row['co_member_ids']).map((id) => ({ member_id: id })),
          ] as Record<string, unknown>[]
        ).filter((assignment) => assignment['member_id']);
    const memberIds = assignments
      .map((assignment) => memberIdMap.get(text(assignment['member_id'])))
      .filter((id): id is string => Boolean(id));
    const startedAt = Date.parse(text(row['started_at']));
    if (memberIds.length === 0 || !Number.isFinite(startedAt)) {
      problems.push({ index, reason: 'A fronting period did not match a member that was imported.' });
      return;
    }
    const [memberId, ...coFronterIds] = memberIds;
    const primary = assignments[0] ?? {};
    const endedAt = Date.parse(text(row['ended_at']));
    frontEvents.push(
      baseRow(scope, 'fev', {
        memberId,
        coFronterIds,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: Number.isFinite(endedAt) ? new Date(endedAt).toISOString() : null,
        durationSeconds:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.floor((endedAt - startedAt) / 1000) : null,
        durationMinutes:
          Number.isFinite(endedAt) && endedAt > startedAt ? Math.round((endedAt - startedAt) / 60000) : null,
        activity: '',
        // Same reasoning as Plural Star, just above: frontEvents only has
        // `locationIds` (references), not free text, so the assignment's own
        // location comes along inside the note rather than being dropped.
        mood: text(primary['mood']),
        note: [
          text(primary['location']) && `Location: ${text(primary['location'])}`,
          text(row['note'] ?? primary['note']),
        ]
          .filter(Boolean)
          .join(' — '),
        tags: [],
        statusType: 'fronting',
        unknownFronter: 0,
      }),
    );
  });

  const journalEntries: StoredRecord[] = [];
  asArray(source['notes']).forEach((entry, index) => {
    const row = entry as Record<string, unknown>;
    const title = text(row['title']).trim();
    const body = text(row['body']);
    if (!body) {
      problems.push({ index, reason: 'This note had no body, so it was skipped.' });
      return;
    }
    const authorIds = asArray(row['author_member_ids'])
      .map((id) => memberIdMap.get(text(id)))
      .filter((id): id is string => Boolean(id));
    const memberId = memberIdMap.get(text(row['member_id'])) ?? authorIds[0] ?? null;
    const entryDate = Date.parse(text(row['entry_date'] ?? row['created_at']));
    const visibility = text(row['visibility']);
    journalEntries.push(
      baseRow(scope, 'jrn', {
        memberId,
        title,
        body,
        entryDate: Number.isFinite(entryDate) ? new Date(entryDate).toISOString() : now(),
        authorIds,
        tags: [],
        pinned: row['pinned'] === true,
        privacy: (['private', 'system', 'friends', 'public'] as const).includes(visibility as never)
          ? visibility
          : 'private',
      }),
    );
  });

  const records: Record<string, StoredRecord[]> = {};
  if (members.length > 0) records['members'] = members;
  if (frontEvents.length > 0) records['frontEvents'] = frontEvents;
  if (groups.length > 0) records['memberGroups'] = groups;
  if (fieldDefinitions.length > 0) records['customFieldDefinitions'] = fieldDefinitions;
  if (journalEntries.length > 0) records['journalEntries'] = journalEntries;
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
    description: 'Members, groups and recent switch history, pulled straight from PluralKit. Nothing to export by hand.',
    accepts: 'token',
    instructions:
      'Message the PluralKit bot `pk;token` in Discord and paste what it sends back. The token is used once for this import and is never stored.',
    collections: ['members', 'frontEvents', 'memberGroups'],
  },
  {
    id: 'pluralkit',
    label: 'PluralKit — file export',
    description: 'Members, pronouns, descriptions, colours, avatars, birthdays, groups and switch history.',
    accepts: 'json',
    instructions: 'Run `pk;export` in Discord and upload the JSON file it sends you.',
    collections: ['members', 'frontEvents', 'memberGroups'],
  },
  {
    id: 'simply-plural',
    label: 'Simply Plural',
    description: 'Members, front history, groups, custom fields and notes — everything a Simply Plural export holds.',
    accepts: 'json',
    instructions: 'Settings → Import/Export → Export, then upload the JSON file.',
    collections: ['members', 'frontEvents', 'memberGroups', 'customFieldDefinitions', 'journalEntries'],
  },
  {
    id: 'sheaf',
    label: 'Sheaf',
    description: 'Members, fronting history, groups, tags, custom fields and journal entries.',
    accepts: 'json',
    instructions: 'Settings → Export → Sync JSON, then upload the file it downloads.',
    collections: ['members', 'frontEvents', 'memberGroups', 'customFieldDefinitions', 'journalEntries'],
  },
  {
    id: 'octocon',
    label: 'Octocon',
    description:
      'Alters, pronouns, descriptions, colours, avatars, tags, custom fields and fronting history. Octocon’s own export does not include journal entries, even though the app has them.',
    accepts: 'json',
    instructions: 'Settings → Export data, then upload the JSON file it gives you.',
    collections: ['members', 'frontEvents', 'customFieldDefinitions'],
  },
  {
    id: 'plural-star',
    label: 'Plural Star',
    description:
      'Members, roles, colours, groups, custom fields, fronting history and journal entries. Choose those categories (and Avatars/Banners) when exporting for everything to come through.',
    accepts: 'json',
    instructions: 'Export → choose Members, Front history, Journal, Groups and Custom fields → JSON, then upload the file.',
    collections: ['members', 'frontEvents', 'memberGroups', 'customFieldDefinitions', 'journalEntries'],
  },
  {
    id: 'pluralspace',
    label: 'PluralSpace',
    description:
      'Members, pronouns, roles, descriptions, groups, custom fields, fronting history and journal entries.',
    accepts: 'json',
    instructions:
      'The migration export from your PluralSpace account settings downloads a .zip file — open it and upload the data.json file inside, not the .zip itself. Avatars live in that zip’s media folder and are not reachable from data.json alone, so they will come through blank.',
    collections: ['members', 'frontEvents', 'memberGroups', 'customFieldDefinitions', 'journalEntries'],
  },
  {
    id: 'openplural',
    label: 'Open Plural (PluralPort)',
    description:
      'The shared, app-independent format some trackers — Sheaf among them — can export directly. Carries members, groups, roles/tags, custom fields, fronting history and journal-style notes.',
    accepts: 'json',
    instructions:
      'If your app can export as "PluralPort" or "Open Plural", upload that file. It is designed to move between apps without losing anything.',
    collections: ['members', 'frontEvents', 'memberGroups', 'customFieldDefinitions', 'journalEntries'],
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
