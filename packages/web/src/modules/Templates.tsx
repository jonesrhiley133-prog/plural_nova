import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CRUD_COLLECTIONS, requireCollection, type StoredRecord } from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton } from '../ui/primitives.js';
import { SelectField, TextField } from '../ui/forms.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';

/**
 * Templates.
 *
 * A saved starting point for any record type. Using one creates a real record
 * with the template's values filled in — the template itself is untouched, and
 * the count of how often it has been used goes up.
 */
export default function Templates(): JSX.Element {
  const navigate = useNavigate();
  const { term } = useI18n();
  const toast = useToast();

  const templates = useCollection('templates');
  const [target, setTarget] = useState<string | null>(null);

  const creator = useDialog();
  const applier = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();

  const shown = target ? templates.items.filter((row) => row['targetCollection'] === target) : templates.items;
  const usedTypes = [...new Set(templates.items.map((row) => String(row['targetCollection'])))];

  return (
    <>
      <PageHeader
        title="My templates"
        description="Starting points you set up once and reuse."
        actions={
          <Button variant="primary" icon="plus" onClick={() => creator.show()}>
            New template
          </Button>
        }
      />

      {usedTypes.length > 1 ? (
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <Chip selected={target === null} onClick={() => setTarget(null)}>
            Everything
          </Chip>
          {usedTypes.map((name) => (
            <Chip key={name} selected={target === name} onClick={() => setTarget(name)}>
              {labelFor(name)}
            </Chip>
          ))}
        </div>
      ) : null}

      <AsyncContent
        loading={templates.loading}
        error={templates.error}
        items={shown}
        onRetry={templates.reload}
        empty={{
          title: 'No templates yet',
          body: term(
            'A daily {{journal}} prompt, a member profile you fill in the same way each time, a task that comes round every week.',
          ),
          icon: 'template',
          action: { label: 'New template', run: () => creator.show() },
        }}
      >
        {(items) => (
          <div className="grid" style={{ ['--grid-min' as never]: '230px' }}>
            {items.map((template) => (
              <Card
                key={template.id}
                title={
                  <span className="row row--nowrap" style={{ gap: 'var(--space-2)' }}>
                    {template['icon'] ? <span>{String(template['icon'])}</span> : <Icon name="template" size={15} />}
                    {String(template['name'])}
                  </span>
                }
                subtitle={labelFor(String(template['targetCollection']))}
                actions={
                  <IconButton
                    icon="trash"
                    label="Delete template"
                    variant="ghost"
                    size="sm"
                    onClick={() => confirm.show(template)}
                  />
                }
              >
                {template['description'] ? (
                  <p className="small muted clamp-2">{String(template['description'])}</p>
                ) : null}

                <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                  <Button variant="primary" size="sm" onClick={() => applier.show(template)}>
                    Use it
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void templates
                        .create({
                          name: `${String(template['name'])} (copy)`,
                          targetCollection: template['targetCollection'],
                          description: template['description'],
                          payload: template['payload'],
                          icon: template['icon'],
                          color: template['color'],
                          useCount: 0,
                        })
                        .then(() => toast.success('Duplicated'))
                        .catch((cause: unknown) => toast.fromError(cause));
                    }}
                  >
                    Duplicate
                  </Button>
                  {Number(template['useCount'] ?? 0) > 0 ? (
                    <span className="tiny faint">used {String(template['useCount'])}×</span>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </AsyncContent>

      <NewTemplateDialog dialog={creator} templates={templates} />

      <Dialog
        open={applier.open}
        onClose={applier.hide}
        title={applier.value ? `New ${labelFor(String(applier.value['targetCollection'])).toLowerCase()}` : 'Use template'}
        wide
      >
        {applier.value ? (
          <RecordForm
            collection={String(applier.value['targetCollection'])}
            initial={(applier.value['payload'] ?? {}) as Record<string, unknown>}
            onSubmit={async (values) => {
              const { recordStore } = await import('../core/data.js');
              await recordStore.create(String(applier.value!['targetCollection']), values);
              await templates.update(applier.value!.id, {
                useCount: Number(applier.value!['useCount'] ?? 0) + 1,
              });
              toast.success('Created from the template');
              applier.hide();
            }}
            onCancel={applier.hide}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this template?"
        body="Records already created from it are not affected."
        onConfirm={async () => {
          if (!confirm.value) return;
          await templates.remove(confirm.value.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}

function labelFor(collection: string): string {
  try {
    return requireCollection(collection).singular;
  } catch {
    return collection;
  }
}

function NewTemplateDialog({
  dialog,
  templates,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  templates: ReturnType<typeof useCollection>;
}): JSX.Element {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [collection, setCollection] = useState('journalEntries');
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const options = CRUD_COLLECTIONS.filter((candidate) => !candidate.vault).map((candidate) => ({
    value: candidate.name,
    label: candidate.label,
  }));

  return (
    <Dialog
      open={dialog.open}
      onClose={() => {
        dialog.hide();
        setStep(0);
      }}
      title={step === 0 ? 'New template' : 'Fill in the starting values'}
      wide={step === 1}
      footer={
        step === 0 ? (
          <>
            <Button variant="ghost" onClick={dialog.hide}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!name.trim()} onClick={() => setStep(1)}>
              Next
            </Button>
          </>
        ) : undefined
      }
    >
      {step === 0 ? (
        <>
          <TextField label="Template name" value={name} onChange={setName} required autoFocus />
          <TextField label="What it is for" value={description} onChange={setDescription} multiline rows={2} />
          <SelectField
            label="Creates a"
            value={collection}
            options={options}
            onChange={setCollection}
            placeholder="Choose a record type"
          />
        </>
      ) : (
        <>
          <p className="small muted prose" style={{ marginBottom: 'var(--space-4)' }}>
            Whatever you put here becomes the starting point. Leave anything blank that should be
            filled in fresh each time.
          </p>
          <RecordForm
            collection={collection}
            initial={payload}
            submitLabel="Save template"
            onSubmit={async (values) => {
              setSaving(true);
              try {
                // Blank fields are dropped so the template only carries what it
                // actually sets, rather than a wall of nulls.
                const trimmed = Object.fromEntries(
                  Object.entries(values).filter(
                    ([, value]) =>
                      value !== null && value !== '' && !(Array.isArray(value) && value.length === 0),
                  ),
                );
                setPayload(trimmed);
                await templates.create({
                  name: name.trim(),
                  description,
                  targetCollection: collection,
                  payload: trimmed,
                  useCount: 0,
                });
                toast.success('Template saved');
                setName('');
                setDescription('');
                setStep(0);
                dialog.hide();
              } finally {
                setSaving(false);
              }
            }}
            onCancel={() => setStep(0)}
          />
        </>
      )}
    </Dialog>
  );
}
