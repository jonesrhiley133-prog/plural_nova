import { useMemo, useState, type ReactNode } from 'react';
import {
  listFields,
  requireCollection,
  type StoredRecord,
} from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useSystemMode } from '../core/auth.js';
import { AsyncContent, SkeletonList } from './feedback.js';
import { Avatar, Button, Card, Chip, IconButton, ListRow } from './primitives.js';
import { SearchField, useDebounced } from './forms.js';
import { ConfirmDialog, Dialog, useDialog } from './overlays.js';
import { RecordForm } from './RecordForm.js';
import { PageHeader } from '../app/PageHeader.js';
import { Icon, iconOr } from './Icon.js';

/**
 * A complete CRUD screen, derived from the registry.
 *
 * List, search, create, edit, delete and the empty state all come from the
 * collection definition. Modules that are genuinely a list of records use this
 * and add only what is particular to them; modules that are not — the front
 * tracker, the headspace canvas, messages — are written out in full.
 */

export interface CollectionScreenProps {
  collection: string;
  title?: string;
  description?: string;
  /** Replaces the default row rendering. */
  renderRow?: (record: StoredRecord, helpers: RowHelpers) => ReactNode;
  /** Extra content between the header and the list. */
  above?: ReactNode;
  /** Filters applied before search. */
  filter?: (record: StoredRecord) => boolean;
  sort?: (a: StoredRecord, b: StoredRecord) => number;
  /** Values applied to a newly created record. */
  newRecordDefaults?: Record<string, unknown>;
  formFields?: string[];
  formOmit?: string[];
  emptyTitle?: string;
  emptyBody?: string;
  /** Layout: rows in a card, or a responsive grid of cards. */
  layout?: 'list' | 'grid';
  headerActions?: ReactNode;
  /** Opens the create dialog on mount, for `?new=1` deep links. */
  autoCreate?: boolean;
}

export interface RowHelpers {
  edit: () => void;
  remove: () => void;
  memberName: (id: string | null) => string | null;
}

export function CollectionScreen(props: CollectionScreenProps): JSX.Element {
  const definition = requireCollection(props.collection);
  const { t, term } = useI18n();
  const toast = useToast();
  const dates = useDateFormat();
  const systemMode = useSystemMode();
  const members = useRecordMap('members');

  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounced(rawSearch);

  const { items, all, loading, error, reload, create, update, remove } = useCollection(
    props.collection,
    {
      search,
      ...(props.filter ? { filter: props.filter } : {}),
      ...(props.sort ? { sort: props.sort } : {}),
    },
  );

  const editor = useDialog<StoredRecord>();
  const [creating, setCreating] = useState(props.autoCreate ?? false);
  const confirm = useDialog<StoredRecord>();

  const memberName = (id: string | null): string | null =>
    id ? ((members.get(id)?.['name'] as string) ?? null) : null;

  const columns = useMemo(() => listFields(definition), [definition]);

  const defaultRow = (record: StoredRecord): ReactNode => {
    const title = String(record[definition.titleField] ?? '').trim() || t('list.untitled');
    const subtitle = definition.subtitleField ? record[definition.subtitleField] : null;
    const attributed = memberName((record['memberId'] as string) ?? null);

    return (
      <ListRow
        key={record.id}
        title={title}
        leading={
          record['color'] || record['icon'] || record['avatarUrl'] ? (
            <Avatar
              name={title}
              src={(record['avatarUrl'] as string) ?? null}
              color={(record['color'] as string) ?? null}
              icon={(record['icon'] as string) ?? null}
              size={36}
            />
          ) : (
            <span style={{ color: 'var(--text-faint)' }}>
              <Icon name={iconOr(definition.icon)} size={18} />
            </span>
          )
        }
        meta={
          <>
            {subtitle ? <span>{String(subtitle)}</span> : null}
            {attributed ? <Chip>{attributed}</Chip> : null}
            {columns
              .filter((field) => field.name !== definition.titleField && field.name !== 'color')
              .slice(0, 2)
              .map((field) => {
                const value = record[field.name];
                if (value === null || value === undefined || value === '' || value === false) return null;
                return (
                  <span key={field.name} className="faint">
                    {formatValue(value, field.kind, dates)}
                  </span>
                );
              })}
          </>
        }
        trailing={
          <>
            <IconButton
              icon="edit"
              label={`Edit ${title}`}
              variant="ghost"
              size="sm"
              onClick={() => editor.show(record)}
            />
            <IconButton
              icon="trash"
              label={`Delete ${title}`}
              variant="ghost"
              size="sm"
              onClick={() => confirm.show(record)}
            />
          </>
        }
        onClick={() => editor.show(record)}
      />
    );
  };

  const helpers = (record: StoredRecord): RowHelpers => ({
    edit: () => editor.show(record),
    remove: () => confirm.show(record),
    memberName,
  });

  const save = async (values: Record<string, unknown>): Promise<void> => {
    if (editor.value) {
      await update(editor.value.id, values);
      toast.success(`${definition.singular} updated`);
      editor.hide();
    } else {
      await create({ ...props.newRecordDefaults, ...values });
      toast.success(`${definition.singular} added`);
      setCreating(false);
    }
  };

  if (definition.systemOnly && !systemMode) {
    return (
      <>
        <PageHeader title={term(props.title ?? definition.label)} />
        <Card>
          <p className="prose muted">
            {term(
              'This is a {{system}}-only feature. Switch to System Mode in settings if you want it back.',
            )}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={term(props.title ?? definition.label)}
        {...(props.description ?? definition.description
          ? { description: term(props.description ?? definition.description ?? '') }
          : {})}
        actions={
          <>
            {props.headerActions}
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              {term(`Add ${definition.singular.toLowerCase()}`)}
            </Button>
          </>
        }
      />

      {props.above}

      {all.length > 4 ? (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <SearchField
            value={rawSearch}
            onChange={setRawSearch}
            placeholder={t('list.searchPlaceholder', { label: definition.label.toLowerCase() })}
          />
        </div>
      ) : null}

      <AsyncContent
        loading={loading}
        error={error}
        items={items}
        onRetry={reload}
        skeleton={<SkeletonList rows={5} />}
        empty={
          search
            ? { title: t('list.noResults'), body: t('list.noResultsBody'), icon: 'search' }
            : {
                title: term(props.emptyTitle ?? `No ${definition.label.toLowerCase()} yet`),
                body: term(props.emptyBody ?? t('list.emptyBody')),
                icon: definition.icon,
                action: {
                  label: term(`Add ${definition.singular.toLowerCase()}`),
                  run: () => setCreating(true),
                },
              }
        }
      >
        {(rows) =>
          props.layout === 'grid' ? (
            <div className="grid">
              {rows.map((record) =>
                props.renderRow ? (
                  <div key={record.id}>{props.renderRow(record, helpers(record))}</div>
                ) : (
                  <Card key={record.id} interactive onClick={() => editor.show(record)}>
                    {defaultRow(record)}
                  </Card>
                ),
              )}
            </div>
          ) : (
            <Card flush>
              <div className="list">
                {rows.map((record) =>
                  props.renderRow ? (
                    <div key={record.id}>{props.renderRow(record, helpers(record))}</div>
                  ) : (
                    defaultRow(record)
                  ),
                )}
              </div>
            </Card>
          )
        }
      </AsyncContent>

      {items.length > 0 && search ? (
        <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
          {t('list.showing', { shown: items.length, total: all.length })}
        </p>
      ) : null}

      <Dialog
        open={creating || editor.open}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        title={
          editor.value
            ? term(`Edit ${definition.singular.toLowerCase()}`)
            : term(`New ${definition.singular.toLowerCase()}`)
        }
      >
        <RecordForm
          collection={props.collection}
          record={editor.value}
          {...(props.newRecordDefaults ? { initial: props.newRecordDefaults } : {})}
          {...(props.formFields ? { fields: props.formFields } : {})}
          {...(props.formOmit ? { omit: props.formOmit } : {})}
          onSubmit={save}
          onCancel={() => {
            setCreating(false);
            editor.hide();
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title={t('confirm.deleteTitle', {
          label: String(confirm.value?.[definition.titleField] ?? definition.singular.toLowerCase()),
        })}
        body={t('confirm.deleteBody')}
        onConfirm={async () => {
          if (!confirm.value) return;
          await remove(confirm.value.id);
          toast.success(`${definition.singular} deleted`, 'You can restore it from the trash.');
        }}
      />
    </>
  );
}

function formatValue(
  value: unknown,
  kind: string,
  dates: ReturnType<typeof useDateFormat>,
): string {
  if (value === true) return 'Yes';
  if (Array.isArray(value)) return value.slice(0, 3).join(', ');
  if (kind === 'datetime') return dates.dateTime(String(value));
  if (kind === 'date') return dates.date(String(value));
  if (kind === 'duration') return `${value} min`;
  return String(value);
}
