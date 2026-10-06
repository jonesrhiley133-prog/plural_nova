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
import { useFacets, type FilterSpec, type SortSpec } from './CollectionToolbar.js';

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
  /** Narrows the grid's column width for smaller, image-forward tiles (default 180px). */
  gridMinWidth?: number;
  headerActions?: ReactNode;
  /** Opens the create dialog on mount, for `?new=1` deep links. */
  autoCreate?: boolean;
  /** Fields offered as filters above the list — enums, flags, tags, categories and member references. */
  filters?: readonly FilterSpec[];
  /** Orderings offered in a sort menu. The first is the default. */
  sorts?: readonly SortSpec[];
  /** A statistics / progress strip computed from every record, not just the filtered ones. */
  stats?: (all: StoredRecord[], helpers: ScreenHelpers) => ReactNode;
  /** A full preview. When given, opening a record shows this first, with Edit and Delete inside. */
  detail?: (record: StoredRecord, helpers: RowHelpers) => ReactNode;
}

export interface ScreenHelpers {
  memberName: (id: string | null) => string | null;
}

export interface RowHelpers {
  /** Opens the preview when the screen has one, otherwise the editor. */
  open: () => void;
  edit: () => void;
  remove: () => void;
  memberName: (id: string | null) => string | null;
  /** A direct patch, for a row action that isn't "open the editor" — a status toggle, a "done" button. */
  update: (patch: Record<string, unknown>) => Promise<unknown>;
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

  const baseQuery = useCollection(props.collection, {});
  const facets = useFacets(props.collection, baseQuery.all, members, props.filters, props.sorts);
  const outerFilter = props.filter;
  const combinedFilter = useMemo(
    () => (record: StoredRecord) => facets.filter(record) && (outerFilter ? outerFilter(record) : true),
    [facets.filter, outerFilter],
  );
  const sortFn = facets.sort ?? props.sort;
  const { items, all, loading, error, reload, create, update, remove } = useCollection(
    props.collection,
    {
      search,
      filter: combinedFilter,
      ...(sortFn ? { sort: sortFn } : {}),
    },
  );
  const previewing = useDialog<StoredRecord>();
  // Reads the live record, so a favourite toggled inside the preview shows straight away.
  const previewed = previewing.value ? (all.find((r) => r.id === previewing.value!.id) ?? previewing.value) : null;

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
        onClick={() => open(record)}
      />
    );
  };

  const open = (record: StoredRecord): void => (props.detail ? previewing.show(record) : editor.show(record));

  const helpers = (record: StoredRecord): RowHelpers => ({
    open: () => open(record),
    edit: () => editor.show(record),
    remove: () => confirm.show(record),
    memberName,
    update: (patch) => update(record.id, patch),
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

      {props.stats && all.length > 0 ? props.stats(all, { memberName }) : null}

      {facets.toolbar}

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
          search || facets.active
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
            <div
              className="grid"
              style={props.gridMinWidth ? ({ ['--grid-min' as never]: `${props.gridMinWidth}px` }) : undefined}
            >
              {rows.map((record) =>
                props.renderRow ? (
                  <div key={record.id}>{props.renderRow(record, helpers(record))}</div>
                ) : (
                  <Card key={record.id} interactive onClick={() => open(record)}>
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

      {items.length > 0 && (search || facets.active) ? (
        <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
          {t('list.showing', { shown: items.length, total: all.length })}
        </p>
      ) : null}

      <Dialog
        open={previewing.open}
        onClose={previewing.hide}
        title={String(previewed?.[definition.titleField] ?? definition.singular)}
      >
        {previewed ? (
          <div className="stack">
            {props.detail?.(previewed, helpers(previewed))}
            <div className="row row--between">
              <Button
                variant="danger"
                icon="trash"
                onClick={() => {
                  const record = previewing.value;
                  previewing.hide();
                  if (record) confirm.show(record);
                }}
              >
                Delete
              </Button>
              <Button
                variant="primary"
                icon="edit"
                onClick={() => {
                  const record = previewing.value;
                  previewing.hide();
                  if (record) editor.show(record);
                }}
              >
                Edit
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

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
