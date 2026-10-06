import { useState } from 'react';
import { OPTIONS, type StoredRecord } from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { useToast } from '../core/toast.js';
import { useI18n } from '../core/i18n.js';
import { CollectionScreen, type RowHelpers } from '../ui/CollectionScreen.js';
import { Avatar, Button, Chip, Status } from '../ui/primitives.js';
import { FileButton } from '../ui/forms.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { ProfilePreviewDialog, ProfileTile } from '../ui/ProfileParts.js';

/**
 * People outside the system. The safety field is the one that earns its place:
 * it is the thing a member who has not met someone needs to know first.
 */
export default function Contacts(): JSX.Element {
  const { term } = useI18n();
  const [safety, setSafety] = useState('all');
  const contacts = useCollection('contacts');
  const importDialog = useDialog();

  return (
    <>
      <CollectionScreen
        collection="contacts"
        description={term('People outside the {{system}}, and what each {{member}} needs to know about them.')}
        emptyTitle="No contacts yet"
        emptyBody={term('Add someone, note how they are with you, and who in the {{system}} knows them.')}
        filter={(record) => safety === 'all' || record['safety'] === safety}
        headerActions={
          <Button variant="secondary" icon="import" onClick={() => importDialog.show()}>
            Import
          </Button>
        }
        above={
          <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
            <Chip selected={safety === 'all'} onClick={() => setSafety('all')}>
              Everyone
            </Chip>
            {OPTIONS.safety.map((option) => (
              <Chip
                key={option.value}
                selected={safety === option.value}
                onClick={() => setSafety(option.value)}
                color={option.color}
              >
                {option.icon} {option.label}
              </Chip>
            ))}
          </div>
        }
        layout="grid"
        gridMinWidth={240}
        renderRow={(record, helpers) => <ContactTile record={record} helpers={helpers} />}
      />
      <ContactImportDialog dialog={importDialog} existing={contacts.items} onImported={contacts.reload} onCreate={contacts.create} />
    </>
  );
}

function ContactTile({ record, helpers }: { record: StoredRecord; helpers: RowHelpers }): JSX.Element {
  const preview = useDialog();
  const level = OPTIONS.safety.find((option) => option.value === record['safety']);
  const name = String(record['name']);
  const subtitle = [record['nickname'], record['relationship']].filter(Boolean).join(' · ');
  return (
    <>
      <ProfileTile
        name={name}
        subtitle={subtitle || undefined}
        avatarUrl={(record['avatarUrl'] as string) || null}
        bannerUrl={(record['bannerUrl'] as string) || null}
        badge={
          <>
            {level && level.value !== 'unset' ? <Status label={level.label} color={level.color} glyph={level.icon} /> : null}
            {record['currentlyWith'] === true ? <Chip accent>With them now</Chip> : null}
          </>
        }
        onOpen={() => preview.show()}
      />
      <ProfilePreviewDialog
        open={preview.open}
        onClose={preview.hide}
        name={name}
        subtitle={subtitle || undefined}
        bio={(record['bio'] as string) || (record['notes'] as string) || null}
        avatarUrl={(record['avatarUrl'] as string) || null}
        bannerUrl={(record['bannerUrl'] as string) || null}
        customInfo={[
          ...(record['phone'] ? [{ label: 'Phone', value: String(record['phone']) }] : []),
          ...(record['email'] ? [{ label: 'Email', value: String(record['email']) }] : []),
          ...(Array.isArray(record['customInfo']) ? (record['customInfo'] as unknown[]) : []),
        ]}
        stats={level && level.value !== 'unset' ? [{ label: 'Safety', value: level.label }] : undefined}
        onEdit={() => {
          preview.hide();
          helpers.edit();
        }}
        onDelete={() => {
          preview.hide();
          helpers.remove();
        }}
      />
    </>
  );
}

/** One entry read out of a vCard, before anything is decided about whether to keep it. */
interface VCardEntry {
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  organisation: string;
  notes: string;
  birthday: string;
}

/**
 * A minimal vCard (2.1/3.0/4.0) reader — every phone and address book exports
 * to this format, whether the source is Android, iOS, Google or Outlook. Only
 * the fields `contacts` already has a place for are read; anything else in
 * the file is left alone rather than guessed at.
 */
function parseVCard(text: string): VCardEntry[] {
  // A line starting with a space or tab continues the one before it — vCard's
  // own line-folding, done before anything else can split on newlines safely.
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const cards: VCardEntry[] = [];
  let current: Partial<VCardEntry> | null = null;

  for (const rawLine of unfolded.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^BEGIN:VCARD$/i.test(line)) {
      current = {};
      continue;
    }
    if (/^END:VCARD$/i.test(line)) {
      if (current) {
        const name = (current.name ?? '').trim() || [current.firstName, current.lastName].filter(Boolean).join(' ').trim();
        if (name) {
          cards.push({
            name,
            firstName: current.firstName ?? '',
            lastName: current.lastName ?? '',
            phone: current.phone ?? '',
            email: current.email ?? '',
            organisation: current.organisation ?? '',
            notes: current.notes ?? '',
            birthday: current.birthday ?? '',
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).split(';')[0]!.toUpperCase();
    const value = line
      .slice(colon + 1)
      .replace(/\\,/g, ',')
      .replace(/\\n/gi, ' ')
      .trim();

    switch (key) {
      case 'FN':
        current.name = value;
        break;
      case 'N': {
        const [lastName, firstName] = value.split(';');
        current.lastName ||= lastName ?? '';
        current.firstName ||= firstName ?? '';
        break;
      }
      case 'TEL':
        current.phone ||= value;
        break;
      case 'EMAIL':
        current.email ||= value;
        break;
      case 'ORG':
        current.organisation ||= value.split(';')[0] ?? '';
        break;
      case 'NOTE':
        current.notes ||= value;
        break;
      case 'BDAY': {
        const digits = value.replace(/-/g, '');
        if (/^\d{8}$/.test(digits)) {
          current.birthday ||= `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
        }
        break;
      }
      default:
        break;
    }
  }
  return cards;
}

interface ContactImportRow extends VCardEntry {
  key: string;
  duplicate: boolean;
}

/**
 * A `.vcf` export — Android's, iOS's, Google's and Outlook's contact books all
 * produce one — matched against contacts already here by name so the same
 * export run twice does not double everyone up.
 */
function ContactImportDialog({
  dialog,
  existing,
  onCreate,
  onImported,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  existing: StoredRecord[];
  onCreate: (input: Record<string, unknown>) => Promise<StoredRecord>;
  onImported: () => Promise<void> | void;
}): JSX.Element {
  const toast = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<ContactImportRow[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);

  const reset = (): void => {
    setFileName(null);
    setParseError(null);
    setRows([]);
    setChecked({});
  };

  const readFile = async (file: File): Promise<void> => {
    reset();
    setFileName(file.name);
    try {
      const entries = parseVCard(await file.text());
      if (entries.length === 0) throw new Error('No contacts were found in that file.');

      const existingNames = new Set(existing.map((contact) => String(contact['name'] ?? '').trim().toLowerCase()));
      const nextRows: ContactImportRow[] = [];
      const nextChecked: Record<string, boolean> = {};
      entries.forEach((entry, index) => {
        const key = `${index}`;
        const duplicate = existingNames.has(entry.name.trim().toLowerCase());
        nextRows.push({ ...entry, key, duplicate });
        nextChecked[key] = !duplicate;
      });

      setRows(nextRows);
      setChecked(nextChecked);
    } catch (cause) {
      setParseError(cause instanceof Error ? cause.message : 'That file could not be read.');
    }
  };

  const selected = rows.filter((row) => checked[row.key]);

  const apply = async (): Promise<void> => {
    if (selected.length === 0) return;
    setApplying(true);
    try {
      await Promise.all(
        selected.map((row) =>
          onCreate({
            name: row.name,
            firstName: row.firstName,
            lastName: row.lastName,
            phone: row.phone,
            email: row.email,
            organisation: row.organisation,
            notes: row.notes,
            ...(row.birthday ? { birthday: row.birthday } : {}),
          }),
        ),
      );
      await onImported();
      toast.success(`Added ${selected.length} contact${selected.length === 1 ? '' : 's'}`);
      dialog.hide();
      reset();
    } catch (cause) {
      toast.fromError(cause, 'Some contacts did not save');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={() => {
        dialog.hide();
        reset();
      }}
      title="Import contacts"
      description="A .vcf file exported from a phone or address book — Android, iPhone, Google and Outlook all produce one."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide} disabled={applying}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void apply()} loading={applying} disabled={selected.length === 0}>
            Add {selected.length} contact{selected.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <FileButton
        label={fileName ? `Chosen: ${fileName}` : 'Choose a .vcf file'}
        accept=".vcf,text/vcard,text/x-vcard"
        onFile={(file) => void readFile(file)}
        variant="secondary"
      />

      {parseError ? (
        <p className="small" style={{ color: 'var(--danger)', marginTop: 'var(--space-3)' }}>
          {parseError}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="list" style={{ marginTop: 'var(--space-4)' }}>
          {rows.map((row) => (
            <div key={row.key} className="list-row">
              <input
                type="checkbox"
                checked={Boolean(checked[row.key])}
                onChange={(event) => setChecked((current) => ({ ...current, [row.key]: event.target.checked }))}
                aria-label={`Add ${row.name}`}
              />
              <Avatar name={row.name} size={30} round />
              <span className="list-row__body">
                <span className="list-row__title">{row.name}</span>
                <span className="list-row__meta">
                  {row.phone ? <span className="faint">{row.phone}</span> : null}
                  {row.duplicate ? <Chip>Already a contact</Chip> : null}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
          {rows.length} found, {rows.filter((row) => row.duplicate).length} already here and left unchecked.
        </p>
      ) : null}
    </Dialog>
  );
}
