import { useCallback, useEffect, useState } from 'react';
import { api, messageFor } from '../core/api.js';
import { useCollection } from '../core/data.js';
import { useAuth } from '../core/auth.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton, Stat } from '../ui/primitives.js';
import { NumberField, TextField } from '../ui/forms.js';
import { AsyncContent, EmptyState } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';
import type { StoredRecord } from '@pluralnova/shared';

/**
 * The private vault.
 *
 * The lock is a property of the session on the server. While it is locked, the
 * rows are not fetched and hidden — they are refused, including by sync, search
 * and backup. Nothing in here ever appears in a notification.
 */

interface VaultStatus {
  configured: boolean;
  unlocked: boolean;
  unlockedUntil: string | null;
  autoLockMinutes: number;
  itemCount: number | null;
}

export default function Vault(): JSX.Element {
  const { settings, saveSettings } = useAuth();
  const dates = useDateFormat();
  const toast = useToast();
  const { t } = useI18n();

  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useCollection('vaultItems', { enabled: status?.unlocked === true });
  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();
  const settingsDialog = useDialog();
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.get<VaultStatus>('/api/vault/status');
      setStatus(result);
    } catch (cause) {
      toast.fromError(cause, 'Could not check the vault');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // The vault relocks itself on the server; this keeps the screen honest about it.
  useEffect(() => {
    if (!status?.unlockedUntil) return;
    const remaining = Date.parse(status.unlockedUntil) - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => void load(), remaining + 1000);
    return () => window.clearTimeout(timer);
  }, [status?.unlockedUntil, load]);

  const submit = async (path: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.post(path, { pin });
      setPin('');
      await load();
      await items.reload();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <>
        <PageHeader title="Private vault" />
        <Card>
          <p className="small muted">Checking the vault…</p>
        </Card>
      </>
    );
  }

  if (!status.configured) {
    return (
      <>
        <PageHeader title="Private vault" />
        <Card>
          <EmptyState
            icon="vault"
            title="Set a vault PIN"
            body="The vault is a section of PluralNova that stays locked behind a second step. While it is locked the server refuses to return anything in it — not to this screen, not to sync, not to search, and never in a notification."
          />
          <div style={{ maxWidth: 320, margin: '0 auto' }}>
            <TextField
              label="Choose a PIN"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={setPin}
              hint="At least four characters. This is not your account password."
              {...(error ? { error } : {})}
            />
            <Button
              variant="primary"
              block
              disabled={pin.length < 4}
              loading={busy}
              onClick={() => void submit('/api/vault/setup')}
            >
              Set the PIN
            </Button>
          </div>
        </Card>
      </>
    );
  }

  if (!status.unlocked) {
    return (
      <>
        <PageHeader title="Private vault" />
        <Card>
          <EmptyState
            icon="lock"
            title={t('error.vaultLocked')}
            body="Enter your PIN to open it. It locks again on its own after a while of not being used."
          />
          <form
            style={{ maxWidth: 300, margin: '0 auto' }}
            onSubmit={(event) => {
              event.preventDefault();
              void submit('/api/vault/unlock');
            }}
          >
            <TextField
              label="Vault PIN"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={setPin}
              autoFocus
              {...(error ? { error } : {})}
            />
            <Button variant="primary" block type="submit" disabled={pin.length < 4} loading={busy}>
              Unlock
            </Button>
          </form>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Private vault"
        description={
          status.unlockedUntil
            ? `Unlocked until ${dates.time(status.unlockedUntil)}.`
            : 'Unlocked.'
        }
        actions={
          <>
            <Button variant="ghost" icon="settings" onClick={() => settingsDialog.show()}>
              Vault settings
            </Button>
            <Button
              variant="secondary"
              icon="lock"
              onClick={() => {
                void api.post('/api/vault/lock').then(() => {
                  void load();
                  toast.success('Vault locked');
                });
              }}
            >
              Lock now
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              Add
            </Button>
          </>
        }
      />

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat label="Items" value={items.items.length} />
        <Stat label="Auto-locks after" value={`${status.autoLockMinutes} min`} />
      </div>

      <AsyncContent
        loading={items.loading}
        error={items.error}
        items={items.items}
        onRetry={items.reload}
        empty={{
          title: 'The vault is empty',
          body: 'Notes, documents and anything else that should take two steps to reach.',
          icon: 'vault',
          action: { label: 'Add an item', run: () => setCreating(true) },
        }}
      >
        {(records) => (
          <Card flush>
            <div className="list">
              {records.map((item) => (
                <div key={item.id} className="list-row">
                  <span style={{ color: 'var(--text-faint)' }}>
                    <Icon name="lock" size={17} />
                  </span>
                  <span className="list-row__body">
                    <span className="list-row__title">{String(item['title'])}</span>
                    <span className="list-row__meta">
                      <Chip>{String(item['kind'] ?? 'note')}</Chip>
                      <span className="faint">{dates.relative(String(item.updatedAt))}</span>
                    </span>
                  </span>
                  <span className="list-row__trailing">
                    <IconButton icon="edit" label="Open" variant="ghost" size="sm" onClick={() => editor.show(item)} />
                    <IconButton icon="trash" label="Delete" variant="ghost" size="sm" onClick={() => confirm.show(item)} />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </AsyncContent>

      <Dialog
        open={creating || editor.open}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        title={editor.value ? String(editor.value['title']) : 'New vault item'}
        wide
      >
        <RecordForm
          collection="vaultItems"
          record={editor.value}
          onSubmit={async (values) => {
            if (editor.value) {
              await items.update(editor.value.id, values);
              toast.success('Saved');
              editor.hide();
            } else {
              await items.create(values);
              toast.success('Added to the vault');
              setCreating(false);
            }
          }}
          onCancel={() => {
            setCreating(false);
            editor.hide();
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this vault item?"
        body="It is removed from the vault."
        onConfirm={async () => {
          if (!confirm.value) return;
          await items.remove(confirm.value.id);
          toast.success('Deleted');
        }}
      />

      <Dialog open={settingsDialog.open} onClose={settingsDialog.hide} title="Vault settings">
        <NumberField
          label="Lock again after"
          value={settings.privacy.vaultAutoLockMinutes}
          onChange={(value) => {
            void saveSettings({
              privacy: { ...settings.privacy, vaultAutoLockMinutes: Math.max(1, value ?? 5) },
            }).then(() => {
              toast.success('Saved');
              void load();
            });
          }}
          min={1}
          max={240}
          suffix="minutes of not using it"
        />

        <Card style={{ marginTop: 'var(--space-4)' }}>
          <p className="small prose muted">
            Changing or removing the PIN needs the current one. Removing it does not delete anything
            — the items stay, they just stop being behind a second step.
          </p>
        </Card>

        <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
          <TextField
            label="Current PIN"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={setPin}
            {...(error ? { error } : {})}
          />
          <div className="row">
            <Button
              variant="danger"
              disabled={pin.length < 4}
              loading={busy}
              onClick={() => {
                setBusy(true);
                void api
                  .delete('/api/vault/pin', undefined, { body: { pin } })
                  .then(() => {
                    toast.success('Vault PIN removed');
                    setPin('');
                    settingsDialog.hide();
                    void load();
                  })
                  .catch((cause: unknown) => setError(messageFor(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              Remove the PIN
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
