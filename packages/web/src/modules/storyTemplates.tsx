import { useMemo, useState } from 'react';
import { useToast } from '../core/toast.js';
import { Icon, type IconName } from '../ui/Icon.js';
import { Button, Chip } from '../ui/primitives.js';
import { SearchField, useDebounced } from '../ui/forms.js';
import { Dialog } from '../ui/overlays.js';

/**
 * Story and chapter templates.
 *
 * A template is nothing more than starter text for a first chapter — there is
 * no separate template engine to keep in sync with the chapter schema, so a
 * template a system outgrows is just text to delete, not a format to migrate
 * away from.
 */

export type TemplateCategory = 'writing' | 'scenes' | 'prompts' | 'planning';

export interface StoryTemplate {
  id: string;
  label: string;
  icon: IconName;
  category: TemplateCategory;
  description: string;
  /** Starter text for the first chapter. Null picks a random prompt at use time. */
  body: string | null;
}

export const TEMPLATES: readonly StoryTemplate[] = [
  { id: 'blank', label: 'Blank Page', icon: 'story', category: 'writing', description: 'Start with a completely empty page.', body: '' },
  {
    id: 'standard',
    label: 'Standard Chapter',
    icon: 'story',
    category: 'writing',
    description: 'A basic structure for writing a chapter.',
    body: 'Opening — where and when this begins.\n\nMiddle — what happens, and what changes.\n\nEnding — where this chapter leaves things.',
  },
  {
    id: 'scene',
    label: 'Scene Builder',
    icon: 'organize',
    category: 'scenes',
    description: 'A structured scene-writing format.',
    body: 'Setting: \nWho is here: \nWhat they want: \nWhat is in the way: \nHow it resolves: ',
  },
  {
    id: 'character',
    label: 'Character Scene',
    icon: 'character',
    category: 'scenes',
    description: 'A character-focused scene prompt.',
    body: "Whose moment is this, and what are they feeling going into it?\n\nWhat do they do or say that they wouldn't have, a chapter ago?\n\nWhat does it cost them?",
  },
  { id: 'prompt', label: 'Writing Prompt', icon: 'insight', category: 'prompts', description: 'Start with a creative prompt.', body: null },
];

const PROMPTS: readonly string[] = [
  'Someone finds a door that was not there yesterday.',
  'Write the last conversation before a long goodbye.',
  'A letter arrives, decades late.',
  'Two characters agree on everything except how the story ends.',
  'Something ordinary turns out to matter more than anyone expected.',
  'A place everyone thought they knew, seen for the first time.',
];

const CATEGORIES: readonly { value: TemplateCategory | 'all' | 'custom'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'writing', label: 'Writing' },
  { value: 'scenes', label: 'Scenes' },
  { value: 'prompts', label: 'Prompts' },
  { value: 'planning', label: 'Planning' },
  { value: 'custom', label: 'Custom' },
];

/** The first-chapter title and body a template (or a plain skip) resolves to. */
export function resolveTemplate(template: StoryTemplate | null): { title: string; body: string } {
  const body = template ? (template.body ?? PROMPTS[Math.floor(Math.random() * PROMPTS.length)]!) : '';
  return { title: 'Chapter 1', body };
}

export function StoryTemplatePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  /** Null means "Skip — start blank." */
  onPick: (template: StoryTemplate | null) => void;
}): JSX.Element {
  const toast = useToast();
  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounced(rawSearch);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('all');

  const visible = useMemo(() => {
    let list = TEMPLATES;
    if (category !== 'all' && category !== 'custom') list = list.filter((template) => template.category === category);
    else if (category === 'custom') list = [];
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      list = list.filter(
        (template) => template.label.toLowerCase().includes(query) || template.description.toLowerCase().includes(query),
      );
    }
    return list;
  }, [category, search]);

  const pick = (template: StoryTemplate | null): void => {
    onPick(template);
    setRawSearch('');
    setCategory('all');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Choose a Template"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toast.info('Custom templates', "You'll be able to save your own here in a future update.")}
          >
            <Icon name="settings" size={13} /> Manage my templates
          </Button>
          <span className="spacer" />
          <Button variant="secondary" size="sm" onClick={() => pick(null)}>
            Skip Templates
          </Button>
        </>
      }
    >
      <p className="small muted" style={{ marginTop: -8, marginBottom: 'var(--space-3)' }}>
        Start with a structure that fits your writing.
      </p>
      <SearchField value={rawSearch} onChange={setRawSearch} placeholder="Search templates…" />
      <div className="row" style={{ margin: 'var(--space-3) 0' }}>
        {CATEGORIES.map((option) => (
          <Chip key={option.value} selected={category === option.value} onClick={() => setCategory(option.value)}>
            {option.label}
          </Chip>
        ))}
      </div>

      <div className="stack stack--tight">
        {category === 'all' && !search.trim() ? (
          <button type="button" className="template-row template-row--selected" onClick={() => pick(null)}>
            <span className="template-row__icon">
              <Icon name="story" size={16} />
            </span>
            <span className="template-row__text">
              <span className="template-row__title">Skip — Start Blank</span>
              <span className="template-row__description">Open a completely empty editor.</span>
            </span>
            <Icon name="check" size={16} />
          </button>
        ) : null}

        {visible.map((template) => (
          <button key={template.id} type="button" className="template-row" onClick={() => pick(template)}>
            <span className="template-row__icon">
              <Icon name={template.icon} size={16} />
            </span>
            <span className="template-row__text">
              <span className="template-row__title">{template.label}</span>
              <span className="template-row__description">{template.description}</span>
            </span>
            <span className="tiny faint">BUILT-IN</span>
          </button>
        ))}

        {visible.length === 0 && category !== 'all' ? (
          <p className="small faint" style={{ padding: 'var(--space-3) 0' }}>
            {category === 'custom' ? 'No custom templates yet.' : 'Nothing in this category yet.'}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
