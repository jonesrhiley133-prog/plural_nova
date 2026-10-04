import { useState } from 'react';
import { APPEARANCE_ELEMENTS } from '@pluralnova/shared';
import { useAppearance } from '../../core/appearance.js';
import { Button, Card, Chip } from '../../ui/primitives.js';
import { SearchField } from '../../ui/forms.js';
import { ElementStyleEditor } from './controls.js';

/**
 * Per-element overrides. Each element starts as "Inherit" (follows the global
 * look); only the ones given a value are emitted to the style sheet.
 */
export function ElementsPanel(): JSX.Element {
  const { state, setElement, resetSection } = useAppearance();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const list = APPEARANCE_ELEMENTS.filter((el) => !needle || el.label.toLowerCase().includes(needle));
  const overridden = Object.keys(state.elements).length;

  return (
    <div className="stack">
      <Card title="Individual elements" subtitle={overridden ? `${overridden} customised` : 'All inheriting the global theme'}>
        <SearchField value={query} onChange={setQuery} placeholder="Search elements" />
        <div className="list" style={{ marginTop: 'var(--space-3)' }}>
          {list.map((el) => {
            const style = state.elements[el.id];
            const open = openId === el.id;
            return (
              <div key={el.id}>
                <button
                  type="button"
                  className="list-row"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : el.id)}
                >
                  <span className="list-row__body">
                    <span className="list-row__title">{el.label}</span>
                  </span>
                  <Chip>{style && Object.keys(style).length ? 'Custom' : 'Inherits'}</Chip>
                </button>
                {open ? (
                  <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-4)' }}>
                    <ElementStyleEditor
                      value={style}
                      onChange={(patch) => setElement(el.id, patch)}
                      onReset={() => setElement(el.id, null)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
      <Button variant="secondary" onClick={() => resetSection('elements')}>
        Reset all element overrides
      </Button>
    </div>
  );
}
