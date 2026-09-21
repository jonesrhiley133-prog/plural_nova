import { useState } from 'react';
import { useAuth } from '../../core/auth.js';
import { useI18n } from '../../core/i18n.js';
import { api, messageFor, setToken, type ApiRequestError } from '../../core/api.js';
import { Atmosphere, Logo } from '../../app/Atmosphere.js';
import { Button, Card } from '../../ui/primitives.js';
import { TextField } from '../../ui/forms.js';
import { Dialog } from '../../ui/overlays.js';
import { Icon } from '../../ui/Icon.js';
import { DEMO_PERIODS, type DemoPeriod } from '@pluralnova/shared';

/**
 * Getting in.
 *
 * Welcome, sign in, register, password reset, recovery and the demo account,
 * all on one screen with one card. Every failure lands on the field that caused
 * it; nothing here can leave the user looking at a blank panel.
 */

type Screen = 'welcome' | 'signIn' | 'register' | 'forgot' | 'reset' | 'recover';

export function AuthScreens(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  return (
    <>
      <Atmosphere />
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-card__brand">
            <Logo size={44} />
            <div>
              <h1 className="auth-card__title">PluralNova</h1>
              <p className="auth-card__tagline">A private constellation for your system.</p>
            </div>
          </div>

          {screen === 'welcome' ? <Welcome onChoose={setScreen} /> : null}
          {screen === 'signIn' ? <SignIn onChoose={setScreen} /> : null}
          {screen === 'register' ? (
            <Register onChoose={setScreen} onRecoveryCode={setRecoveryCode} />
          ) : null}
          {screen === 'forgot' ? <ForgotPassword onChoose={setScreen} /> : null}
          {screen === 'reset' ? <ResetPassword onChoose={setScreen} /> : null}
          {screen === 'recover' ? (
            <RecoverAccount onChoose={setScreen} onRecoveryCode={setRecoveryCode} />
          ) : null}
        </div>

        <p className="tiny faint" style={{ marginTop: 'var(--space-5)', textAlign: 'center', maxWidth: 420 }}>
          Everything you write here is private by default and stored under your account. You can
          export or delete all of it at any time.
        </p>
      </div>

      <RecoveryCodeDialog code={recoveryCode} onClose={() => setRecoveryCode(null)} />
    </>
  );
}

function Welcome({ onChoose }: { onChoose: (screen: Screen) => void }): JSX.Element {
  const { startGuest } = useAuth();
  const { t } = useI18n();
  const [showDemo, setShowDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (days: DemoPeriod): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await startGuest(days);
    } catch (cause) {
      setError(messageFor(cause));
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <p className="prose small muted">{t('auth.welcomeBody')}</p>

      <Button variant="primary" size="lg" block onClick={() => onChoose('register')}>
        {t('auth.signUp')}
      </Button>
      <Button variant="secondary" size="lg" block onClick={() => onChoose('signIn')}>
        {t('auth.signIn')}
      </Button>

      <div className="row" style={{ justifyContent: 'center', margin: 'var(--space-2) 0' }}>
        <span className="tiny faint">or</span>
      </div>

      <Button variant="ghost" block icon="sparkle" onClick={() => setShowDemo(true)}>
        {t('auth.guestMode')}
      </Button>

      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}

      <Dialog
        open={showDemo}
        onClose={() => setShowDemo(false)}
        title="Look around with demo data"
        description={t('auth.guestBody')}
      >
        <div className="stack">
          {DEMO_PERIODS.map((period) => (
            <button
              key={period.days}
              type="button"
              className="card card--interactive"
              style={{ textAlign: 'left' }}
              disabled={busy}
              onClick={() => void start(period.days)}
            >
              <div className="row row--between">
                <div>
                  <div className="card__title">{period.label}</div>
                  <div className="card__subtitle">{period.description}</div>
                </div>
                <Icon name="chevronRight" size={16} />
              </div>
            </button>
          ))}
          <p className="tiny faint">
            A demo account keeps its data until you delete it — updating the app does not wipe it.
            You can turn it into a real account later without losing anything.
          </p>
        </div>
      </Dialog>
    </div>
  );
}

function SignIn({ onChoose }: { onChoose: (screen: Screen) => void }): JSX.Element {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (cause) {
      setError(messageFor(cause));
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
      <TextField
        label={t('auth.email')}
        type="email"
        inputMode="email"
        autoComplete="username"
        value={email}
        onChange={setEmail}
        autoFocus
      />
      <TextField
        label={t('auth.password')}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
      />

      {error ? (
        <p className="field__error" role="alert">
          <Icon name="warning" size={12} /> {error}
        </p>
      ) : null}

      <Button variant="primary" block size="lg" type="submit" loading={busy}>
        {t('auth.signIn')}
      </Button>

      <div className="auth-card__footer">
        <button type="button" className="button button--ghost button--sm" onClick={() => onChoose('forgot')}>
          {t('auth.forgotPassword')}
        </button>
        <div style={{ marginTop: 'var(--space-2)' }}>
          {t('auth.noAccount')}{' '}
          <button type="button" className="button button--ghost button--sm" onClick={() => onChoose('register')}>
            {t('auth.signUp')}
          </button>
        </div>
      </div>
    </form>
  );
}

function Register({
  onChoose,
  onRecoveryCode,
}: {
  onChoose: (screen: Screen) => void;
  onRecoveryCode: (code: string) => void;
}): JSX.Element {
  const { register } = useAuth();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'system' | 'singlet'>('system');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const result = await register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        mode,
      });
      if (result.recoveryCode) onRecoveryCode(result.recoveryCode);
    } catch (cause) {
      const fieldErrors = (cause as ApiRequestError).fieldErrors;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else setError(messageFor(cause));
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
      <TextField
        label={t('auth.displayName')}
        value={displayName}
        onChange={setDisplayName}
        autoComplete="nickname"
        {...(errors['displayName'] ? { error: errors['displayName'] } : {})}
        autoFocus
      />
      <TextField
        label={t('auth.email')}
        type="email"
        inputMode="email"
        autoComplete="username"
        value={email}
        onChange={setEmail}
        {...(errors['email'] ? { error: errors['email'] } : {})}
      />
      <TextField
        label={t('auth.password')}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint="At least 10 characters, with a number or symbol."
        {...(errors['password'] ? { error: errors['password'] } : {})}
      />

      <div className="field">
        <span className="field__label">{t('onboarding.modeTitle')}</span>
        <div className="stack stack--tight">
          {(
            [
              ['system', t('onboarding.modeSystem'), t('onboarding.modeSystemBody')],
              ['singlet', t('onboarding.modeSinglet'), t('onboarding.modeSingletBody')],
            ] as const
          ).map(([value, label, body]) => (
            <label key={value} className="checkbox-row" style={{ border: 'var(--border-width) solid var(--border)' }}>
              <input
                type="radio"
                name="mode"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span className="checkbox-row__text">
                <span className="checkbox-row__title">{label}</span>
                <span className="checkbox-row__hint">{body}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}

      <Button variant="primary" block size="lg" type="submit" loading={busy}>
        {t('auth.signUp')}
      </Button>

      <div className="auth-card__footer">
        {t('auth.haveAccount')}{' '}
        <button type="button" className="button button--ghost button--sm" onClick={() => onChoose('signIn')}>
          {t('auth.signIn')}
        </button>
      </div>
    </form>
  );
}

function ForgotPassword({ onChoose }: { onChoose: (screen: Screen) => void }): JSX.Element {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await api.post<{ message: string; devCode?: string }>(
        '/api/auth/forgot-password',
        { email: email.trim() },
      );
      setSent(result.message);
      setDevCode(result.devCode ?? null);
    } catch (cause) {
      setSent(messageFor(cause));
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
      <p className="prose small muted" style={{ marginBottom: 'var(--space-4)' }}>
        Enter the email on the account and we will send a reset code.
      </p>
      <TextField
        label={t('auth.email')}
        type="email"
        inputMode="email"
        value={email}
        onChange={setEmail}
        autoFocus
      />

      {sent ? (
        <Card raised style={{ marginBottom: 'var(--space-4)' }}>
          <p className="small">{sent}</p>
          {devCode ? (
            <p className="tiny faint" style={{ marginTop: 'var(--space-2)' }}>
              This server has no mail configured, so the code is shown here: <strong>{devCode}</strong>
            </p>
          ) : null}
        </Card>
      ) : null}

      <Button variant="primary" block type="submit" loading={busy}>
        Send a reset code
      </Button>

      <div className="auth-card__footer">
        <button type="button" className="button button--ghost button--sm" onClick={() => onChoose('reset')}>
          I have a code
        </button>
        {' · '}
        <button type="button" className="button button--ghost button--sm" onClick={() => onChoose('recover')}>
          Use a recovery code
        </button>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <button type="button" className="button button--ghost button--sm" onClick={() => onChoose('signIn')}>
            Back to sign in
          </button>
        </div>
      </div>
    </form>
  );
}

function ResetPassword({ onChoose }: { onChoose: (screen: Screen) => void }): JSX.Element {
  const { refresh } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ token: string }>('/api/auth/reset-password', {
        email: email.trim(),
        code: code.trim(),
        password,
      });
      setToken(result.token);
      await refresh();
    } catch (cause) {
      setError(messageFor(cause));
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
      <TextField label={t('auth.email')} type="email" value={email} onChange={setEmail} autoFocus />
      <TextField label={t('auth.resetCode')} value={code} onChange={setCode} autoComplete="one-time-code" />
      <TextField
        label={t('auth.newPassword')}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint="At least 10 characters, with a number or symbol."
      />

      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}

      <Button variant="primary" block type="submit" loading={busy}>
        {t('auth.resetPassword')}
      </Button>

      <div className="auth-card__footer">
        <button type="button" className="button button--ghost button--sm" onClick={() => onChoose('signIn')}>
          Back to sign in
        </button>
      </div>
    </form>
  );
}

function RecoverAccount({
  onChoose,
  onRecoveryCode,
}: {
  onChoose: (screen: Screen) => void;
  onRecoveryCode: (code: string) => void;
}): JSX.Element {
  const { refresh } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ token: string; recoveryCode?: string }>('/api/auth/recover', {
        email: email.trim(),
        recoveryCode: recoveryCode.trim(),
        password,
      });
      setToken(result.token);
      if (result.recoveryCode) onRecoveryCode(result.recoveryCode);
      await refresh();
    } catch (cause) {
      setError(messageFor(cause));
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
      <p className="prose small muted" style={{ marginBottom: 'var(--space-4)' }}>
        {t('auth.recoveryBody')}
      </p>
      <TextField label={t('auth.email')} type="email" value={email} onChange={setEmail} autoFocus />
      <TextField
        label="Recovery code"
        value={recoveryCode}
        onChange={setRecoveryCode}
        placeholder="XXXX-XXXX-XXXX-XXXX"
      />
      <TextField
        label={t('auth.newPassword')}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
      />

      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}

      <Button variant="primary" block type="submit" loading={busy}>
        {t('auth.recovery')}
      </Button>

      <div className="auth-card__footer">
        <button type="button" className="button button--ghost button--sm" onClick={() => onChoose('signIn')}>
          Back to sign in
        </button>
      </div>
    </form>
  );
}

/**
 * The recovery code is shown once. It exists so an account is not lost with a
 * forgotten password and an unreachable inbox, and it is stored hashed — there
 * is no way to show it again.
 */
export function RecoveryCodeDialog({
  code,
  onClose,
}: {
  code: string | null;
  onClose: () => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  return (
    <Dialog
      open={Boolean(code)}
      onClose={onClose}
      dismissible={false}
      title="Save your recovery code"
      footer={
        <Button variant="primary" onClick={onClose} block>
          I have saved it
        </Button>
      }
    >
      <p className="prose small" style={{ marginBottom: 'var(--space-4)' }}>
        This code gets you back into your account if you lose your password and your email. It is
        shown once and stored in a form we cannot read, so keep it somewhere safe.
      </p>
      <div
        className="card"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--size-md)',
          letterSpacing: '0.08em',
          textAlign: 'center',
          userSelect: 'all',
        }}
      >
        {code}
      </div>
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <Button
          variant="secondary"
          icon={copied ? 'check' : 'link'}
          onClick={() => {
            void navigator.clipboard?.writeText(code ?? '').then(() => setCopied(true));
          }}
        >
          {copied ? 'Copied' : 'Copy code'}
        </Button>
      </div>
    </Dialog>
  );
}
