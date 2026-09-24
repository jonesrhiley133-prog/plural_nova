import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, messageFor } from '../core/api.js';
import { realtime } from '../core/realtime.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { refreshBadges } from '../core/badges.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, ListRow } from '../ui/primitives.js';
import { TextField } from '../ui/forms.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';

/**
 * Friends.
 *
 * Requests, friends, mutes and blocks. Declining is silent — the other side is
 * not told — because a refusal that generates a notification is an invitation
 * to try again.
 */

interface Person {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string;
  accent: string;
  state?: string;
  mutual?: boolean;
  lastInteractionAt?: string | null;
}

interface Request {
  id: string;
  message: string;
  createdAt: string;
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string;
}

export default function Friends(): JSX.Element {
  const navigate = useNavigate();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();

  const [friends, setFriends] = useState<Person[]>([]);
  const [blocked, setBlocked] = useState<Person[]>([]);
  const [incoming, setIncoming] = useState<Request[]>([]);
  const [outgoing, setOutgoing] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const adder = useDialog();
  const confirmRemove = useDialog<Person>();

  const load = useCallback(async () => {
    try {
      const [friendsResult, requestsResult] = await Promise.all([
        api.get<{ friends: Person[]; blocked: Person[] }>('/api/social/friends'),
        api.get<{ incoming: Request[]; outgoing: Request[] }>('/api/social/friends/requests'),
      ]);
      setFriends(friendsResult.friends);
      setBlocked(friendsResult.blocked);
      setIncoming(requestsResult.incoming);
      setOutgoing(requestsResult.outgoing);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return realtime.on((event) => {
      if (event.type === 'friend.request' || event.type === 'friend.accepted') void load();
    });
  }, [load]);

  const respond = async (request: Request, accept: boolean): Promise<void> => {
    try {
      if (accept) {
        await api.post(`/api/social/friends/requests/${request.id}/accept`);
        toast.success(`You and ${request.displayName} are now friends`);
      } else {
        await api.post(`/api/social/friends/requests/${request.id}/decline`);
        toast.info('Declined', 'They are not told.');
      }
      await load();
      void refreshBadges();
    } catch (cause) {
      toast.fromError(cause);
    }
  };

  const setState = async (person: Person, state: string): Promise<void> => {
    try {
      await api.post(`/api/social/friends/${person.userId}/state`, { state });
      toast.success(state === 'blocked' ? `${person.displayName} is blocked` : 'Updated');
      await load();
    } catch (cause) {
      toast.fromError(cause);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title={t('social.friends')} />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('social.friends')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => adder.show()}>
            {t('social.addFriend')}
          </Button>
        }
      />

      {error ? <ErrorPanel message={error} onRetry={() => void load()} /> : null}

      <div className="stack">
        {incoming.length > 0 ? (
          <Card title={t('social.requests')} subtitle={`${incoming.length} waiting`} flush>
            <div className="list">
              {incoming.map((request) => (
                <div key={request.id} className="list-row">
                  <Avatar name={request.displayName} src={request.avatarUrl || null} size={40} round />
                  <span className="list-row__body">
                    <span className="list-row__title">{request.displayName}</span>
                    <span className="list-row__meta">
                      {request.handle ? <Chip>@{request.handle}</Chip> : null}
                      {request.message ? <span className="faint">{request.message}</span> : null}
                      <span className="faint">{dates.relative(request.createdAt)}</span>
                    </span>
                  </span>
                  <span className="list-row__trailing">
                    <Button variant="primary" size="sm" onClick={() => void respond(request, true)}>
                      {t('social.accept')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void respond(request, false)}>
                      {t('social.decline')}
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {outgoing.length > 0 ? (
          <Card title="Sent" subtitle="Waiting on them" flush>
            <div className="list">
              {outgoing.map((request) => (
                <ListRow
                  key={request.id}
                  title={request.displayName}
                  leading={<Avatar name={request.displayName} src={request.avatarUrl || null} size={32} round />}
                  meta={<span className="faint">Sent {dates.relative(request.createdAt)}</span>}
                  trailing={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void api
                          .delete(`/api/social/friends/requests/${request.id}`)
                          .then(() => {
                            toast.info('Request cancelled');
                            void load();
                          })
                          .catch((cause: unknown) => toast.fromError(cause, 'Could not cancel that request'));
                      }}
                    >
                      Cancel
                    </Button>
                  }
                />
              ))}
            </div>
          </Card>
        ) : null}

        {friends.length === 0 && incoming.length === 0 ? (
          <Card>
            <EmptyState
              icon="friend"
              title="No friends yet"
              body={term('Find a {{system}} on Constellations, or send a request to a handle you already know.')}
              action={{ label: 'Browse Constellations', run: () => navigate('/constellations') }}
              secondaryAction={{ label: t('social.addFriend'), run: () => adder.show() }}
            />
          </Card>
        ) : friends.length > 0 ? (
          <Card title={`${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}`} flush>
            <div className="list">
              {friends.map((person) => (
                <div key={person.userId} className="list-row">
                  <Avatar
                    name={person.displayName}
                    src={person.avatarUrl || null}
                    color={person.accent || null}
                    size={40}
                    round
                  />
                  <span className="list-row__body">
                    <span className="list-row__title">{person.displayName}</span>
                    <span className="list-row__meta">
                      {person.handle ? <Chip>@{person.handle}</Chip> : null}
                      {person.state === 'muted' ? <Chip>Muted</Chip> : null}
                      {!person.mutual ? <Chip>Not mutual yet</Chip> : null}
                    </span>
                  </span>
                  <span className="list-row__trailing">
                    {person.handle ? (
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/constellations/${person.handle}`)}>
                        Profile
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void api
                          .post<{ conversation: { threadId: string } }>('/api/messages/conversations', {
                            userId: person.userId,
                          })
                          .then((result) => navigate(`/messages/${result.conversation.threadId}`))
                          .catch((cause: unknown) => toast.fromError(cause));
                      }}
                    >
                      Message
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void setState(person, person.state === 'muted' ? 'active' : 'muted')}
                    >
                      {person.state === 'muted' ? 'Unmute' : t('social.mute')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => confirmRemove.show(person)}>
                      {t('action.more')}
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {blocked.length > 0 ? (
          <Card title="Blocked" subtitle="You and they cannot see each other" flush>
            <div className="list">
              {blocked.map((person) => (
                <ListRow
                  key={person.userId}
                  title={person.displayName}
                  leading={<Avatar name={person.displayName} size={32} round />}
                  trailing={
                    <Button variant="ghost" size="sm" onClick={() => void setState(person, 'active')}>
                      {t('social.unblock')}
                    </Button>
                  }
                />
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <AddFriendDialog dialog={adder} onSent={() => void load()} />

      <ConfirmDialog
        open={confirmRemove.open}
        onClose={confirmRemove.hide}
        title={`Remove ${confirmRemove.value?.displayName ?? 'this friend'}?`}
        body="You will both lose access to anything shared only with friends. You can send a new request later."
        confirmLabel="Remove"
        recoverable={false}
        onConfirm={async () => {
          if (!confirmRemove.value) return;
          await api.delete(`/api/social/friends/${confirmRemove.value.userId}`);
          toast.success('Removed');
          await load();
        }}
      />
    </>
  );
}

function AddFriendDialog({
  dialog,
  onSent,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  onSent: () => void;
}): JSX.Element {
  const { term } = useI18n();
  const toast = useToast();
  const [handle, setHandle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/social/friends/requests', { handle: handle.trim(), message });
      toast.success('Request sent');
      setHandle('');
      setMessage('');
      dialog.hide();
      onSent();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="Add a friend"
      description={term("Requests respect the other {{system}}'s privacy settings.")}
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void send()} disabled={!handle.trim()} loading={busy}>
            Send request
          </Button>
        </>
      }
    >
      <TextField
        label="Their handle"
        value={handle}
        onChange={setHandle}
        placeholder="their-handle"
        {...(error ? { error } : {})}
        autoFocus
      />
      <TextField label="Message" value={message} onChange={setMessage} multiline rows={2} />
    </Dialog>
  );
}
