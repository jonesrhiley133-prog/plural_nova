import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEFAULT_CHAT_CATEGORIES, allThemes, newId, pinnedThemes } from '@pluralnova/shared';
import { api } from '../core/api.js';
import { useAppearance } from '../core/appearance.js';
import { useCollection } from '../core/data.js';
import { useToast } from '../core/toast.js';
import { uploadBackground } from '../modules/appearance/imageUpload.js';
import { Avatar, Button, Card, Chip, SegmentedControl } from '../ui/primitives.js';
import { ColorField, FileButton, SearchField, SelectField, SwitchRow, TextField } from '../ui/forms.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { CHAT_COLORS, CHAT_EMOJI, CHAT_SYMBOLS, ChatIcon, generatedIcon, type ChatIconValue } from './ChatIcon.js';

type Who = 'everyone' | 'creator';
const WHO_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'creator', label: 'Only me (the creator)' },
] as const;

/**
 * Full-page group creation: header (icon + name), category, members, settings,
 * then a preview step before anything is created.
 */
export default function NewGroupPage(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const appearance = useAppearance();
  const members = useCollection('members');
  const preselected = (location.state as { members?: string[] } | null)?.members ?? [];

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<ChatIconValue>(() => generatedIcon('new'));
  const [category, setCategory] = useState('none');
  const [newCategory, setNewCategory] = useState('');
  const [everyone, setEveryone] = useState(preselected.length === 0);
  const [selected, setSelected] = useState<string[]>(preselected);
  const [query, setQuery] = useState('');
  const [description, setDescription] = useState('');
  const [themeId, setThemeId] = useState('');
  const [bubble, setBubble] = useState('');
  const [wallpaperColor, setWallpaperColor] = useState('');
  const [wallpaperImage, setWallpaperImage] = useState('');
  const [notifications, setNotifications] = useState<'all' | 'mentions' | 'none'>('all');
  const [canMessage, setCanMessage] = useState<Who>('everyone');
  const [canRename, setCanRename] = useState<Who>('everyone');
  const [canChangeIcon, setCanChangeIcon] = useState<Who>('everyone');
  const [canManageMembers, setCanManageMembers] = useState<Who>('everyone');
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  const [busy, setBusy] = useState(false);
  const iconDialog = useDialog();

  const roster = useMemo(() => members.items.filter((m) => m['archived'] !== true), [members.items]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? roster.filter((m) => String(m['name'] ?? '').toLowerCase().includes(needle)) : roster;
  }, [roster, query]);
  const chosen = everyone ? roster : roster.filter((m) => selected.includes(m.id));
  const categories = [...DEFAULT_CHAT_CATEGORIES, ...appearance.state.chatCategories];
  const categoryLabel = categories.find((c) => c.id === category)?.label ?? 'None';
  const pinned = pinnedThemes(appearance.state);

  const toggle = (id: string): void => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const valid = name.trim().length > 0 && (everyone || selected.length > 0);

  const addCategory = (): void => {
    const label = newCategory.trim();
    if (!label) return;
    const existing = categories.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      setCategory(existing.id);
    } else {
      const created = { id: newId('cat'), label };
      appearance.update({ chatCategories: [...appearance.state.chatCategories, created] });
      setCategory(created.id);
    }
    setNewCategory('');
  };

  const create = async (): Promise<void> => {
    setBusy(true);
    try {
      const wallpaper = wallpaperImage ? `center / cover no-repeat url("${wallpaperImage}")` : wallpaperColor || null;
      const thread = await api.post<{ id: string }>('/api/records/systemChatThreads', {
        id: newId('sct'),
        kind: 'group',
        name: name.trim(),
        // Empty means "everyone in the system", including alters added later.
        participantMemberIds: everyone ? [] : selected,
        pinned: false,
        muted: notifications === 'none',
        archived: false,
        lastMessageAt: new Date().toISOString(),
        lastMessagePreview: 'Group created',
        settings: {
          icon,
          category,
          description: description.trim(),
          notifications,
          permissions: { messages: canMessage, rename: canRename, icon: canChangeIcon, members: canManageMembers },
          appearance: { wallpaper, bubbleMine: bubble || null, bubbleTheirs: null, spacing: 'cozy' },
        },
      });
      if (themeId) appearance.assign('chat', thread.id, themeId);
      toast.success('Group created');
      navigate(`/system/chat/${thread.id}`, { replace: true });
    } catch (cause) {
      toast.fromError(cause, 'Could not create the group');
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------ preview ------------------------------ */
  if (step === 'preview') {
    return (
      <div className="stack" style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-4)' }}>
        <h1 style={{ margin: 0 }}>Preview</h1>
        <Card>
          <div className="row" style={{ alignItems: 'center', gap: 'var(--space-4)' }}>
            <ChatIcon icon={icon} size={72} />
            <div>
              <h2 style={{ margin: 0 }}>{name}</h2>
              <p className="small muted" style={{ margin: 0 }}>
                {categoryLabel} · {everyone ? `Everyone (${roster.length})` : `${chosen.length} alter${chosen.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          {description ? <p className="small" style={{ marginTop: 'var(--space-3)' }}>{description}</p> : null}
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
            {chosen.slice(0, 12).map((m) => (
              <Avatar key={m.id} name={String(m['name'])} src={(m['avatarUrl'] as string) ?? null} color={(m['color'] as string) ?? null} size={30} round />
            ))}
          </div>
        </Card>
        <div
          style={{
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: wallpaperImage ? `center / cover no-repeat url("${wallpaperImage}")` : wallpaperColor || 'var(--surface-sunken)',
          }}
        >
          <div style={{ background: bubble || 'var(--accent)', color: '#05070d', padding: '8px 12px', borderRadius: 16, width: 'fit-content', marginLeft: 'auto' }}>
            Hello, everyone!
          </div>
        </div>
        <Card title="Settings">
          <ul className="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
            <li>Notifications: {notifications}</li>
            <li>Theme: {allThemes(appearance.state).find((t) => t.id === themeId)?.name ?? 'Inherits'}</li>
            <li>Can message: {canMessage === 'everyone' ? 'Everyone' : 'Only me'}</li>
            <li>Can rename / change icon / manage members: {[canRename, canChangeIcon, canManageMembers].map((w) => (w === 'everyone' ? 'Everyone' : 'Only me')).join(' / ')}</li>
          </ul>
        </Card>
        <div className="row row--between">
          <Button variant="ghost" onClick={() => setStep('edit')}>
            Back to edit
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void create()}>
            Create group
          </Button>
        </div>
      </div>
    );
  }

  /* ------------------------------ editor ------------------------------ */
  return (
    <div className="stack" style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-4)' }}>
      <div className="row row--between">
        <Button variant="ghost" onClick={() => navigate('/system/chat')}>
          <Icon name="chevronLeft" size={16} /> Cancel
        </Button>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>New group</h1>
        <Button variant="primary" disabled={!valid} onClick={() => setStep('preview')}>
          Preview
        </Button>
      </div>

      <div className="row" style={{ alignItems: 'flex-end', gap: 'var(--space-3)' }}>
        <button type="button" aria-label="Choose chat icon" onClick={() => iconDialog.show()} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
          <ChatIcon icon={icon} size={64} />
        </button>
        <div style={{ flex: 1 }}>
          <TextField label="Chat name" value={name} onChange={setName} placeholder="Name this group" required maxLength={60} autoFocus />
        </div>
      </div>

      <Card title="Category">
        <SelectField
          label="Category"
          value={category}
          onChange={setCategory}
          options={[{ value: 'none', label: 'None' }, ...categories.map((c) => ({ value: c.id, label: c.label }))]}
        />
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 'var(--space-2)' }}>
          <div style={{ flex: 1 }}>
            <TextField label="New custom category" value={newCategory} onChange={setNewCategory} placeholder="e.g. Rituals" />
          </div>
          <Button variant="secondary" onClick={addCategory}>
            Add
          </Button>
        </div>
      </Card>

      <Card title="Members">
        <SwitchRow
          label="Include everyone"
          hint={everyone ? 'All alters belong to this chat, including ones added later.' : 'Choose which alters are in this chat.'}
          checked={everyone}
          onChange={setEveryone}
        />
        {!everyone ? (
          <div className="stack" style={{ marginTop: 'var(--space-3)' }}>
            <SearchField value={query} onChange={setQuery} placeholder="Search alters" />
            <div className="row">
              <Button size="sm" variant="secondary" onClick={() => setSelected(roster.map((m) => m.id))}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Deselect all</Button>
              <span className="tiny faint">{selected.length} selected</span>
            </div>
            {selected.length > 0 ? (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {roster.filter((m) => selected.includes(m.id)).map((m) => (
                  <Chip key={m.id} onClick={() => toggle(m.id)}>
                    <Avatar name={String(m['name'])} src={(m['avatarUrl'] as string) ?? null} color={(m['color'] as string) ?? null} size={18} round /> {String(m['name'])} ✕
                  </Chip>
                ))}
              </div>
            ) : null}
            <div className="chat-picker-list">
              {shown.map((m) => {
                const on = selected.includes(m.id);
                return (
                  <button key={m.id} type="button" className="chat-picker-row" aria-pressed={on} onClick={() => toggle(m.id)}>
                    <span className="chat-picker-row__avatar">
                      <Avatar name={String(m['name'])} src={(m['avatarUrl'] as string) ?? null} color={(m['color'] as string) ?? null} size={34} round />
                    </span>
                    <span className="chat-picker-row__body"><span className="chat-picker-row__name">{String(m['name'])}</span></span>
                    <span className="chat-picker-row__check" aria-hidden="true">{on ? <Icon name="check" size={16} /> : null}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </Card>

      <Card title="Group settings">
        <div className="stack">
          <TextField label="Description" value={description} onChange={setDescription} multiline rows={2} maxLength={280} />
          <SelectField
            label="Group theme"
            value={themeId}
            onChange={setThemeId}
            options={[{ value: '', label: 'None — inherit' }, ...allThemes(appearance.state).map((t) => ({ value: t.id, label: t.name }))]}
          />
          {pinned.length > 0 ? (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="tiny faint">Pinned themes:</span>
              {pinned.map((t) => (
                <Chip key={t.id} onClick={() => setThemeId(t.id)}>★ {t.name}</Chip>
              ))}
            </div>
          ) : null}
          <ColorField label="Chat bubble colour" value={bubble || '#7aa2f7'} onChange={setBubble} />
          <ColorField label="Chat background colour" value={wallpaperColor || '#0b1020'} onChange={(v) => { setWallpaperColor(v); setWallpaperImage(''); }} />
          <div className="row">
            <FileButton
              label={wallpaperImage ? 'Change wallpaper' : 'Custom wallpaper'}
              accept="image/*"
              onFile={(file) => void uploadBackground(file).then(setWallpaperImage).catch((c) => toast.fromError(c, 'Could not add that image'))}
            />
            {wallpaperImage ? <Button variant="ghost" size="sm" onClick={() => setWallpaperImage('')}>Remove</Button> : null}
          </div>
          <SegmentedControl
            label="Notifications"
            value={notifications}
            onChange={setNotifications}
            options={[{ value: 'all', label: 'All' }, { value: 'mentions', label: 'Mentions' }, { value: 'none', label: 'Muted' }]}
          />
          <SelectField label="Who can send messages" value={canMessage} onChange={(v) => setCanMessage(v as Who)} options={WHO_OPTIONS} />
          <SelectField label="Who can rename the group" value={canRename} onChange={(v) => setCanRename(v as Who)} options={WHO_OPTIONS} />
          <SelectField label="Who can change the icon" value={canChangeIcon} onChange={(v) => setCanChangeIcon(v as Who)} options={WHO_OPTIONS} />
          <SelectField label="Who can add / remove participants" value={canManageMembers} onChange={(v) => setCanManageMembers(v as Who)} options={WHO_OPTIONS} />
        </div>
      </Card>

      <Dialog open={iconDialog.open} onClose={iconDialog.hide} title="Chat icon">
        <IconChooser
          value={icon}
          seed={name || 'new'}
          onPick={(next) => {
            setIcon(next);
            iconDialog.hide();
          }}
        />
      </Dialog>
    </div>
  );
}

function IconChooser({ value, seed, onPick }: { value: ChatIconValue; seed: string; onPick: (icon: ChatIconValue) => void }): JSX.Element {
  const toast = useToast();
  const [tab, setTab] = useState<'emoji' | 'symbol' | 'image' | 'generated'>(value.type);
  const [color, setColor] = useState(value.color ?? CHAT_COLORS[0]!);
  const [glyph, setGlyph] = useState(value.type === 'generated' ? value.value : CHAT_SYMBOLS[0]!);
  const [uploading, setUploading] = useState(false);
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 8 } as const;
  const cell = { fontSize: 24, padding: 6, background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' } as const;

  return (
    <div className="stack">
      <SegmentedControl
        label="Icon type"
        value={tab}
        onChange={setTab}
        options={[{ value: 'emoji', label: 'Emoji' }, { value: 'symbol', label: 'Symbol' }, { value: 'image', label: 'Image' }, { value: 'generated', label: 'Generated' }]}
      />
      {tab === 'emoji' ? (
        <div style={grid}>
          {CHAT_EMOJI.map((e) => (
            <button key={e} type="button" style={cell} onClick={() => onPick({ type: 'emoji', value: e, color: color })}>{e}</button>
          ))}
        </div>
      ) : null}
      {tab === 'symbol' ? (
        <div style={grid}>
          {CHAT_SYMBOLS.map((s) => (
            <button key={s} type="button" style={cell} onClick={() => onPick({ type: 'symbol', value: s, color })}>{s}</button>
          ))}
        </div>
      ) : null}
      {tab === 'image' ? (
        <FileButton
          label={uploading ? 'Uploading…' : 'Upload an image'}
          accept="image/*"
          onFile={(file) => {
            setUploading(true);
            uploadBackground(file)
              .then((url) => onPick({ type: 'image', value: url }))
              .catch((c) => toast.fromError(c, 'Could not upload that image'))
              .finally(() => setUploading(false));
          }}
        />
      ) : null}
      {tab === 'generated' ? (
        <div className="stack">
          <ChatIcon icon={{ type: 'generated', value: glyph, color }} size={64} />
          <div style={grid}>
            {CHAT_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColor(c)} style={{ ...cell, background: c, outline: color === c ? '2px solid var(--text)' : undefined, height: 40 }} />
            ))}
          </div>
          <div style={grid}>
            {CHAT_SYMBOLS.map((s) => (
              <button key={s} type="button" style={cell} onClick={() => setGlyph(s)}>{s}</button>
            ))}
          </div>
          <div className="row">
            <Button variant="ghost" size="sm" onClick={() => { const g = generatedIcon(seed + Math.random()); setColor(g.color!); setGlyph(g.value); }}>Shuffle</Button>
            <Button variant="primary" onClick={() => onPick({ type: 'generated', value: glyph, color })}>Use this icon</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
