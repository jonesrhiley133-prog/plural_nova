import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SegmentedControl } from '../ui/primitives.js';
import { ColorField, SelectField, TextField } from '../ui/forms.js';
import { EmptyState, SkeletonCards } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { memberColor } from '../charts/palette.js';

/**
 * The headspace mapper.
 *
 * Two views over the same idea. The canvas is a freeform surface — rooms,
 * landmarks, markers, labels, placed and sized by hand — and the analytics map
 * is the same objects read as structure: what is where, who is in it, what
 * connects to what.
 *
 * Deliberately unopinionated. PluralNova supplies a surface and a few shapes;
 * what a headspace *is* is not something an app gets to decide.
 */

type Tool = 'select' | 'room' | 'region' | 'landmark' | 'object' | 'label' | 'member' | 'decoration';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'room', label: 'Room' },
  { id: 'region', label: 'Region' },
  { id: 'landmark', label: 'Landmark' },
  { id: 'object', label: 'Object' },
  { id: 'label', label: 'Label' },
  { id: 'member', label: 'Someone' },
];

const DEFAULT_SIZE: Record<string, { width: number; height: number }> = {
  room: { width: 180, height: 130 },
  region: { width: 260, height: 190 },
  landmark: { width: 90, height: 90 },
  object: { width: 70, height: 70 },
  label: { width: 140, height: 34 },
  member: { width: 56, height: 56 },
  decoration: { width: 60, height: 60 },
};

export default function Headspace(): JSX.Element {
  const { term } = useI18n();
  const toast = useToast();
  const members = useRecordMap('members');

  const maps = useCollection('headspaceMaps');
  const objects = useCollection('headspaceObjects');

  const [mapId, setMapId] = useState<string | null>(null);
  const [view, setView] = useState<'canvas' | 'analytics'>('canvas');
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const panning = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const mapEditor = useDialog<StoredRecord>();
  const objectEditor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();

  const activeMap = maps.items.find((map) => map.id === mapId) ?? maps.items[0] ?? null;

  useEffect(() => {
    if (!mapId && activeMap) setMapId(activeMap.id);
  }, [mapId, activeMap]);

  const onMap = useMemo(
    () => objects.items.filter((object) => object['mapId'] === activeMap?.id),
    [objects.items, activeMap],
  );

  const place = useCallback(
    async (kind: Tool, x: number, y: number) => {
      if (!activeMap || kind === 'select') return;
      const size = DEFAULT_SIZE[kind] ?? { width: 120, height: 90 };
      try {
        const created = await objects.create({
          mapId: activeMap.id,
          kind,
          label: kind === 'label' ? 'New label' : kind === 'member' ? '' : `New ${kind}`,
          x: Math.round(x - size.width / 2),
          y: Math.round(y - size.height / 2),
          width: size.width,
          height: size.height,
          rotation: 0,
          z: onMap.length,
          layer: kind === 'member' ? 'markers' : 'base',
          shape: kind === 'member' || kind === 'landmark' ? 'circle' : 'rounded',
        });
        setSelected(created.id);
        setTool('select');
        if (kind === 'member') objectEditor.show(created);
      } catch (cause) {
        toast.fromError(cause, 'Could not place that');
      }
    },
    [activeMap, objects, onMap.length, toast, objectEditor],
  );

  const toCanvas = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  if (maps.loading) {
    return (
      <>
        <PageHeader title={term('{{Headspace}} mapper')} />
        <SkeletonCards count={2} />
      </>
    );
  }

  if (maps.items.length === 0) {
    return (
      <>
        <PageHeader title={term('{{Headspace}} mapper')} />
        <Card>
          <EmptyState
            icon="headspace"
            title={term('No {{headspace}} mapped yet')}
            body={term(
              'A blank canvas for the inner world — rooms, places, who tends to be where. PluralNova does not decide what any of it means, or whether a {{headspace}} has to look like anything in particular.',
            )}
            action={{ label: 'Create a map', run: () => mapEditor.show() }}
          />
        </Card>
        <MapDialog dialog={mapEditor} maps={maps} onSaved={(id) => setMapId(id)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={term('{{Headspace}} mapper')}
        actions={
          <>
            <SegmentedControl
              value={view}
              onChange={setView}
              label="View"
              options={[
                { value: 'canvas', label: 'Canvas' },
                { value: 'analytics', label: 'Structure' },
              ]}
            />
            <Button variant="ghost" icon="plus" onClick={() => mapEditor.show()}>
              New map
            </Button>
          </>
        }
      />

      {maps.items.length > 1 ? (
        <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
          {maps.items.map((map) => (
            <Chip key={map.id} selected={activeMap?.id === map.id} onClick={() => setMapId(map.id)}>
              {String(map['name'])}
            </Chip>
          ))}
        </div>
      ) : null}

      {view === 'canvas' ? (
        <>
          <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
            <SegmentedControl
              value={tool}
              onChange={setTool}
              label="Tool"
              options={TOOLS.map(({ id, label }) => ({ value: id, label }))}
            />
            <span className="spacer" />
            <IconButton icon="minus" label="Zoom out" variant="ghost" size="sm" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} />
            <span className="tiny numeric faint" style={{ minWidth: 38, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <IconButton icon="plus" label="Zoom in" variant="ghost" size="sm" onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Reset view
            </Button>
          </div>

          {tool !== 'select' ? (
            <p className="tiny faint" style={{ marginBottom: 'var(--space-2)' }}>
              Tap anywhere on the canvas to place a {tool}.
            </p>
          ) : null}

          <Card flush style={{ overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
            <div
              ref={surface}
              style={{
                position: 'relative',
                height: '62vh',
                minHeight: 380,
                background: String(activeMap?.['background'] ?? 'var(--surface-sunken)'),
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--border) 60%, transparent) 1px, transparent 0)',
                backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
                backgroundPosition: `${pan.x}px ${pan.y}px`,
                cursor: tool === 'select' ? (panning.current ? 'grabbing' : 'grab') : 'crosshair',
                touchAction: 'none',
                overflow: 'hidden',
              }}
              onPointerDown={(event) => {
                if (tool !== 'select') {
                  const point = toCanvas(event.clientX, event.clientY);
                  void place(tool, point.x, point.y);
                  return;
                }
                if (event.target === surface.current) {
                  setSelected(null);
                  panning.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
                  // Not every WebView implements this, and this app ships as
                  // one on Android — an unguarded call would throw before the
                  // pan even starts.
                  (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
                }
              }}
              onPointerMove={(event) => {
                if (drag.current) {
                  const point = toCanvas(event.clientX, event.clientY);
                  const object = onMap.find((candidate) => candidate.id === drag.current!.id);
                  if (!object) return;
                  const next = {
                    x: Math.round(point.x - drag.current.offsetX),
                    y: Math.round(point.y - drag.current.offsetY),
                  };
                  // Moved locally while dragging; written once on release so a
                  // drag is one save rather than fifty.
                  object['x'] = next.x;
                  object['y'] = next.y;
                  setSelected(drag.current.id);
                  return;
                }
                if (panning.current) {
                  setPan({
                    x: panning.current.panX + (event.clientX - panning.current.x),
                    y: panning.current.panY + (event.clientY - panning.current.y),
                  });
                }
              }}
              onPointerUp={() => {
                if (drag.current) {
                  const object = onMap.find((candidate) => candidate.id === drag.current!.id);
                  if (object) {
                    void objects
                      .update(object.id, { x: object['x'], y: object['y'] })
                      .catch((cause: unknown) => toast.fromError(cause, 'Could not move that'));
                  }
                  drag.current = null;
                }
                panning.current = null;
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
              >
                {[...onMap]
                  .sort((a, b) => Number(a['z'] ?? 0) - Number(b['z'] ?? 0))
                  .map((object) => {
                    const kind = String(object['kind']);
                    const member = object['memberId'] ? members.get(String(object['memberId'])) : null;
                    const colour =
                      (object['color'] as string) ||
                      (member ? memberColor(member as { id: string; color?: string | null }) : 'var(--accent)');
                    const isSelected = selected === object.id;

                    return (
                      <div
                        key={object.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${kind}: ${String(object['label'] || member?.['name'] || 'unnamed')}`}
                        onPointerDown={(event) => {
                          if (tool !== 'select') return;
                          event.stopPropagation();
                          const point = toCanvas(event.clientX, event.clientY);
                          drag.current = {
                            id: object.id,
                            offsetX: point.x - Number(object['x'] ?? 0),
                            offsetY: point.y - Number(object['y'] ?? 0),
                          };
                          setSelected(object.id);
                        }}
                        onDoubleClick={() => objectEditor.show(object)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') objectEditor.show(object);
                          const step = event.shiftKey ? 20 : 4;
                          const moves: Record<string, [number, number]> = {
                            ArrowLeft: [-step, 0],
                            ArrowRight: [step, 0],
                            ArrowUp: [0, -step],
                            ArrowDown: [0, step],
                          };
                          const move = moves[event.key];
                          if (move) {
                            event.preventDefault();
                            void objects.update(object.id, {
                              x: Number(object['x'] ?? 0) + move[0],
                              y: Number(object['y'] ?? 0) + move[1],
                            });
                          }
                        }}
                        style={{
                          position: 'absolute',
                          left: Number(object['x'] ?? 0),
                          top: Number(object['y'] ?? 0),
                          width: Number(object['width'] ?? 120),
                          height: Number(object['height'] ?? 90),
                          transform: `rotate(${Number(object['rotation'] ?? 0)}deg)`,
                          borderRadius:
                            object['shape'] === 'circle' ? '50%' : kind === 'label' ? 'var(--radius-sm)' : 'var(--radius)',
                          border: `${isSelected ? 2 : 1}px solid ${isSelected ? 'var(--accent)' : colour}`,
                          background:
                            kind === 'label'
                              ? 'transparent'
                              : `color-mix(in srgb, ${colour} ${kind === 'region' ? 10 : 18}%, transparent)`,
                          display: 'flex',
                          alignItems: kind === 'room' || kind === 'region' ? 'flex-start' : 'center',
                          justifyContent: 'center',
                          padding: 6,
                          cursor: tool === 'select' ? 'move' : 'crosshair',
                          userSelect: 'none',
                          overflow: 'hidden',
                          fontSize: kind === 'label' ? 14 : 12,
                          color: 'var(--text)',
                          textAlign: 'center',
                        }}
                      >
                        {member ? (
                          <Avatar
                            name={String(member['name'])}
                            src={(member['avatarUrl'] as string) ?? null}
                            color={(member['color'] as string) ?? null}
                            icon={(member['icon'] as string) ?? null}
                            size={Math.min(Number(object['width'] ?? 56), Number(object['height'] ?? 56)) - 8}
                            round
                          />
                        ) : (
                          <span className="truncate" style={{ maxWidth: '100%' }}>
                            {object['icon'] ? `${String(object['icon'])} ` : ''}
                            {String(object['label'] ?? '')}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>

              {onMap.length === 0 ? (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                  <p className="small faint" style={{ textAlign: 'center', maxWidth: 320 }}>
                    Pick a tool above and tap the canvas to place something. There is no right way to
                    lay this out.
                  </p>
                </div>
              ) : null}
            </div>
          </Card>

          {selected ? (
            <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
              <Button
                variant="secondary"
                size="sm"
                icon="edit"
                onClick={() => {
                  const object = onMap.find((candidate) => candidate.id === selected);
                  if (object) objectEditor.show(object);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const object = onMap.find((candidate) => candidate.id === selected);
                  if (object) void objects.update(object.id, { z: Number(object['z'] ?? 0) + 1 });
                }}
              >
                Bring forward
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const object = onMap.find((candidate) => candidate.id === selected);
                  if (object) void objects.update(object.id, { rotation: (Number(object['rotation'] ?? 0) + 15) % 360 });
                }}
              >
                Rotate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="trash"
                onClick={() => {
                  const object = onMap.find((candidate) => candidate.id === selected);
                  if (object) confirm.show(object);
                }}
              >
                Delete
              </Button>
            </div>
          ) : (
            <p className="tiny faint" style={{ marginBottom: 'var(--space-4)' }}>
              Drag to move. Double-tap to edit. Arrow keys nudge the selection; hold shift to move further.
            </p>
          )}
        </>
      ) : (
        <StructureView objects={onMap} members={members} />
      )}

      <MapDialog dialog={mapEditor} maps={maps} onSaved={(id) => setMapId(id)} />

      <ObjectDialog dialog={objectEditor} objects={objects} members={members} />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Remove this from the map?"
        body="It disappears from the canvas."
        onConfirm={async () => {
          if (!confirm.value) return;
          await objects.remove(confirm.value.id);
          setSelected(null);
          toast.success('Removed');
        }}
      />
    </>
  );
}

/**
 * The same objects, read as structure: what contains what, and who is where.
 * Containment is worked out from the rectangles, so it stays true to the canvas
 * without anyone having to maintain a second model of it.
 */
function StructureView({
  objects,
  members,
}: {
  objects: StoredRecord[];
  members: Map<string, StoredRecord>;
}): JSX.Element {
  const { term } = useI18n();

  const containers = objects.filter((object) =>
    ['room', 'region', 'landmark'].includes(String(object['kind'])),
  );
  const markers = objects.filter((object) => String(object['kind']) === 'member');

  const contains = (container: StoredRecord, marker: StoredRecord): boolean => {
    const cx = Number(marker['x'] ?? 0) + Number(marker['width'] ?? 0) / 2;
    const cy = Number(marker['y'] ?? 0) + Number(marker['height'] ?? 0) / 2;
    const left = Number(container['x'] ?? 0);
    const top = Number(container['y'] ?? 0);
    return (
      cx >= left &&
      cx <= left + Number(container['width'] ?? 0) &&
      cy >= top &&
      cy <= top + Number(container['height'] ?? 0)
    );
  };

  const placed = new Set<string>();

  if (objects.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="headspace"
          title="Nothing placed yet"
          body="Once there are rooms and markers on the canvas, this view reads them back as structure."
        />
      </Card>
    );
  }

  return (
    <div className="stack">
      {containers.map((container) => {
        const inside = markers.filter((marker) => contains(container, marker));
        for (const marker of inside) placed.add(marker.id);
        return (
          <Card
            key={container.id}
            title={
              <span className="row row--nowrap" style={{ gap: 'var(--space-2)' }}>
                <span style={{ color: (container['color'] as string) || 'var(--accent)' }}>
                  <Icon name={String(container['kind']) === 'region' ? 'location' : 'grid'} size={15} />
                </span>
                {String(container['label'] || 'Unnamed')}
              </span>
            }
            subtitle={`${String(container['kind'])} · ${inside.length} ${inside.length === 1 ? 'person' : 'people'}`}
          >
            {container['description'] ? (
              <p className="small muted prose" style={{ marginBottom: 'var(--space-3)' }}>
                {String(container['description'])}
              </p>
            ) : null}
            {inside.length === 0 ? (
              <p className="tiny faint">Nobody placed in here.</p>
            ) : (
              <div className="row">
                {inside.map((marker) => {
                  const member = marker['memberId'] ? members.get(String(marker['memberId'])) : null;
                  return (
                    <Chip key={marker.id} color={(member?.['color'] as string) ?? null}>
                      {String(member?.['name'] ?? marker['label'] ?? 'Someone')}
                    </Chip>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}

      {markers.some((marker) => !placed.has(marker.id)) ? (
        <Card title="Not inside anything" subtitle="Markers that are not within a room or region">
          <div className="row">
            {markers
              .filter((marker) => !placed.has(marker.id))
              .map((marker) => {
                const member = marker['memberId'] ? members.get(String(marker['memberId'])) : null;
                return (
                  <Chip key={marker.id} color={(member?.['color'] as string) ?? null}>
                    {String(member?.['name'] ?? marker['label'] ?? 'Someone')}
                  </Chip>
                );
              })}
          </div>
          <p className="tiny faint" style={{ marginTop: 'var(--space-2)' }}>
            {term('Being outside a room is a position, not a problem.')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function MapDialog({
  dialog,
  maps,
  onSaved,
}: {
  dialog: ReturnType<typeof useDialog<StoredRecord>>;
  maps: ReturnType<typeof useCollection>;
  onSaved: (id: string) => void;
}): JSX.Element {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [background, setBackground] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="New map"
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            loading={saving}
            onClick={() => {
              setSaving(true);
              void maps
                .create({ name: name.trim(), description, background, sortOrder: 0, isDefault: false })
                .then((created) => {
                  onSaved(created.id);
                  setName('');
                  setDescription('');
                  dialog.hide();
                  toast.success('Map created');
                })
                .catch((cause: unknown) => toast.fromError(cause))
                .finally(() => setSaving(false));
            }}
          >
            Create
          </Button>
        </>
      }
    >
      <TextField label="Name" value={name} onChange={setName} required autoFocus />
      <TextField label="Description" value={description} onChange={setDescription} multiline rows={2} />
      <ColorField label="Background" value={background} onChange={setBackground} />
    </Dialog>
  );
}

function ObjectDialog({
  dialog,
  objects,
  members,
}: {
  dialog: ReturnType<typeof useDialog<StoredRecord>>;
  objects: ReturnType<typeof useCollection>;
  members: Map<string, StoredRecord>;
}): JSX.Element {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const object = dialog.value;
  if (dialog.open && object && loadedId !== object.id) {
    setLoadedId(object.id);
    setValues({
      label: object['label'] ?? '',
      description: object['description'] ?? '',
      color: object['color'] ?? '',
      icon: object['icon'] ?? '',
      memberId: object['memberId'] ?? '',
      width: object['width'] ?? 120,
      height: object['height'] ?? 90,
      shape: object['shape'] ?? 'rounded',
    });
  }
  if (!dialog.open && loadedId !== null) setLoadedId(null);

  const set = (key: string, value: unknown): void => setValues((current) => ({ ...current, [key]: value }));

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="Edit"
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!object) return;
              void objects
                .update(object.id, { ...values, memberId: values['memberId'] || null })
                .then(() => {
                  toast.success('Saved');
                  dialog.hide();
                })
                .catch((cause: unknown) => toast.fromError(cause));
            }}
          >
            Save
          </Button>
        </>
      }
    >
      {String(object?.['kind']) === 'member' ? (
        <SelectField
          label="Who"
          value={String(values['memberId'] ?? '')}
          options={[...members.values()].map((member) => ({ value: member.id, label: String(member['name']) }))}
          onChange={(value) => set('memberId', value)}
          placeholder="Nobody in particular"
        />
      ) : null}

      <TextField label="Label" value={String(values['label'] ?? '')} onChange={(value) => set('label', value)} />
      <TextField
        label="Description"
        value={String(values['description'] ?? '')}
        onChange={(value) => set('description', value)}
        multiline
        rows={2}
      />
      <TextField
        label="Symbol"
        value={String(values['icon'] ?? '')}
        onChange={(value) => set('icon', value.slice(0, 4))}
        hint="A short glyph or emoji."
      />
      <ColorField label="Colour" value={String(values['color'] ?? '')} onChange={(value) => set('color', value)} />

      <SelectField
        label="Shape"
        value={String(values['shape'] ?? 'rounded')}
        options={[
          { value: 'rounded', label: 'Rounded' },
          { value: 'circle', label: 'Circle' },
          { value: 'square', label: 'Square' },
        ]}
        onChange={(value) => set('shape', value)}
        placeholder="Rounded"
      />

      <div className="row row--nowrap">
        <TextField
          label="Width"
          type="number"
          value={String(values['width'] ?? 120)}
          onChange={(value) => set('width', Number(value))}
        />
        <TextField
          label="Height"
          type="number"
          value={String(values['height'] ?? 90)}
          onChange={(value) => set('height', Number(value))}
        />
      </div>
    </Dialog>
  );
}
