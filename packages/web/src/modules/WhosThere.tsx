import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDuration } from '@pluralnova/shared';
import { useFronting, FRONT_STATUS_META } from '../core/fronting.js';
import { useCollection } from '../core/data.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, ListRow, Status } from '../ui/primitives.js';
import { SearchField, useDebounced } from '../ui/forms.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

/**
 * Who's there.
 *
 * The one screen that answers the question the app exists for. It handles every
 * shape that answer can take: one person, several at once, someone unnamed, or
 * nobody — and treats the last two as valid states rather than errors.
 */
export default function WhosThere(): JSX.Element {
  const navigate = useNavigate();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const { state, loading, error, reload, end, clear, removeCoFronter } = useFronting();
  const members = useCollection('members');
  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounced(rawSearch);
  const [rosterFilter, setRosterFilter] = useState<'all' | 'nearby' | 'favorites'>('all');

  if (loading) {
    return (
      <>
        <PageHeader title={t('front.whosThere')} />
        <SkeletonList rows={3} />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title={t('front.whosThere')} />
        <ErrorPanel message={error} onRetry={() => void reload()} />
      </>
    );
  }

  if (members.items.length === 0) {
    return (
      <>
        <PageHeader title={t('front.whosThere')} />
        <Card>
          <EmptyState
            icon="member"
            title={t('members.empty')}
            body={t('members.emptyBody')}
            action={{ label: t('members.create'), run: () => navigate('/members?new=1') }}
            secondaryAction={{ label: t('members.import'), run: () => navigate('/import') }}
          />
        </Card>
      </>
    );
  }

  const frontingIds = new Set(state.fronting.map((member) => member.id));
  const others = members.items.filter((member) => !frontingIds.has(member.id));
  const visibleOthers = others.filter((member) => {
    if (rosterFilter === 'nearby' && member['frontStatus'] !== 'nearby') return false;
    if (rosterFilter === 'favorites' && member['isFavourite'] !== true) return false;
    if (search && !String(member['name']).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <PageHeader
        title={t('front.whosThere')}
        actions={
          <>
            <Button icon="bolt" onClick={() => navigate('/quick-front')}>
              {t('front.quickFront')}
            </Button>
            {state.active.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  void clear()
                    .then(() => toast.success(term('{{Front}} cleared')))
                    .catch((cause: unknown) => toast.fromError(cause));
                }}
              >
                {t('front.clear')}
              </Button>
            ) : null}
          </>
        }
      />

      {state.active.length === 0 ? (
        <Card>
          <EmptyState
            icon="front"
            title={t('front.noOne')}
            body={t('front.noOneBody')}
            action={{ label: t('front.start'), run: () => navigate('/quick-front') }}
          />
        </Card>
      ) : (
        <div className="stack">
          {state.active.map((event) => (
            <Card key={event.id} raised>
              <div className="row row--nowrap" style={{ alignItems: 'flex-start' }}>
                <Avatar
                  name={String(event.member?.['name'] ?? 'Unknown')}
                  src={(event.member?.['avatarUrl'] as string) ?? null}
                  color={(event.member?.['color'] as string) ?? null}
                  icon={(event.member?.['icon'] as string) ?? null}
                  size={64}
                  ring
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: 'var(--size-lg)' }}>
                    {event['unknownFronter'] === true
                      ? t('front.unknown')
                      : String(event.member?.['name'] ?? t('front.unknown'))}
                  </h2>
                  {event.member?.['pronouns'] ? (
                    <p className="small muted">{String(event.member['pronouns'])}</p>
                  ) : null}

                  <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                    <Status
                      label={term(FRONT_STATUS_META[String(event['statusType'])]?.label ?? 'Fronting')}
                      glyph={FRONT_STATUS_META[String(event['statusType'])]?.glyph}
                      color={FRONT_STATUS_META[String(event['statusType'])]?.color ?? null}
                    />
                    <span className="small muted">
                      {t('front.since', { time: dates.time(String(event['startedAt'])) })} ·{' '}
                      {formatDuration(event.minutes)}
                    </span>
                  </div>

                  {event['activity'] || event['mood'] || event['location'] ? (
                    <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                      {event['activity'] ? (
                        <Chip>
                          <Icon name="sparkle" size={11} /> {String(event['activity'])}
                        </Chip>
                      ) : null}
                      {event['mood'] ? (
                        <Chip>
                          <Icon name="mood" size={11} /> {String(event['mood'])}
                        </Chip>
                      ) : null}
                      {event['location'] ? (
                        <Chip>
                          <Icon name="location" size={11} /> {String(event['location'])}
                        </Chip>
                      ) : null}
                    </div>
                  ) : null}

                  {event['note'] ? (
                    <p className="small muted prose" style={{ marginTop: 'var(--space-3)' }}>
                      {String(event['note'])}
                    </p>
                  ) : null}

                  {event.coFronters.length > 0 ? (
                    <div style={{ marginTop: 'var(--space-4)' }}>
                      <div className="section-heading__label" style={{ marginBottom: 'var(--space-2)' }}>
                        {t('front.cofronting')}
                      </div>
                      <div className="row">
                        {event.coFronters.map((coFronter) => (
                          <Chip
                            key={coFronter.id}
                            color={(coFronter['color'] as string) ?? null}
                            onClick={() => {
                              void removeCoFronter(event.id, coFronter.id).catch((cause: unknown) =>
                                toast.fromError(cause),
                              );
                            }}
                            title={`Remove ${String(coFronter['name'])}`}
                          >
                            {String(coFronter['name'])} <Icon name="close" size={10} />
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="row" style={{ marginTop: 'var(--space-4)' }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void end(event.id)
                      .then(() => toast.success(term('{{Front}} ended')))
                      .catch((cause: unknown) => toast.fromError(cause));
                  }}
                >
                  {t('front.end')}
                </Button>
                <Button variant="ghost" onClick={() => navigate(`/quick-front?switch=${event.id}`)}>
                  {t('front.switch')}
                </Button>
                <span className="spacer" />
                {event.member ? (
                  <Button variant="ghost" onClick={() => navigate(`/members/${event.member!.id}`)}>
                    {t('members.profile')}
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {others.length > 0 ? (
        <>
          <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
            {others.length > 3 ? (
              <SearchField
                value={rawSearch}
                onChange={setRawSearch}
                placeholder={term('Search {{members}}…')}
              />
            ) : null}
            <div className="row">
              <Chip selected={rosterFilter === 'all'} onClick={() => setRosterFilter('all')}>
                All
              </Chip>
              <Chip selected={rosterFilter === 'nearby'} onClick={() => setRosterFilter('nearby')}>
                Nearby
              </Chip>
              <Chip selected={rosterFilter === 'favorites'} onClick={() => setRosterFilter('favorites')}>
                Favourites
              </Chip>
            </div>
          </div>

          <Card
            title={t('front.notFronting')}
            subtitle={term('Everyone else in the {{system}} right now')}
            flush
            style={{ marginTop: 'var(--space-3)' }}
          >
            {visibleOthers.length > 0 ? (
              <div className="list">
                {visibleOthers.map((member) => {
                  const meta = FRONT_STATUS_META[String(member['frontStatus'])] ?? FRONT_STATUS_META['nearby']!;
                  return (
                    <ListRow
                      key={member.id}
                      leading={
                        <Avatar
                          name={String(member['name'])}
                          src={(member['avatarUrl'] as string) ?? null}
                          color={(member['color'] as string) ?? null}
                          icon={(member['icon'] as string) ?? null}
                          size={34}
                          round
                        />
                      }
                      title={String(member['name'])}
                      meta={<Status label={term(meta.label)} glyph={meta.glyph} color={meta.color} />}
                      trailing={<Icon name="chevronRight" size={14} />}
                      onClick={() => navigate(`/members/${member.id}`)}
                    />
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: 'var(--space-4)' }}>
                <p className="small muted">{t('list.noResultsBody')}</p>
              </div>
            )}
          </Card>
        </>
      ) : null}

      {state.recent.length > 0 ? (
        <Card title={t('front.recent')} flush style={{ marginTop: 'var(--space-4)' }}>
          <div className="list">
            {state.recent.slice(0, 8).map((event) => (
              <div key={event.id} className="list-row">
                <Avatar
                  name={String(event.member?.['name'] ?? 'Unknown')}
                  color={(event.member?.['color'] as string) ?? null}
                  icon={(event.member?.['icon'] as string) ?? null}
                  size={28}
                  round
                />
                <span className="list-row__body">
                  <span className="list-row__title">
                    {String(event.member?.['name'] ?? t('front.unknown'))}
                  </span>
                  <span className="list-row__meta">
                    {dates.dateTime(String(event['startedAt']))}
                    {event['durationMinutes'] ? (
                      <span className="faint">
                        {formatDuration(Number(event['durationMinutes']))}
                      </span>
                    ) : (
                      <Chip accent>Open</Chip>
                    )}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
