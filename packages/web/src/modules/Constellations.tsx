import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateHandle } from '@pluralnova/shared';
import { api, messageFor } from '../core/api.js';
import { useAuth } from '../core/auth.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useCollection } from '../core/data.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, SectionHeading } from '../ui/primitives.js';
import {
  ColorField,
  ImageField,
  NumberField,
  SearchField,
  SelectField,
  SwitchRow,
  TextField,
  useDebounced,
} from '../ui/forms.js';
import { EmptyState, SkeletonCards } from '../ui/feedback.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Constellations.
 *
 * The public face of a system, and nothing more than what it was told to show.
 * The profile is private until someone deliberately publishes it, and each of
 * the "show this" switches is separate — publishing a profile does not publish
 * a member list.
 */

interface Profile {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  accent: string;
  systemType: string;
  pronouns: string;
  isPublic: boolean;
  showMemberCount: boolean;
  showMemberList: boolean;
  showCurrentFronter: boolean;
  acceptFriendRequests: boolean;
  acceptMessageRequests: boolean;
  memberSort: string;
  memberColumns: number;
  pinnedMediaIds: string[];
  customInfo: { label: string; value: string }[] | null;
  memberCount?: number;
}

export default function Constellations(): JSX.Element {
  const navigate = useNavigate();
  const { term } = useI18n();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [discovered, setDiscovered] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounced(rawSearch, 400);
  const editor = useDialog();

  const loadProfile = useCallback(async () => {
    try {
      const result = await api.get<{ profile: Profile | null }>('/api/social/profile');
      setProfile(result.profile);
    } catch (cause) {
      toast.fromError(cause, 'Could not load your profile');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    void api
      .get<{ profiles: Profile[] }>('/api/social/discover', { q: search })
      .then((result) => setDiscovered(result.profiles))
      .catch(() => setDiscovered([]));
  }, [search]);

  return (
    <>
      <PageHeader
        title="Constellations"
        description={term('A profile for your {{system}}, shown only as far as you choose.')}
        actions={
          <Button variant={profile ? 'secondary' : 'primary'} icon="edit" onClick={() => editor.show()}>
            {profile ? 'Edit profile' : 'Create a profile'}
          </Button>
        }
      />

      {loading ? (
        <SkeletonCards count={2} />
      ) : !profile ? (
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <EmptyState
            icon="constellation"
            title="No profile yet"
            body={term(
              'A Constellations profile is how other systems find you. It stays private until you turn on discoverability, and nothing about your {{members}} is shown unless you say so.',
            )}
            action={{ label: 'Create a profile', run: () => editor.show() }}
          />
        </Card>
      ) : (
        <Card style={{ marginBottom: 'var(--space-5)' }} flush>
          <div
            className="banner"
            style={{ ['--member-color' as never]: profile.accent || 'var(--accent)', height: 110 }}
          >
            {profile.bannerUrl ? <img className="banner__image" src={profile.bannerUrl} alt="" /> : null}
            <span className="banner__scrim" />
          </div>
          <div className="banner-profile">
            <div className="banner-profile__avatar" style={{ ['--avatar-size' as never]: '68px' }}>
              <Avatar
                name={profile.displayName}
                src={profile.avatarUrl || null}
                color={profile.accent || null}
                size={68}
                round
              />
            </div>
            <div className="banner-profile__body">
              <div className="row row--between">
                <div>
                  <h2 style={{ fontSize: 'var(--size-lg)' }}>{profile.displayName}</h2>
                  <div className="small faint">@{profile.handle}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/constellations/${profile.handle}`)}>
                  View as others see it
                </Button>
              </div>
              {profile.bio ? <p className="prose small" style={{ marginTop: 'var(--space-3)' }}>{profile.bio}</p> : null}
              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                <Chip accent={profile.isPublic}>
                  <Icon name={profile.isPublic ? 'eye' : 'eyeOff'} size={11} />
                  {profile.isPublic ? 'Discoverable' : 'Private'}
                </Chip>
                {profile.showMemberList ? <Chip>{term('{{Member}} list shown')}</Chip> : null}
                {profile.showCurrentFronter ? <Chip>{term('{{Fronting}} shown')}</Chip> : null}
                {!profile.acceptFriendRequests ? <Chip>Requests closed</Chip> : null}
              </div>
            </div>
          </div>
        </Card>
      )}

      <SectionHeading label="Find other systems" />
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <SearchField value={rawSearch} onChange={setRawSearch} placeholder="Search handles and names…" />
      </div>

      {discovered.length === 0 ? (
        <Card>
          <EmptyState
            icon="search"
            title={search ? 'Nothing matches that' : 'Nobody to show yet'}
            body={
              search
                ? 'Try a different handle or name.'
                : 'Systems appear here once they make their profile discoverable.'
            }
          />
        </Card>
      ) : (
        <div className="stack">
          {discovered.map((other) => (
            <button
              key={other.id}
              type="button"
              className="card card--interactive"
              style={{ textAlign: 'left' }}
              onClick={() => navigate(`/constellations/${other.handle}`)}
            >
              <div className="row row--between row--nowrap">
                <div className="row row--nowrap" style={{ minWidth: 0 }}>
                  <Avatar
                    name={other.displayName}
                    src={other.avatarUrl || null}
                    color={other.accent || null}
                    size={40}
                    round
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 'var(--weight-medium)' }}>
                      {other.displayName}
                    </div>
                    <div className="tiny faint truncate">
                      @{other.handle}
                      {other.memberCount !== undefined ? ` · ${other.memberCount} ${term('{{members}}')}` : ''}
                    </div>
                  </div>
                </div>
                <Icon name="chevronRight" size={14} />
              </div>
              {other.bio ? (
                <p className="small muted clamp-2" style={{ marginTop: 'var(--space-2)' }}>
                  {other.bio}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <ProfileEditor dialog={editor} profile={profile} onSaved={() => void loadProfile()} />
    </>
  );
}

function ProfileEditor({
  dialog,
  profile,
  onSaved,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  profile: Profile | null;
  onSaved: () => void;
}): JSX.Element {
  const { term } = useI18n();
  const toast = useToast();
  const media = useCollection('mediaItems', { filter: (item) => item['mediaType'] === 'image' });

  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const key = profile?.id ?? 'new';
  if (dialog.open && loadedFor !== key) {
    setLoadedFor(key);
    setDraft(
      profile ?? {
        handle: '',
        displayName: '',
        bio: '',
        accent: '',
        memberSort: 'orbit',
        memberColumns: 3,
        acceptFriendRequests: true,
        acceptMessageRequests: true,
        pinnedMediaIds: [],
      },
    );
    setError(null);
  }
  if (!dialog.open && loadedFor !== null) setLoadedFor(null);

  const set = <K extends keyof Profile>(field: K, value: Profile[K]): void =>
    setDraft((current) => ({ ...current, [field]: value }));

  const save = async (): Promise<void> => {
    const handleError = validateHandle(String(draft.handle ?? ''));
    if (handleError) {
      setError(handleError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.put('/api/social/profile', draft);
      toast.success('Profile saved');
      dialog.hide();
      onSaved();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title={profile ? 'Edit your profile' : 'Create a profile'}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <TextField
        label="Handle"
        value={String(draft.handle ?? '')}
        onChange={(value) => set('handle', value.toLowerCase())}
        hint="Letters, numbers, dots, dashes and underscores. This is how people find you."
        {...(error ? { error } : {})}
        required
      />
      <TextField
        label="Display name"
        value={String(draft.displayName ?? '')}
        onChange={(value) => set('displayName', value)}
        required
      />
      <TextField label="Pronouns" value={String(draft.pronouns ?? '')} onChange={(value) => set('pronouns', value)} />
      <TextField
        label="Bio"
        value={String(draft.bio ?? '')}
        onChange={(value) => set('bio', value)}
        multiline
        rows={3}
      />
      <TextField
        label={term('How you describe the {{system}}')}
        value={String(draft.systemType ?? '')}
        onChange={(value) => set('systemType', value)}
        hint="Only if you want it shown. Nothing is assumed."
      />
      <ImageField label="Avatar" value={String(draft.avatarUrl ?? '')} onChange={(value) => set('avatarUrl', value)} shape="avatar" />
      <ImageField label="Banner" value={String(draft.bannerUrl ?? '')} onChange={(value) => set('bannerUrl', value)} shape="banner" />
      <ColorField label="Accent" value={String(draft.accent ?? '')} onChange={(value) => set('accent', value)} />

      <h3 className="section-heading__label" style={{ margin: 'var(--space-5) 0 var(--space-3)' }}>
        What this profile shows
      </h3>

      <SwitchRow
        label="Discoverable"
        hint="Off means only people you are already friends with can open it."
        checked={draft.isPublic === true}
        onChange={(value) => set('isPublic', value)}
      />
      <SwitchRow
        label={term('Show how many {{members}} there are')}
        checked={draft.showMemberCount === true}
        onChange={(value) => set('showMemberCount', value)}
      />
      <SwitchRow
        label={term('Show the {{member}} list')}
        hint={term('Each {{member}} can still opt out individually from their own profile.')}
        checked={draft.showMemberList === true}
        onChange={(value) => set('showMemberList', value)}
      />
      <SwitchRow
        label={term('Show who is {{fronting}}')}
        checked={draft.showCurrentFronter === true}
        onChange={(value) => set('showCurrentFronter', value)}
      />
      <SwitchRow
        label="Accept friend requests"
        checked={draft.acceptFriendRequests !== false}
        onChange={(value) => set('acceptFriendRequests', value)}
      />
      <SwitchRow
        label="Accept message requests"
        hint="From systems you are not friends with."
        checked={draft.acceptMessageRequests !== false}
        onChange={(value) => set('acceptMessageRequests', value)}
      />

      <SelectField
        label={term('{{Member}} order')}
        value={String(draft.memberSort ?? 'orbit')}
        options={[
          { value: 'orbit', label: 'Orbit order' },
          { value: 'alphabetical', label: 'Alphabetical' },
          { value: 'newest', label: 'Newest first' },
          { value: 'active', label: 'Most active' },
          { value: 'custom', label: 'Custom' },
        ]}
        onChange={(value) => set('memberSort', value)}
        placeholder="Orbit order"
      />
      <NumberField
        label="Grid columns"
        value={Number(draft.memberColumns ?? 3)}
        onChange={(value) => set('memberColumns', Math.min(5, Math.max(1, value ?? 3)))}
        min={1}
        max={5}
        hint="Up to five, where the screen is wide enough."
      />

      {media.items.length > 0 ? (
        <div className="field">
          <span className="field__label">Pinned gallery</span>
          <p className="field__hint">Pick images from your media library to show on the profile.</p>
          <div className="grid grid--tight" style={{ ['--grid-min' as never]: '80px' }}>
            {media.items.slice(0, 24).map((item) => {
              const pinned = (draft.pinnedMediaIds ?? []).includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={pinned}
                  onClick={() =>
                    set(
                      'pinnedMediaIds',
                      pinned
                        ? (draft.pinnedMediaIds ?? []).filter((id) => id !== item.id)
                        : [...(draft.pinnedMediaIds ?? []), item.id],
                    )
                  }
                  style={{
                    padding: 0,
                    border: pinned ? '2px solid var(--accent)' : 'var(--border-width) solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    aspectRatio: '1',
                    cursor: 'pointer',
                    background: 'none',
                  }}
                >
                  <img
                    src={String(item['url'])}
                    alt={String(item['title'] ?? '')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
