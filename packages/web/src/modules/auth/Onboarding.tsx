import { useMemo, useState } from 'react';
import {
  ACCENT_PRESETS,
  TERMS,
  THEME_PRESETS,
  type TermOverrides,
} from '@pluralnova/shared';
import { useAuth } from '../../core/auth.js';
import { useI18n } from '../../core/i18n.js';
import { useTheme } from '../../core/theme.js';
import { useToast } from '../../core/toast.js';
import { api, messageFor } from '../../core/api.js';
import { enablePush, pushSupported } from '../../core/push.js';
import { Atmosphere, Logo } from '../../app/Atmosphere.js';
import { Button, Card, Chip, Meter } from '../../ui/primitives.js';
import { TextField, SwitchRow } from '../../ui/forms.js';
import { ColorPicker } from '../../ui/ColorPicker.js';
import { Icon } from '../../ui/Icon.js';

/**
 * First run.
 *
 * Nine short steps, all skippable except choosing a mode. The order matters:
 * the app explains what it does with data before it asks for any, and it asks
 * for the system's own words before it starts using words of its own.
 */

const STEPS = [
  'welcome',
  'privacy',
  'features',
  'mode',
  'profile',
  'terminology',
  'members',
  'theme',
  'notifications',
  'done',
] as const;

type Step = (typeof STEPS)[number];

export function Onboarding(): JSX.Element {
  const { user, settings, saveSettings, markOnboarded, refresh } = useAuth();
  const { t, term } = useI18n();
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const step = STEPS[index] as Step;

  const next = (): void => setIndex((value) => Math.min(STEPS.length - 1, value + 1));
  const back = (): void => setIndex((value) => Math.max(0, value - 1));

  const finish = async (): Promise<void> => {
    try {
      await markOnboarded();
      await refresh();
    } catch (cause) {
      toast.fromError(cause, 'Could not finish setting up');
    }
  };

  return (
    <>
      <Atmosphere />
      <div className="auth-screen">
        <div className="auth-card" style={{ maxWidth: 520 }}>
          <div className="row row--between" style={{ marginBottom: 'var(--space-4)' }}>
            <Logo size={30} />
            <span className="tiny faint">
              Step {index + 1} of {STEPS.length}
            </span>
          </div>
          <Meter value={index + 1} max={STEPS.length} label="Setup progress" />

          <div style={{ marginTop: 'var(--space-5)' }}>
            {step === 'welcome' ? (
              <Intro
                title={`Welcome, ${user?.displayName ?? 'there'}`}
                body={t('auth.welcomeBody')}
                icon="sparkle"
              />
            ) : null}

            {step === 'privacy' ? (
              <Intro title={t('onboarding.privacyTitle')} body={t('onboarding.privacyBody')} icon="lock">
                <ul className="stack stack--tight small muted" style={{ paddingLeft: '1.1rem' }}>
                  <li>Records are private until you choose to share them.</li>
                  <li>{term('Nothing about your {{system}} is public by default.')}</li>
                  <li>You can export everything, at any time, in one file.</li>
                  <li>Deleting your account removes your data.</li>
                </ul>
              </Intro>
            ) : null}

            {step === 'features' ? <FeatureTour /> : null}
            {step === 'mode' ? <ModeStep onDone={next} /> : null}
            {step === 'profile' ? <SystemProfileStep /> : null}
            {step === 'terminology' ? <TerminologyStep /> : null}
            {step === 'members' ? <MembersStep /> : null}
            {step === 'theme' ? <ThemeStep /> : null}
            {step === 'notifications' ? <NotificationsStep /> : null}

            {step === 'done' ? (
              <Intro title={t('onboarding.finishTitle')} body="" icon="check">
                <DemoDataOffer />
              </Intro>
            ) : null}
          </div>

          <div className="row" style={{ marginTop: 'var(--space-6)' }}>
            {index > 0 ? (
              <Button variant="ghost" onClick={back}>
                {t('action.back')}
              </Button>
            ) : null}
            <span className="spacer" />
            {step === 'done' ? (
              <Button variant="primary" size="lg" onClick={() => void finish()}>
                {term('Open {{system}}')}
              </Button>
            ) : (
              <>
                {step !== 'mode' ? (
                  <Button variant="ghost" onClick={next}>
                    {t('action.skip')}
                  </Button>
                ) : null}
                <Button variant="primary" onClick={next}>
                  {t('action.next')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );

  function ModeStep({ onDone }: { onDone: () => void }): JSX.Element {
    return (
      <div className="stack">
        <h2 className="auth-card__title">{t('onboarding.modeTitle')}</h2>
        {(
          [
            ['system', t('onboarding.modeSystem'), t('onboarding.modeSystemBody')],
            ['singlet', t('onboarding.modeSinglet'), t('onboarding.modeSingletBody')],
          ] as const
        ).map(([value, label, body]) => (
          <button
            key={value}
            type="button"
            className="card card--interactive"
            style={{ textAlign: 'left' }}
            aria-pressed={settings.mode === value}
            onClick={() => {
              void saveSettings({ mode: value })
                .then(onDone)
                .catch((cause: unknown) => toast.fromError(cause, 'Could not save that'));
            }}
          >
            <div className="row row--between row--nowrap">
              <div>
                <div className="card__title">{label}</div>
                <div className="card__subtitle">{body}</div>
              </div>
              {settings.mode === value ? (
                <span style={{ color: 'var(--accent)' }}>
                  <Icon name="check" size={18} />
                </span>
              ) : null}
            </div>
          </button>
        ))}
        <p className="tiny faint">You can switch modes later in settings. Nothing is deleted either way.</p>
      </div>
    );
  }
}

function Intro({
  title,
  body,
  icon,
  children,
}: {
  title: string;
  body: string;
  icon: 'sparkle' | 'lock' | 'check';
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="stack">
      <span style={{ color: 'var(--accent)' }}>
        <Icon name={icon} size={28} />
      </span>
      <h2 className="auth-card__title">{title}</h2>
      {body ? <p className="prose small muted">{body}</p> : null}
      {children}
    </div>
  );
}

function FeatureTour(): JSX.Element {
  const { term } = useI18n();
  const groups = [
    ['front', term('Who is {{fronting}}'), term('Track {{fronting}}, co-{{fronting}} and the whole history.')],
    [
      'journal',
      'Journalling and notes',
      term('Entries by {{member}} or for the whole {{system}}, with moods and tags.'),
    ],
    ['wellbeing', 'Wellbeing', '144 emotions, body sensations, sleep and daily check-ins — described, never diagnosed.'],
    ['social', 'Social, if you want it', 'A profile you control, friends, a feed, and private messages.'],
    ['backup', 'Your data stays yours', 'Full export and restore, offline support, and sync across devices.'],
  ] as const;

  return (
    <div className="stack">
      <h2 className="auth-card__title">What is in here</h2>
      {groups.map(([icon, title, body]) => (
        <div key={title} className="row row--nowrap" style={{ alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--accent)', marginTop: 2 }}>
            <Icon name={icon as never} size={18} />
          </span>
          <div>
            <div style={{ fontWeight: 'var(--weight-medium)' }}>{title}</div>
            <div className="small muted">{body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SystemProfileStep(): JSX.Element {
  const { activeSystem, refresh } = useAuth();
  const { t, term } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(String(activeSystem?.['name'] ?? ''));
  const [description, setDescription] = useState(String(activeSystem?.['description'] ?? ''));
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    if (!activeSystem) return;
    setSaving(true);
    try {
      await api.patch(`/api/system/${activeSystem.id}`, { name, description });
      await refresh();
      toast.success('Saved');
    } catch (cause) {
      toast.error('Could not save', messageFor(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <h2 className="auth-card__title">{t('onboarding.profileTitle')}</h2>
      <TextField label={term('{{System}} name')} value={name} onChange={setName} />
      <TextField
        label="Description"
        value={description}
        onChange={setDescription}
        multiline
        rows={3}
        hint="Only for you, unless you publish a profile later."
      />
      <Button variant="secondary" onClick={() => void save()} loading={saving}>
        {t('action.save')}
      </Button>
    </div>
  );
}

function TerminologyStep(): JSX.Element {
  const { settings, saveSettings } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [overrides, setOverrides] = useState<TermOverrides>(settings.terminology ?? {});
  const shown = useMemo(() => TERMS.slice(0, 4), []);

  const choose = (key: string, one: string, other: string): void => {
    const next = { ...overrides, [key]: { one, other } };
    setOverrides(next);
    void saveSettings({ terminology: next }).catch((cause: unknown) => toast.fromError(cause, 'Could not save that'));
  };

  return (
    <div className="stack">
      <h2 className="auth-card__title">{t('onboarding.terminologyTitle')}</h2>
      <p className="prose small muted">{t('onboarding.terminologyBody')}</p>
      {shown.map((termDef) => (
        <div key={termDef.key}>
          <div className="small" style={{ marginBottom: 'var(--space-2)' }}>
            {termDef.label}
          </div>
          <div className="row">
            {(termDef.suggestions ?? []).map(([one, other]) => (
              <Chip
                key={one}
                selected={(overrides[termDef.key]?.one ?? termDef.one) === one}
                onClick={() => choose(termDef.key, one!, other ?? one!)}
              >
                {one}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <p className="tiny faint">
        Every one of these can be changed later, and anything not listed can be typed in from settings.
      </p>
    </div>
  );
}

function MembersStep(): JSX.Element {
  const { settings } = useAuth();
  const { t, term } = useI18n();
  const toast = useToast();
  const [names, setNames] = useState('');
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(0);

  if (settings.mode !== 'system') {
    return (
      <Intro
        title="Singlet Mode is on"
        body={term('The {{member}} features are hidden. Everything else is here.')}
        icon="check"
      />
    );
  }

  const create = async (): Promise<void> => {
    const list = names
      .split(/[\n,]/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (list.length === 0) return;

    setSaving(true);
    try {
      const result = await api.post<{ created: number }>('/api/records/members/batch', {
        records: list.map((name, index) => ({
          name,
          orbitOrder: index,
          color: ACCENT_PRESETS[index % ACCENT_PRESETS.length]!.accent,
        })),
      });
      setAdded(result.created);
      setNames('');
      toast.success(`${result.created} added`);
    } catch (cause) {
      toast.error('Could not add them', messageFor(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <h2 className="auth-card__title">{t('onboarding.membersTitle')}</h2>
      <p className="prose small muted">{t('onboarding.membersBody')}</p>
      <TextField
        label={term('Names, one per line')}
        value={names}
        onChange={setNames}
        multiline
        rows={4}
        placeholder={'Vega\nCorvid\nJuniper'}
      />
      <Button variant="secondary" onClick={() => void create()} loading={saving} icon="plus">
        {term('Add {{members}}')}
      </Button>
      {added > 0 ? (
        <p className="small" style={{ color: 'var(--positive)' }}>
          <Icon name="check" size={13} /> {added} added. You can fill in their profiles whenever you like.
        </p>
      ) : null}
    </div>
  );
}

function ThemeStep(): JSX.Element {
  const { settings, update } = useTheme();
  const { t } = useI18n();

  return (
    <div className="stack">
      <h2 className="auth-card__title">{t('onboarding.themeTitle')}</h2>
      <div className="row">
        {THEME_PRESETS.map((preset) => (
          <Chip
            key={preset.id}
            selected={settings.presetId === preset.id}
            onClick={() =>
              void update({ ...preset.settings, presetId: preset.id })
            }
          >
            {preset.label}
          </Chip>
        ))}
      </div>
      <div className="small muted">
        {THEME_PRESETS.find((preset) => preset.id === settings.presetId)?.description ??
          'Pick a starting point — everything is adjustable later.'}
      </div>

      <div className="field">
        <span className="field__label">Accent</span>
        <ColorPicker
          value={settings.accent}
          onChange={(accent) => void update({ accent })}
          presets={ACCENT_PRESETS}
        />
      </div>
    </div>
  );
}

function NotificationsStep(): JSX.Element {
  const { settings, saveSettings } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const turnOn = async (): Promise<void> => {
    setBusy(true);
    const result = await enablePush();
    setStatus(result.message);
    if (result.state === 'subscribed') toast.success('Notifications are on');
    setBusy(false);
  };

  return (
    <div className="stack">
      <h2 className="auth-card__title">{t('onboarding.notificationsTitle')}</h2>
      <p className="prose small muted">{t('onboarding.notificationsBody')}</p>

      {pushSupported() ? (
        <Button variant="secondary" icon="notification" onClick={() => void turnOn()} loading={busy}>
          {t('notifications.enable')}
        </Button>
      ) : (
        <p className="small muted">
          This browser cannot deliver notifications while PluralNova is closed. In-app notifications
          still work, and installing the app may add support.
        </p>
      )}

      {status ? <p className="small muted">{status}</p> : null}

      <Card>
        <SwitchRow
          label="Quiet hours"
          hint="Hold notifications overnight. In-app ones still arrive."
          checked={settings.quietHours.enabled}
          onChange={(enabled) =>
            void saveSettings({ quietHours: { ...settings.quietHours, enabled } }).catch((cause: unknown) =>
              toast.fromError(cause, 'Could not save that'),
            )
          }
        />
      </Card>
    </div>
  );
}

function DemoDataOffer(): JSX.Element {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const add = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.post('/api/data/demo/reset', { days: 30 });
      setDone(true);
      toast.success('Example data added');
    } catch (cause) {
      toast.error('Could not add example data', messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <p className="prose small muted">
        Everything is set up. You can change any of it from settings, and none of the choices are
        permanent.
      </p>
      {done ? (
        <p className="small" style={{ color: 'var(--positive)' }}>
          <Icon name="check" size={13} /> Example data added — delete it whenever you like.
        </p>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => void add()} loading={busy}>
          {t('onboarding.demoData')}
        </Button>
      )}
    </div>
  );
}
