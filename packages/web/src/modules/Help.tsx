import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../core/i18n.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip } from '../ui/primitives.js';
import { SearchField } from '../ui/forms.js';
import { EmptyState } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

/**
 * Help.
 *
 * Written as answers rather than documentation: each entry says what to do and
 * links to the screen that does it. Terminology is applied here too, so the
 * help uses the same words as the rest of the app.
 */

interface Topic {
  id: string;
  title: string;
  category: string;
  body: string[];
  link?: { label: string; path: string };
}

const TOPICS: Topic[] = [
  {
    id: 'start',
    title: 'Getting started',
    category: 'Getting started',
    body: [
      'PluralNova opens on a dashboard you choose the contents of. Everything else is behind the navigation — a bar at the bottom on a phone, a rail on the left on a wider screen.',
      'Nothing is required. A {{system}} with no {{members}} works; so does one with fifty. Every field on every form is optional except a name.',
    ],
    link: { label: 'Customise the dashboard', path: '/' },
  },
  {
    id: 'front',
    title: 'Recording who is {{fronting}}',
    category: 'Getting started',
    body: [
      'Quick {{Front}} records a {{front}} in one step: choose one {{member}} or several, and save. Everything else — activity, mood, location, a note — is optional and folded away.',
      'More than one person can be at the {{front}} at once. So can nobody. So can someone you cannot name yet: mark it unknown and fill it in later, or never.',
      'A {{front}} stays open until it is ended, and survives reloading, closing the app and switching device.',
    ],
    link: { label: 'Open Quick {{Front}}', path: '/quick-front' },
  },
  {
    id: 'members',
    title: 'Adding and organising {{members}}',
    category: '{{Members}}',
    body: [
      'A {{member}} needs a name and nothing else. The rest of the profile — pronouns, roles, interests, boundaries, custom fields you invent — is there when it is wanted.',
      'Organise groups them into groups and {{subsystems}}, by dragging or with the arrows beside each name. Both do the same thing; use whichever suits.',
      'Deleting a {{member}} moves them to the trash for thirty days. Their {{fronting}} history and {{journal}} entries stay where they are.',
    ],
    link: { label: 'Open {{Members}}', path: '/members' },
  },
  {
    id: 'terminology',
    title: 'Changing the words the app uses',
    category: 'Making it yours',
    body: [
      'Settings → Terminology changes what PluralNova calls things, everywhere at once. "{{Member}}" can be headmate, alter, part, resident, or a word nobody else uses.',
      'It applies to menus, buttons, empty states and help — including this page — and it persists across reloads, sign-outs and devices.',
    ],
    link: { label: 'Open terminology settings', path: '/settings/terminology' },
  },
  {
    id: 'privacy',
    title: 'Who can see what',
    category: 'Privacy',
    body: [
      'Everything is private by default. A record becomes visible to others only when its visibility is changed, and some things — the vault, emergency contacts, finances, work, locations — can never be made public at all.',
      'Each {{member}} controls their own visibility separately from the profile: whether they are listed, whether their avatar shows, whether their {{fronting}} shows, whether their {{journal}} shows.',
      'The vault is locked on the server, not in the interface. While it is locked, nothing in it is returned to this app, to sync, to search or to a notification.',
    ],
    link: { label: 'Open privacy settings', path: '/settings/privacy' },
  },
  {
    id: 'social',
    title: 'Friends, profiles and messages',
    category: 'Social',
    body: [
      'A Constellations profile is how other systems find you. It does not exist until you make one, and it is not discoverable until you say so.',
      'Messages are ordered by the server, so they always read oldest at the top and newest at the bottom — including one sent while a device was offline.',
      'Where both sides have published a key, messages are encrypted in the browser and the server stores ciphertext it cannot read. Where they have not, the message is sent in the clear and the app says so rather than showing a padlock it has not earned.',
    ],
    link: { label: 'Open Constellations', path: '/constellations' },
  },
  {
    id: 'backup',
    title: 'Backing up and restoring',
    category: 'Your data',
    body: [
      'Backup → Export produces one file with every record in the account, versioned and checksummed. Keep it wherever you keep things.',
      'Restoring previews what a file contains before anything is written. It merges by default and never empties a table, so restoring the same file twice changes nothing the second time.',
      'A backup from an older version is migrated forward automatically when it is restored.',
    ],
    link: { label: 'Open backup', path: '/backup' },
  },
  {
    id: 'import',
    title: 'Bringing data in from elsewhere',
    category: 'Your data',
    body: [
      'Import reads exports from other apps, a PluralNova collection export, or any CSV with a header row.',
      'A row that cannot be read is reported by name and skipped — the rest of the file still imports, and nothing already here is overwritten unless you ask for that.',
    ],
    link: { label: 'Open import', path: '/import' },
  },
  {
    id: 'offline',
    title: 'Using it offline',
    category: 'Troubleshooting',
    body: [
      'Reading works offline from a copy held on the device. So does writing: changes are queued and sent when there is a connection again.',
      'The indicator in the header says when something is waiting. Nothing is lost while it waits.',
      'If both sides changed the same record, PluralNova shows you the server’s copy rather than picking a winner quietly.',
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications are not arriving',
    category: 'Troubleshooting',
    body: [
      'First check Settings → Notifications: the category has to be on for the channel you expect, and quiet hours may be holding them.',
      'Then check the browser or system settings — if notifications are blocked there, PluralNova cannot override it. The settings screen says which of these is the problem.',
      'Installing PluralNova to the home screen makes notifications behave like an app’s rather than a browser tab’s, including while it is closed.',
    ],
    link: { label: 'Open notification settings', path: '/settings/notifications' },
  },
  {
    id: 'modes',
    title: 'System Mode and Singlet Mode',
    category: 'Making it yours',
    body: [
      'System Mode has everything. Singlet Mode hides the {{system}}-specific screens — {{members}}, {{fronting}}, {{subsystems}}, {{system}} chat — and keeps journalling, planning, wellbeing and the rest.',
      'Switching hides screens; it never deletes anything. Switching back brings every screen back with everything still in it.',
    ],
    link: { label: 'Change mode', path: '/settings/navigation' },
  },
  {
    id: 'wellbeing',
    title: 'What the wellbeing numbers mean',
    category: 'Troubleshooting',
    body: [
      'Nothing, on their own. PluralNova counts what was recorded and shows it back. It does not assess anyone, diagnose anything, or decide what a number ought to be.',
      'A gap in a chart means nothing was logged, which is not the same as nothing happening.',
    ],
  },
];

export default function Help(): JSX.Element {
  const navigate = useNavigate();
  const { term } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(TOPICS[0]?.id ?? null);

  const search = query.trim().toLowerCase();
  const matching = search
    ? TOPICS.filter(
        (topic) =>
          term(topic.title).toLowerCase().includes(search) ||
          topic.body.some((line) => term(line).toLowerCase().includes(search)),
      )
    : TOPICS;

  const categories = [...new Set(matching.map((topic) => term(topic.category)))];

  return (
    <>
      <PageHeader title="Help" description={term('How PluralNova works, in the words you chose.')} />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <SearchField value={query} onChange={setQuery} placeholder="Search help…" />
      </div>

      {matching.length === 0 ? (
        <Card>
          <EmptyState
            icon="help"
            title="Nothing matches that"
            body="Try a different word, or browse the sections below."
            action={{ label: 'Clear the search', run: () => setQuery('') }}
          />
        </Card>
      ) : (
        <div className="stack stack--loose">
          {categories.map((category) => (
            <section key={category}>
              <h2 className="section-heading__label" style={{ marginBottom: 'var(--space-2)' }}>
                {category}
              </h2>
              <div className="stack stack--tight">
                {matching
                  .filter((topic) => term(topic.category) === category)
                  .map((topic) => (
                    <Card key={topic.id}>
                      <button
                        type="button"
                        className="row row--between"
                        style={{
                          width: '100%',
                          background: 'none',
                          border: 'none',
                          color: 'inherit',
                          cursor: 'pointer',
                          padding: 0,
                          textAlign: 'left',
                        }}
                        aria-expanded={open === topic.id}
                        onClick={() => setOpen(open === topic.id ? null : topic.id)}
                      >
                        <span className="card__title">{term(topic.title)}</span>
                        <Icon name={open === topic.id ? 'chevronUp' : 'chevronDown'} size={16} />
                      </button>

                      {open === topic.id ? (
                        <div style={{ marginTop: 'var(--space-3)' }}>
                          {topic.body.map((line, index) => (
                            <p key={index} className="prose small muted" style={{ marginBottom: 'var(--space-2)' }}>
                              {term(line)}
                            </p>
                          ))}
                          {topic.link ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              iconRight="chevronRight"
                              onClick={() => navigate(topic.link!.path)}
                            >
                              {term(topic.link.label)}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </Card>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Card style={{ marginTop: 'var(--space-5)' }}>
        <p className="small muted prose">
          {term(
            'PluralNova is a tool, not an authority. It does not decide what a {{system}} is, how many {{members}} it should have, whether they should {{fronting}}, or what any of it means. That is yours.',
          )}
        </p>
      </Card>
    </>
  );
}
