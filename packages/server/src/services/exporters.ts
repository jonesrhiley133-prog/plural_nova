import { now } from '@pluralnova/shared';
import { allRecords } from '../db/repository.js';
import type { Scope } from '../db/repository.js';

/**
 * Open Plural (PluralPort v0.1) export.
 *
 * A second export format alongside the native backup: not a PluralNova
 * format at all, but the shared, app-independent envelope a growing set of
 * trackers can read directly. Avatars and banners are modelled as separate
 * assets referenced by id, per the spec, rather than inline URLs — so a
 * member with no image simply has no asset, instead of a broken reference.
 */

export interface OpenPluralExport {
  openplural_version: string;
  exported_at: string;
  producer: { app: string; version: string };
  modules: string[];
  systems: Record<string, unknown>[];
  members: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  front_periods: Record<string, unknown>[];
  warnings: string[];
}

export function buildOpenPluralExport(scope: Scope, systemName: string, appVersion: string): OpenPluralExport {
  const members = allRecords('members', scope);
  const frontEvents = allRecords('frontEvents', scope);

  const assets: Record<string, unknown>[] = [];
  const assetRef = (url: unknown, kind: 'avatar' | 'banner'): string | null => {
    const href = typeof url === 'string' ? url.trim() : '';
    if (!href) return null;
    const id = `asset-${kind}-${assets.length}`;
    assets.push({ id, kind, url: href });
    return id;
  };

  const memberRecords = members.map((member) => ({
    id: member.id,
    system_id: scope.systemId,
    name: member['name'] || null,
    pronouns: member['pronouns'] || null,
    description: member['bio'] || null,
    color: member['color'] || null,
    birthday: member['birthday'] || null,
    avatar_asset_id: assetRef(member['avatarUrl'], 'avatar'),
    banner_asset_id: assetRef(member['bannerUrl'], 'banner'),
    archived: Boolean(member['archived']),
    sort_order: member['orbitOrder'] ?? 0,
    source_refs: { pluralnova_id: member.id },
  }));

  const frontPeriods = frontEvents.map((event) => ({
    id: event.id,
    member_id: event.memberId ?? null,
    co_member_ids: event['coFronterIds'] ?? [],
    started_at: event['startedAt'],
    ended_at: event['endedAt'] ?? null,
    source_refs: { pluralnova_id: event.id },
  }));

  return {
    openplural_version: '0.1',
    exported_at: now(),
    producer: { app: 'PluralNova', version: appVersion },
    modules: ['core', 'fronting'],
    systems: [{ id: scope.systemId ?? 'system', name: systemName || 'System', archived: false }],
    members: memberRecords,
    assets,
    front_periods: frontPeriods,
    warnings: [],
  };
}
