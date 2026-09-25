import { useState, type ReactNode } from 'react';
import { useAppLock } from '../core/appLock.js';
import { messageFor } from '../core/api.js';
import { Atmosphere, Logo } from './Atmosphere.js';
import { Button } from '../ui/primitives.js';
import { TextField } from '../ui/forms.js';
import { SkeletonList } from '../ui/feedback.js';

/**
 * Stands between the authenticated shell and the routes.
 *
 * While locked, no route mounts and nothing it would have fetched is ever
 * requested — the routes below simply do not exist yet as far as React is
 * concerned, which is what "do not expose private information behind the
 * lock screen" means at the client layer.
 */
export function AppLockGate({ children }: { children: ReactNode }): JSX.Element {
  const { state } = useAppLock();

  if (state === 'checking') {
    return (
      <>
        <Atmosphere />
        <div className="auth-screen">
          <div className="auth-card" aria-busy="true">
            <SkeletonList rows={3} />
          </div>
        </div>
      </>
    );
  }

  if (state === 'locked') return <AppLockScreen />;

  return <>{children}</>;
}

function AppLockScreen(): JSX.Element {
  const { status, error, unlock, biometricSupported, authenticateBiometric, recoverWithPassword } =
    useAppLock();
  const [pin, setPin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setFormError(null);
    try {
      await unlock(pin);
      setPin('');
    } catch (cause) {
      setFormError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const useBiometric = async (): Promise<void> => {
    setBiometricBusy(true);
    setFormError(null);
    try {
      await authenticateBiometric();
    } catch (cause) {
      setFormError(messageFor(cause));
    } finally {
      setBiometricBusy(false);
    }
  };

  return (
    <>
      <Atmosphere />
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-card__brand">
            <Logo size={44} />
            <div>
              <h1 className="auth-card__title">PluralNova</h1>
              <p className="auth-card__tagline">Locked</p>
            </div>
          </div>

          {biometricSupported && status?.biometricRegistered ? (
            <Button
              variant="secondary"
              block
              icon="device"
              loading={biometricBusy}
              onClick={() => void useBiometric()}
              style={{ marginBottom: 'var(--space-4)' }}
            >
              Unlock with this device
            </Button>
          ) : null}

          {recovering ? (
            <RecoverForm
              onDone={() => setRecovering(false)}
              recoverWithPassword={recoverWithPassword}
            />
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <TextField
                label="App lock PIN"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={setPin}
                autoFocus
                {...(formError ?? error ? { error: (formError ?? error) as string } : {})}
              />
              <Button variant="primary" block type="submit" disabled={pin.length < 4} loading={busy}>
                Unlock
              </Button>
              <button
                type="button"
                className="button button--ghost button--sm"
                style={{ marginTop: 'var(--space-3)' }}
                onClick={() => {
                  setFormError(null);
                  setRecovering(true);
                }}
              >
                Forgot your PIN?
              </button>
            </form>
          )}
        </div>

        <p className="tiny faint" style={{ marginTop: 'var(--space-5)', textAlign: 'center', maxWidth: 420 }}>
          This PIN protects PluralNova on this device. It is separate from your account password and
          from any profile PINs.
        </p>
      </div>
    </>
  );
}

function RecoverForm({
  onDone,
  recoverWithPassword,
}: {
  onDone: () => void;
  recoverWithPassword: (accountPassword: string, newPin: string) => Promise<void>;
}): JSX.Element {
  const [accountPassword, setAccountPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await recoverWithPassword(accountPassword, newPin);
      onDone();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="small prose muted">
        Verify with your account password to set a new app lock PIN.
      </p>
      <TextField
        label="Account password"
        type="password"
        value={accountPassword}
        onChange={setAccountPassword}
        autoFocus
        {...(error ? { error } : {})}
      />
      <TextField
        label="New PIN"
        type="password"
        inputMode="numeric"
        hint="4 to 8 digits."
        value={newPin}
        onChange={setNewPin}
      />
      <Button
        variant="primary"
        block
        type="submit"
        disabled={!accountPassword || !/^\d{4,8}$/.test(newPin)}
        loading={busy}
      >
        Set new PIN
      </Button>
      <button
        type="button"
        className="button button--ghost button--sm"
        style={{ marginTop: 'var(--space-3)' }}
        onClick={onDone}
      >
        Back to PIN
      </button>
    </form>
  );
}
