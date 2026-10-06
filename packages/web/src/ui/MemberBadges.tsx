/**
 * Badges a member has been given — small, decorative, and entirely optional.
 * Stored as plain JSON on `members.customBadges` rather than a collection of
 * their own, since a badge has no life of its own beyond sitting on a
 * profile: nothing reminds about it, lists it, or reports on it.
 */
export interface MemberBadge {
  id: string;
  emoji: string;
  label: string;
  awardedAt: string;
  awardedByMemberId: string | null;
}

/** A fixed set rather than free text, so a badge stays a quick tap, not a form. */
export const GIFT_EMOJI: readonly { emoji: string; label: string }[] = [
  { emoji: '🎁', label: 'Gift' },
  { emoji: '🎂', label: 'Birthday cake' },
  { emoji: '🧁', label: 'Cupcake' },
  { emoji: '🎉', label: 'Celebration' },
  { emoji: '🎈', label: 'Balloon' },
  { emoji: '⭐', label: 'Star' },
  { emoji: '🌟', label: 'Shining star' },
  { emoji: '✨', label: 'Sparkle' },
  { emoji: '💝', label: 'Heart gift' },
  { emoji: '🏅', label: 'Medal' },
  { emoji: '🏆', label: 'Trophy' },
  { emoji: '🌈', label: 'Rainbow' },
];

export function createBadge(emoji: string, label: string, awardedByMemberId: string | null): MemberBadge {
  return {
    id: `badge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    emoji,
    label,
    awardedAt: new Date().toISOString(),
    awardedByMemberId,
  };
}

export function parseBadges(value: unknown): MemberBadge[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is MemberBadge =>
      Boolean(entry) && typeof entry === 'object' && typeof (entry as MemberBadge).emoji === 'string',
  );
}

/** A compact row of what's been given — read-only, for anyone looking at the profile. */
export function MemberBadgeRow({ badges }: { badges: MemberBadge[] }): JSX.Element | null {
  if (badges.length === 0) return null;
  return (
    <div className="row" role="list" aria-label="Badges">
      {badges.map((badge) => (
        <span
          key={badge.id}
          role="listitem"
          title={badge.label}
          style={{ fontSize: 'var(--size-lg)', lineHeight: 1 }}
        >
          {badge.emoji}
        </span>
      ))}
    </div>
  );
}

/** A one-tap picker: choosing an emoji gives the badge immediately, no extra form. */
export function GiveBadgePicker({ onGive }: { onGive: (emoji: string, label: string) => void }): JSX.Element {
  return (
    <div className="row" aria-label="Give a gift">
      {GIFT_EMOJI.map(({ emoji, label }) => (
        <button
          key={emoji}
          type="button"
          className="badge-picker__option"
          aria-label={`Give ${label}`}
          title={label}
          onClick={() => onGive(emoji, label)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
