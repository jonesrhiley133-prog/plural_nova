import { useMemo } from 'react';
import { ACHIEVEMENTS } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useCollection } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Meter, Stat } from '../ui/primitives.js';
import { SwitchRow } from '../ui/forms.js';
import { SkeletonCards } from '../ui/feedback.js';

/**
 * Achievements.
 *
 * Marks that a part of the app has been used, not that a system is doing well.
 * They can be switched off entirely, and switching them off does not delete the
 * ones already earned.
 */

const CATEGORIES = [
  { id: 'firsts', label: 'Firsts' },
  { id: 'habits', label: 'Kept up' },
  { id: 'system', label: 'System' },
  { id: 'care', label: 'Looking after things' },
  { id: 'creative', label: 'Creative' },
] as const;

export default function Achievements(): JSX.Element {
  const { settings, saveSettings } = useAuth();
  const dates = useDateFormat();
  const toast = useToast();
  const unlocked = useCollection('achievements');

  const byKey = useMemo(
    () => new Map(unlocked.items.map((row) => [String(row['achievementKey']), row])),
    [unlocked.items],
  );

  const earned = ACHIEVEMENTS.filter((achievement) => byKey.has(achievement.key));

  if (unlocked.loading) {
    return (
      <>
        <PageHeader title="Achievements" />
        <SkeletonCards count={6} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Achievements"
        description="Small markers for using parts of the app. Nothing here measures how a system is doing."
      />

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat label="Earned" value={`${earned.length} of ${ACHIEVEMENTS.length}`} />
        <Stat
          label="Most recent"
          value={
            unlocked.items[0] ? dates.relative(String(unlocked.items[0]['unlockedAt'])) : 'None yet'
          }
        />
      </div>

      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <Meter value={earned.length} max={ACHIEVEMENTS.length} label="Achievements earned" />
        <div className="row row--between" style={{ marginTop: 'var(--space-3)' }}>
          <span className="tiny faint">
            These unlock from what is actually stored, so they stay right after an import or a restore.
          </span>
        </div>
      </Card>

      <div className="stack stack--loose">
        {CATEGORIES.map((category) => {
          const items = ACHIEVEMENTS.filter((achievement) => achievement.category === category.id);
          if (items.length === 0) return null;
          return (
            <section key={category.id}>
              <h2 className="section-heading__label" style={{ marginBottom: 'var(--space-3)' }}>
                {category.label}
              </h2>
              <div className="grid" style={{ ['--grid-min' as never]: '210px' }}>
                {items.map((achievement) => {
                  const row = byKey.get(achievement.key);
                  const isEarned = Boolean(row);
                  return (
                    <Card
                      key={achievement.key}
                      style={{
                        opacity: isEarned ? 1 : 0.55,
                        borderColor: isEarned ? 'var(--accent)' : undefined,
                      }}
                    >
                      <div className="row row--nowrap" style={{ alignItems: 'flex-start' }}>
                        <span
                          style={{
                            fontSize: 22,
                            color: isEarned ? 'var(--accent)' : 'var(--text-faint)',
                            lineHeight: 1,
                          }}
                          aria-hidden="true"
                        >
                          {achievement.icon}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 'var(--weight-medium)' }}>{achievement.label}</div>
                          <p className="small muted" style={{ marginTop: 2 }}>
                            {achievement.description}
                          </p>
                          {row ? (
                            <p className="tiny faint" style={{ marginTop: 6 }}>
                              Earned {dates.relative(String(row['unlockedAt']))}
                            </p>
                          ) : (
                            <p className="tiny faint" style={{ marginTop: 6 }}>
                              Not yet
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Card title="Settings" style={{ marginTop: 'var(--space-5)' }}>
        <SwitchRow
          label="Track achievements"
          hint="Off means nothing new unlocks. What you have earned is kept."
          checked={settings.achievementsEnabled}
          onChange={(value) => {
            void saveSettings({ achievementsEnabled: value }).then(() => toast.success('Saved'));
          }}
        />
        <SwitchRow
          label="Notify me when one unlocks"
          checked={settings.achievementToasts}
          disabled={!settings.achievementsEnabled}
          onChange={(value) => {
            void saveSettings({ achievementToasts: value }).then(() => toast.success('Saved'));
          }}
        />
      </Card>
    </>
  );
}
