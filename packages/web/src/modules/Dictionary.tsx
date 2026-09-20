import { useState } from 'react';
import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Card, Chip } from '../ui/primitives.js';
import { useI18n } from '../core/i18n.js';

/**
 * A dictionary the system writes itself: plurality vocabulary plus whatever
 * words this system coined or redefined. Nothing is supplied as fact.
 */
export default function Dictionary(): JSX.Element {
  const { term } = useI18n();
  const [oursOnly, setOursOnly] = useState(false);

  return (
    <CollectionScreen
      collection="dictionaryTerms"
      description={term('Words this {{system}} uses, defined by this {{system}}.')}
      emptyTitle="No terms yet"
      emptyBody="Add a word you use and what it means to you — plurality vocabulary, or something you coined."
      filter={(record) => !oursOnly || record['systemSpecific'] === true}
      above={
        <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="row">
            <Chip selected={!oursOnly} onClick={() => setOursOnly(false)}>
              Everything
            </Chip>
            <Chip selected={oursOnly} onClick={() => setOursOnly(true)}>
              {term('Our own terms')}
            </Chip>
          </div>
          <Card>
            <p className="small muted prose">
              Plurality vocabulary is not standardised, and PluralNova does not try to settle it.
              What is here is what you wrote.
            </p>
          </Card>
        </div>
      }
    />
  );
}
