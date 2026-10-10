import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Tabs } from '../ui/primitives.js';
import { Patterns } from './insights/Patterns.js';
import { Story } from './insights/Story.js';
import { CycleComparison } from './insights/CycleComparison.js';
import { Landscape } from './insights/Landscape.js';

/**
 * Insights.
 *
 * Cross-feature relationships, pulled from what is already logged elsewhere
 * — Patterns (named relationships, each with its own evidence), Story (one
 * day as a paragraph), Cycle comparison (only once cycle tracking is on),
 * and Landscape (the long-run numbers). None of it is new tracking; all four
 * tabs read collections other screens already write to.
 */

type InsightsTab = 'patterns' | 'story' | 'cycle' | 'landscape';

export default function Insights(): JSX.Element {
  const [params] = useSearchParams();
  const { settings } = useAuth();

  const tabs: { value: InsightsTab; label: string }[] = [
    { value: 'patterns', label: 'Patterns' },
    { value: 'story', label: 'Story' },
    ...(settings.cycleEnabled ? [{ value: 'cycle' as const, label: 'Cycle comparison' }] : []),
    { value: 'landscape', label: 'Landscape' },
  ];

  // Read once on mount, the same as Mood & Emotions' own tabs — a tab is
  // where you land, not something the URL keeps tracking as you click around.
  const [tab, setTab] = useState<InsightsTab>(() => {
    const requested = params.get('tab');
    return tabs.some((option) => option.value === requested) ? (requested as InsightsTab) : 'patterns';
  });

  return (
    <>
      <PageHeader title="Insights" description="Patterns across what you've already logged — comparisons, never conclusions." />

      <Tabs value={tab} onChange={setTab} label="Insights sections" options={tabs} />

      <div style={{ marginTop: 'var(--space-4)' }}>
        {tab === 'patterns' ? (
          <Patterns />
        ) : tab === 'story' ? (
          <Story />
        ) : tab === 'cycle' && settings.cycleEnabled ? (
          <CycleComparison />
        ) : (
          <Landscape />
        )}
      </div>
    </>
  );
}
