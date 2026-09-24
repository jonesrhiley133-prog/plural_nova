import { useNavigate } from 'react-router-dom';
import { EMOTIONS, COLLECTIONS } from '@pluralnova/shared';
import { useI18n } from '../core/i18n.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, Stat } from '../ui/primitives.js';
import { Icon, iconOr } from '../ui/Icon.js';

/**
 * What is in PluralNova.
 *
 * A plain inventory, grouped the way the navigation is, with a link into each
 * area. Written so someone deciding whether to use this can tell what it does
 * without opening every screen.
 */

const AREAS = [
  {
    icon: 'system' as const,
    title: '{{System}} management',
    body: '{{Members}} with profiles as detailed or as sparse as you like, {{subsystems}}, groups, a profile switcher, relationships, a {{headspace}} mapper, and a history of what changed.',
    items: ['{{Members}}', 'Profile select', 'Organise', '{{Subsystems}}', 'Relationships', '{{Headspace}}', '{{System}} history'],
    path: '/members',
  },
  {
    icon: 'front' as const,
    title: '{{Fronting}}',
    body: 'One step to record who is out. Several people at once, nobody, or someone unnamed. A full tracker with timeline, day, week and month views, every entry editable, and statistics that describe rather than conclude.',
    items: ['Quick {{front}}', '{{Front}} tracker', 'Statistics'],
    path: '/fronting',
  },
  {
    icon: 'journal' as const,
    title: 'Journalling and notes',
    body: 'Entries for the whole {{system}} or by one {{member}}, with moods, tags and per-entry visibility. Notes with folders, checklists and pinning.',
    items: ['{{Journal}}', 'Notes', 'Templates', 'Media library'],
    path: '/journal',
  },
  {
    icon: 'wellbeing' as const,
    title: 'Wellbeing',
    body: `${EMOTIONS.length} emotions in twelve families, body sensations on an anatomy outline, sleep, cycle, fitness, daily check-ins with metrics you name yourself — and insights that describe the log without interpreting it.`,
    items: ['Wellbeing', 'Emotions', 'Body sensations', 'Emotion insights', 'Sleep', 'Cycle', 'Fitness'],
    path: '/wellbeing',
  },
  {
    icon: 'task' as const,
    title: 'Getting through the day',
    body: 'Tasks with recurrence and reminders, a full calendar, contacts with a safety note, emergency contacts kept out of every public surface, locations recorded by hand, finances and work.',
    items: ['Tasks', 'Calendar', 'Contacts', 'Emergency contacts', 'Locations', 'Finances', 'Work'],
    path: '/tasks',
  },
  {
    icon: 'social' as const,
    title: 'Social, if you want it',
    body: 'A profile you control down to each {{member}}, friends, a feed you post to as the {{system}} or as one {{member}}, and private messages that are encrypted when both sides can be.',
    items: ['Constellations', 'Friends', 'Flux', 'Messages'],
    path: '/constellations',
  },
  {
    icon: 'chat' as const,
    title: 'Internal',
    body: 'A {{system}}-only chat, a bulletin board for notices, and polls for decisions that affect everyone. None of it leaves the account.',
    items: ['{{System}} chat', 'Bulletin board', 'Polls'],
    path: '/system-chat',
  },
  {
    icon: 'create' as const,
    title: 'Creative',
    body: 'A story workspace with chapters, scenes, characters and worldbuilding, a character database, a reading tracker, a music section over a public catalogue, video collections, resources and your own dictionary.',
    items: ['Stories', 'Characters', 'Fic tracker', 'Music', 'Video', 'Resources', 'Dictionary'],
    path: '/stories',
  },
  {
    icon: 'backup' as const,
    title: 'Your data',
    body: 'Full export in one versioned file, restore with a preview and no destructive merge, imports from other apps and from CSV, sync across devices, and everything usable offline.',
    items: ['Backup', 'Restore', 'Import', 'Export', 'Sync', 'Offline'],
    path: '/backup',
  },
  {
    icon: 'lock' as const,
    title: 'Privacy and security',
    body: 'Private by default, enforced on the server. A vault behind a second lock. Per-{{member}} visibility. Passwords stored with scrypt, sessions that can be revoked, and nothing sensitive in a notification preview.',
    items: ['Private vault', 'Visibility controls', 'Per-{{member}} privacy', 'Session management'],
    path: '/settings/privacy',
  },
  {
    icon: 'settings' as const,
    title: 'Making it yours',
    body: 'Terminology that applies everywhere, four base themes with a custom accent, glass, solid or clear surfaces, three effect tiers, high contrast, larger text, reduced motion, and a dashboard you arrange.',
    items: ['Terminology', 'Themes', 'AMOLED', 'Performance mode', 'Accessibility', 'Dashboard layout'],
    path: '/settings',
  },
];

export default function Features(): JSX.Element {
  const navigate = useNavigate();
  const { term } = useI18n();

  return (
    <>
      <PageHeader
        title="What is in PluralNova"
        description={term('Everything, grouped the way the app is.')}
      />

      <div className="stat-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Stat label="Record types" value={COLLECTIONS.length} />
        <Stat label="Emotions" value={EMOTIONS.length} />
        <Stat label="Everything works" value="Offline" />
        <Stat label="Your data" value="Exportable" />
      </div>

      <div className="stack">
        {AREAS.map((area) => (
          <Card key={area.title}>
            <div className="row row--nowrap" style={{ alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--accent)', marginTop: 2 }}>
                <Icon name={iconOr(area.icon)} size={22} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ fontSize: 'var(--size-md)' }}>{term(area.title)}</h2>
                <p className="prose small muted" style={{ marginTop: 'var(--space-2)' }}>
                  {term(area.body)}
                </p>
                <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                  {area.items.map((item) => (
                    <Chip key={item}>{term(item)}</Chip>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  iconRight="chevronRight"
                  style={{ marginTop: 'var(--space-3)' }}
                  onClick={() => navigate(area.path)}
                >
                  Open
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 'var(--space-5)' }}>
        <p className="prose small muted">
          {term(
            'PluralNova is built to support different plural experiences rather than one model of them. It does not assume every {{member}} {{fronting}}, that a {{system}} has one {{member}} at the {{front}}, that {{members}} came from anywhere in particular, or that any particular word is the right one.',
          )}
        </p>
      </Card>
    </>
  );
}
