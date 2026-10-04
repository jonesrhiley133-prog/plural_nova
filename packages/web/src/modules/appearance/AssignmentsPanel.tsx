import { APPEARANCE_SECTIONS, pinnedThemes } from '@pluralnova/shared';
import { useAppearance } from '../../core/appearance.js';
import { useCollection } from '../../core/data.js';
import { Button, Card } from '../../ui/primitives.js';
import { SegmentedControl } from '../../ui/primitives.js';
import { EmptyState } from '../../ui/feedback.js';
import { ThemePicker } from './ThemePicker.js';

/** Pinned themes + where each saved theme is assigned. */
export function AssignmentsPanel(): JSX.Element {
  const a = useAppearance();
  const pinned = pinnedThemes(a.state);
  const members = useCollection('members');
  const playlists = useCollection('musicPlaylists');
  const threads = useCollection('systemChatThreads');

  return (
    <div className="stack">
      <Card title="Pinned themes" subtitle="Quick access to favourites">
        {pinned.length === 0 ? (
          <EmptyState icon="features" title="No pinned themes" body="Pin a saved theme from the Themes tab to keep it here." />
        ) : (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {pinned.map((theme) => (
              <Button key={theme.id} variant="secondary" size="sm" onClick={() => a.applyTheme(theme)}>
                ★ {theme.name}
              </Button>
            ))}
          </div>
        )}
      </Card>

      <Card title="Alters" subtitle="Theme a profile, banner, accent, cards — and optionally their chat">
        <SegmentedControl
          label="Where alter themes apply"
          value={a.state.alterThemeScope}
          onChange={(alterThemeScope) => a.update({ alterThemeScope })}
          options={[
            { value: 'profile', label: 'Profile only' },
            { value: 'everywhere', label: 'Follow them app-wide' },
          ]}
        />
        <div className="stack" style={{ marginTop: 'var(--space-3)' }}>
          {members.items.map((m) => (
            <ThemePicker key={m.id} target="alter" id={m.id} label={String(m['name'])} />
          ))}
          {members.items.length === 0 ? <p className="tiny faint">Add an alter to assign them a theme.</p> : null}
        </div>
      </Card>

      <Card title="Sections" subtitle="A section theme sits between the global look and its components">
        <div className="stack">
          {APPEARANCE_SECTIONS.map((s) => (
            <ThemePicker key={s.id} target="section" id={s.id} label={s.label} />
          ))}
        </div>
      </Card>

      <Card title="Playlists">
        <div className="stack">
          {playlists.items.map((p) => (
            <ThemePicker key={p.id} target="playlist" id={p.id} label={String(p['name'])} />
          ))}
          {playlists.items.length === 0 ? <p className="tiny faint">No playlists yet.</p> : null}
        </div>
      </Card>

      <Card title="Chats">
        <div className="stack">
          {threads.items.map((t) => (
            <ThemePicker key={t.id} target="chat" id={t.id} label={String(t['name'] || 'Chat')} />
          ))}
          {threads.items.length === 0 ? <p className="tiny faint">No In-Sys chats yet.</p> : null}
        </div>
      </Card>

      <Card title="Calendar categories">
        <div className="stack">
          {['personal', 'system', 'work', 'health', 'social', 'birthday'].map((k) => (
            <ThemePicker key={k} target="calendarCategory" id={k} label={k[0]!.toUpperCase() + k.slice(1)} />
          ))}
        </div>
      </Card>
    </div>
  );
}
