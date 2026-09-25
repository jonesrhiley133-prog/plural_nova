import { f, OPTIONS, type CollectionDef } from './schema.js';

export const workplaces: CollectionDef = {
  name: 'workplaces',
  label: 'Workplaces',
  singular: 'Workplace',
  icon: 'work',
  area: 'work',
  scope: 'system',
  memberScoped: true,
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  neverPublic: true,
  fields: [
    f.text('name', 'Employer', { required: true, inList: true, searchable: true }),
    f.text('position', 'Position', { inList: true, searchable: true }),
    f.text('department', 'Department'),
    f.date('startedOn', 'Started'),
    f.date('endedOn', 'Ended'),
    f.money('hourlyRate', 'Hourly rate', { sensitive: true }),
    f.text('currency', 'Currency', { defaultValue: 'USD', maxLength: 8 }),
    f.text('location', 'Location'),
    f.long('notes', 'Notes', { searchable: true }),
    f.color('color', 'Colour'),
    f.bool('current', 'Current job', { defaultValue: true, inList: true }),
  ],
};

export const workShifts: CollectionDef = {
  name: 'workShifts',
  label: 'Work schedule',
  singular: 'Shift',
  icon: 'work',
  area: 'work',
  scope: 'system',
  memberScoped: true,
  titleField: 'startsAt',
  sortField: 'startsAt',
  sortDir: 'asc',
  indexes: [['systemId', 'startsAt']],
  neverPublic: true,
  fields: [
    f.ref('workplaceId', 'Workplace', 'workplaces', { inList: true }),
    f.datetime('startsAt', 'Starts', { required: true, inList: true }),
    f.datetime('endsAt', 'Ends', { inList: true }),
    f.int('breakMinutes', 'Break', { defaultValue: 0 }),
    f.int('durationSeconds', 'Exact duration', {
      min: 0,
      hint: 'The full worked span, before subtracting breaks. Derived from the times above.',
    }),
    f.text('location', 'Location'),
    f.text('role', 'Role on shift'),
    /*
     * Recurrence in parts, for the same reason as the calendar: a rota
     * described in a sentence cannot be expanded into shifts, so a repeating
     * shift only ever showed up once. The text field stays for anything these
     * cannot express, which with real rotas is plenty.
     */
    f.text('recurrence', 'Repeats', { hint: 'Described in your own words.' }),
    f.enumOf(
      'recurrenceType',
      'Pattern',
      [
        { value: 'none', label: 'One-off' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'fortnightly', label: 'Every two weeks' },
        { value: 'custom', label: 'Every N weeks' },
      ],
      { defaultValue: 'none', group: 'Repeating' },
    ),
    f.json('recurrenceDays', 'Days of the week', { group: 'Repeating' }),
    f.int('recurrenceInterval', 'Every N weeks', { min: 1, max: 52, group: 'Repeating' }),
    f.date('recurrenceEndsOn', 'Until', { group: 'Repeating' }),

    /*
     * Scheduled time and clocked time are different numbers, and the
     * difference is the one people actually need: unpaid minutes before a
     * shift and after it add up, and nothing recovers them later.
     */
    f.datetime('clockedInAt', 'Clocked in', { group: 'Hours worked' }),
    f.datetime('clockedOutAt', 'Clocked out', { group: 'Hours worked' }),
    f.int('actualBreakMinutes', 'Break actually taken', { min: 0, group: 'Hours worked' }),
    f.money('wageOverride', 'Rate for this shift', {
      group: 'Hours worked',
      hint: 'Only when it differs from the workplace rate.',
    }),

    f.refs('assignedMemberIds', 'Who is working it', 'members', { group: 'Who' }),
    f.text('timezone', 'Time zone', { group: 'Details' }),
    f.color('color', 'Colour', { group: 'Details' }),
    f.json('breaks', 'Scheduled breaks', { group: 'Details' }),

    f.datetime('remindAt', 'Reminder'),
    f.bool('remindSent', 'Reminder sent'),
    f.bool('completed', 'Worked', { inList: true }),
    f.long('notes', 'Notes', { searchable: true, sensitive: true }),
  ],
};

export const workTasks: CollectionDef = {
  name: 'workTasks',
  label: 'Work tasks',
  singular: 'Work task',
  icon: 'work',
  area: 'work',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'dueAt',
  sortDir: 'asc',
  neverPublic: true,
  fields: [
    f.ref('workplaceId', 'Workplace', 'workplaces'),
    f.text('title', 'Task', { required: true, inList: true, searchable: true }),
    f.text('project', 'Project', { inList: true, searchable: true }),
    f.long('notes', 'Notes', { searchable: true, sensitive: true }),
    f.datetime('dueAt', 'Due', { inList: true }),
    f.enumOf('priority', 'Priority', OPTIONS.priority, { defaultValue: 'normal', inList: true }),
    f.bool('completed', 'Completed', { inList: true }),
    f.datetime('completedAt', 'Completed at'),
    f.int('estimateMinutes', 'Estimate'),
  ],
};

export const coworkers: CollectionDef = {
  name: 'coworkers',
  label: 'Coworkers',
  singular: 'Coworker',
  icon: 'work',
  area: 'work',
  scope: 'system',
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  neverPublic: true,
  fields: [
    f.ref('workplaceId', 'Workplace', 'workplaces'),
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.text('role', 'Role', { inList: true }),
    f.enumOf('safety', 'Comfort', OPTIONS.safety, { defaultValue: 'unset', inList: true }),
    f.long('notes', 'Notes', { searchable: true, sensitive: true }),
  ],
};

export const WORK_COLLECTIONS = [workplaces, workShifts, workTasks, coworkers] as const;
