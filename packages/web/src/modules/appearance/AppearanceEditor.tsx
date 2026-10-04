import { useState, type ReactNode } from 'react';
import { useAppearance } from '../../core/appearance.js';
import { useAuth } from '../../core/auth.js';
import { useToast } from '../../core/toast.js';
import { Button, Card, Tabs } from '../../ui/primitives.js';
import { SwitchRow } from '../../ui/forms.js';
import { ConfirmDialog, useDialog } from '../../ui/overlays.js';
import { AssignmentsPanel } from './AssignmentsPanel.js';
import { ElementsPanel } from './ElementsPanel.js';
import { GlobalPanel } from './GlobalPanel.js';
import { ThemesPanel } from './ThemesPanel.js';

type Tab = 'basics' | 'global' | 'elements' | 'themes' | 'assign' | 'performance';

/**
 * The Appearance Editor. Changes apply live as you make them; nothing is
 * locked in until you stop touching it, and “Reset” is always one click away.
 * `basics` hosts the original theme controls so nothing was removed.
 */
export function AppearanceEditor({ basics }: { basics: ReactNode }): JSX.Element {
  const [tab, setTab] = useState<Tab>('basics');
  const a = useAppearance();
  const { settings, saveSettings } = useAuth();
  const toast = useToast();
  const resetAll = useDialog();

  return (
    <div className="stack">
      <Tabs
        label="Appearance sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'basics', label: 'Basics' },
          { value: 'global', label: 'Global' },
          { value: 'elements', label: 'Elements' },
          { value: 'themes', label: 'Themes' },
          { value: 'assign', label: 'Assign' },
          { value: 'performance', label: 'Performance' },
        ]}
      />

      {tab === 'basics' ? basics : null}
      {tab === 'global' ? <GlobalPanel /> : null}
      {tab === 'elements' ? <ElementsPanel /> : null}
      {tab === 'themes' ? <ThemesPanel /> : null}
      {tab === 'assign' ? <AssignmentsPanel /> : null}
      {tab === 'performance' ? (
        <Card title="Performance & effects" subtitle="Keep it personal without making the device work hard">
          <div className="stack">
            <SwitchRow
              label="Performance / AMOLED-friendly mode"
              hint="Turns off blur, animation and decorative effects everywhere."
              checked={settings.performanceMode}
              onChange={(performanceMode) => void saveSettings({ performanceMode }).catch((cause) => toast.fromError(cause, 'Not saved'))}
            />
            <SwitchRow
              label="Animated gradients"
              hint="Off freezes every gradient, whatever the theme says."
              checked={a.state.animatedGradients}
              onChange={(animatedGradients) => a.update({ animatedGradients })}
            />
            <SwitchRow
              label="Decorative effects"
              hint="The soft nebula colour fields behind the glass."
              checked={a.state.decorativeEffects}
              onChange={(decorativeEffects) => a.update({ decorativeEffects })}
            />
          </div>
        </Card>
      ) : null}

      <Card title="Reset">
        <p className="small muted">
          Puts the global look, element overrides and assignments back to default. Saved themes and music pins are kept.
        </p>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Button variant="secondary" onClick={() => resetAll.show()}>
            Reset entire appearance
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={resetAll.open}
        title="Reset entire appearance?"
        body="Customisations and theme assignments are cleared. Your saved themes are kept."
        confirmLabel="Reset"
        tone="primary"
        onClose={resetAll.hide}
        onConfirm={() => {
          a.resetAll();
          resetAll.hide();
          toast.success('Appearance reset');
        }}
      />
    </div>
  );
}
