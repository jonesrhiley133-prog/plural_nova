import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StoredRecord } from '@pluralnova/shared';
import { useAuth, useActiveMemberId } from '../core/auth.js';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useOptimisticSettings } from '../core/settings.js';
import { useToast } from '../core/toast.js';
import { api, messageFor } from '../core/api.js';
import { Atmosphere, Logo } from '../app/Atmosphere.js';
import { Avatar, Button, Card } from '../ui/primitives.js';
import { TextField, SwitchRow } from '../ui/forms.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { EmptyState, SkeletonCards } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

/**
 * Profile Select.
 *
 * Choosing a profile sets who new records are attributed to by default. It is
 * deliberately not the same as who is fronting and not the same as the signed-in
 * account — those three answer different questions, and conflating them is how
 * data ends up attributed to the wrong person.
 */
export default function ProfileSelect(): JSX.Element {
  const navigate = useNavigate();
  const { setActiveMember, settings, user } = useAuth();
  const activeMemberId = useActiveMemberId();
  const { t, term } = useI18n();
  const toast = useToast();
  const members = useCollection('members', {
    filter: (member) => member['archived'] !== true,
  });

  const pinPrompt = useDialog<StoredRecord>();
  const pinManager = useDialog<StoredRecord>();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (member: StoredRecord | null, suppliedPin?: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await setActiveMember(member?.id ?? null, suppliedPin);
      toast.success(member ? `Now using PluralNova as ${String(member['name'])}` : term('Back to the whole {{system}}'));
      pinPrompt.hide();
      setPin('');
      navigate('/');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const open = (member: StoredRecord): void => {
    const needsPin = Boolean(member['pinHash']) && settings.privacy.requireProfilePins;
    if (needsPin) {
      setPin('');
      setError(null);
      pinPrompt.show(member);
      return;
    }
    void choose(member);
  };

  return (
    <>
      <Atmosphere />
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <Logo size={40} />
        <h1 style={{ fontSize: 'var(--size-xl)', marginTop: 'var(--space-3)' }}>
          {t('profiles.title')}
        </h1>
        <p className="small muted">{t('profiles.subtitle')}</p>
      </div>

      {members.loading ? (
        <SkeletonCards count={6} />
      ) : members.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="member"
            title={t('members.empty')}
            body={term('Profile Select needs at least one {{member}}. You can carry on as the whole {{system}} in the meantime.')}
            action={{ label: t('members.create'), run: () => navigate('/members?new=1') }}
            secondaryAction={{ label: t('profiles.system'), run: () => void choose(null) }}
          />
        </Card>
      ) : (
        <div className="grid" style={{ ['--grid-min' as never]: '132px' }}>
          <ProfileTile
            name={t('profiles.system')}
            active={!activeMemberId}
            onClick={() => void choose(null)}
            glyph="system"
            subtitle={user?.displayName ?? ''}
          />
          {members.items.map((member) => (
            <ProfileTile
              key={member.id}
              name={String(member['name'])}
              subtitle={String(member['pronouns'] ?? '')}
              avatarUrl={(member['avatarUrl'] as string) ?? null}
              color={(member['color'] as string) ?? null}
              icon={(member['icon'] as string) ?? null}
              locked={Boolean(member['pinHash'])}
              active={activeMemberId === member.id}
              onClick={() => open(member)}
              onManage={() => pinManager.show(member)}
            />
          ))}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-6)' }}>
        <Button variant="ghost" onClick={() => navigate('/members')}>
          {t('profiles.manage')}
        </Button>
      </div>

      <Dialog
        open={pinPrompt.open}
        onClose={pinPrompt.hide}
        title={t('profiles.enterPin', { name: String(pinPrompt.value?.['name'] ?? '') })}
        footer={
          <>
            <Button variant="ghost" onClick={pinPrompt.hide}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void choose(pinPrompt.value, pin)}
              disabled={pin.length < 4}
            >
              {t('action.confirm')}
            </Button>
          </>
        }
      >
        <TextField
          label="PIN"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={setPin}
          autoFocus
          {...(error ? { error } : {})}
        />
      </Dialog>

      <PinManager dialog={pinManager} />
    </>
  );
}

function ProfileTile({
  name,
  subtitle,
  avatarUrl,
  color,
  icon,
  glyph,
  locked,
  active,
  onClick,
  onManage,
}: {
  name: string;
  subtitle?: string;
  avatarUrl?: string | null;
  color?: string | null;
  icon?: string | null;
  glyph?: 'system';
  locked?: boolean;
  active?: boolean;
  onClick: () => void;
  onManage?: () => void;
}): JSX.Element {
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onClick}
        className="card card--interactive"
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-4) var(--space-2)',
          borderColor: active ? 'var(--accent)' : undefined,
        }}
        aria-current={active ? 'true' : undefined}
      >
        {glyph === 'system' ? (
          <span
            className="avatar avatar--round"
            style={{ ['--avatar-size' as never]: '64px', color: 'var(--accent)' }}
          >
            <Icon name="system" size={30} />
          </span>
        ) : (
          <Avatar name={name} src={avatarUrl ?? null} color={color ?? null} icon={icon ?? null} size={64} round ring={active} />
        )}
        <span className="small truncate" style={{ maxWidth: '100%', fontWeight: 'var(--weight-medium)' }}>
          {name}
        </span>
        {subtitle ? (
          <span className="tiny faint truncate" style={{ maxWidth: '100%' }}>
            {subtitle}
          </span>
        ) : null}
        {locked ? (
          <span className="tiny faint">
            <Icon name="lock" size={11} label="PIN protected" />
          </span>
        ) : null}
      </button>
      {onManage ? (
        <button
          type="button"
          onClick={onManage}
          className="button button--ghost button--sm button--icon"
          style={{ position: 'absolute', top: 6, right: 6 }}
          aria-label={`Manage ${name}'s PIN`}
        >
          <Icon name="settings" size={13} />
        </button>
      ) : null}
    </div>
  );
}

function PinManager({
  dialog,
}: {
  dialog: ReturnType<typeof useDialog<StoredRecord>>;
}): JSX.Element {
  const { settings, update: updateSettings } = useOptimisticSettings();
  const { term } = useI18n();
  const toast = useToast();
  const { reload } = useCollection('members');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const member = dialog.value;
  const hasPin = Boolean(member?.['pinHash']);

  const save = async (value: string | null): Promise<void> => {
    if (!member) return;
    setBusy(true);
    try {
      await api.post(`/api/system/members/${member.id}/pin`, { pin: value });
      await reload();
      toast.success(value ? 'PIN set' : 'PIN removed');
      dialog.hide();
      setPin('');
    } catch (cause) {
      toast.fromError(cause, 'Could not update the PIN');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title={term(`${String(member?.['name'] ?? 'Profile')}’s PIN`)}
    >
      <p className="prose small muted" style={{ marginBottom: 'var(--space-4)' }}>
        A PIN keeps this profile from being selected by someone else picking up the device. It
        protects the profile switch, not the data — anything genuinely private belongs in the vault.
      </p>

      <TextField
        label={hasPin ? 'New PIN' : 'PIN'}
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={setPin}
        hint="At least four characters."
      />

      <div className="row">
        <Button variant="primary" onClick={() => void save(pin)} disabled={pin.length < 4} loading={busy}>
          {hasPin ? 'Change PIN' : 'Set PIN'}
        </Button>
        {hasPin ? (
          <Button variant="ghost" onClick={() => void save(null)} loading={busy}>
            Remove PIN
          </Button>
        ) : null}
      </div>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <SwitchRow
          label="Ask for PINs when switching"
          hint="Turn this off to skip every profile PIN on this account."
          checked={settings.privacy.requireProfilePins}
          onChange={(value) =>
            updateSettings({ privacy: { ...settings.privacy, requireProfilePins: value } })
          }
        />
      </div>
    </Dialog>
  );
}
