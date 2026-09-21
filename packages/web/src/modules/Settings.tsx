import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ACCENT_PRESETS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  TERMS,
  THEME_PRESETS,
  ALL_NAV_ITEMS,
  createCustomPreset,
  sanitizeImportedPreset,
  type NotificationCategory,
  type TermOverrides,
  type ThemePreset,
} from '@pluralnova/shared';
import { api, messageFor } from '../core/api.js';
import { useQuery } from '../core/data.js';
import { useAuth } from '../core/auth.js';
import { useOptimisticSettings } from '../core/settings.js';
import { useTheme } from '../core/theme.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { disablePush, enablePush, isInstalled, pushStatus, pushSupported, sendTestNotification } from '../core/push.js';
import { syncEngine } from '../core/sync.js';
import { offlineStorageProblem, storageEstimate } from '../core/localdb.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton, ListRow, Stat } from '../ui/primitives.js';
import { NumberField, SelectField, SwitchRow, TextField } from '../ui/forms.js';
import { ColorPicker, ColorSwatch } from '../ui/ColorPicker.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { DescriptiveNote } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

/**
 * Settings.
 *
 * Everything that persists lives in one settings object saved to the server and
 * re-read from the response, so what this screen shows after a save is what was
 * actually stored. Sections are routed, so a deep link to notification settings
 * opens on notification settings.
 */

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'features' as const },
  { id: 'terminology', label: 'Terminology', icon: 'dictionary' as const },
  { id: 'notifications', label: 'Notifications', icon: 'notification' as const },
  { id: 'privacy', label: 'Privacy', icon: 'lock' as const },
  { id: 'accessibility', label: 'Accessibility', icon: 'eye' as const },
  { id: 'performance', label: 'Performance', icon: 'bolt' as const },
  { id: 'navigation', label: 'Navigation', icon: 'menu' as const },
  { id: 'account', label: 'Account', icon: 'member' as const },
  { id: 'about', label: 'About', icon: 'info' as const },
];

export default function Settings(): JSX.Element {
  const { section } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const { term } = useI18n();
  const active = SECTIONS.find((candidate) => candidate.id === section)?.id ?? 'appearance';

  return (
    <>
      <PageHeader title="Settings" description={term('How PluralNova looks, what it calls things, and what it may do.')} />

      <div className="split">
        <nav aria-label="Settings sections">
          <Card flush>
            <div className="list">
              {SECTIONS.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="list-row"
                  aria-current={active === candidate.id ? 'page' : undefined}
                  style={{ background: active === candidate.id ? 'var(--accent-soft)' : undefined }}
                  onClick={() => navigate(`/settings/${candidate.id}`)}
                >
                  <Icon name={candidate.icon} size={17} />
                  <span className="list-row__body">
                    <span className="list-row__title">{candidate.label}</span>
                  </span>
                  <Icon name="chevronRight" size={14} />
                </button>
              ))}
            </div>
          </Card>
        </nav>

        <div className="stack">
          {active === 'appearance' ? <Appearance /> : null}
          {active === 'terminology' ? <Terminology /> : null}
          {active === 'notifications' ? <Notifications /> : null}
          {active === 'privacy' ? <Privacy /> : null}
          {active === 'accessibility' ? <Accessibility /> : null}
          {active === 'performance' ? <Performance /> : null}
          {active === 'navigation' ? <Navigation /> : null}
          {active === 'account' ? <Account /> : null}
          {active === 'about' ? <About /> : null}
        </div>
      </div>
    </>
  );
}

function Appearance(): JSX.Element {
  const { settings: theme, tokens, update, reset } = useTheme();
  const { settings, saveSettings } = useAuth();
  const toast = useToast();
  const saveDialog = useDialog();
  const deleteDialog = useDialog<ThemePreset>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [presetName, setPresetName] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (saveDialog.open) setPresetName('');
  }, [saveDialog.open]);

  const customPresets = settings.customThemePresets;
  const activeDescription =
    THEME_PRESETS.find((preset) => preset.id === theme.presetId)?.description ??
    customPresets.find((preset) => preset.id === theme.presetId)?.description ??
    'Adjusted from a preset, or built from scratch below.';

  const applyPreset = (preset: ThemePreset): void => {
    void update({ ...preset.settings, presetId: preset.id });
  };

  const saveCurrentAsPreset = async (): Promise<void> => {
    const preset = createCustomPreset(presetName, theme);
    await saveSettings({ customThemePresets: [...customPresets, preset] });
    await update({ presetId: preset.id });
    saveDialog.hide();
    toast.success('Saved', `"${preset.label}" was added to your presets.`);
  };

  const duplicatePreset = async (preset: ThemePreset): Promise<void> => {
    const copy = createCustomPreset(`${preset.label} (copy)`, preset.settings);
    await saveSettings({ customThemePresets: [...customPresets, copy] });
    applyPreset(copy);
    toast.success('Duplicated', `Adjust "${copy.label}" freely — the original is untouched.`);
  };

  const deletePreset = async (preset: ThemePreset): Promise<void> => {
    await saveSettings({ customThemePresets: customPresets.filter((p) => p.id !== preset.id) });
    if (theme.presetId === preset.id) void update({ presetId: null });
    toast.success('Deleted');
  };

  const exportPreset = (preset: ThemePreset): void => {
    const payload = JSON.stringify(
      { label: preset.label, description: preset.description, settings: preset.settings },
      null,
      2,
    );
    const slug = preset.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug || 'theme'}.pluralnova-theme.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importPreset = async (file: File): Promise<void> => {
    setImporting(true);
    try {
      const preset = sanitizeImportedPreset(JSON.parse(await file.text()));
      if (!preset) throw new Error('not a theme file');
      await saveSettings({ customThemePresets: [...customPresets, preset] });
      applyPreset(preset);
      toast.success('Imported', `"${preset.label}" was added to your presets and applied.`);
    } catch (cause) {
      toast.fromError(cause, 'Could not read that file as a theme');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Card
        title="Presets"
        subtitle="A starting point you can then adjust, save your own, or bring in from a file"
      >
        <div className="row">
          {THEME_PRESETS.map((preset) => (
            <Chip key={preset.id} selected={theme.presetId === preset.id} onClick={() => applyPreset(preset)}>
              {preset.label}
            </Chip>
          ))}
        </div>
        <p className="tiny faint" style={{ marginTop: 'var(--space-2)' }}>
          {activeDescription}
        </p>

        {customPresets.length > 0 ? (
          <div className="list" style={{ marginTop: 'var(--space-4)' }}>
            {customPresets.map((preset) => (
              <ListRow
                key={preset.id}
                leading={
                  <ColorSwatch
                    color={preset.settings.accent ?? theme.accent}
                    label={`${preset.label}'s accent`}
                    size={22}
                  />
                }
                title={preset.label}
                meta={preset.description}
                trailing={
                  <div className="row row--nowrap">
                    <Button size="sm" variant="secondary" disabled={theme.presetId === preset.id} onClick={() => applyPreset(preset)}>
                      Use
                    </Button>
                    <IconButton
                      icon="duplicate"
                      label={`Duplicate ${preset.label}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => void duplicatePreset(preset)}
                    />
                    <IconButton
                      icon="download"
                      label={`Export ${preset.label}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => exportPreset(preset)}
                    />
                    <IconButton
                      icon="trash"
                      label={`Delete ${preset.label}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteDialog.show(preset)}
                    />
                  </div>
                }
              />
            ))}
          </div>
        ) : null}

        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="secondary" icon="plus" onClick={() => saveDialog.show()}>
            Save current as preset
          </Button>
          <Button variant="secondary" icon="import" loading={importing} onClick={() => fileInput.current?.click()}>
            Import a theme
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importPreset(file);
            }}
          />
        </div>
      </Card>

      <Dialog
        open={saveDialog.open}
        onClose={saveDialog.hide}
        title="Save current appearance as a preset"
        footer={
          <>
            <Button variant="ghost" onClick={saveDialog.hide}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveCurrentAsPreset()} disabled={!presetName.trim()}>
              Save
            </Button>
          </>
        }
      >
        <TextField label="Name" value={presetName} onChange={setPresetName} placeholder='e.g. "Late night"' autoFocus />
      </Dialog>

      <ConfirmDialog
        open={deleteDialog.open}
        onClose={deleteDialog.hide}
        onConfirm={async () => {
          if (deleteDialog.value) await deletePreset(deleteDialog.value);
        }}
        title={`Delete "${deleteDialog.value?.label ?? ''}"?`}
        body="This removes it from your saved presets. It stays applied until you switch to something else."
        recoverable={false}
      />

      <Card title="Base">
        <SelectField
          label="Light or dark"
          value={theme.base}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'amoled', label: 'AMOLED black' },
            { value: 'light', label: 'Light' },
          ]}
          onChange={(value) => void update({ base: value as 'dark' | 'amoled' | 'light', presetId: null })}
          placeholder="Dark"
        />

        <div className="field">
          <span className="field__label">Accent</span>
          <p className="field__hint" style={{ marginTop: 0, marginBottom: 'var(--space-2)' }}>
            Any colour — a preset, a recent one, or dial one in below. One unreadable on the
            background is adjusted until it is.
          </p>
          <ColorPicker
            value={theme.accent}
            onChange={(value) => void update({ accent: value, presetId: null })}
            presets={ACCENT_PRESETS}
            showContrastAgainst={tokens.bg}
            defaultOpen
          />
        </div>
      </Card>

      <Card title="Surfaces">
        <SelectField
          label="Card style"
          value={theme.surfaceStyle}
          options={[
            { value: 'glass', label: 'Glass — translucent, blurred' },
            { value: 'solid', label: 'Solid — opaque' },
            { value: 'clear', label: 'Clear — mostly transparent' },
          ]}
          onChange={(value) => void update({ surfaceStyle: value as 'glass' | 'solid' | 'clear', presetId: null })}
          placeholder="Glass"
        />

        {theme.surfaceStyle === 'glass' ? (
          <NumberField
            label="How solid"
            value={theme.surfaceOpacity}
            onChange={(value) => void update({ surfaceOpacity: value ?? 72 })}
            min={20}
            max={100}
            suffix="%"
          />
        ) : null}

        <SwitchRow
          label="Starfield"
          hint="A static field of stars behind everything. Off in performance mode regardless."
          checked={theme.showStarfield}
          onChange={(value) => void update({ showStarfield: value })}
        />
      </Card>

      <Card title="Start over">
        <p className="small muted prose" style={{ marginBottom: 'var(--space-3)' }}>
          Puts every appearance setting back to the default. Nothing else is affected.
        </p>
        <Button
          variant="secondary"
          icon="refresh"
          onClick={() => {
            void reset().then(() => toast.success('Appearance reset'));
          }}
        >
          Reset appearance
        </Button>
      </Card>
    </>
  );
}

function Terminology(): JSX.Element {
  const { settings, saveSettings } = useAuth();
  const { term } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<TermOverrides>(settings.terminology ?? {});
  const [saving, setSaving] = useState(false);

  const save = async (next: TermOverrides): Promise<void> => {
    setDraft(next);
    setSaving(true);
    try {
      await saveSettings({ terminology: next });
      toast.success('Saved', 'It applies everywhere in the app.');
    } catch (cause) {
      toast.fromError(cause, 'Could not save that');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card title="Your words" subtitle={term('PluralNova uses whatever this {{system}} uses.')}>
        <DescriptiveNote>
          Changing a word here changes it on every screen at once — menus, empty states, buttons and
          all. It persists across reloads, sign-outs and devices.
        </DescriptiveNote>
      </Card>

      {TERMS.map((definition) => {
        const current = draft[definition.key] ?? {};
        return (
          <Card key={definition.key} title={definition.label} subtitle={definition.hint}>
            {definition.suggestions && definition.suggestions.length > 0 ? (
              <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
                {definition.suggestions.map(([one, other]) => (
                  <Chip
                    key={one}
                    selected={(current.one ?? definition.one) === one}
                    onClick={() => void save({ ...draft, [definition.key]: { one: one!, other: other ?? one! } })}
                  >
                    {one}
                  </Chip>
                ))}
              </div>
            ) : null}

            <div className="row row--nowrap">
              <TextField
                label="One"
                value={current.one ?? definition.one}
                onChange={(value) =>
                  setDraft({ ...draft, [definition.key]: { ...current, one: value } })
                }
              />
              <TextField
                label="More than one"
                value={current.other ?? definition.other}
                onChange={(value) =>
                  setDraft({ ...draft, [definition.key]: { ...current, other: value } })
                }
              />
            </div>
            <Button variant="secondary" size="sm" loading={saving} onClick={() => void save(draft)}>
              Save this word
            </Button>
          </Card>
        );
      })}

      <Card>
        <Button
          variant="ghost"
          icon="refresh"
          onClick={() => {
            void save({});
          }}
        >
          Back to the default words
        </Button>
      </Card>
    </>
  );
}

function Notifications(): JSX.Element {
  const { settings, update } = useOptimisticSettings();
  const toast = useToast();
  const [status, setStatus] = useState<{ state: string; message: string; canAsk: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushStatus().then(setStatus);
  }, []);

  const setCategory = (
    category: NotificationCategory,
    channel: 'inApp' | 'foreground' | 'push' | 'badge',
    value: boolean,
  ): void => {
    update({
      notifications: {
        ...settings.notifications,
        [category]: { ...settings.notifications[category], [channel]: value },
      },
    });
  };

  return (
    <>
      <Card title="On this device">
        <p className="small muted prose" style={{ marginBottom: 'var(--space-3)' }}>
          {status?.message ?? 'Checking…'}
        </p>

        <div className="row">
          {status?.canAsk ? (
            <Button
              variant="primary"
              icon="notification"
              loading={busy}
              onClick={() => {
                setBusy(true);
                void enablePush()
                  .then((result) => {
                    setStatus(result);
                    if (result.state === 'subscribed') toast.success('Notifications are on');
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Turn on notifications
            </Button>
          ) : null}

          {status?.state === 'subscribed' ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  void sendTestNotification()
                    .then(() => toast.success('Sent', 'It should arrive in a moment.'))
                    .catch((cause: unknown) => toast.fromError(cause, 'The test did not send'));
                }}
              >
                Send a test
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void disablePush().then(() => {
                    void pushStatus().then(setStatus);
                    toast.info('Push turned off for this device');
                  });
                }}
              >
                Turn off on this device
              </Button>
            </>
          ) : null}
        </div>

        {!isInstalled() && pushSupported() ? (
          <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
            Installing PluralNova to your home screen makes notifications behave like an app's rather
            than a browser tab's.
          </p>
        ) : null}
      </Card>

      <Card title="Globally">
        <SwitchRow
          label="Notifications outside the app"
          hint="Off means only the in-app notification centre. Nothing is lost either way."
          checked={settings.notificationsEnabled}
          onChange={(value) => {
            update({ notificationsEnabled: value });
          }}
        />
        <SwitchRow
          label="Quiet hours"
          hint="Holds push notifications overnight. They still arrive in the app."
          checked={settings.quietHours.enabled}
          onChange={(value) => {
            update({ quietHours: { ...settings.quietHours, enabled: value } });
          }}
        />
        {settings.quietHours.enabled ? (
          <div className="row row--nowrap">
            <TextField
              label="From"
              type="time"
              value={settings.quietHours.from}
              onChange={(value) => {
                update({ quietHours: { ...settings.quietHours, from: value } });
              }}
            />
            <TextField
              label="Until"
              type="time"
              value={settings.quietHours.to}
              onChange={(value) => {
                update({ quietHours: { ...settings.quietHours, to: value } });
              }}
            />
          </div>
        ) : null}
      </Card>

      <Card title="What you are told about" subtitle="Each category, on each channel">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--size-sm)' }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--text-muted)' }}>
                  Category
                </th>
                {(['inApp', 'foreground', 'push', 'badge'] as const).map((channel) => (
                  <th
                    key={channel}
                    scope="col"
                    style={{ padding: 'var(--space-2)', color: 'var(--text-muted)', fontWeight: 'var(--weight-medium)' }}
                  >
                    {channel === 'inApp' ? 'In app' : channel === 'foreground' ? 'While open' : channel === 'push' ? 'Push' : 'Badge'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_CATEGORIES.map((category) => (
                <tr key={category}>
                  <th
                    scope="row"
                    style={{
                      textAlign: 'left',
                      padding: 'var(--space-2)',
                      borderTop: 'var(--border-width) solid var(--border)',
                      fontWeight: 'var(--weight-normal)',
                    }}
                  >
                    {NOTIFICATION_CATEGORY_LABELS[category]}
                  </th>
                  {(['inApp', 'foreground', 'push', 'badge'] as const).map((channel) => (
                    <td
                      key={channel}
                      style={{ padding: 'var(--space-2)', borderTop: 'var(--border-width) solid var(--border)', textAlign: 'center' }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.notifications[category][channel]}
                        onChange={(event) => setCategory(category, channel, event.target.checked)}
                        aria-label={`${NOTIFICATION_CATEGORY_LABELS[category]} — ${channel}`}
                        style={{ accentColor: 'var(--accent)', width: 18, height: 18 }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
          Every one of these saves immediately and is read back from the server, so what you see here
          is what is actually stored.
        </p>
      </Card>
    </>
  );
}

function Privacy(): JSX.Element {
  const { settings, update } = useOptimisticSettings();
  const { term } = useI18n();

  const set = (patch: Partial<typeof settings.privacy>): void => {
    update({ privacy: { ...settings.privacy, ...patch } });
  };

  return (
    <>
      <Card title="Defaults for new records">
        <SelectField
          label="Who can see something new by default"
          value={settings.privacy.defaultVisibility}
          options={[
            { value: 'private', label: 'Only me' },
            { value: 'system', label: term('The whole {{system}}') },
            { value: 'friends', label: 'Friends' },
          ]}
          onChange={(value) => set({ defaultVisibility: value as 'private' | 'system' | 'friends' })}
          placeholder="Only me"
        />
        <DescriptiveNote>
          Records marked never-public in PluralNova's data model — the vault, emergency contacts,
          finances, work, locations — stay private whatever this is set to.
        </DescriptiveNote>
      </Card>

      <Card title="What leaves the app">
        <SwitchRow
          label="Message previews in notifications"
          hint="Off means a notification says a message arrived without saying what it said."
          checked={settings.privacy.showMessagePreviews}
          onChange={(value) => set({ showMessagePreviews: value })}
        />
        <SwitchRow
          label="Allow precise location fields"
          hint="Off hides the coordinate fields entirely. Nothing is ever captured automatically."
          checked={settings.privacy.allowPreciseLocation}
          onChange={(value) => set({ allowPreciseLocation: value })}
        />
      </Card>

      <Card title="Locks">
        <SwitchRow
          label={term('Ask for a PIN when switching to a {{member}} who has one')}
          checked={settings.privacy.requireProfilePins}
          onChange={(value) => set({ requireProfilePins: value })}
        />
        <NumberField
          label="Lock the vault after"
          value={settings.privacy.vaultAutoLockMinutes}
          onChange={(value) => set({ vaultAutoLockMinutes: Math.max(1, value ?? 5) })}
          min={1}
          max={240}
          suffix="minutes"
        />
      </Card>
    </>
  );
}

function Accessibility(): JSX.Element {
  const { settings: theme, update } = useTheme();
  const toast = useToast();

  return (
    <Card title="Accessibility">
      <SwitchRow
        label="High contrast"
        hint="Stronger text, borders and surfaces throughout."
        checked={theme.highContrast}
        onChange={(value) => void update({ highContrast: value }).then(() => toast.success('Saved'))}
      />
      <SwitchRow
        label="Reduce motion"
        hint="Removes transitions and animation. Your system preference is honoured either way."
        checked={theme.reducedMotion}
        onChange={(value) => void update({ reducedMotion: value })}
      />
      <SwitchRow
        label="Larger text"
        checked={theme.largeText}
        onChange={(value) => void update({ largeText: value })}
      />
      <NumberField
        label="Text size"
        value={theme.textScale}
        onChange={(value) => void update({ textScale: value ?? 100 })}
        min={80}
        max={160}
        suffix="%"
      />

      <DescriptiveNote>
        Every status in PluralNova pairs a colour with a word or a glyph, so nothing depends on being
        able to tell two hues apart. Charts all offer a table view of the same numbers.
      </DescriptiveNote>
    </Card>
  );
}

function Performance(): JSX.Element {
  const { settings, update } = useOptimisticSettings();
  const { settings: theme, update: updateTheme } = useTheme();
  const toast = useToast();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    void storageEstimate().then(setStorage);
  }, []);

  return (
    <>
      <Card title="Effects" subtitle="What the device has to draw. None of it changes what the app can do.">
        <SelectField
          label="Visual effects"
          value={theme.effects}
          options={[
            { value: 'full', label: 'Full — blur, glow, starfield, motion' },
            { value: 'balanced', label: 'Balanced — lighter blur, less motion' },
            { value: 'performance', label: 'Performance — no blur, no motion, no starfield' },
          ]}
          onChange={(value) =>
            void updateTheme({ effects: value as 'full' | 'balanced' | 'performance' })
          }
          placeholder="Full"
        />

        <SwitchRow
          label="Performance mode"
          hint="Forces the lowest effect tier without discarding the one you chose."
          checked={settings.performanceMode}
          onChange={(value) => {
            update({ performanceMode: value });
          }}
        />

        <SwitchRow
          label="Low-end sign-in screen"
          hint="Skips the background on the sign-in screen, for older phones."
          checked={settings.lowEndLogin}
          onChange={(value) => {
            update({ lowEndLogin: value });
          }}
        />
      </Card>

      <Card title="Data on this device">
        <SwitchRow
          label="Sync across devices"
          hint="Off keeps everything on this device only. Nothing is deleted when you turn it back on."
          checked={settings.syncEnabled}
          onChange={(value) => {
            update({ syncEnabled: value });
          }}
        />

        {storage ? (
          <div className="stat-grid" style={{ marginTop: 'var(--space-3)' }}>
            <Stat label="Used here" value={`${Math.round(storage.usage / 1024 / 1024)} MB`} />
            <Stat label="Available" value={`${Math.round(storage.quota / 1024 / 1024)} MB`} />
          </div>
        ) : null}

        {offlineStorageProblem() ? (
          <p className="small" style={{ color: 'var(--caution)', marginTop: 'var(--space-3)' }}>
            {offlineStorageProblem()} PluralNova still works, but it will need a connection for
            everything.
          </p>
        ) : null}

        <Button
          variant="secondary"
          icon="refresh"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => {
            void syncEngine.run().then(() => toast.success('Synced'));
          }}
        >
          Sync now
        </Button>
      </Card>
    </>
  );
}

function Navigation(): JSX.Element {
  const { saveSettings } = useAuth();
  const { settings, update } = useOptimisticSettings();
  const { term } = useI18n();
  const toast = useToast();

  const available = ALL_NAV_ITEMS.filter(
    (item) => settings.mode === 'system' || !item.systemOnly,
  );
  const tabs = settings.mobileTabs.length >= 3 ? settings.mobileTabs : ['dashboard', 'journal', 'tasks', 'calendar', 'more'];

  const setTab = (index: number, id: string): void => {
    const next = [...tabs];
    next[index] = id;
    update({ mobileTabs: next });
  };

  return (
    <>
      <Card title="Mode">
        <SelectField
          label="How you use PluralNova"
          value={settings.mode}
          options={[
            { value: 'system', label: term('System Mode — {{members}}, {{fronting}} and all') },
            { value: 'singlet', label: term('Singlet Mode — {{system}} features hidden') },
          ]}
          onChange={(value) => {
            void saveSettings({ mode: value as 'system' | 'singlet' }).then(() =>
              toast.success('Saved', 'Nothing was deleted — switching back brings it all straight back.'),
            );
          }}
          placeholder="System Mode"
        />
        <DescriptiveNote>
          Singlet Mode hides the {term('{{system}}')}-specific screens. Your data stays exactly where it
          is, and switching back restores every screen with everything in it.
        </DescriptiveNote>
      </Card>

      <Card title="Bottom bar" subtitle="The five slots on a phone">
        {tabs.slice(0, 5).map((id, index) => (
          <SelectField
            key={index}
            label={`Slot ${index + 1}`}
            value={id}
            options={[
              ...available.map((item) => ({ value: item.id, label: term(item.label) })),
              { value: 'more', label: 'More' },
            ]}
            onChange={(value) => setTab(index, value)}
            placeholder="Choose a screen"
          />
        ))}
      </Card>
    </>
  );
}

function Account(): JSX.Element {
  const { user, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const passwordDialog = useDialog();
  const claimDialog = useDialog();
  const deleteDialog = useDialog();

  const [sessions, setSessions] = useState<{ id: string; userAgent: string | null; lastSeenAt: string; current: boolean }[]>([]);

  useEffect(() => {
    void api
      .get<{ id: string; userAgent: string | null; lastSeenAt: string; current: boolean }[]>('/api/auth/sessions')
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  return (
    <>
      <Card title="Account">
        <div className="stat-grid">
          <Stat label="Name" value={user?.displayName ?? '—'} />
          <Stat label="Email" value={user?.email || 'Not set'} />
          <Stat label="Mode" value={user?.mode === 'singlet' ? 'Singlet' : 'System'} />
        </div>

        {user?.isGuest ? (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <p className="small prose muted" style={{ marginBottom: 'var(--space-3)' }}>
              This is a demo account. Turning it into a real one keeps everything that is already here.
            </p>
            <Button variant="primary" onClick={() => claimDialog.show()}>
              Keep this data and create an account
            </Button>
          </div>
        ) : (
          <div className="row" style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="secondary" onClick={() => passwordDialog.show()}>
              Change password
            </Button>
          </div>
        )}
      </Card>

      {sessions.length > 0 ? (
        <Card title="Signed in" subtitle="Everywhere this account is open" flush>
          <div className="list">
            {sessions.map((session) => (
              <div key={session.id} className="list-row">
                <Icon name="device" size={17} />
                <span className="list-row__body">
                  <span className="list-row__title">
                    {session.userAgent?.slice(0, 48) ?? 'A device'}
                    {session.current ? <span className="faint"> · this one</span> : null}
                  </span>
                  <span className="list-row__meta">{new Date(session.lastSeenAt).toLocaleString()}</span>
                </span>
                {!session.current ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void api.delete(`/api/auth/sessions/${session.id}`).then(() => {
                        setSessions((current) => current.filter((row) => row.id !== session.id));
                        toast.success('Signed out there');
                      });
                    }}
                  >
                    Sign out
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="Your data">
        <div className="row">
          <Button variant="secondary" icon="download" onClick={() => navigate('/backup')}>
            Export everything
          </Button>
          <Button variant="ghost" icon="import" onClick={() => navigate('/import')}>
            Import
          </Button>
        </div>
      </Card>

      <Card title="Leaving">
        <div className="row">
          <Button variant="secondary" icon="logout" onClick={() => void signOut()}>
            Sign out
          </Button>
          <Button variant="danger" icon="trash" onClick={() => deleteDialog.show()}>
            Delete account
          </Button>
        </div>
        <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
          Export a backup before deleting. Deletion removes the account and everything in it.
        </p>
      </Card>

      <PasswordDialog dialog={passwordDialog} />
      <ClaimDialog dialog={claimDialog} onDone={() => void refresh()} />

      <ConfirmDialog
        open={deleteDialog.open}
        onClose={deleteDialog.hide}
        title="Delete this account?"
        body="Everything in it goes: members, journals, fronting history, messages, all of it. Export a backup first if there is anything you want to keep."
        confirmLabel="Delete for good"
        typeToConfirm="DELETE"
        recoverable={false}
        onConfirm={async () => {
          await api.delete('/api/auth/me', undefined, { body: { confirm: 'DELETE' } });
          await signOut();
        }}
      />
    </>
  );
}

function PasswordDialog({ dialog }: { dialog: ReturnType<typeof useDialog<true>> }): JSX.Element {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="Change password"
      description="Every other device is signed out."
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!current || next.length < 10}
            onClick={() => {
              setBusy(true);
              setError(null);
              void api
                .post('/api/auth/change-password', { currentPassword: current, password: next })
                .then(() => {
                  toast.success('Password changed');
                  setCurrent('');
                  setNext('');
                  dialog.hide();
                })
                .catch((cause: unknown) => setError(messageFor(cause)))
                .finally(() => setBusy(false));
            }}
          >
            Change it
          </Button>
        </>
      }
    >
      <TextField label="Current password" type="password" value={current} onChange={setCurrent} />
      <TextField
        label="New password"
        type="password"
        value={next}
        onChange={setNext}
        hint="At least 10 characters, with a number or symbol."
        {...(error ? { error } : {})}
      />
    </Dialog>
  );
}

function ClaimDialog({
  dialog,
  onDone,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  onDone: () => void;
}): JSX.Element {
  const { claimGuest } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="Create a real account"
      description="Everything already in this demo account is kept."
      footer={
        recoveryCode ? (
          <Button
            variant="primary"
            block
            onClick={() => {
              setRecoveryCode(null);
              dialog.hide();
              onDone();
            }}
          >
            I have saved it
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={dialog.hide}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!email.trim() || password.length < 10}
              onClick={() => {
                setBusy(true);
                setError(null);
                void claimGuest({ email: email.trim(), password })
                  .then((result) => {
                    toast.success('Account created');
                    if (result.recoveryCode) setRecoveryCode(result.recoveryCode);
                    else {
                      dialog.hide();
                      onDone();
                    }
                  })
                  .catch((cause: unknown) => setError(messageFor(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              Create
            </Button>
          </>
        )
      }
    >
      {recoveryCode ? (
        <>
          <p className="prose small" style={{ marginBottom: 'var(--space-4)' }}>
            Save this recovery code somewhere safe. It is shown once and stored in a form we cannot
            read.
          </p>
          <div
            className="card"
            style={{ fontFamily: 'var(--font-mono)', textAlign: 'center', letterSpacing: '0.08em', userSelect: 'all' }}
          >
            {recoveryCode}
          </div>
        </>
      ) : (
        <>
          <TextField label="Email" type="email" value={email} onChange={setEmail} autoFocus />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            hint="At least 10 characters, with a number or symbol."
            {...(error ? { error } : {})}
          />
        </>
      )}
    </Dialog>
  );
}

function About(): JSX.Element {
  const navigate = useNavigate();
  const { term } = useI18n();
  const { locale, locales } = useI18n();
  const { update } = useOptimisticSettings();

  return (
    <>
      <Card title="Language">
        <SelectField
          label="Language"
          value={locale}
          options={locales.map((entry) => ({
            value: entry.code,
            label: `${entry.label}${entry.coverage < 100 ? ` — ${entry.coverage}% translated` : ''}`,
          }))}
          onChange={(value) => {
            update({ locale: value });
          }}
          placeholder="English"
        />
        <p className="tiny faint">
          Anything not yet translated falls back to English rather than showing a blank. Terminology
          you set applies on top of whichever language is chosen.
        </p>
      </Card>

      <Card title="PluralNova">
        <p className="prose small muted">
          {term(
            'A private place for a {{system}} to keep track of itself. Your data stays yours: export it whenever you like, import it into whatever you like, and delete it when you are done.',
          )}
        </p>
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="secondary" onClick={() => navigate('/features')}>
            What is in it
          </Button>
          <Button variant="ghost" onClick={() => navigate('/help')}>
            Help
          </Button>
        </div>
      </Card>

      <AndroidDownload />
    </>
  );
}

/**
 * The Android build, when this server has one.
 *
 * Hidden entirely otherwise — most people will install PluralNova from their
 * browser, and an empty "download the app" card on a server that publishes no
 * app would be a dead end rather than an option.
 */
function AndroidDownload(): JSX.Element | null {
  const release = useQuery<{
    release: { versionName: string; size: number; sha256: string; url: string; notes?: string } | null;
  }>('/api/app/android');

  const build = release.data?.release;
  if (!build) return null;

  return (
    <Card
      title="Android app"
      subtitle={`Version ${build.versionName} · ${Math.round(build.size / 1024 / 1024)} MB`}
    >
      <p className="prose small muted">
        The same PluralNova, installed from this server rather than from a store. It updates itself
        from here too. You can also install the web version from your browser's menu, which works on
        every platform and is the simpler option if you are not sure.
      </p>

      {build.notes ? (
        <p className="small" style={{ marginTop: 'var(--space-3)' }}>
          {build.notes}
        </p>
      ) : null}

      <div className="row" style={{ marginTop: 'var(--space-4)' }}>
        <Button variant="secondary" icon="download" onClick={() => window.open(build.url, '_blank')}>
          Download the APK
        </Button>
      </div>

      <p className="tiny faint" style={{ marginTop: 'var(--space-3)', wordBreak: 'break-all' }}>
        SHA-256 {build.sha256}
      </p>
    </Card>
  );
}
