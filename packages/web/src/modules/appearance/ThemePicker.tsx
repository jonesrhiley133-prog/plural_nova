import { allThemes, assignmentKey, type AssignmentTarget } from '@pluralnova/shared';
import { useAppearance } from '../../core/appearance.js';
import { SelectField } from '../../ui/forms.js';

/**
 * Assigns a saved theme to one target. Used from the editor's Assignments tab
 * and directly inside the features themselves (an alter's profile, a playlist,
 * a chat's settings), so a theme can be attached from wherever it is wanted.
 */
export function ThemePicker({
  target,
  id,
  label = 'Theme',
  hint,
}: {
  target: AssignmentTarget;
  id?: string;
  label?: string;
  hint?: string;
}): JSX.Element {
  const { state, assign } = useAppearance();
  const key = assignmentKey(target, id);
  const current = state.assignments[key] ?? '';
  const pinned = allThemes(state).filter((t) => t.pinned);
  const rest = allThemes(state).filter((t) => !t.pinned);
  return (
    <SelectField
      label={label}
      value={current}
      {...(hint ? { hint } : {})}
      onChange={(value) => assign(target, id, value || null)}
      options={[
        { value: '', label: 'None — inherit' },
        ...pinned.map((t) => ({ value: t.id, label: `★ ${t.name}` })),
        ...rest.map((t) => ({ value: t.id, label: t.name })),
      ]}
    />
  );
}
