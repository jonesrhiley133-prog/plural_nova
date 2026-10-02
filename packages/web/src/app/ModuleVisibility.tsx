import { ALWAYS_VISIBLE_NAV_IDS, categoriesForMode } from '@pluralnova/shared';
import { useOptimisticSettings } from '../core/settings.js';
import { useI18n } from '../core/i18n.js';
import { Card } from '../ui/primitives.js';
import { SwitchRow } from '../ui/forms.js';

/**
 * Turns individual nav pages and whole categories on or off, without
 * deleting anything behind them. One setting (`hiddenModules`) backs it;
 * Settings' Navigation tab and the Features page both render this same
 * card rather than keeping their own copies of the toggle list.
 */
export function ModuleVisibilityCard(): JSX.Element {
  const { settings, update } = useOptimisticSettings();
  const { term } = useI18n();

  return (
    <Card title="Sidebar &amp; menu" subtitle="Turn off anything you never use — nothing about it is deleted">
      {categoriesForMode(settings.mode).map((category) => (
        <div key={category.id} style={{ marginBottom: 'var(--space-3)' }}>
          <p className="tiny faint" style={{ marginBottom: 'var(--space-1)' }}>
            {term(category.label)}
          </p>
          {category.items
            .filter((item) => !ALWAYS_VISIBLE_NAV_IDS.includes(item.id))
            .map((item) => (
              <SwitchRow
                key={item.id}
                label={term(item.label)}
                checked={!settings.hiddenModules.includes(item.id)}
                onChange={(visible) =>
                  update({
                    hiddenModules: visible
                      ? settings.hiddenModules.filter((id) => id !== item.id)
                      : [...settings.hiddenModules, item.id],
                  })
                }
              />
            ))}
        </div>
      ))}
    </Card>
  );
}
