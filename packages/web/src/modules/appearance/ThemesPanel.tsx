import { useRef, useState, type ReactNode } from 'react';
import {
  BUILTIN_APPEARANCE_PRESETS,
  exportTheme,
  importTheme,
  type SavedTheme,
} from '@pluralnova/shared';
import { useAppearance } from '../../core/appearance.js';
import { useToast } from '../../core/toast.js';
import { Button, Card, Chip } from '../../ui/primitives.js';
import { TextField } from '../../ui/forms.js';
import { ConfirmDialog, useDialog } from '../../ui/overlays.js';

function swatch(theme: SavedTheme): string {
  const g = theme.global;
  const grad = g.bgGradient?.colors;
  return grad && grad.length > 1
    ? `linear-gradient(135deg, ${grad.join(', ')})`
    : `linear-gradient(135deg, ${g.bgColor ?? '#0b1020'} 50%, ${g.accent ?? '#7aa2f7'} 50%)`;
}

function ThemeTile({ theme, active, children }: { theme: SavedTheme; active: boolean; children: ReactNode }): JSX.Element {
  return (
    <div className="card" style={{ padding: 'var(--space-3)', outline: active ? '2px solid var(--accent)' : undefined }}>
      <div style={{ height: 48, borderRadius: 'var(--radius-sm)', background: swatch(theme), border: '1px solid var(--border)' }} />
      <div className="row row--between" style={{ marginTop: 'var(--space-2)' }}>
        <strong className="small">{theme.name}</strong>
        {theme.pinned ? <Chip>Pinned</Chip> : null}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>{children}</div>
    </div>
  );
}

const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 'var(--space-3)' } as const;

export function ThemesPanel(): JSX.Element {
  const a = useAppearance();
  const toast = useToast();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const deleteDialog = useDialog<SavedTheme>();
  const importRef = useRef<HTMLInputElement>(null);

  /**
   * A theme's background image is normally a path on this server
   * (`/uploads/...`), so handing the exported JSON to someone else — or
   * restoring it on a different server — would leave the image broken.
   * Inlining it as a data URI makes the export self-contained, the same
   * way the colours and gradients already are.
   */
  const inlineBackgroundImage = async (theme: SavedTheme): Promise<SavedTheme> => {
    const bgImage = theme.global.bgImage;
    if (!bgImage || bgImage.startsWith('data:')) return theme;
    try {
      const response = await fetch(bgImage);
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return { ...theme, global: { ...theme.global, bgImage: dataUrl } };
    } catch {
      // Exported without the image rather than failing the whole download —
      // every other setting still travels, and the image was already broken
      // for anyone this is shared with outside this account.
      toast.error('Could not include the background image; the rest of the theme still exported.');
      return theme;
    }
  };

  const download = async (theme: SavedTheme): Promise<void> => {
    const resolved = await inlineBackgroundImage(theme);
    const blob = new Blob([exportTheme(resolved)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${theme.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'theme'}.pluralnova-theme.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File): Promise<void> => {
    const theme = importTheme(await file.text());
    if (!theme) {
      toast.error('That file is not a PluralNova theme.');
      return;
    }
    a.importThemeObject(theme);
    toast.success(`Imported “${theme.name}”`);
  };

  return (
    <div className="stack">
      <Card title="Presets" subtitle="Starting points — every value stays editable afterwards">
        <div style={GRID}>
          {BUILTIN_APPEARANCE_PRESETS.map((theme) => (
            <ThemeTile key={theme.id} theme={theme} active={a.state.activeThemeId === theme.id}>
              <Button size="sm" variant="secondary" onClick={() => a.applyTheme(theme)}>
                Use
              </Button>
              <Button size="sm" variant="ghost" onClick={() => a.duplicateTheme(theme.id)}>
                Save copy
              </Button>
            </ThemeTile>
          ))}
        </div>
      </Card>

      <Card title="Save current look" subtitle="Turns what you see now into a reusable theme">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <TextField label="Theme name" value={name} onChange={setName} placeholder="e.g. Bonnie Purple" />
          </div>
          <Button
            variant="primary"
            onClick={() => {
              a.saveTheme(name);
              setName('');
              toast.success('Theme saved');
            }}
          >
            Save theme
          </Button>
        </div>
      </Card>

      <Card title="Your themes" subtitle={a.state.savedThemes.length ? 'Rename, duplicate, pin, export or delete' : 'Nothing saved yet'}>
        <div style={GRID}>
          {a.state.savedThemes.map((theme) => (
            <ThemeTile key={theme.id} theme={theme} active={a.state.activeThemeId === theme.id}>
              {renaming?.id === theme.id ? (
                <>
                  <TextField label="Name" value={renaming.value} onChange={(value) => setRenaming({ id: theme.id, value })} />
                  <Button size="sm" variant="primary" onClick={() => { a.renameTheme(theme.id, renaming.value); setRenaming(null); }}>
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={() => a.applyTheme(theme)}>Edit / use</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming({ id: theme.id, value: theme.name })}>Rename</Button>
                  <Button size="sm" variant="ghost" onClick={() => a.duplicateTheme(theme.id)}>Duplicate</Button>
                  <Button size="sm" variant="ghost" onClick={() => a.togglePinTheme(theme.id)}>{theme.pinned ? 'Unpin' : 'Pin'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void download(theme)}>Export</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteDialog.show(theme)}>Delete</Button>
                </>
              )}
            </ThemeTile>
          ))}
        </div>
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImport(file);
              event.target.value = '';
            }}
          />
          <Button variant="secondary" onClick={() => importRef.current?.click()}>
            Import theme file
          </Button>
        </div>
        <p className="tiny faint" style={{ marginTop: 'var(--space-2)' }}>
          Editing a saved theme: apply it, change anything, then “Save theme” again under the same name, or rename and delete the old one.
        </p>
      </Card>

      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete this theme?"
        body={`“${deleteDialog.value?.name ?? ''}” will be removed. Anything it was assigned to goes back to inheriting.`}
        confirmLabel="Delete"
        onClose={deleteDialog.hide}
        onConfirm={() => {
          if (deleteDialog.value) a.deleteTheme(deleteDialog.value.id);
          deleteDialog.hide();
        }}
      />
    </div>
  );
}
