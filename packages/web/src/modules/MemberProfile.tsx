import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { customFieldValues, formatDuration, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecord, useRecordMap } from '../core/data.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { FRONT_STATUS_META } from '../core/fronting.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, FieldList, IconButton, Stat, Status, Tabs } from '../ui/primitives.js';
import { EmptyState, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { SwitchRow } from '../ui/forms.js';
import { MemberCustomFieldsEditor, MemberCustomFieldsView } from '../ui/CustomFields.js';
import { Icon } from '../ui/Icon.js';

/**
 * A member's profile.
 *
 * Banner, then avatar, then content, in that order and on their own layers, so
 * a portrait never lands on top of the name. Sections are tabs rather than one
 * long scroll, because a filled-in profile is long and most visits want one
 * part of it.
 */

const TABS = [
  'overview',
  'identity',
  'about',
  'fronting',
  'relationships',
  'journal',
  'media',
  'boundaries',
  'statistics',
  'privacy',
] as const;

type Tab = (typeof TABS)[number];

export default function MemberProfile(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();

  const member = useRecord('members', id);
  const { update, remove, loading } = useCollection('members');
  const [tab, setTab] = useState<Tab>('overview');
  const editor = useDialog();
  const confirm = useDialog();

  const flags = useCollection('flags');
  const flagAssignments = useCollection('flagAssignments', {
    filter: (record) => record['targetType'] === 'member' && record['targetId'] === id,
  });
  const flagById = useMemo(() => new Map(flags.items.map((flag) => [flag.id, flag])), [flags.items]);
  const attachedFlags = useMemo(
    () =>
      flagAssignments.items
        .map((assignment) => flagById.get(String(assignment['flagId'])))
        .filter((flag): flag is StoredRecord => Boolean(flag)),
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

  const flagsVisible = member['flagDisplayEnabled'] !== false && attachedFlags.length > 0;

  return (
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
              ring
            />
          </div>

          <div className="banner-profile__body">
            <div className="row row--between" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 'var(--size-xl)' }}>{String(member['name'])}</h1>
                <div className="row" style={{ marginTop: 'var(--space-1)' }}>
                  {member['pronouns'] ? <span className="muted">{String(member['pronouns'])}</span> : null}
                  <Status label={term(meta.label)} glyph={meta.glyph} color={meta.color} />
                </div>
              </div>
              <div className="row row--nowrap">
                <IconButton icon="edit" label="Edit profile" onClick={() => editor.show()} />
                <IconButton
                  icon="trash"
                  label={term('Delete {{member}}')}
                  variant="ghost"
                  onClick={() => confirm.show()}
                />
              </div>
            </div>

            {flagsVisible ? (
              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                {attachedFlags.map((flag) => (
                  <span
                    key={flag.id}
                    className="chip chip--flag"
                    style={{ ['--flag-color' as never]: (flag['color'] as string) || 'var(--accent)' }}
                    title={String(flag['name'])}
                  >
                    {flag['icon'] ? `${String(flag['icon'])} ` : ''}
                    {String(flag['name'])}
                  </span>
                ))}
              </div>
            ) : null}

            {Array.isArray(member['roles']) && member['roles'].length > 0 ? (
              <div className="row" style={{ marginTop: flagsVisible ? 'var(--space-2)' : 'var(--space-3)' }}>
                {(member['roles'] as string[]).map((role) => (
                  <Chip key={role} accent>
                    {role}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        label="Profile sections"
        options={TABS.map((option) => ({ value: option, label: term(tabLabel(option)) }))}
      />

      {tab === 'overview' ? <Overview member={member} /> : null}
      {tab === 'identity' ? <Identity member={member} /> : null}
      {tab === 'about' ? <About member={member} onChange={update} /> : null}
      {tab === 'fronting' ? <FrontingTab member={member} /> : null}
      {tab === 'relationships' ? <RelationshipsTab member={member} /> : null}
      {tab === 'journal' ? <MemberJournal member={member} /> : null}
      {tab === 'media' ? <MemberMedia member={member} /> : null}
      {tab === 'boundaries' ? <Boundaries member={member} /> : null}
      {tab === 'statistics' ? <Statistics member={member} /> : null}
      {tab === 'privacy' ? <Privacy member={member} onChange={update} /> : null}

      <Dialog open={editor.open} onClose={editor.hide} title={term('Edit {{member}}')} wide>
        <RecordForm
          collection="members"
          record={member}
          omit={['frontStatus', 'customStatus', 'isDormant', 'archived', 'privacy', 'preferences']}
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
    </div>
  );

  function tabLabel(value: Tab): string {
    const labels: Record<Tab, string> = {
      overview: 'Overview',
      identity: 'Identity',
      about: 'About',
      fronting: '{{Fronting}}',
      relationships: 'Relationships',
      journal: '{{Journal}}',
      media: 'Media',
      boundaries: 'Boundaries',
      statistics: 'Statistics',
      privacy: 'Privacy',
    };
    return labels[value];
  }

  function Overview({ member }: { member: StoredRecord }): JSX.Element {
    return (
      <div className="stack">
        {member['bio'] ? (
          <Card title="Biography">
            <p className="prose">{String(member['bio'])}</p>
          </Card>
        ) : null}

        <div className="stat-grid">
          <Stat label={term('Times {{fronting}}')} value={Number(member['frontCount'] ?? 0)} />
          <Stat
            label={term('Total {{fronting}} time')}
            value={formatDuration(Number(member['frontMinutes'] ?? 0))}
          />
          <Stat
            label={term('Last {{fronting}}')}
            value={
              member['lastFrontedAt'] ? dates.relative(String(member['lastFrontedAt'])) : 'Not yet'
            }
          />
        </div>

        {Array.isArray(member['interests']) && member['interests'].length > 0 ? (
          <Card title="Interests">
            <div className="row">
              {(member['interests'] as string[]).map((interest) => (
                <Chip key={interest}>{interest}</Chip>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    );
  }
}

function Identity({ member }: { member: StoredRecord }): JSX.Element {
  return (
    <Card title="Identity">
      <FieldList
        rows={[
          ['Pronouns', member['pronouns']],
          ['Age', member['age']],
          ['Gender', member['gender']],
          ['Sexuality', member['sexuality']],
          ['Nationality', member['nationality']],
          ['Ethnicity', member['ethnicity']],
          ['Race', member['race']],
          ['Labels', member['identityLabels']],
          ['Birthday', member['birthday']],
        ]}
      />
    </Card>
  );
}

function About({
  member,
  onChange,
}: {
  member: StoredRecord;
  onChange: (id: string, patch: Record<string, unknown>) => Promise<StoredRecord>;
}): JSX.Element {
  const toast = useToast();
  const navigate = useNavigate();
  const editor = useDialog();
  const definitions = useCollection('customFieldDefinitions');
  const members = useCollection('members');
  const values = useMemo(() => customFieldValues(member['customFieldValues']), [member]);

  return (
    <div className="stack">
      <Card title="About">
        <FieldList
          rows={[
            ['Source / origin', member['source']],
            ['Tags', member['tags']],
            ['Personality', member['personality']],
            ['Likes', member['likes']],
            ['Dislikes', member['dislikes']],
          ]}
        />
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

      {member['notes'] ? (
        <Card title="Notes" subtitle="Private to this account">
          <p className="prose">{String(member['notes'])}</p>
        </Card>
      ) : null}

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
  const toast = useToast();
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
  const picker = useDialog();

  return (
    <div className="stack">
      <Card title="Boundaries">
        {member['boundaries'] ? (
          <p className="prose">{String(member['boundaries'])}</p>
        ) : (
          <p className="small faint">Nothing recorded here.</p>
        )}
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
          <div className="row">
            {assignments.items.map((assignment) => {
              const flag = flagById.get(String(assignment['flagId']));
              if (!flag) return null;
              return (
                <Chip
                  key={assignment.id}
                  color={(flag['color'] as string) ?? null}
                  onClick={() => {
                    void assignments.remove(assignment.id).catch((cause: unknown) => toast.fromError(cause));
                  }}
                  title={`Remove ${String(flag['name'])}`}
                >
                  {flag['icon'] ? `${String(flag['icon'])} ` : ''}
                  {String(flag['name'])} <Icon name="close" size={10} />
                </Chip>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={picker.open} onClose={picker.hide} title="Attach a flag">
        {available.length === 0 ? (
          <p className="small muted">Every flag you have defined is already attached.</p>
        ) : (
          <div className="row">
            {available.map((flag) => (
              <Chip
                key={flag.id}
                color={(flag['color'] as string) ?? null}
                onClick={() => {
                  void assignments
                    .create({ targetType: 'member', targetId: member.id, flagId: flag.id })
                    .then(() => toast.success('Attached'))
                    .catch((cause: unknown) => toast.fromError(cause));
                  picker.hide();
                }}
              >
                {flag['icon'] ? `${String(flag['icon'])} ` : ''}
                {String(flag['name'])}
              </Chip>
            ))}
          </div>
        )}
      </Dialog>
    </div>
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
          <p className="prose clamp-3">{String(entry['body'] ?? '')}</p>
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

function Statistics({ member }: { member: StoredRecord }): JSX.Element {
  const { term } = useI18n();
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
      <Stat label={term('{{Fronts}} as the main {{member}}')} value={primary.length} />
      <Stat label={term('Co-{{fronting}} {{fronts}}')} value={co} />
      <Stat
        label={term('Total {{fronting}} time')}
        value={formatDuration(Number(member['frontMinutes'] ?? 0))}
      />
      <Stat label={term('{{Journal}} entries')} value={journal.items.length} />
      <Stat label="Emotions logged" value={emotions.items.length} />
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
