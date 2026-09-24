import { useCallback, useEffect, useState } from 'react';
import { newId } from '@pluralnova/shared';
import { NetworkError, api, isOffline, messageFor } from '../core/api.js';
import { realtime } from '../core/realtime.js';
import { useCollection } from '../core/data.js';
import { getMeta, setMeta } from '../core/localdb.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useActiveMemberId } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, Meter } from '../ui/primitives.js';
import { DateTimeField, SwitchRow, TextField } from '../ui/forms.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Internal polls.
 *
 * For decisions the system takes together. An anonymous poll really is
 * anonymous: the server returns counts only, so the names are not sent and then
 * hidden by the client.
 */

interface PollOption {
  id: string;
  label: string;
  count: number;
  share: number;
  voters: { memberId: string; name: string; comment: string }[];
}

interface Poll {
  id: string;
  title: string;
  description: string;
  options: { id: string; label: string }[];
  results: PollOption[];
  anonymous: boolean;
  multipleChoice: boolean;
  closesAt: string | null;
  closed: boolean;
  isClosed: boolean;
  totalVotes: number;
  memberId: string | null;
  createdAt: string;
}

export default function Polls(): JSX.Element {
  const { term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const activeMemberId = useActiveMemberId();
  const members = useCollection('members');

  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asMemberId, setAsMemberId] = useState<string | null>(activeMemberId);
  const composer = useDialog();

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ polls: Poll[] }>('/api/system/polls');
      setPolls(result.polls);
      setError(null);
      void setMeta('polls.current', result.polls);
    } catch (cause) {
      // Tallies are computed live and never stored on the record itself, so
      // the last full answer this device saw — voters and all — is kept
      // rather than falling back to the bare questions with no results.
      if (isOffline(cause)) {
        const cached = await getMeta<Poll[]>('polls.current');
        if (cached) {
          setPolls(cached);
          setError('Shown from this device. Reconnect for the latest.');
          return;
        }
      }
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return realtime.on((event) => {
      if (event.type === 'poll.updated') void load();
    });
  }, [load]);

  const vote = async (poll: Poll, optionIds: string[]): Promise<void> => {
    try {
      await api.post(`/api/system/polls/${poll.id}/vote`, { optionIds, memberId: asMemberId });
      await load();
      toast.success('Vote recorded');
    } catch (cause) {
      // A vote changes the tally everyone sees, so it is never queued —
      // offline, the default "saved on this device" text would be false here.
      toast.fromError(
        isOffline(cause) ? new NetworkError('This needs a connection — the vote was not recorded.') : cause,
        'Could not record that vote',
      );
    }
  };

  const open = polls.filter((poll) => !poll.isClosed);
  const closed = polls.filter((poll) => poll.isClosed);

  return (
    <>
      <PageHeader
        title="Polls"
        description={term('For decisions the {{system}} makes together.')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => composer.show()}>
            New poll
          </Button>
        }
      />

      {members.items.length > 0 ? (
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <span className="tiny faint">Voting as</span>
          <Chip selected={asMemberId === null} onClick={() => setAsMemberId(null)}>
            {term('The {{system}}')}
          </Chip>
          {members.items.map((member) => (
            <Chip
              key={member.id}
              selected={asMemberId === member.id}
              color={(member['color'] as string) ?? null}
              onClick={() => setAsMemberId(member.id)}
            >
              {String(member['name'])}
            </Chip>
          ))}
        </div>
      ) : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : error && polls.length === 0 ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : polls.length === 0 ? (
        <Card>
          <EmptyState
            icon="poll"
            title="No polls yet"
            body={term(
              'Useful when a decision affects everyone — which is more often than it seems until you ask.',
            )}
            action={{ label: 'New poll', run: () => composer.show() }}
          />
        </Card>
      ) : (
        <div className="stack">
          {error ? <p className="tiny faint">{error}</p> : null}
          {[...open, ...closed].map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              onVote={(optionIds) => void vote(poll, optionIds)}
              onClose={() => {
                void api
                  .post(`/api/system/polls/${poll.id}/close`)
                  .then(() => {
                    toast.success('Poll closed');
                    void load();
                  })
                  .catch((cause: unknown) => toast.fromError(cause, 'Could not close that poll'));
              }}
              dates={dates}
            />
          ))}
        </div>
      )}

      <PollComposer dialog={composer} onCreated={() => void load()} />
    </>
  );
}

function PollCard({
  poll,
  onVote,
  onClose,
  dates,
}: {
  poll: Poll;
  onVote: (optionIds: string[]) => void;
  onClose: () => void;
  dates: ReturnType<typeof useDateFormat>;
}): JSX.Element {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string): void => {
    if (poll.multipleChoice) {
      setSelected((current) =>
        current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
      );
    } else {
      setSelected([id]);
      onVote([id]);
    }
  };

  return (
    <Card
      title={poll.title}
      subtitle={poll.description || undefined}
      actions={
        !poll.isClosed ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : (
          <Chip>Closed</Chip>
        )
      }
    >
      <div className="stack stack--tight">
        {poll.results.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={poll.isClosed}
            onClick={() => toggle(option.id)}
            aria-pressed={selected.includes(option.id)}
            style={{
              background: 'none',
              border: '1px solid',
              borderColor: selected.includes(option.id) ? 'var(--accent)' : 'var(--border)',
              borderRadius: 'var(--radius)',
              padding: 'var(--space-3)',
              textAlign: 'left',
              cursor: poll.isClosed ? 'default' : 'pointer',
              color: 'inherit',
            }}
          >
            <div className="row row--between" style={{ marginBottom: 6 }}>
              <span className="small">{option.label}</span>
              <span className="tiny numeric muted">
                {option.count} · {Math.round(option.share * 100)}%
              </span>
            </div>
            <Meter value={option.share} max={1} label={`${option.label}: ${option.count} votes`} />
            {!poll.anonymous && option.voters.length > 0 ? (
              <div className="row" style={{ marginTop: 6 }}>
                {option.voters.map((voter) => (
                  <Chip key={`${option.id}-${voter.memberId}`}>{voter.name}</Chip>
                ))}
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {poll.multipleChoice && !poll.isClosed ? (
        <Button
          variant="primary"
          size="sm"
          style={{ marginTop: 'var(--space-3)' }}
          disabled={selected.length === 0}
          onClick={() => onVote(selected)}
        >
          Submit vote
        </Button>
      ) : null}

      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <span className="tiny faint">
          {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
        </span>
        {poll.anonymous ? (
          <span className="tiny faint">
            <Icon name="lock" size={10} /> Anonymous
          </span>
        ) : null}
        {poll.closesAt ? (
          <span className="tiny faint">
            {poll.isClosed ? 'Closed' : 'Closes'} {dates.relative(poll.closesAt)}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function PollComposer({
  dialog,
  onCreated,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  onCreated: () => void;
}): JSX.Element {
  const toast = useToast();
  const polls = useCollection('polls');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState([
    { id: newId('opt').slice(4), label: '' },
    { id: newId('opt').slice(4), label: '' },
  ]);
  const [anonymous, setAnonymous] = useState(false);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const create = async (): Promise<void> => {
    const filled = options.filter((option) => option.label.trim());
    if (!title.trim() || filled.length < 2) return;

    setSaving(true);
    try {
      await polls.create({
        title: title.trim(),
        description,
        options: filled,
        anonymous,
        multipleChoice,
        closesAt,
        closed: false,
      });
      setTitle('');
      setDescription('');
      setOptions([
        { id: newId('opt').slice(4), label: '' },
        { id: newId('opt').slice(4), label: '' },
      ]);
      dialog.hide();
      onCreated();
      toast.success('Poll created');
    } catch (cause) {
      toast.fromError(cause, 'Could not create that poll');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="New poll"
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void create()}
            disabled={!title.trim() || options.filter((option) => option.label.trim()).length < 2}
            loading={saving}
          >
            Create
          </Button>
        </>
      }
    >
      <TextField label="Question" value={title} onChange={setTitle} required autoFocus />
      <TextField label="Details" value={description} onChange={setDescription} multiline rows={2} />

      <div className="field">
        <span className="field__label">Options</span>
        {options.map((option, index) => (
          <div key={option.id} className="row row--nowrap" style={{ marginBottom: 'var(--space-2)' }}>
            <input
              className="input"
              value={option.label}
              placeholder={`Option ${index + 1}`}
              aria-label={`Option ${index + 1}`}
              onChange={(event) =>
                setOptions((current) =>
                  current.map((candidate) =>
                    candidate.id === option.id ? { ...candidate, label: event.target.value } : candidate,
                  ),
                )
              }
            />
            {options.length > 2 ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove option ${index + 1}`}
                onClick={() => setOptions((current) => current.filter((candidate) => candidate.id !== option.id))}
              >
                <Icon name="close" size={13} />
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          icon="plus"
          onClick={() => setOptions((current) => [...current, { id: newId('opt').slice(4), label: '' }])}
        >
          Add an option
        </Button>
      </div>

      <SwitchRow
        label="Anonymous"
        hint="Only counts are stored against each option — no names are sent back."
        checked={anonymous}
        onChange={setAnonymous}
      />
      <SwitchRow label="Allow several answers" checked={multipleChoice} onChange={setMultipleChoice} />
      <DateTimeField label="Closes" value={closesAt} onChange={setClosesAt} />
    </Dialog>
  );
}
