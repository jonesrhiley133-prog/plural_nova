import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ACCENT_PRESETS, MEMBER_LIST_LAYOUTS, formatDuration, type MemberListLayout, type StoredRecord } from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { FRONT_STATUS_META, useFronting } from '../core/fronting.js';
import { useOptimisticSettings } from '../core/settings.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SegmentedControl, Status } from '../ui/primitives.js';
import { SearchField, useDebounced } from '../ui/forms.js';
import { AsyncContent, SkeletonCards } from '../ui/feedback.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';

/**
 * The member directory.
 *
 * Square profile cards, sorted however the system wants to see them. The point
 * of the card is recognition at a glance — face, name, colour, status — with the
 * detail a tap away.
 */

type SortKey = 'name' | 'recent' | 'frequent' | 'newest' | 'orbit';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'orbit', label: 'Orbit order' },
  { key: 'name', label: 'A–Z' },
  { key: 'recent', label: 'Recently out' },
  { key: 'frequent', label: 'Most often out' },
  { key: 'newest', label: 'Newest' },
];

const LAYOUTS: { value: MemberListLayout; label: string }[] = [
  { value: 'square', label: 'Squares' },
  { value: 'circle', label: 'Circles' },
  { value: 'slimBanner', label: 'Slim banners' },
  { value: 'thickBanner', label: 'Thick banners' },
];

function isFronting(member: StoredRecord): boolean {
  return member['frontStatus'] === 'fronting' || member['frontStatus'] === 'cofronting';
}

export default function Members(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t, term } = useI18n();
  const toast = useToast();

  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounced(rawSearch);
  const [sort, setSort] = useState<SortKey>('orbit');
  const { settings, update: updateSettings } = useOptimisticSettings();
  const layout = settings.memberListLayout;
  const setLayout = (value: MemberListLayout): void => updateSettings({ memberListLayout: value });
  const [columns, setColumns] = useState(3);
  const [showArchived, setShowArchived] = useState(false);
  const isGrid = layout === 'square' || layout === 'circle';
  const fronting = useFronting();

  const groups = useCollection('memberGroups');
  const subsystems = useCollection('subsystems');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const { items, all, loading, error, reload, create } = useCollection('members', {
    search,
    filter: (member) =>
      (showArchived ? member['archived'] === true : member['archived'] !== true) &&
      (groupFilter === null ||
        member['groupId'] === groupFilter ||
        member['subsystemId'] === groupFilter),
  });

  const creator = useDialog();
  // Cycled by how many members already exist, so a new one starts distinct
  // from the last rather than defaulting to the same accent as everyone else
  // who never opened the colour picker.
  const nextColor = ACCENT_PRESETS[all.length % ACCENT_PRESETS.length]!.accent;
  const [autoOpened, setAutoOpened] = useState(false);
  if (params.get('new') === '1' && !autoOpened) {
    setAutoOpened(true);
    creator.show();
  }

  const sorted = useMemo(() => sortMembers(items, sort), [items, sort]);

  // Instant: applied to the shared fronting state before the request that
  // tells the server about it resolves, so the tap never waits on anything.
  const quickFrontMember = (member: StoredRecord): void => {
    if (fronting.isFrontingAlready(member.id)) return;
    void fronting.quickFront(member.id).catch((cause: unknown) => toast.fromError(cause));
  };

  return (
    <>
      <PageHeader
        title={term('{{Members}}')}
        description={t('members.count', { count: all.length })}
        actions={
          <Button variant="primary" icon="plus" onClick={() => creator.show()}>
            {t('members.create')}
          </Button>
        }
      />

      {all.length === 0 && !loading ? (
        <Card>
          <AsyncContent
            loading={false}
            items={[]}
            empty={{
              title: t('members.empty'),
              body: t('members.emptyBody'),
              icon: 'member',
              action: { label: t('members.create'), run: () => creator.show() },
            }}
          >
            {() => null}
          </AsyncContent>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Button variant="ghost" onClick={() => navigate('/import')}>
              {t('members.import')}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              {t('members.continueWithout')}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
            <SearchField
              value={rawSearch}
              onChange={setRawSearch}
              placeholder={term('Search {{members}}…')}
            />
            <div className="row">
              <SegmentedControl
                value={sort}
                onChange={setSort}
                label="Sort"
                options={SORTS.map(({ key, label }) => ({ value: key, label }))}
              />
              <span className="spacer" />
              <SegmentedControl value={layout} onChange={setLayout} label="Layout" options={LAYOUTS} />
            </div>

            {isGrid ? (
              <div className="row">
                <SegmentedControl
                  value={columns}
                  onChange={setColumns}
                  label="Columns"
                  options={[2, 3, 4, 5].map((count) => ({ value: count, label: count }))}
                />
              </div>
            ) : null}

            {groups.items.length > 0 || subsystems.items.length > 0 ? (
              <div className="row">
                <Chip selected={groupFilter === null} onClick={() => setGroupFilter(null)}>
                  Everyone
                </Chip>
                {subsystems.items.map((subsystem) => (
                  <Chip
                    key={subsystem.id}
                    selected={groupFilter === subsystem.id}
                    onClick={() => setGroupFilter(subsystem.id)}
                    color={(subsystem['color'] as string) ?? null}
                  >
                    <Icon name="subsystem" size={11} /> {String(subsystem['name'])}
                  </Chip>
                ))}
                {groups.items.map((group) => (
                  <Chip
                    key={group.id}
                    selected={groupFilter === group.id}
                    onClick={() => setGroupFilter(group.id)}
                    color={(group['color'] as string) ?? null}
                  >
                    {String(group['name'])}
                  </Chip>
                ))}
                <span className="spacer" />
                <Chip selected={showArchived} onClick={() => setShowArchived((value) => !value)}>
                  Archived
                </Chip>
              </div>
            ) : null}
          </div>

          <AsyncContent
            loading={loading}
            error={error}
            items={sorted}
            onRetry={reload}
            skeleton={<SkeletonCards count={6} />}
            empty={{
              title: t('list.noResults'),
              body: t('list.noResultsBody'),
              icon: 'search',
            }}
          >
            {(records) =>
              isGrid ? (
                <div className="grid grid--columns" style={{ ['--grid-columns' as never]: columns }}>
                  {records.map((member) =>
                    layout === 'square' ? (
                      <MemberCard
                        key={member.id}
                        member={member}
                        onOpen={() => navigate(`/members/${member.id}`)}
                        onQuickFront={() => quickFrontMember(member)}
                      />
                    ) : (
                      <MemberCircleCard
                        key={member.id}
                        member={member}
                        onOpen={() => navigate(`/members/${member.id}`)}
                        onQuickFront={() => quickFrontMember(member)}
                      />
                    ),
                  )}
                </div>
              ) : (
                <Card flush>
                  <div className="list">
                    {records.map((member) => (
                      <MemberBannerRow
                        key={member.id}
                        member={member}
                        thick={layout === 'thickBanner'}
                        onOpen={() => navigate(`/members/${member.id}`)}
                        onQuickFront={() => quickFrontMember(member)}
                      />
                    ))}
                  </div>
                </Card>
              )
            }
          </AsyncContent>
        </>
      )}

      <Dialog open={creator.open} onClose={creator.hide} title={t('members.create')}>
        <RecordForm
          collection="members"
          fields={['name', 'pronouns', 'color', 'icon', 'bio', 'roles', 'subsystemId']}
          initial={{ color: nextColor }}
          onSubmit={async (values) => {
            const created = await create(values);
            toast.success(term('{{Member}} added'), 'Fill in the rest of their profile whenever you like.');
            creator.hide();
            navigate(`/members/${created.id}`);
          }}
          onCancel={creator.hide}
        />
      </Dialog>
    </>
  );
}

function MemberCard({
  member,
  onOpen,
  onQuickFront,
}: {
  member: StoredRecord;
  onOpen: () => void;
  onQuickFront: () => void;
}): JSX.Element {
  const { term } = useI18n();
  const meta = FRONT_STATUS_META[String(member['frontStatus'])] ?? FRONT_STATUS_META['nearby']!;
  const minutes = Number(member['frontMinutes'] ?? 0);

  return (
    <div
      className="card card--interactive card--flush"
      style={{ position: 'relative', textAlign: 'left', overflow: 'hidden' }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={String(member['name'])}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          zIndex: 1,
        }}
      />
      <div
        style={{
          aspectRatio: '1',
          position: 'relative',
          background: member['bannerUrl']
            ? undefined
            : `linear-gradient(150deg, color-mix(in srgb, ${
                (member['color'] as string) || 'var(--accent)'
              } 32%, var(--bg-subtle)), var(--bg-subtle))`,
        }}
      >
        <span style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
          <IconButton
            icon="bolt"
            label={isFronting(member) ? term('Already {{fronting}}') : term('Quick {{front}}')}
            disabled={isFronting(member)}
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onQuickFront();
            }}
          />
        </span>
        {member['avatarUrl'] ? (
          <img
            src={String(member['avatarUrl'])}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontSize: '2rem',
              color: (member['color'] as string) || 'var(--accent)',
            }}
            aria-hidden="true"
          >
            {String(member['icon'] ?? String(member['name']).charAt(0).toUpperCase())}
          </span>
        )}
        <span
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, color-mix(in srgb, var(--bg) 88%, transparent) 8%, transparent 55%)',
          }}
        />
        <span style={{ position: 'absolute', left: 8, bottom: 6, right: 8 }}>
          <span className="truncate" style={{ display: 'block', fontWeight: 'var(--weight-semibold)' }}>
            {String(member['name'])}
          </span>
          {member['pronouns'] ? (
            <span className="tiny faint truncate" style={{ display: 'block' }}>
              {String(member['pronouns'])}
            </span>
          ) : null}
        </span>
      </div>

      <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
        <Status label={term(meta.label)} glyph={meta.glyph} color={meta.color} />
        {minutes > 0 ? (
          <div className="tiny faint numeric" style={{ marginTop: 2 }}>
            {formatDuration(minutes)} {term('{{fronting}}')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MemberCircleCard({
  member,
  onOpen,
  onQuickFront,
}: {
  member: StoredRecord;
  onOpen: () => void;
  onQuickFront: () => void;
}): JSX.Element {
  const { term } = useI18n();
  const meta = FRONT_STATUS_META[String(member['frontStatus'])] ?? FRONT_STATUS_META['nearby']!;

  return (
    <div
      className="card card--interactive"
      style={{ textAlign: 'center', position: 'relative', padding: 'var(--space-3)' }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={String(member['name'])}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          zIndex: 1,
        }}
      />
      <span style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
        <IconButton
          icon="bolt"
          label={isFronting(member) ? term('Already {{fronting}}') : term('Quick {{front}}')}
          disabled={isFronting(member)}
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onQuickFront();
          }}
        />
      </span>
      <Avatar
        name={String(member['name'])}
        src={(member['avatarUrl'] as string) ?? null}
        color={(member['color'] as string) ?? null}
        icon={(member['icon'] as string) ?? null}
        size={64}
        round
        ring={isFronting(member)}
      />
      <div className="truncate" style={{ marginTop: 'var(--space-2)', fontWeight: 'var(--weight-semibold)' }}>
        {String(member['name'])}
      </div>
      <div style={{ marginTop: 2, display: 'flex', justifyContent: 'center' }}>
        <Status label={term(meta.label)} glyph={meta.glyph} color={meta.color} />
      </div>
    </div>
  );
}

function MemberBannerRow({
  member,
  thick,
  onOpen,
  onQuickFront,
}: {
  member: StoredRecord;
  thick: boolean;
  onOpen: () => void;
  onQuickFront: () => void;
}): JSX.Element {
  const { term } = useI18n();
  const meta = FRONT_STATUS_META[String(member['frontStatus'])] ?? FRONT_STATUS_META['nearby']!;
  const minutes = Number(member['frontMinutes'] ?? 0);
  const alreadyFronting = isFronting(member);
  const roles = Array.isArray(member['roles']) ? (member['roles'] as string[]) : [];

  const quickFrontButton = (
    <IconButton
      icon="bolt"
      label={alreadyFronting ? term('Already {{fronting}}') : term('Quick {{front}}')}
      disabled={alreadyFronting}
      size="sm"
      variant="ghost"
      onClick={(event) => {
        event.stopPropagation();
        onQuickFront();
      }}
    />
  );

  if (thick) {
    // A real banner, the same way the member's own profile shows one, rather
    // than a taller version of the slim row — the point of "thick" is to
    // recognise someone by more than a small circular avatar.
    const color = (member['color'] as string) || 'var(--accent)';
    return (
      <div className="member-banner-row" style={{ ['--member-color' as never]: color }}>
        {member['bannerUrl'] ? (
          <img
            className="member-banner-row__image"
            src={String(member['bannerUrl'])}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <span className="member-banner-row__scrim" />
        <button
          type="button"
          onClick={onOpen}
          aria-label={String(member['name'])}
          className="member-banner-row__hit"
        />
        <span className="member-banner-row__avatar">
          <Avatar
            name={String(member['name'])}
            src={(member['avatarUrl'] as string) ?? null}
            color={color}
            icon={(member['icon'] as string) ?? null}
            size={56}
            round
            ring={alreadyFronting}
          />
        </span>
        <span className="member-banner-row__body">
          <span className="list-row__title truncate">{String(member['name'])}</span>
          <span className="list-row__meta">
            {member['pronouns'] ? <span className="faint">{String(member['pronouns'])}</span> : null}
            <Status label={term(meta.label)} glyph={meta.glyph} color={meta.color} />
          </span>
          {roles.length > 0 ? (
            <span className="row" style={{ marginTop: 2, gap: 'var(--space-1)' }}>
              {roles.map((role) => (
                <Chip key={role} accent>
                  {role}
                </Chip>
              ))}
            </span>
          ) : null}
        </span>
        <span className="member-banner-row__trailing">{quickFrontButton}</span>
      </div>
    );
  }

  return (
    <div className="list-row" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={String(member['name'])}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          zIndex: 1,
        }}
      />
      <Avatar
        name={String(member['name'])}
        src={(member['avatarUrl'] as string) ?? null}
        color={(member['color'] as string) ?? null}
        icon={(member['icon'] as string) ?? null}
        size={40}
        round
        ring={alreadyFronting}
      />
      <span className="list-row__body">
        <span className="list-row__title">{String(member['name'])}</span>
        <span className="list-row__meta">
          {member['pronouns'] ? <span className="faint">{String(member['pronouns'])}</span> : null}
          <Status label={term(meta.label)} glyph={meta.glyph} color={meta.color} />
          {minutes > 0 ? (
            <span className="tiny faint numeric">
              {formatDuration(minutes)} {term('{{fronting}}')}
            </span>
          ) : null}
        </span>
      </span>
      <span className="list-row__trailing" style={{ position: 'relative', zIndex: 2 }}>
        {quickFrontButton}
      </span>
    </div>
  );
}

function sortMembers(records: StoredRecord[], sort: SortKey): StoredRecord[] {
  const copy = [...records];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => String(a['name']).localeCompare(String(b['name'])));
    case 'recent':
      return copy.sort((a, b) =>
        String(b['lastFrontedAt'] ?? '').localeCompare(String(a['lastFrontedAt'] ?? '')),
      );
    case 'frequent':
      return copy.sort((a, b) => Number(b['frontCount'] ?? 0) - Number(a['frontCount'] ?? 0));
    case 'newest':
      return copy.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    case 'orbit':
    default:
      return copy.sort(
        (a, b) =>
          Number(a['orbitOrder'] ?? 0) - Number(b['orbitOrder'] ?? 0) ||
          String(a['name']).localeCompare(String(b['name'])),
      );
  }
}
