import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dayKey, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useActiveMemberId, useSystemMode } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SectionHeading, SegmentedControl } from '../ui/primitives.js';
import { SearchField, useDebounced } from '../ui/forms.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';

/**
 * The journal.
 *
 * Entries are grouped by day, attributed to whoever wrote them, and filterable
 * by member — because "what did I write" and "what did they write" are
 * different questions and both get asked.
 */
export default function Journal(): JSX.Element {
  const [params] = useSearchParams();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const systemMode = useSystemMode();
  const members = useRecordMap('members');
  const activeMemberId = useActiveMemberId();

  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounced(rawSearch);
  const [view, setView] = useState<'all' | 'mine' | 'members'>('all');
  const [memberFilter, setMemberFilter] = useState<string | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);

  // "My entries" always means this account's own writing, whichever member
  // that is right now — so switching who is fronting doesn't strand the
  // filter on someone who used to be active.
  const effectiveFilter = view === 'mine' ? activeMemberId : memberFilter;

  const { items, all, loading, error, reload, create, update, remove } = useCollection(
    'journalEntries',
    {
      search,
      ...(effectiveFilter !== undefined
        ? { filter: (entry: StoredRecord) => (entry['memberId'] ?? null) === effectiveFilter }
        : {}),
    },
  );

  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();
  const [creating, setCreating] = useState(params.get('new') === '1');

  const grouped = useMemo(() => {
    const groups = new Map<string, StoredRecord[]>();
    const sorted = [...items].sort(
      (a, b) =>
        Number(b['pinned'] === true) - Number(a['pinned'] === true) ||
        String(b['entryDate']).localeCompare(String(a['entryDate'])),
    );
    for (const entry of sorted) {
      const key = dayKey(String(entry['entryDate']));
      const bucket = groups.get(key);
      if (bucket) bucket.push(entry);
      else groups.set(key, [entry]);
    }
    return [...groups.entries()];
  }, [items]);

  return (
    <>
      <PageHeader
        title={term('{{Journal}}')}
        description={t('journal.subtitle')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            {t('journal.new')}
          </Button>
        }
      />

      <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
        {all.length > 3 ? (
          <SearchField
            value={rawSearch}
            onChange={setRawSearch}
            placeholder={term('Search the {{journal}}…')}
          />
        ) : null}

        {systemMode && members.size > 0 ? (
          <>
            <SegmentedControl
              value={view}
              onChange={(next) => {
                setView(next);
                if (next !== 'members') setMemberFilter(undefined);
              }}
              label="View"
              options={[
                { value: 'all', label: t('journal.allEntries') },
                { value: 'mine', label: t('journal.myEntries') },
                { value: 'members', label: t('journal.membersTab') },
              ]}
            />
            {view === 'members' ? (
              <div className="row">
                <Chip selected={memberFilter === undefined} onClick={() => setMemberFilter(undefined)}>
                  Everything
                </Chip>
                <Chip selected={memberFilter === null} onClick={() => setMemberFilter(null)}>
                  {t('journal.wholeSystem')}
                </Chip>
                {[...members.values()].map((member) => (
                  <Chip
                    key={member.id}
                    selected={memberFilter === member.id}
                    onClick={() => setMemberFilter(member.id)}
                    color={(member['color'] as string) ?? null}
                  >
                    {String(member['name'])}
                  </Chip>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <AsyncContent
        loading={loading}
        error={error}
        items={grouped}
        onRetry={reload}
        empty={
          search
            ? { title: t('list.noResults'), body: t('list.noResultsBody'), icon: 'search' }
            : {
                title: t('journal.empty'),
                body: t('journal.emptyBody'),
                icon: 'journal',
                action: { label: t('journal.new'), run: () => setCreating(true) },
              }
        }
      >
        {(groups) => (
          <div className="stack stack--loose">
            {groups.map(([day, entries]) => (
              <section key={day}>
                <SectionHeading label={dates.date(`${day}T12:00:00`)} />
                <div className="stack">
                  {entries.map((entry) => {
                    const author = entry['memberId'] ? members.get(String(entry['memberId'])) : null;
                    const isOpen = expanded === entry.id;
                    return (
                      <Card key={entry.id}>
                        <div className="row row--between" style={{ alignItems: 'flex-start' }}>
                          <div className="row row--nowrap" style={{ minWidth: 0 }}>
                            {author ? (
                              <Avatar
                                name={String(author['name'])}
                                src={(author['avatarUrl'] as string) ?? null}
                                color={(author['color'] as string) ?? null}
                                icon={(author['icon'] as string) ?? null}
                                size={32}
                                round
                              />
                            ) : (
                              <span className="avatar avatar--round" style={{ ['--avatar-size' as never]: '32px' }}>
                                <Icon name="system" size={16} />
                              </span>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <h3 style={{ fontSize: 'var(--size-md)' }} className="truncate">
                                {String(entry['title'] || 'Untitled')}
                              </h3>
                              <div className="tiny faint">
                                {author ? String(author['name']) : t('journal.wholeSystem')} ·{' '}
                                {dates.time(String(entry['entryDate']))}
                                {entry['visibility'] === 'private' ? ` · ${t('journal.private')}` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="row row--nowrap">
                            {entry['mood'] ? (
                              <Chip>
                                <Icon name="mood" size={11} /> {String(entry['mood'])}
                              </Chip>
                            ) : null}
                            {entry['pinned'] === true ? (
                              <span style={{ color: 'var(--accent)' }}>
                                <Icon name="pin" size={14} label="Pinned" />
                              </span>
                            ) : null}
                            <IconButton
                              icon="edit"
                              label="Edit entry"
                              variant="ghost"
                              size="sm"
                              onClick={() => editor.show(entry)}
                            />
                            <IconButton
                              icon="trash"
                              label="Delete entry"
                              variant="ghost"
                              size="sm"
                              onClick={() => confirm.show(entry)}
                            />
                          </div>
                        </div>

                        {entry['body'] ? (
                          <>
                            <p
                              className={`prose${isOpen ? '' : ' clamp-3'}`}
                              style={{ marginTop: 'var(--space-3)' }}
                            >
                              {String(entry['body'])}
                            </p>
                            {String(entry['body']).length > 220 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpanded(isOpen ? null : entry.id)}
                              >
                                {isOpen ? 'Show less' : 'Read more'}
                              </Button>
                            ) : null}
                          </>
                        ) : null}

                        {Array.isArray(entry['tags']) && entry['tags'].length > 0 ? (
                          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                            {((entry['tags'] as string[]) ?? []).map((tag) => (
                              <Chip key={tag}>{tag}</Chip>
                            ))}
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </AsyncContent>

      <Dialog
        open={creating || editor.open}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        title={editor.value ? term('Edit {{journal}} entry') : t('journal.new')}
        wide
      >
        <RecordForm
          collection="journalEntries"
          record={editor.value}
          initial={{ entryDate: new Date().toISOString() }}
          omit={['attachmentIds', 'moodScore']}
          onSubmit={async (values) => {
            if (editor.value) {
              await update(editor.value.id, values);
              toast.success('Saved');
              editor.hide();
            } else {
              await create(values);
              toast.success('Entry saved');
              setCreating(false);
            }
          }}
          onCancel={() => {
            setCreating(false);
            editor.hide();
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title={t('confirm.deleteTitle', { label: 'this entry' })}
        body={t('confirm.deleteBody')}
        onConfirm={async () => {
          if (!confirm.value) return;
          await remove(confirm.value.id);
          toast.success('Entry deleted');
        }}
      />
    </>
  );
}
