import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ACCENT_PRESETS,
  customFieldValues,
  withDefinitionValue,
  formatDuration,
  type CustomFieldValueEntry,
  type MemberListLayout,
  type StoredRecord,
} from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { FRONT_STATUS_META, useFronting } from '../core/fronting.js';
import { useOptimisticSettings } from '../core/settings.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SegmentedControl, Status } from '../ui/primitives.js';
import { SearchField, TextField, useDebounced } from '../ui/forms.js';
import { AsyncContent, SkeletonCards } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { MemberEditorForm } from '../ui/MemberEditorForm.js';
import { MemberCustomFieldsEditor } from '../ui/CustomFields.js';
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

const LONG_PRESS_MS = 500;

/**
 * Press and hold, on both touch and mouse — Pointer Events cover both without
 * a separate implementation for each. The card's own click still fires right
 * after the hold ends, so `consume` lets the caller swallow that one click
 * rather than also opening the profile it just entered multiselect from.
 */
function useLongPress(onLongPress: () => void): {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  consume: () => boolean;
} {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);

  const clear = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    onPointerDown: (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    // Holding on a touch screen otherwise opens the browser's own text-selection/context menu.
    onContextMenu: (event) => event.preventDefault(),
    consume: () => {
      if (!fired.current) return false;
      fired.current = false;
      return true;
    },
  };
}

/** The checkmark a card wears once multiselect is active. */
function SelectionMark({ selected }: { selected: boolean }): JSX.Element {
  return (
    <span
      className={`member-select-mark${selected ? ' member-select-mark--selected' : ''}`}
      aria-hidden="true"
    >
      {selected ? <Icon name="check" size={13} /> : null}
    </span>
  );
}

/**
 * Windowed rendering for the grid layouts.
 *
 * The page itself scrolls — there is no inner scroll pane to hand a
 * virtualizer — so this measures against the window, chunking the sorted
 * members into rows of `columns` and rendering only the rows near the
 * viewport. Each row keeps the exact `.grid.grid--columns` markup a
 * non-virtualized page already used, so the visual result is identical; only
 * the DOM node count while scrolling changes. Row height is a rough guess
 * corrected after the first paint — a square card's height depends on a
 * column width this component cannot compute from CSS alone, so it is
 * measured rather than calculated.
 */
function VirtualizedGrid({
  members,
  columns,
  estimateRowHeight,
  renderCard,
}: {
  members: StoredRecord[];
  columns: number;
  estimateRowHeight: number;
  renderCard: (member: StoredRecord) => ReactNode;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const chunks: StoredRecord[][] = [];
    for (let index = 0; index < members.length; index += columns) {
      chunks.push(members.slice(index, index + columns));
    }
    return chunks;
  }, [members, columns]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => estimateRowHeight,
    overscan: 3,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
    getItemKey: (index) => rows[index]?.[0]?.id ?? index,
  });

  return (
    <div ref={containerRef} style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualRow) => (
        <div
          key={virtualRow.key}
          ref={virtualizer.measureElement}
          data-index={virtualRow.index}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            paddingBottom: 'var(--space-3)',
            transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          <div className="grid grid--columns" style={{ ['--grid-columns' as never]: columns }}>
            {rows[virtualRow.index]!.map((member) => renderCard(member))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Windowed rendering for the slim/thick banner (list) layouts — the same
 * window-measured approach as `VirtualizedGrid`, one row per member rather
 * than one row per `columns` of them.
 */
function VirtualizedList({
  members,
  estimateRowHeight,
  renderRow,
}: {
  members: StoredRecord[];
  estimateRowHeight: number;
  renderRow: (member: StoredRecord, isLast: boolean) => ReactNode;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useWindowVirtualizer({
    count: members.length,
    estimateSize: () => estimateRowHeight,
    overscan: 6,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
    getItemKey: (index) => members[index]?.id ?? index,
  });

  return (
    <div ref={containerRef} style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualRow) => (
        <div
          key={virtualRow.key}
          ref={virtualizer.measureElement}
          data-index={virtualRow.index}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {renderRow(members[virtualRow.index]!, virtualRow.index === members.length - 1)}
        </div>
      ))}
    </div>
  );
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

  const { items, all, loading, error, reload, create, update, remove } = useCollection('members', {
    search,
    filter: (member) =>
      (showArchived ? member['archived'] === true : member['archived'] !== true) &&
      (groupFilter === null ||
        member['groupId'] === groupFilter ||
        member['subsystemId'] === groupFilter),
  });
  const definitions = useCollection('customFieldDefinitions');

  const [multiselect, setMultiselect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkFields = useDialog();
  const bulkGroup = useDialog();
  const bulkDelete = useDialog();

  const enterMultiselect = (id: string): void => {
    setMultiselect(true);
    setSelectedIds(new Set([id]));
  };
  const toggleSelected = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitMultiselect = (): void => {
    setMultiselect(false);
    setSelectedIds(new Set());
  };

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
  const selectedMembers = useMemo(
    () => sorted.filter((member) => selectedIds.has(member.id)),
    [sorted, selectedIds],
  );

  // Instant: applied to the shared fronting state before the request that
  // tells the server about it resolves, so the tap never waits on anything.
  // `fronting.quickFront` is itself the toggle — already fronting removes
  // them, not fronting adds them — so this wrapper only needs to forward the
  // tap, not gate it.
  const quickFrontMember = (member: StoredRecord): void => {
    void fronting.quickFront(member.id).catch((cause: unknown) => toast.fromError(cause));
  };

  // Only the definitions actually filled in are applied — everything else a
  // member already has stays exactly as it was, per member, not overwritten
  // by whatever a differently-answered member in the same selection has.
  const bulkSetCustomFields = async (entries: CustomFieldValueEntry[]): Promise<void> => {
    const count = selectedMembers.length;
    await Promise.all(
      selectedMembers.map((member) => {
        let merged = customFieldValues(member['customFieldValues']);
        for (const entry of entries) merged = withDefinitionValue(merged, entry.definitionId, entry.value);
        return update(member.id, { customFieldValues: merged });
      }),
    );
    toast.success(term(count === 1 ? 'Custom fields updated' : `Custom fields updated for ${count} {{members}}`));
    exitMultiselect();
  };

  const bulkMoveToGroup = async (groupId: string): Promise<void> => {
    const count = selectedMembers.length;
    await Promise.all(selectedMembers.map((member) => update(member.id, { groupId })));
    toast.success(term(count === 1 ? 'Moved to the group' : `Moved ${count} {{members}} to the group`));
    exitMultiselect();
  };

  const bulkDeleteSelected = async (): Promise<void> => {
    const count = selectedMembers.length;
    await Promise.all(selectedMembers.map((member) => remove(member.id)));
    toast.success(
      term(count === 1 ? '{{Member}} deleted' : `${count} {{members}} deleted`),
      'You can restore them from the trash for 30 days.',
    );
    exitMultiselect();
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

          <div
            style={{
              // Reserves room for the bulk bar the same way the page already
              // does for the music mini-bar, so the last row is never hidden
              // behind the one control multiselect actually needs reachable.
              paddingBottom: multiselect
                ? 'calc(var(--bulk-bar-height) + var(--bottom-nav-height) + var(--safe-bottom) + var(--space-4))'
                : undefined,
            }}
          >
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
                <VirtualizedGrid
                  members={records}
                  columns={columns}
                  estimateRowHeight={layout === 'square' ? 210 : 150}
                  renderCard={(member) =>
                    layout === 'square' ? (
                      <MemberCard
                        key={member.id}
                        member={member}
                        onOpen={multiselect ? () => toggleSelected(member.id) : () => navigate(`/members/${member.id}`)}
                        onQuickFront={() => quickFrontMember(member)}
                        multiselect={multiselect}
                        selected={selectedIds.has(member.id)}
                        onLongPress={() => enterMultiselect(member.id)}
                      />
                    ) : (
                      <MemberCircleCard
                        key={member.id}
                        member={member}
                        onOpen={multiselect ? () => toggleSelected(member.id) : () => navigate(`/members/${member.id}`)}
                        onQuickFront={() => quickFrontMember(member)}
                        multiselect={multiselect}
                        selected={selectedIds.has(member.id)}
                        onLongPress={() => enterMultiselect(member.id)}
                      />
                    )
                  }
                />
              ) : (
                <Card flush>
                  <VirtualizedList
                    members={records}
                    estimateRowHeight={layout === 'thickBanner' ? 96 : 66}
                    renderRow={(member, isLast) => (
                      <MemberBannerRow
                        key={member.id}
                        member={member}
                        thick={layout === 'thickBanner'}
                        last={isLast}
                        onOpen={multiselect ? () => toggleSelected(member.id) : () => navigate(`/members/${member.id}`)}
                        onQuickFront={() => quickFrontMember(member)}
                        multiselect={multiselect}
                        selected={selectedIds.has(member.id)}
                        onLongPress={() => enterMultiselect(member.id)}
                      />
                    )}
                  />
                </Card>
              )
            }
          </AsyncContent>
          </div>
        </>
      )}

      {multiselect ? (
        <BulkActionBar
          count={selectedIds.size}
          onCancel={exitMultiselect}
          onCustomFields={() => bulkFields.show()}
          onMoveToGroup={() => bulkGroup.show()}
          onDelete={() => bulkDelete.show()}
        />
      ) : null}

      <Dialog open={creator.open} onClose={creator.hide} title={t('members.create')}>
        <MemberEditorForm
          member={null}
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

      <BulkCustomFieldsDialog
        dialog={bulkFields}
        definitions={definitions.items}
        members={selectedMembers}
        allMembers={all}
        onSave={bulkSetCustomFields}
      />
      <BulkGroupDialog
        dialog={bulkGroup}
        groups={groups.items}
        members={selectedMembers}
        onCreateGroup={(name) => groups.create({ name })}
        onMove={bulkMoveToGroup}
      />
      <ConfirmDialog
        open={bulkDelete.open}
        onClose={bulkDelete.hide}
        title={term(
          selectedMembers.length === 1
            ? `Delete ${String(selectedMembers[0]?.['name'] ?? 'this member')}?`
            : `Delete ${selectedMembers.length} {{members}}?`,
        )}
        body={term(
          `This deletes ${selectedMembers.length === 1 ? 'this {{member}}' : `all ${selectedMembers.length} selected {{members}}`}. You can restore them from the trash for 30 days.`,
        )}
        onConfirm={bulkDeleteSelected}
      />
    </>
  );
}

function MemberCard({
  member,
  onOpen,
  onQuickFront,
  multiselect,
  selected,
  onLongPress,
}: {
  member: StoredRecord;
  onOpen: () => void;
  onQuickFront: () => void;
  multiselect: boolean;
  selected: boolean;
  onLongPress: () => void;
}): JSX.Element {
  const { term } = useI18n();
  const meta = FRONT_STATUS_META[String(member['frontStatus'])] ?? FRONT_STATUS_META['nearby']!;
  const minutes = Number(member['frontMinutes'] ?? 0);
  const longPress = useLongPress(onLongPress);

  return (
    <div
      className="card card--interactive card--flush"
      style={{ position: 'relative', textAlign: 'left', overflow: 'hidden' }}
    >
      <button
        type="button"
        onClick={() => {
          if (!longPress.consume()) onOpen();
        }}
        onPointerDown={longPress.onPointerDown}
        onPointerUp={longPress.onPointerUp}
        onPointerLeave={longPress.onPointerLeave}
        onPointerCancel={longPress.onPointerCancel}
        onContextMenu={longPress.onContextMenu}
        aria-label={String(member['name'])}
        aria-pressed={multiselect ? selected : undefined}
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
        {multiselect ? (
          <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 2 }}>
            <SelectionMark selected={selected} />
          </span>
        ) : (
          <span style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
            <IconButton
              icon={isFronting(member) ? 'close' : 'bolt'}
              label={isFronting(member) ? term('Remove from {{fronting}}') : term('Quick {{front}}')}
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onQuickFront();
              }}
            />
          </span>
        )}
        <Avatar
          name={String(member['name'])}
          src={(member['avatarUrl'] as string) ?? null}
          color={(member['color'] as string) ?? null}
          // `fill` makes the photo itself fill the tile regardless of this;
          // it only sets how large the no-photo initial falls back to, so a
          // size in the tile's own typical range keeps that fallback
          // reasonably proportioned rather than defaulting to a tiny 40px one.
          size={120}
          fill
        />
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
  multiselect,
  selected,
  onLongPress,
}: {
  member: StoredRecord;
  onOpen: () => void;
  onQuickFront: () => void;
  multiselect: boolean;
  selected: boolean;
  onLongPress: () => void;
}): JSX.Element {
  const { term } = useI18n();
  const meta = FRONT_STATUS_META[String(member['frontStatus'])] ?? FRONT_STATUS_META['nearby']!;
  const longPress = useLongPress(onLongPress);

  return (
    <div
      className="card card--interactive"
      style={{ textAlign: 'center', position: 'relative', padding: 'var(--space-3)' }}
    >
      <button
        type="button"
        onClick={() => {
          if (!longPress.consume()) onOpen();
        }}
        onPointerDown={longPress.onPointerDown}
        onPointerUp={longPress.onPointerUp}
        onPointerLeave={longPress.onPointerLeave}
        onPointerCancel={longPress.onPointerCancel}
        onContextMenu={longPress.onContextMenu}
        aria-label={String(member['name'])}
        aria-pressed={multiselect ? selected : undefined}
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
      {multiselect ? (
        <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 2 }}>
          <SelectionMark selected={selected} />
        </span>
      ) : (
        <span style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
          <IconButton
            icon={isFronting(member) ? 'close' : 'bolt'}
            label={isFronting(member) ? term('Remove from {{fronting}}') : term('Quick {{front}}')}
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onQuickFront();
            }}
          />
        </span>
      )}
      <Avatar
        name={String(member['name'])}
        src={(member['avatarUrl'] as string) ?? null}
        color={(member['color'] as string) ?? null}
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
  last,
  onOpen,
  onQuickFront,
  multiselect,
  selected,
  onLongPress,
}: {
  member: StoredRecord;
  thick: boolean;
  /**
   * Virtualized rows are each the sole child of their own positioned
   * wrapper, so `:last-child` — which the plain row's own divider relies on
   * — matches every row instead of only the true last one. An inline
   * `border-bottom` here outranks that rule for every row except the real
   * last, where leaving it unset lets `:last-child` remove the divider as it
   * always did.
   */
  last: boolean;
  onOpen: () => void;
  onQuickFront: () => void;
  multiselect: boolean;
  selected: boolean;
  onLongPress: () => void;
}): JSX.Element {
  const { term } = useI18n();
  const meta = FRONT_STATUS_META[String(member['frontStatus'])] ?? FRONT_STATUS_META['nearby']!;
  const minutes = Number(member['frontMinutes'] ?? 0);
  const alreadyFronting = isFronting(member);
  const roles = Array.isArray(member['roles']) ? (member['roles'] as string[]) : [];
  const longPress = useLongPress(onLongPress);
  const dividerStyle = last ? undefined : { borderBottom: 'var(--border-width) solid var(--border)' };

  const trailing = multiselect ? (
    <SelectionMark selected={selected} />
  ) : (
    <IconButton
      icon={alreadyFronting ? 'close' : 'bolt'}
      label={alreadyFronting ? term('Remove from {{fronting}}') : term('Quick {{front}}')}
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
      <div className="member-banner-row" style={{ ['--member-color' as never]: color, ...dividerStyle }}>
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
          onClick={() => {
            if (!longPress.consume()) onOpen();
          }}
          onPointerDown={longPress.onPointerDown}
          onPointerUp={longPress.onPointerUp}
          onPointerLeave={longPress.onPointerLeave}
          onPointerCancel={longPress.onPointerCancel}
          onContextMenu={longPress.onContextMenu}
          aria-label={String(member['name'])}
          aria-pressed={multiselect ? selected : undefined}
          className="member-banner-row__hit"
        />
        <span className="member-banner-row__avatar">
          <Avatar
            name={String(member['name'])}
            src={(member['avatarUrl'] as string) ?? null}
            color={color}
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
                <Chip key={role} color={color}>
                  {role}
                </Chip>
              ))}
            </span>
          ) : null}
        </span>
        <span className="member-banner-row__trailing">{trailing}</span>
      </div>
    );
  }

  return (
    <div className="list-row" style={{ position: 'relative', ...dividerStyle }}>
      <button
        type="button"
        onClick={() => {
          if (!longPress.consume()) onOpen();
        }}
        onPointerDown={longPress.onPointerDown}
        onPointerUp={longPress.onPointerUp}
        onPointerLeave={longPress.onPointerLeave}
        onPointerCancel={longPress.onPointerCancel}
        onContextMenu={longPress.onContextMenu}
        aria-label={String(member['name'])}
        aria-pressed={multiselect ? selected : undefined}
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
        {trailing}
      </span>
    </div>
  );
}

/** The contextual toolbar that replaces the page header's own actions while multiselect is active. */
function BulkActionBar({
  count,
  onCancel,
  onCustomFields,
  onMoveToGroup,
  onDelete,
}: {
  count: number;
  onCancel: () => void;
  onCustomFields: () => void;
  onMoveToGroup: () => void;
  onDelete: () => void;
}): JSX.Element {
  const { t, term } = useI18n();

  return (
    <div className="bulk-bar" role="toolbar" aria-label={term('Bulk actions')}>
      <div className="bulk-bar__count">
        <IconButton icon="close" label={t('action.cancel')} variant="ghost" size="sm" onClick={onCancel} />
        <span className="small">{term(count === 1 ? '1 {{member}} selected' : `${count} {{members}} selected`)}</span>
      </div>
      <div className="bulk-bar__actions">
        <Button variant="ghost" size="sm" icon="tag" disabled={count === 0} onClick={onCustomFields}>
          Custom fields
        </Button>
        <Button variant="ghost" size="sm" icon="group" disabled={count === 0} onClick={onMoveToGroup}>
          Move to group
        </Button>
        <Button variant="ghost" size="sm" icon="trash" disabled={count === 0} onClick={onDelete}>
          {t('action.delete')}
        </Button>
      </div>
    </div>
  );
}

function BulkCustomFieldsDialog({
  dialog,
  definitions,
  members,
  allMembers,
  onSave,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  definitions: StoredRecord[];
  members: StoredRecord[];
  allMembers: StoredRecord[];
  onSave: (entries: CustomFieldValueEntry[]) => Promise<void>;
}): JSX.Element {
  const toast = useToast();

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title={members.length === 1 ? 'Custom fields' : `Custom fields for ${members.length} members`}
      wide
    >
      <p className="small faint">
        Only the fields filled in below are changed. Anything else already set on each member is left alone.
      </p>
      {dialog.open ? (
        <MemberCustomFieldsEditor
          definitions={definitions}
          values={[]}
          members={allMembers}
          onCancel={dialog.hide}
          onSave={(next) =>
            onSave(next)
              .then(() => dialog.hide())
              .catch((cause: unknown) => toast.fromError(cause))
          }
        />
      ) : null}
    </Dialog>
  );
}

function BulkGroupDialog({
  dialog,
  groups,
  members,
  onCreateGroup,
  onMove,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  groups: StoredRecord[];
  members: StoredRecord[];
  onCreateGroup: (name: string) => Promise<StoredRecord>;
  onMove: (groupId: string) => Promise<void>;
}): JSX.Element {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const moveTo = (groupId: string): void => {
    setSaving(true);
    void onMove(groupId)
      .then(() => {
        setCreating(false);
        setName('');
        dialog.hide();
      })
      .catch((cause: unknown) => toast.fromError(cause))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title={members.length === 1 ? 'Move to a group' : `Move ${members.length} members to a group`}
    >
      {groups.length > 0 ? (
        <div className="list" style={{ marginBottom: 'var(--space-3)' }}>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="list-row"
              disabled={saving}
              onClick={() => moveTo(group.id)}
            >
              <span
                className="list-row__icon"
                style={{ ['--row-icon-color' as never]: (group['color'] as string) ?? undefined }}
              >
                <Icon name="group" size={16} />
              </span>
              <span className="list-row__body">
                <span className="list-row__title">{String(group['name'])}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="small faint">No groups yet.</p>
      )}

      {creating ? (
        <div className="stack">
          <TextField label="New group name" value={name} onChange={setName} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              loading={saving}
              onClick={() => {
                setSaving(true);
                void onCreateGroup(name.trim())
                  .then((group) => onMove(group.id))
                  .then(() => {
                    setCreating(false);
                    setName('');
                    dialog.hide();
                  })
                  .catch((cause: unknown) => toast.fromError(cause))
                  .finally(() => setSaving(false));
              }}
            >
              Create and move
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" icon="plus" onClick={() => setCreating(true)}>
          New group
        </Button>
      )}
    </Dialog>
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
