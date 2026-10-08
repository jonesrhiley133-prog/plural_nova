import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  customFieldValues,
  emotionIdsOf,
  formatDuration,
  isBirthdayToday,
  valueForDefinition,
  type StoredRecord,
} from '@pluralnova/shared';
import { useCollection, useRecord, useRecordMap } from '../core/data.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useActiveMemberId } from '../core/auth.js';
import { FRONT_STATUS_META, useFronting } from '../core/fronting.js';
import { PageHeader } from '../app/PageHeader.js';
import { BirthdayCelebration } from '../app/BirthdayCelebration.js';
import { Avatar, Button, Card, Chip, FieldList, IconButton, Stat, Status, Tabs } from '../ui/primitives.js';
import { EmptyState, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { AstroSummaryCard } from './astro/AstroSummary.js';
import { MemberEditorForm } from '../ui/MemberEditorForm.js';
import { SelectField, SwitchRow } from '../ui/forms.js';
import { MemberCustomFieldsEditor, MemberCustomFieldsView } from '../ui/CustomFields.js';
import { GiveBadgePicker, MemberBadgeRow, createBadge, parseBadges } from '../ui/MemberBadges.js';
import { Icon } from '../ui/Icon.js';
import { FlagImage, FlagImageRow, type FlagImageItem } from '../ui/FlagImage.js';
import { ThemeScope, useAssignedTheme } from '../core/appearance.js';
import { ThemePicker } from './appearance/ThemePicker.js';
import { Markdown } from '../ui/Markdown.js';

/**
 * A member's profile.
 *
 * Banner, then avatar, then content, in that order and on their own layers, so
 * a portrait never lands on top of the name. Sections are tabs rather than one
 * long scroll, because a filled-in profile is long and most visits want one
 * part of it. Birthday and badges are the two exceptions — shown once, above
 * the tabs, since they are not any one section's business.
 */

const TABS = [
  'identity-about',
  'boundaries',
  'fronting',
  'statistics',
  'relationships',
  'media',
  'gallery',
  'mood-emotions',
  'wellbeing',
  'journal',
  'horoscope',
  'preferences',
  'privacy',
  'theme',
] as const;

type Tab = (typeof TABS)[number];

function tabLabel(value: Tab): string {
  const labels: Record<Tab, string> = {
    'identity-about': 'Identity & About',
    boundaries: 'Boundaries',
    fronting: '{{Fronting}}',
    statistics: 'Statistics',
    relationships: 'Relationships',
    media: 'Media',
    gallery: 'Gallery',
    'mood-emotions': 'Mood & Emotions',
    wellbeing: 'Cycle & Wellbeing',
    journal: '{{Journal}}',
    horoscope: 'Horoscope',
    preferences: 'Preferences',
    privacy: 'Privacy',
    theme: 'Theme',
  };
  return labels[value];
}

export default function MemberProfile(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, term } = useI18n();
  const toast = useToast();
  const activeMemberId = useActiveMemberId();

  const member = useRecord('members', id);
  const { update, remove, loading } = useCollection('members');
  const { quickFront: fireQuickFront, isFrontingAlready } = useFronting();
  const [tab, setTab] = useState<Tab>('identity-about');
  const editor = useDialog();
  const confirm = useDialog();
  const celebrate = useDialog<StoredRecord>();
  const alterTheme = useAssignedTheme('alter', id);

  const flags = useCollection('flags');
  const flagAssignments = useCollection('flagAssignments', {
    filter: (record) => record['targetType'] === 'member' && record['targetId'] === id,
  });
  // Their latest "today's vibe" board post, reused here as a "currently
  // feeling" line rather than a field of its own — the board already is the
  // record of this, just read from a different angle.
  const vibePosts = useCollection('boards', {
    filter: (record) => record['boardType'] === 'vibe' && record['authorMemberId'] === id,
    limit: 1,
  });
  const flagById = useMemo(() => new Map(flags.items.map((flag) => [flag.id, flag])), [flags.items]);
  const attachedFlags: FlagImageItem[] = useMemo(
    () =>
      flagAssignments.items
        .map((flag) => flagById.get(String(flag['flagId'])))
        .filter((flag): flag is StoredRecord => Boolean(flag))
        .map((flag) => ({
          id: flag.id,
          name: String(flag['name'] ?? ''),
          imageUrl: (flag['imageUrl'] as string) ?? null,
          color: (flag['color'] as string) ?? null,
          icon: (flag['icon'] as string) ?? null,
        })),
    [flagAssignments.items, flagById],
  );

  if (loading && !member) return <SkeletonList rows={4} />;

  if (!member) {
    return (
      <Card>
        <EmptyState
          icon="member"
          title={t('error.notFound')}
          body={t('error.notFoundBody')}
          action={{ label: term('Back to {{members}}'), run: () => navigate('/members') }}
        />
      </Card>
    );
  }

  const color = (member['color'] as string) || 'var(--accent)';
  const meta = FRONT_STATUS_META[String(member['frontStatus'])] ?? FRONT_STATUS_META['nearby']!;
  const alreadyFronting = isFrontingAlready(member.id);
  const isBirthday = member['birthday'] ? isBirthdayToday(String(member['birthday'])) : false;
  const latestVibe = vibePosts.items[0];
  const badges = parseBadges(member['customBadges']);

  // Instant: applied to the shared fronting state before the request that
  // tells the server about it resolves, so this never shows a loading state.
  const quickFront = (): void => {
    fireQuickFront(member.id).catch((cause: unknown) => toast.fromError(cause));
  };

  const addSticker = async (emoji: string, label: string): Promise<void> => {
    const badge = createBadge(emoji, label, activeMemberId ?? null);
    await update(member.id, { customBadges: [...badges, badge] });
    toast.success(`Added ${label.toLowerCase()}`);
  };

  const flagsVisible = member['flagDisplayEnabled'] !== false && attachedFlags.length > 0;

  return (
    <ThemeScope theme={alterTheme}>
    <div className="member-tint" style={{ ['--member-color' as never]: color }}>
      <Card flush style={{ marginBottom: 'var(--space-4)', overflow: 'visible' }}>
        <div className="banner" style={{ ['--member-color' as never]: color, borderRadius: 'var(--radius) var(--radius) 0 0' }}>
          {member['bannerUrl'] ? (
            <img className="banner__image" src={String(member['bannerUrl'])} alt="" />
          ) : null}
          <span className="banner__scrim" />
        </div>

        <div className="banner-profile">
          <div className="banner-profile__avatar" style={{ ['--avatar-size' as never]: '88px' }}>
            <Avatar
              name={String(member['name'])}
              src={(member['avatarUrl'] as string) ?? null}
              color={color}
              icon={(member['icon'] as string) ?? null}
              size={88}
              round
              ring={alreadyFronting}
            />
          </div>

          <div className="banner-profile__body">
            <div className="row row--between" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 'var(--size-xl)', overflowWrap: 'anywhere' }}>{String(member['name'])}</h1>
                <div className="row" style={{ marginTop: 'var(--space-1)' }}>
                  {member['pronouns'] ? <span className="muted">{String(member['pronouns'])}</span> : null}
                  <Status label={term(meta.label)} glyph={meta.glyph} color={meta.color} />
                </div>
              </div>
              <div className="row row--nowrap">
                <IconButton
                  icon={alreadyFronting ? 'close' : 'bolt'}
                  label={alreadyFronting ? term('Remove from {{fronting}}') : term('Quick {{front}}')}
                  onClick={quickFront}
                />
                <IconButton icon="edit" label="Edit profile" onClick={() => editor.show()} />
                <IconButton
                  icon="trash"
                  label={term('Delete {{member}}')}
                  variant="ghost"
                  onClick={() => confirm.show()}
                />
              </div>
            </div>

            {latestVibe ? (
              <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
                Currently feeling: "{String(latestVibe['body'])}"
              </p>
            ) : null}

            {flagsVisible ? (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <FlagImageRow flags={attachedFlags} width={44} />
              </div>
            ) : null}

            {Array.isArray(member['roles']) && member['roles'].length > 0 ? (
              <div className="row" style={{ marginTop: flagsVisible ? 'var(--space-2)' : 'var(--space-3)' }}>
                {(member['roles'] as string[]).map((role) => (
                  <Chip key={role} color={color}>
                    {role}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {isBirthday ? (
        <Card style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
          <p style={{ fontSize: 'var(--size-lg)' }}>🎉 It's {String(member['name'])}'s birthday!</p>
          <Button variant="primary" size="sm" style={{ marginTop: 'var(--space-2)' }} onClick={() => celebrate.show(member)}>
            Celebrate
          </Button>
        </Card>
      ) : null}

      <Card
        title="Badges"
        subtitle={badges.length > 0 ? undefined : 'Pick a sticker for their profile'}
        style={{ marginBottom: 'var(--space-4)' }}
      >
        <MemberBadgeRow badges={badges} />
        <p className="tiny faint" style={{ marginTop: badges.length > 0 ? 'var(--space-3)' : 0 }}>
          Tap one to add it
        </p>
        <GiveBadgePicker onGive={(emoji, label) => void addSticker(emoji, label)} />
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        label="Profile sections"
        options={TABS.map((option) => ({ value: option, label: term(tabLabel(option)) }))}
      />

      {tab === 'identity-about' ? <IdentityAbout member={member} onChange={update} /> : null}
      {tab === 'boundaries' ? <Boundaries member={member} /> : null}
      {tab === 'fronting' ? <FrontingTab member={member} /> : null}
      {tab === 'statistics' ? <Statistics member={member} /> : null}
      {tab === 'relationships' ? <RelationshipsTab member={member} /> : null}
      {tab === 'media' ? <MemberMedia member={member} /> : null}
      {tab === 'gallery' ? <Gallery member={member} onChange={update} /> : null}
      {tab === 'mood-emotions' ? <MoodEmotionsTab member={member} /> : null}
      {tab === 'wellbeing' ? <WellbeingTab member={member} /> : null}
      {tab === 'journal' ? <MemberJournal member={member} /> : null}
      {tab === 'horoscope' ? <Horoscope member={member} /> : null}
      {tab === 'preferences' ? <Preferences member={member} onChange={update} /> : null}
      {tab === 'privacy' ? <Privacy member={member} onChange={update} /> : null}
      {tab === 'theme' ? <Theme member={member} /> : null}

      <Dialog open={editor.open} onClose={editor.hide} title={term('Edit {{member}}')} wide>
        <MemberEditorForm
          member={member}
          onSubmit={async (values) => {
            await update(member.id, values);
            toast.success('Saved');
            editor.hide();
          }}
          onCancel={editor.hide}
        />
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title={term(`Delete ${String(member['name'])}?`)}
        body={t('members.deleteConfirm', { name: String(member['name']) })}
        onConfirm={async () => {
          await remove(member.id);
          toast.success(term('{{Member}} deleted'), 'You can restore them from the trash for 30 days.');
          navigate('/members');
        }}
      />

      <BirthdayCelebration dialog={celebrate} onUpdateMember={update} />
    </div>
    </ThemeScope>
  );
}

function IdentityAbout({
  member,
  onChange,
}: {
  member: StoredRecord;
  onChange: (id: string, patch: Record<string, unknown>) => Promise<StoredRecord>;
}): JSX.Element {
  const toast = useToast();
  const navigate = useNavigate();
  const editor = useDialog();
  const picker = useDialog();
  const definitions = useCollection('customFieldDefinitions');
  const members = useCollection('members');
  const values = useMemo(() => customFieldValues(member['customFieldValues']), [member]);

  const flags = useCollection('flags');
  const assignments = useCollection('flagAssignments', {
    filter: (record) => record['targetType'] === 'member' && record['targetId'] === member.id,
  });
  const flagById = useMemo(() => new Map(flags.items.map((flag) => [flag.id, flag])), [flags.items]);
  const attachedIds = useMemo(
    () => new Set(assignments.items.map((assignment) => String(assignment['flagId']))),
    [assignments.items],
  );
  const available = useMemo(
    () => flags.items.filter((flag) => !attachedIds.has(flag.id)),
    [flags.items, attachedIds],
  );

  // `assignments.items` already arrives sorted by `sortOrder` (the
  // collection's own default sort) — reordering renumbers this list and
  // persists the new order, rather than tracking position separately.
  const reorder = (fromIndex: number, toIndex: number): void => {
    if (toIndex < 0 || toIndex >= assignments.items.length) return;
    const next = [...assignments.items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved!);
    next.forEach((assignment, index) => {
      if (Number(assignment['sortOrder'] ?? 0) !== index) {
        void assignments.update(assignment.id, { sortOrder: index }).catch((cause: unknown) => toast.fromError(cause));
      }
    });
  };

  return (
    <div className="stack">
      <Card title="Identity">
        <FieldList
          rows={[
            ['Pronouns', member['pronouns']],
            ['Age', member['age']],
            ['Birthday', member['birthday']],
          ]}
        />
      </Card>

      <Card
        title="Flags"
        subtitle="Markers attached to this profile"
        actions={
          flags.items.length > 0 ? (
            <Button variant="ghost" size="sm" icon="plus" onClick={() => picker.show()}>
              Attach
            </Button>
          ) : null
        }
      >
        {assignments.items.length === 0 ? (
          <p className="small faint">
            {flags.items.length === 0
              ? 'No flags defined yet — create one in Flags, then attach it here.'
              : 'No flags attached.'}
          </p>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {assignments.items.map((assignment, index) => {
              const flag = flagById.get(String(assignment['flagId']));
              if (!flag) return null;
              const name = String(flag['name'] ?? '');
              return (
                <div key={assignment.id} className="row row--between" style={{ alignItems: 'center' }}>
                  <div className="row row--nowrap" style={{ alignItems: 'center' }}>
                    <FlagImage
                      flag={{
                        id: flag.id,
                        name,
                        imageUrl: (flag['imageUrl'] as string) ?? null,
                        color: (flag['color'] as string) ?? null,
                        icon: (flag['icon'] as string) ?? null,
                      }}
                      width={52}
                    />
                    <span className="small" style={{ marginLeft: 'var(--space-2)' }}>
                      {name}
                    </span>
                  </div>
                  <div className="row row--nowrap">
                    <IconButton
                      icon="chevronUp"
                      label={`Move ${name} earlier`}
                      variant="ghost"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => reorder(index, index - 1)}
                    />
                    <IconButton
                      icon="chevronDown"
                      label={`Move ${name} later`}
                      variant="ghost"
                      size="sm"
                      disabled={index === assignments.items.length - 1}
                      onClick={() => reorder(index, index + 1)}
                    />
                    <IconButton
                      icon="close"
                      label={`Remove ${name}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void assignments.remove(assignment.id).catch((cause: unknown) => toast.fromError(cause));
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="About">
        <FieldList rows={[['Source / origin', member['source']]]} />
      </Card>

      <MemberCustomFieldsView
        definitions={definitions.items}
        values={values}
        members={members.items}
        actions={
          <span className="row row--nowrap">
            <Button variant="ghost" size="sm" icon="settings" onClick={() => navigate('/settings/custom-fields')}>
              Manage fields
            </Button>
            <Button variant="ghost" size="sm" icon="edit" onClick={() => editor.show()}>
              Edit
            </Button>
          </span>
        }
      />

      <Dialog open={picker.open} onClose={picker.hide} title="Attach a flag">
        {available.length === 0 ? (
          <p className="small muted">Every flag you have defined is already attached.</p>
        ) : (
          <div className="row">
            {available.map((flag) => (
              <button
                key={flag.id}
                type="button"
                className="card card--interactive"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)' }}
                onClick={() => {
                  void assignments
                    .create({
                      targetType: 'member',
                      targetId: member.id,
                      flagId: flag.id,
                      sortOrder: assignments.items.length,
                    })
                    .then(() => toast.success('Attached'))
                    .catch((cause: unknown) => toast.fromError(cause));
                  picker.hide();
                }}
              >
                <FlagImage
                  flag={{
                    id: flag.id,
                    name: String(flag['name'] ?? ''),
                    imageUrl: (flag['imageUrl'] as string) ?? null,
                    color: (flag['color'] as string) ?? null,
                    icon: (flag['icon'] as string) ?? null,
                  }}
                  width={56}
                />
                <span className="tiny">{String(flag['name'])}</span>
              </button>
            ))}
          </div>
        )}
      </Dialog>

      <Dialog open={editor.open} onClose={editor.hide} title="Custom fields" wide>
        <MemberCustomFieldsEditor
          definitions={definitions.items}
          values={values}
          members={members.items}
          onCancel={editor.hide}
          onSave={async (next) => {
            await onChange(member.id, { customFieldValues: next });
            toast.success('Saved');
            editor.hide();
          }}
        />
      </Dialog>
    </div>
  );
}

function Boundaries({ member }: { member: StoredRecord }): JSX.Element {
  const definitions = useCollection('customFieldDefinitions');
  const boundariesDefinition = useMemo(
    () => definitions.items.find((definition) => String(definition['label']).trim().toLowerCase() === 'boundaries'),
    [definitions.items],
  );
  const values = useMemo(() => customFieldValues(member['customFieldValues']), [member]);
  const boundariesText = boundariesDefinition ? valueForDefinition(boundariesDefinition.id, values) : '';

  return (
    <Card title="Boundaries" subtitle="Edited from Identity & About">
      {boundariesText ? <Markdown text={boundariesText} /> : <p className="small faint">Nothing recorded here.</p>}
    </Card>
  );
}

function FrontingTab({ member }: { member: StoredRecord }): JSX.Element {
  const dates = useDateFormat();
  const { term } = useI18n();
  const events = useCollection('frontEvents', {
    filter: (record) =>
      record['memberId'] === member.id ||
      (Array.isArray(record['coFronterIds']) &&
        (record['coFronterIds'] as string[]).includes(member.id)),
    limit: 40,
  });

  if (events.items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="front"
          title={term('No {{fronts}} recorded for this {{member}}')}
          body={term('That is a normal state — not everyone {{fronting}}, and not everyone logs it.')}
        />
      </Card>
    );
  }

  return (
    <Card flush>
      <div className="list">
        {events.items.map((event) => (
          <div key={event.id} className="list-row">
            <span className="list-row__body">
              <span className="list-row__title">
                {dates.dateTime(String(event['startedAt']))}
                {event['memberId'] !== member.id ? (
                  <span className="faint"> · {term('co-{{fronting}}')}</span>
                ) : null}
              </span>
              <span className="list-row__meta">
                {event['endedAt'] ? (
                  <span>{formatDuration(Number(event['durationMinutes'] ?? 0))}</span>
                ) : (
                  <Chip accent>Still open</Chip>
                )}
                {event['activity'] ? <Chip>{String(event['activity'])}</Chip> : null}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RelationshipsTab({ member }: { member: StoredRecord }): JSX.Element {
  const members = useRecordMap('members');
  const relationships = useCollection('relationships', {
    filter: (record) => record['fromId'] === member.id || record['toId'] === member.id,
  });

  if (relationships.items.length === 0) {
    return (
      <Card>
        <EmptyState icon="relationship" title="No relationships mapped" body="Add them from the Relationships screen." />
      </Card>
    );
  }

  return (
    <Card flush>
      <div className="list">
        {relationships.items.map((relationship) => {
          const outgoing = relationship['fromId'] === member.id;
          const otherId = String(outgoing ? relationship['toId'] : relationship['fromId']);
          const other = members.get(otherId);
          const label = String(
            outgoing ? relationship['label'] : relationship['reverseLabel'] || relationship['label'],
          );
          return (
            <div key={relationship.id} className="list-row">
              <Avatar
                name={String(other?.['name'] ?? 'Someone')}
                src={(other?.['avatarUrl'] as string) || null}
                color={(other?.['color'] as string) ?? null}
                icon={(other?.['icon'] as string) ?? null}
                size={30}
                round
              />
              <span className="list-row__body">
                <span className="list-row__title">{String(other?.['name'] ?? 'Someone')}</span>
                <span className="list-row__meta">{label}</span>
              </span>
              <span className="list-row__trailing">
                <Chip>{String(relationship['strength'] ?? 'neutral')}</Chip>
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MemberJournal({ member }: { member: StoredRecord }): JSX.Element {
  const dates = useDateFormat();
  const { term } = useI18n();
  const entries = useCollection('journalEntries', {
    filter: (record) => record['memberId'] === member.id,
    limit: 25,
  });

  if (entries.items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="journal"
          title={term('No {{journal}} entries by this {{member}}')}
          body={term('Entries written as them show up here.')}
        />
      </Card>
    );
  }

  return (
    <div className="stack">
      {entries.items.map((entry) => (
        <Card key={entry.id} title={String(entry['title'] || 'Untitled')} subtitle={dates.dateTime(String(entry['entryDate']))}>
          <Markdown text={String(entry['body'] ?? '')} className="clamp-3" />
        </Card>
      ))}
    </div>
  );
}

function MemberMedia({ member }: { member: StoredRecord }): JSX.Element {
  const media = useCollection('mediaItems', {
    filter: (record) => record['memberId'] === member.id,
  });

  if (media.items.length === 0) {
    return (
      <Card>
        <EmptyState icon="media" title="No media yet" body="Images and files attributed to them appear here." />
      </Card>
    );
  }

  return (
    <div className="grid" style={{ ['--grid-min' as never]: '130px' }}>
      {media.items.map((item) => (
        <div key={item.id} className="card card--flush" style={{ aspectRatio: '1', overflow: 'hidden' }}>
          {item['mediaType'] === 'image' ? (
            <img
              src={String(item['url'])}
              alt={String(item['title'] ?? '')}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
              <Icon name="media" size={22} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * A small, curated strip from this member's own media — distinct from the
 * full chronological grid on the Media tab, which stays unchanged and
 * unfiltered. Picking is scoped to their own images, same as Media.
 */
function Gallery({
  member,
  onChange,
}: {
  member: StoredRecord;
  onChange: (id: string, patch: Record<string, unknown>) => Promise<StoredRecord>;
}): JSX.Element {
  const toast = useToast();
  const picker = useDialog();
  const media = useCollection('mediaItems', {
    filter: (record) => record['memberId'] === member.id && record['mediaType'] === 'image',
  });
  const pinnedIds = Array.isArray(member['pinnedMediaIds']) ? (member['pinnedMediaIds'] as string[]) : [];
  const pinnedItems = useMemo(
    () =>
      pinnedIds
        .map((pinnedId) => media.items.find((item) => item.id === pinnedId))
        .filter((item): item is StoredRecord => Boolean(item)),
    [pinnedIds, media.items],
  );

  const toggle = (itemId: string): void => {
    const next = pinnedIds.includes(itemId)
      ? pinnedIds.filter((existing) => existing !== itemId)
      : [...pinnedIds, itemId];
    void onChange(member.id, { pinnedMediaIds: next }).catch((cause: unknown) => toast.fromError(cause));
  };

  return (
    <div className="stack">
      <Card
        title="Gallery"
        subtitle="A featured strip from their media — the full library is in Media"
        actions={
          media.items.length > 0 ? (
            <Button variant="ghost" size="sm" icon="edit" onClick={() => picker.show()}>
              Choose
            </Button>
          ) : null
        }
      >
        {pinnedItems.length === 0 ? (
          <p className="small faint">
            {media.items.length === 0 ? 'No images in their media yet.' : 'Nothing featured yet.'}
          </p>
        ) : (
          <div className="grid" style={{ ['--grid-min' as never]: '110px' }}>
            {pinnedItems.map((item) => (
              <div key={item.id} className="card card--flush" style={{ aspectRatio: '1', overflow: 'hidden' }}>
                <img
                  src={String(item['url'])}
                  alt={String(item['title'] ?? '')}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={picker.open} onClose={picker.hide} title="Choose featured images" wide>
        {media.items.length === 0 ? (
          <p className="small muted">No images yet — add some from Media first.</p>
        ) : (
          <div className="grid grid--tight" style={{ ['--grid-min' as never]: '80px' }}>
            {media.items.map((item) => {
              const pinned = pinnedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={pinned}
                  onClick={() => toggle(item.id)}
                  style={{
                    padding: 0,
                    border: pinned ? '2px solid var(--accent)' : 'var(--border-width) solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    aspectRatio: '1',
                    cursor: 'pointer',
                    background: 'none',
                  }}
                >
                  <img
                    src={String(item['url'])}
                    alt={String(item['title'] ?? '')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </Dialog>
    </div>
  );
}

/** A thin, member-filtered slice of the account-level Mood & Emotions screen. */
function MoodEmotionsTab({ member }: { member: StoredRecord }): JSX.Element {
  const dates = useDateFormat();
  const checkIns = useCollection('feelingEntries', {
    filter: (record) => record['memberId'] === member.id,
  });
  const emotions = useCollection('emotionEntries', {
    filter: (record) => record['memberId'] === member.id,
  });
  const latest = checkIns.items[0];

  return (
    <Card title="Mood & Emotions" subtitle="Filtered to just this member from the full log">
      <div className="stat-grid">
        <Stat label="Check-ins logged" value={checkIns.items.length} />
        <Stat
          label="Emotions logged"
          value={emotions.items.reduce((sum, entry) => sum + emotionIdsOf(entry).length, 0)}
        />
        <Stat label="Latest mood" value={latest ? `${Number(latest['mood'] ?? 0)} / 100` : 'None yet'} />
        <Stat label="Last check-in" value={latest ? dates.relative(String(latest['recordedAt'])) : 'Not yet'} />
      </div>
      <p style={{ marginTop: 'var(--space-3)' }}>
        <Link to="/mood-emotions">Open Mood &amp; Emotions →</Link>
      </p>
    </Card>
  );
}

/** A thin, member-filtered slice of the account-level Cycle & Wellbeing screen. */
function WellbeingTab({ member }: { member: StoredRecord }): JSX.Element {
  const dates = useDateFormat();
  const cycle = useCollection('cycleEntries', {
    filter: (record) => record['memberId'] === member.id,
  });
  const symptoms = useCollection('symptomEntries', {
    filter: (record) => record['memberId'] === member.id,
  });
  const latestCycle = cycle.items[0];

  return (
    <Card title="Cycle & Wellbeing" subtitle="Filtered to just this member from the full log">
      <div className="stat-grid">
        <Stat label="Cycle entries" value={cycle.items.length} />
        <Stat label="Symptoms logged" value={symptoms.items.length} />
        <Stat label="Latest phase" value={latestCycle ? String(latestCycle['phase'] || 'Unnamed') : 'None yet'} />
        <Stat label="Last entry" value={latestCycle ? dates.relative(String(latestCycle['entryDate'])) : 'Not yet'} />
      </div>
      <p style={{ marginTop: 'var(--space-3)' }}>
        <Link to="/wellbeing">Open Cycle &amp; Wellbeing →</Link>
      </p>
    </Card>
  );
}

function Statistics({ member }: { member: StoredRecord }): JSX.Element {
  const { term } = useI18n();
  const dates = useDateFormat();
  const events = useCollection('frontEvents', {
    filter: (record) =>
      record['memberId'] === member.id ||
      (Array.isArray(record['coFronterIds']) &&
        (record['coFronterIds'] as string[]).includes(member.id)),
  });
  const emotions = useCollection('emotionEntries', {
    filter: (record) => record['memberId'] === member.id,
  });
  const journal = useCollection('journalEntries', {
    filter: (record) => record['memberId'] === member.id,
  });

  const primary = events.items.filter((event) => event['memberId'] === member.id);
  const co = events.items.length - primary.length;

  return (
    <div className="stat-grid">
      <Stat label={term('Times {{fronting}}')} value={Number(member['frontCount'] ?? 0)} />
      <Stat label={term('{{Fronts}} as the main {{member}}')} value={primary.length} />
      <Stat label={term('Co-{{fronting}} {{fronts}}')} value={co} />
      <Stat
        label={term('Total {{fronting}} time')}
        value={formatDuration(Number(member['frontMinutes'] ?? 0))}
      />
      <Stat
        label={term('Last {{fronting}}')}
        value={member['lastFrontedAt'] ? dates.relative(String(member['lastFrontedAt'])) : 'Not yet'}
      />
      <Stat label={term('{{Journal}} entries')} value={journal.items.length} />
      <Stat
        label="Emotions logged"
        value={emotions.items.reduce((sum, entry) => sum + emotionIdsOf(entry).length, 0)}
      />
    </div>
  );
}

function Horoscope({ member }: { member: StoredRecord }): JSX.Element | null {
  return <AstroSummaryCard member={member} />;
}

function Preferences({
  member,
  onChange,
}: {
  member: StoredRecord;
  onChange: (id: string, patch: Record<string, unknown>) => Promise<StoredRecord>;
}): JSX.Element {
  const toast = useToast();

  const set = (key: string, value: unknown): void => {
    void onChange(member.id, { [key]: value })
      .then(() => toast.success('Saved'))
      .catch((cause: unknown) => toast.fromError(cause));
  };

  return (
    <div className="stack">
      <Card title="Flag display" subtitle="How attached flags are intended to appear on this profile">
        <SwitchRow
          label="Show flags on their profile"
          checked={member['flagDisplayEnabled'] !== false}
          onChange={(value) => set('flagDisplayEnabled', value)}
        />
        <SelectField
          label="Flag style"
          value={String(member['flagDisplayStyle'] ?? 'stripes')}
          options={[
            { value: 'stripes', label: 'Stripes' },
            { value: 'badge', label: 'Badge' },
            { value: 'ring', label: 'Ring around the avatar' },
            { value: 'background', label: 'Card background' },
          ]}
          onChange={(value) => set('flagDisplayStyle', value)}
        />
        <SelectField
          label="Flag size"
          value={String(member['flagDisplaySize'] ?? 'md')}
          options={[
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Medium' },
            { value: 'lg', label: 'Large' },
          ]}
          onChange={(value) => set('flagDisplaySize', value)}
        />
      </Card>

      {member['color'] || member['icon'] ? (
        <Card title="Colour & symbol">
          <div className="row" style={{ gap: 'var(--space-5)' }}>
            {member['color'] ? (
              <span className="row row--nowrap" style={{ gap: 'var(--space-2)' }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: String(member['color']),
                    border: '1px solid var(--border)',
                  }}
                />
                <span className="small muted">Favourite colour</span>
              </span>
            ) : null}
            {member['icon'] ? (
              <span className="row row--nowrap" style={{ gap: 'var(--space-2)' }}>
                <span aria-hidden="true" style={{ fontSize: 'var(--size-lg)', lineHeight: 1 }}>
                  {String(member['icon'])}
                </span>
                <span className="small muted">Favourite emoji</span>
              </span>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Privacy({
  member,
  onChange,
}: {
  member: StoredRecord;
  onChange: (id: string, patch: Record<string, unknown>) => Promise<StoredRecord>;
}): JSX.Element {
  const { term } = useI18n();
  const toast = useToast();
  const privacy = (member['privacy'] ?? {}) as Record<string, boolean>;

  const set = (key: string, value: boolean): void => {
    void onChange(member.id, { privacy: { ...privacy, [key]: value } })
      .then(() => toast.success('Saved'))
      .catch((cause: unknown) => toast.fromError(cause));
  };

  return (
    <Card
      title={term('What this {{member}} shares')}
      subtitle={term('Each {{member}} decides separately. Nothing here affects anyone else.')}
    >
      <SwitchRow
        label="Appear on a shared profile"
        hint={term('When off, this {{member}} is not listed even if the {{system}} profile is public.')}
        checked={privacy['showOnProfile'] !== false}
        onChange={(value) => set('showOnProfile', value)}
      />
      <SwitchRow
        label="Show their avatar publicly"
        checked={privacy['showAvatar'] !== false}
        onChange={(value) => set('showAvatar', value)}
      />
      <SwitchRow
        label={term('Show when they are {{fronting}}')}
        checked={privacy['showFronting'] !== false}
        onChange={(value) => set('showFronting', value)}
      />
      <SwitchRow
        label={term('Show their {{journal}} entries')}
        hint="Off by default. Individual entries still have their own visibility."
        checked={privacy['showJournal'] === true}
        onChange={(value) => set('showJournal', value)}
      />
      <SwitchRow
        label="Show their relationships"
        checked={privacy['showRelationships'] === true}
        onChange={(value) => set('showRelationships', value)}
      />
    </Card>
  );
}

function Theme({ member }: { member: StoredRecord }): JSX.Element {
  return (
    <Card
      title="Profile theme"
      subtitle="Banner, accent, buttons and cards on this profile — and, if you choose, everywhere they are fronting"
    >
      <ThemePicker target="alter" id={member.id} label="Assigned theme" />
    </Card>
  );
}
