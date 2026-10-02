import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BIRTHDAY_MESSAGES,
  nextBirthdayOccurrence,
  pickDaily,
  type StoredRecord,
} from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { useActiveMemberId } from '../core/auth.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { Button, Card } from '../ui/primitives.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { TextField } from '../ui/forms.js';
import { Icon } from '../ui/Icon.js';
import { GiveBadgePicker, MemberBadgeRow, parseBadges, type MemberBadge } from '../ui/MemberBadges.js';

/**
 * The birthday celebration view: a card, a guestbook, a place to give a gift,
 * and a shortcut into the existing Journal rather than a memory concept of
 * its own. Reached from the Birthdays panel and from the member's own
 * profile, both of which already hold the member record and its own update
 * function — this takes both as props instead of fetching its own copy.
 */
export function BirthdayCelebration({
  dialog,
  onUpdateMember,
}: {
  dialog: ReturnType<typeof useDialog<StoredRecord>>;
  onUpdateMember: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
}): JSX.Element | null {
  const member = dialog.value;
  const memberId = member?.id ?? '';
  const navigate = useNavigate();
  const dates = useDateFormat();
  const toast = useToast();
  const activeMemberId = useActiveMemberId();
  const [draft, setDraft] = useState('');

  const notes = useCollection('memberNotes', {
    enabled: dialog.open,
    filter: (note) => note['kind'] === 'greeting' && ((note['toMemberIds'] as string[] | null) ?? []).includes(memberId),
  });
  const journal = useCollection('journalEntries', {
    enabled: dialog.open,
    filter: (entry) =>
      entry['memberId'] === memberId &&
      Array.isArray(entry['tags']) &&
      (entry['tags'] as string[]).includes('birthday'),
  });

  const occurrence = member?.['birthday'] ? nextBirthdayOccurrence(String(member['birthday'])) : null;
  const message = useMemo(
    () => pickDaily(BIRTHDAY_MESSAGES, new Date()).replace('{name}', member ? String(member['name']) : ''),
    [member],
  );
  const badges = parseBadges(member?.['customBadges']);

  const thisYear = new Date().getFullYear();
  const todaysGreetings = notes.items.filter((note) => new Date(String(note['createdAt'])).getFullYear() === thisYear);

  const recap = useMemo(() => {
    const byYear = new Map<number, { greetings: StoredRecord[]; memories: StoredRecord[] }>();
    for (const note of notes.items) {
      const year = new Date(String(note['createdAt'])).getFullYear();
      if (year === thisYear) continue;
      const bucket = byYear.get(year) ?? { greetings: [], memories: [] };
      bucket.greetings.push(note);
      byYear.set(year, bucket);
    }
    for (const entry of journal.items) {
      const year = new Date(String(entry['entryDate'])).getFullYear();
      const bucket = byYear.get(year) ?? { greetings: [], memories: [] };
      bucket.memories.push(entry);
      byYear.set(year, bucket);
    }
    return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  }, [notes.items, journal.items, thisYear]);

  if (!member) return null;

  const giveBadge = async (emoji: string, label: string): Promise<void> => {
    const badge: MemberBadge = {
      id: `badge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      emoji,
      label,
      awardedAt: new Date().toISOString(),
      awardedByMemberId: activeMemberId ?? null,
    };
    await onUpdateMember(member.id, { customBadges: [...badges, badge] });
    toast.success(`Gave ${String(member['name'])} a ${label.toLowerCase()}`);
  };

  const sendGreeting = async (): Promise<void> => {
    if (!draft.trim()) return;
    await notes.create({
      kind: 'greeting',
      toMemberIds: [member.id],
      body: draft.trim(),
      ...(activeMemberId ? { fromMemberId: activeMemberId } : {}),
    });
    setDraft('');
    toast.success('Left in the guestbook');
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title={`${String(member['name'])}'s birthday`}
      description={occurrence ? `Turning ${occurrence.age} today` : undefined}
      wide
    >
      <div className="celebration-sparkles" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} className="celebration-sparkles__star">
            <Icon name="sparkle" size={index % 2 === 0 ? 14 : 20} />
          </span>
        ))}
      </div>

      <div className="stack">
        <Card style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--size-lg)' }}>{message}</p>
        </Card>

        <Card
          title="Gifts"
          subtitle={badges.length > 0 ? `${badges.length} so far` : 'Nothing given yet'}
        >
          <MemberBadgeRow badges={badges} />
          <p className="tiny faint" style={{ marginTop: badges.length > 0 ? 'var(--space-3)' : 0 }}>
            Tap one to give it
          </p>
          <GiveBadgePicker onGive={(emoji, label) => void giveBadge(emoji, label)} />
        </Card>

        <Card title="Guestbook">
          {todaysGreetings.length === 0 ? (
            <p className="small faint">Nothing left yet today. Be the first.</p>
          ) : (
            <div className="stack stack--tight" style={{ marginBottom: 'var(--space-3)' }}>
              {todaysGreetings.map((note) => (
                <p key={note.id} className="small">
                  {String(note['body'] ?? '')}
                  <span className="faint"> · {dates.relative(String(note['createdAt']))}</span>
                </p>
              ))}
            </div>
          )}
          <TextField
            label="Leave a birthday message"
            value={draft}
            onChange={setDraft}
            multiline
            rows={2}
            placeholder="Happy birthday…"
          />
          <Button
            variant="secondary"
            size="sm"
            style={{ marginTop: 'var(--space-2)' }}
            disabled={!draft.trim()}
            onClick={() => void sendGreeting()}
          >
            Leave it
          </Button>
        </Card>

        <Button
          variant="ghost"
          onClick={() => {
            dialog.hide();
            navigate(`/journal?new=1&memberId=${member.id}&tag=birthday`);
          }}
        >
          Add a memory
        </Button>

        {recap.length > 0 ? (
          <Card title="Past birthdays">
            <div className="stack">
              {recap.map(([year, bucket]) => (
                <div key={year}>
                  <p className="tiny faint" style={{ marginBottom: 'var(--space-1)' }}>
                    {year}
                  </p>
                  <div className="stack stack--tight">
                    {bucket.greetings.map((note) => (
                      <p key={note.id} className="small">
                        {String(note['body'] ?? '')}
                      </p>
                    ))}
                    {bucket.memories.map((entry) => (
                      <p key={entry.id} className="small">
                        {String(entry['title'] || 'A memory from that year')}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </Dialog>
  );
}
