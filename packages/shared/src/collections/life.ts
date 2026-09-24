import { f, OPTIONS, type CollectionDef } from './schema.js';

export const noteFolders: CollectionDef = {
  name: 'noteFolders',
  label: 'Note folders',
  singular: 'Folder',
  icon: 'folder',
  area: 'life',
  scope: 'system',
  titleField: 'name',
  sortField: 'sortOrder',
  sortDir: 'asc',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.color('color', 'Colour'),
    f.text('icon', 'Symbol', { maxLength: 8 }),
    f.ref('parentId', 'Inside folder', 'noteFolders'),
    f.int('sortOrder', 'Order', { defaultValue: 0 }),
  ],
};

export const notes: CollectionDef = {
  name: 'notes',
  label: 'Notes',
  singular: 'Note',
  icon: 'note',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'updatedAt',
  sortDir: 'desc',
  indexes: [['systemId', 'folderId']],
  fields: [
    f.text('title', 'Title', { inList: true, searchable: true }),
    f.long('body', 'Note', { searchable: true }),
    f.ref('folderId', 'Folder', 'noteFolders', { inList: true }),
    f.tags('tags', 'Tags'),
    f.json('checklist', 'Checklist', { hint: 'Items with a label and a done flag.' }),
    f.refs('attachmentIds', 'Attachments', 'mediaItems'),
    f.bool('pinned', 'Pinned', { inList: true }),
    f.bool('archived', 'Archived'),
    f.color('color', 'Colour'),
  ],
};

export const tasks: CollectionDef = {
  name: 'tasks',
  label: 'Tasks',
  singular: 'Task',
  icon: 'task',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'dueAt',
  sortDir: 'asc',
  indexes: [['systemId', 'completed', 'dueAt']],
  fields: [
    f.text('title', 'Task', { required: true, inList: true, searchable: true }),
    f.long('notes', 'Notes', { searchable: true }),
    f.datetime('dueAt', 'Due', { inList: true }),
    f.enumOf('priority', 'Priority', OPTIONS.priority, { defaultValue: 'normal', inList: true }),
    f.text('category', 'Category', { inList: true, searchable: true }),
    f.bool('completed', 'Completed', { inList: true }),
    f.datetime('completedAt', 'Completed at'),
    f.json('subtasks', 'Subtasks'),
    f.text('recurrence', 'Repeats', { hint: 'daily, weekly, monthly, weekdays, or none.' }),
    f.datetime('remindAt', 'Reminder'),
    f.bool('remindSent', 'Reminder sent'),
    f.tags('tags', 'Tags'),
    f.bool('archived', 'Archived'),
    f.bool('forWholeSystem', 'For the whole system', { defaultValue: true }),
  ],
};

export const calendarFolders: CollectionDef = {
  name: 'calendarFolders',
  label: 'Calendar folders',
  singular: 'Calendar',
  icon: 'folder',
  area: 'life',
  scope: 'system',
  titleField: 'name',
  sortField: 'sortOrder',
  sortDir: 'asc',
  description: 'Separate calendars — work, appointments, a shared one — each shown or hidden on its own.',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.color('color', 'Colour', { inList: true }),
    f.text('icon', 'Symbol', { maxLength: 8 }),
    f.bool('visible', 'Shown on the calendar', { defaultValue: true, inList: true }),
    f.int('sortOrder', 'Order', { defaultValue: 0 }),
  ],
};

export const calendarEvents: CollectionDef = {
  name: 'calendarEvents',
  label: 'Calendar',
  singular: 'Event',
  icon: 'calendar',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'startsAt',
  sortDir: 'asc',
  indexes: [['systemId', 'startsAt']],
  fields: [
    f.text('title', 'Title', { required: true, inList: true, searchable: true }),
    f.long('notes', 'Notes', { searchable: true }),
    f.datetime('startsAt', 'Starts', { required: true, inList: true }),
    f.datetime('endsAt', 'Ends'),
    f.bool('allDay', 'All day'),
    f.text('location', 'Location', { searchable: true }),
    f.refs('memberIds', 'Members involved', 'members'),
    f.color('color', 'Colour', { group: 'Appearance' }),
    /*
     * Recurrence, in parts rather than as a sentence.
     *
     * A text field saying "every other Tuesday" is readable and useless: the
     * calendar cannot expand it into occurrences, so a repeating event only
     * ever appeared once. These four are what an expander needs. The old text
     * field stays for whatever people already typed into it, and as the place
     * to describe a rule these cannot express.
     */
    f.text('recurrence', 'Repeats', { hint: 'Described in your own words.', group: 'Repeating' }),
    f.bool('isRecurring', 'Repeats', { group: 'Repeating' }),
    f.enumOf(
      'recurrenceType',
      'How often',
      [
        { value: 'daily', label: 'Daily' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'yearly', label: 'Yearly' },
      ],
      { group: 'Repeating' },
    ),
    f.int('recurrenceInterval', 'Every', {
      min: 1,
      max: 365,
      defaultValue: 1,
      group: 'Repeating',
      hint: '2 with "weekly" is every other week.',
    }),
    f.json('recurrenceWeekdays', 'On these days', { group: 'Repeating' }),
    f.date('recurrenceEndsOn', 'Until', { group: 'Repeating' }),

    f.datetime('remindAt', 'Reminder', { group: 'Reminders' }),
    f.int('remindMinutesBefore', 'Remind me', {
      min: 0,
      max: 20160,
      group: 'Reminders',
      hint: 'Minutes before it starts.',
    }),
    f.json('extraReminders', 'Other reminders', { group: 'Reminders' }),
    f.bool('remindSent', 'Reminder sent'),
    f.refs('attachmentIds', 'Attachments', 'mediaItems'),
    f.text('emoji', 'Emoji', { maxLength: 8, group: 'Appearance' }),
    f.image('bannerUrl', 'Banner', { group: 'Appearance' }),
    f.url('link', 'Link', { hint: 'A meeting link, a ticket, a page about it.' }),
    f.enumOf('priority', 'Priority', OPTIONS.priority, { group: 'Organisation' }),
    f.ref('folderId', 'Folder', 'calendarFolders', { group: 'Organisation' }),
    f.bool('showOnCalendar', 'Show on the calendar', {
      defaultValue: true,
      group: 'Organisation',
      hint: 'Off keeps it as a record without putting it on the grid.',
    }),
    f.enumOf('kind', 'Kind', [
      { value: 'personal', label: 'Personal' },
      { value: 'system', label: 'System' },
      { value: 'work', label: 'Work' },
      { value: 'health', label: 'Health' },
      { value: 'social', label: 'Social' },
      { value: 'birthday', label: 'Birthday' },
    ], { defaultValue: 'personal', inList: true }),
  ],
};

export const mediaItems: CollectionDef = {
  name: 'mediaItems',
  label: 'Media library',
  singular: 'Media item',
  icon: 'media',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'createdAt',
  sortDir: 'desc',
  indexes: [['systemId', 'mediaType']],
  fields: [
    f.text('title', 'Title', { inList: true, searchable: true }),
    f.enumOf('mediaType', 'Type', [
      { value: 'image', label: 'Image', icon: '▣' },
      { value: 'video', label: 'Video', icon: '▶' },
      { value: 'audio', label: 'Audio', icon: '♪' },
      { value: 'document', label: 'Document', icon: '▤' },
    ], { required: true, defaultValue: 'image', inList: true }),
    f.url('url', 'File', { required: true }),
    f.url('thumbnailUrl', 'Thumbnail'),
    f.text('mimeType', 'MIME type'),
    f.int('sizeBytes', 'Size'),
    f.int('width', 'Width'),
    f.int('height', 'Height'),
    f.int('durationSeconds', 'Duration'),
    f.long('description', 'Description', { searchable: true }),
    f.text('folder', 'Folder', { inList: true, searchable: true }),
    f.tags('tags', 'Tags'),
    f.text('source', 'Source'),
    f.bool('favorite', 'Favourite', { inList: true }),
    f.bool('pinned', 'Pinned'),
    f.bool('inVault', 'Keep in vault'),
    f.json('focalPoint', 'Focal point'),
  ],
};

export const moodEntries: CollectionDef = {
  name: 'moodEntries',
  label: 'Moods',
  singular: 'Mood',
  icon: 'mood',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'label',
  sortField: 'recordedAt',
  sortDir: 'desc',
  indexes: [['systemId', 'recordedAt']],
  fields: [
    f.text('label', 'Mood', { required: true, inList: true, searchable: true }),
    f.int('score', 'Score', { min: 1, max: 10, inList: true, hint: '1 lowest — 10 highest.' }),
    f.datetime('recordedAt', 'When', { required: true, inList: true }),
    f.long('note', 'Note', { searchable: true }),
    f.tags('tags', 'Tags'),
    f.color('color', 'Colour'),
  ],
};

export const emotionEntries: CollectionDef = {
  name: 'emotionEntries',
  label: 'Emotions',
  singular: 'Emotion entry',
  icon: 'emotion',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'emotionId',
  sortField: 'recordedAt',
  sortDir: 'desc',
  indexes: [['systemId', 'recordedAt'], ['systemId', 'emotionId']],
  fields: [
    f.text('emotionId', 'Emotion', { required: true, inList: true, searchable: true }),
    f.text('category', 'Category', { inList: true }),
    f.int('intensity', 'Intensity', { min: 1, max: 5, defaultValue: 3, inList: true }),
    f.datetime('recordedAt', 'When', { required: true, inList: true }),
    f.text('context', 'Context', { searchable: true, hint: 'What was happening.' }),
    f.long('note', 'Note', { searchable: true }),
    f.tags('tags', 'Tags'),
    f.text('activity', 'Activity', { searchable: true }),
  ],
};

export const bodySensations: CollectionDef = {
  name: 'bodySensations',
  label: 'Body sensations',
  singular: 'Sensation',
  icon: 'body',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'sensation',
  sortField: 'recordedAt',
  sortDir: 'desc',
  description: 'Somatic tracking. A log, not an assessment.',
  fields: [
    f.text('region', 'Body area', { required: true, inList: true }),
    f.text('sensation', 'Sensation', { required: true, inList: true, searchable: true }),
    f.int('intensity', 'Intensity', { min: 1, max: 5, defaultValue: 3, inList: true }),
    f.datetime('recordedAt', 'When', { required: true, inList: true }),
    f.long('note', 'Note', { searchable: true }),
    f.enumOf('side', 'Side', [
      { value: 'both', label: 'Both' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
      { value: 'centre', label: 'Centre' },
    ], { defaultValue: 'both' }),
  ],
};

export const wellnessEntries: CollectionDef = {
  name: 'wellnessEntries',
  label: 'Wellbeing',
  singular: 'Wellbeing check-in',
  icon: 'wellbeing',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'recordedAt',
  sortField: 'recordedAt',
  sortDir: 'desc',
  fields: [
    f.datetime('recordedAt', 'When', { required: true, inList: true }),
    f.int('energy', 'Energy', { min: 1, max: 10, inList: true }),
    f.int('stress', 'Stress', { min: 1, max: 10, inList: true }),
    f.int('comfort', 'Comfort', { min: 1, max: 10 }),
    f.int('hydrationGlasses', 'Water (glasses)', { min: 0, max: 40 }),
    f.int('mealCount', 'Meals', { min: 0, max: 20 }),
    f.int('painLevel', 'Physical discomfort', { min: 0, max: 10 }),
    f.int('socialBattery', 'Social battery', { min: 1, max: 10 }),
    f.bool('medicationTaken', 'Medication taken'),
    f.long('note', 'Note', { searchable: true }),
    f.json('customMetrics', 'Custom metrics', {
      hint: 'Metrics the system defined for itself.',
    }),
    f.tags('tags', 'Tags'),
  ],
};

export const sleepEntries: CollectionDef = {
  name: 'sleepEntries',
  label: 'Sleep',
  singular: 'Sleep entry',
  icon: 'sleep',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'startedAt',
  sortField: 'startedAt',
  sortDir: 'desc',
  indexes: [['systemId', 'startedAt']],
  fields: [
    f.datetime('startedAt', 'Fell asleep', { required: true, inList: true }),
    f.datetime('endedAt', 'Woke up', { inList: true }),
    f.int('durationMinutes', 'Duration', { inList: true }),
    f.int('quality', 'Quality', { min: 1, max: 5, inList: true }),
    f.bool('isNap', 'Nap'),
    f.int('awakenings', 'Times awake', { min: 0, max: 50 }),
    f.text('mood', 'Mood on waking'),
    f.long('dreamNotes', 'Dreams', { searchable: true }),
    f.long('note', 'Note', { searchable: true }),
    f.tags('tags', 'Tags'),

    /*
     * Four timestamps rather than two, because "went to bed" and "fell
     * asleep" are different times and the gap between them is the single most
     * useful number here for anybody who lies awake. Same at the other end:
     * waking and getting up are not the same event.
     *
     * startedAt and endedAt above stay as the sleep itself, so nothing that
     * already used them changes meaning.
     */
    f.datetime('bedtime', 'Went to bed', { group: 'Times' }),
    f.datetime('outOfBedAt', 'Got up', { group: 'Times' }),
    f.int('latencyMinutes', 'Minutes to fall asleep', {
      min: 0,
      max: 600,
      group: 'Times',
      hint: 'Filled in from the two times above if you leave it.',
    }),

    f.bool('nightmares', 'Nightmares', { group: 'During the night' }),
    f.bool('sleepTalking', 'Sleep talking', { group: 'During the night' }),
    f.bool('sleepwalking', 'Sleepwalking', { group: 'During the night' }),
    f.ref('frontingMemberId', 'Who woke up', 'members', {
      group: 'During the night',
      hint: 'When that is not who went to sleep.',
    }),

    f.int('moodBefore', 'Mood before sleep', { min: 1, max: 10, group: 'Around it' }),
    f.int('stress', 'Stress', { min: 1, max: 5, group: 'Around it' }),
    f.tags('medications', 'Medications', { group: 'Around it', sensitive: true }),
    f.bool('caffeine', 'Caffeine that day', { group: 'Around it' }),
    f.bool('exercised', 'Exercised that day', { group: 'Around it' }),

    /*
     * Environment, because a pattern here is usually the answer when nothing
     * else explains a run of bad nights, and none of it is knowable later.
     */
    f.text('location', 'Where', { group: 'Environment', hint: 'Home, away, somewhere new.' }),
    f.enumOf(
      'noise',
      'Noise',
      [
        { value: 'silent', label: 'Silent' },
        { value: 'quiet', label: 'Quiet' },
        { value: 'some', label: 'Some noise' },
        { value: 'loud', label: 'Loud' },
      ],
      { group: 'Environment' },
    ),
    f.enumOf(
      'lightLevel',
      'Light',
      [
        { value: 'dark', label: 'Dark' },
        { value: 'dim', label: 'Dim' },
        { value: 'lit', label: 'Lit' },
      ],
      { group: 'Environment' },
    ),
    f.enumOf(
      'temperature',
      'Temperature',
      [
        { value: 'cold', label: 'Cold' },
        { value: 'cool', label: 'Cool' },
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'warm', label: 'Warm' },
        { value: 'hot', label: 'Hot' },
      ],
      { group: 'Environment' },
    ),
  ],
};

export const fitnessEntries: CollectionDef = {
  name: 'fitnessEntries',
  label: 'Fitness',
  singular: 'Activity',
  icon: 'fitness',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'activity',
  sortField: 'performedAt',
  sortDir: 'desc',
  description: 'Movement you choose to record. No targets are assumed and nothing is scored.',
  fields: [
    f.text('activity', 'Activity', { required: true, inList: true, searchable: true }),
    f.datetime('performedAt', 'When', { required: true, inList: true }),
    f.int('durationMinutes', 'Duration', { inList: true }),
    f.real('distanceKm', 'Distance (km)'),
    f.int('steps', 'Steps'),
    f.int('intensity', 'Effort', { min: 1, max: 5 }),
    f.long('note', 'Note', { searchable: true }),
    f.text('goalKey', 'Goal'),
    f.tags('tags', 'Tags'),

    f.enumOf(
      'activityType',
      'Kind of activity',
      [
        { value: 'walk', label: 'Walking' },
        { value: 'run', label: 'Running' },
        { value: 'cycle', label: 'Cycling' },
        { value: 'swim', label: 'Swimming' },
        { value: 'strength', label: 'Strength' },
        { value: 'stretch', label: 'Stretching' },
        { value: 'yoga', label: 'Yoga' },
        { value: 'sport', label: 'Sport' },
        { value: 'dance', label: 'Dance' },
        { value: 'chores', label: 'Housework' },
        { value: 'other', label: 'Something else' },
      ],
      { group: 'Activity', inList: true },
    ),
    f.datetime('startedAt', 'Started', { group: 'Activity' }),
    f.datetime('endedAt', 'Ended', { group: 'Activity' }),
    f.text('location', 'Where', { group: 'Activity' }),

    f.int('calories', 'Energy (kcal)', { min: 0, group: 'Measurements' }),
    f.int('heartRateAvg', 'Average heart rate', { min: 20, max: 250, group: 'Measurements' }),
    f.int('heartRateMax', 'Peak heart rate', { min: 20, max: 250, group: 'Measurements' }),
    f.real('elevationM', 'Elevation gained (m)', { group: 'Measurements' }),
    f.int('reps', 'Reps', { min: 0, group: 'Measurements' }),
    f.int('sets', 'Sets', { min: 0, group: 'Measurements' }),
    f.real('weightKg', 'Weight (kg)', { group: 'Measurements' }),

    /*
     * How it felt, kept separate from how hard it was. Effort above is what
     * the body did; these are what it cost and what it gave back, and for a
     * lot of people the second pair is the reason they are logging at all.
     */
    f.int('moodBefore', 'Mood before', { min: 1, max: 10, group: 'How it felt' }),
    f.int('moodAfter', 'Mood after', { min: 1, max: 10, group: 'How it felt' }),
    f.int('energyAfter', 'Energy after', { min: 1, max: 5, group: 'How it felt' }),
    f.int('painLevel', 'Pain', { min: 0, max: 10, group: 'How it felt' }),
    f.tags('painLocations', 'Where it hurt', { group: 'How it felt' }),

    /*
     * Imported rows carry where they came from and the other side's id, so a
     * second import updates a row rather than adding a duplicate of it.
     */
    f.text('source', 'Recorded by', {
      group: 'Source',
      hint: 'Left empty when you entered it yourself.',
    }),
    f.text('externalId', 'Source reference', { group: 'Source' }),
  ],
};

export const cycleEntries: CollectionDef = {
  name: 'cycleEntries',
  label: 'Cycle & wellness',
  singular: 'Cycle entry',
  icon: 'cycle',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'phase',
  sortField: 'entryDate',
  sortDir: 'desc',
  neverPublic: true,
  description:
    'A configurable cycle log. Every field is optional and the phases are whatever the user names them.',
  fields: [
    f.date('entryDate', 'Date', { required: true, inList: true }),
    f.text('phase', 'Phase', { inList: true, hint: 'Your own labels — nothing is preset.' }),
    f.enumOf('eventType', 'Event', [
      { value: 'none', label: 'No event' },
      { value: 'start', label: 'Cycle start' },
      { value: 'end', label: 'Cycle end' },
      { value: 'symptom', label: 'Symptom day' },
      { value: 'note', label: 'Note only' },
    ], { defaultValue: 'none', inList: true }),
    f.tags('symptoms', 'Symptoms'),
    f.int('energy', 'Energy', { min: 1, max: 10 }),
    f.int('discomfort', 'Discomfort', { min: 0, max: 10 }),
    f.text('mood', 'Mood'),
    f.long('note', 'Note', { searchable: true, sensitive: true }),
    f.bool('remind', 'Remind me next cycle'),
  ],
};

export const financeAccounts: CollectionDef = {
  name: 'financeAccounts',
  label: 'Accounts',
  singular: 'Account',
  icon: 'finance',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  neverPublic: true,
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.enumOf('kind', 'Type', [
      { value: 'checking', label: 'Everyday' },
      { value: 'savings', label: 'Savings' },
      { value: 'cash', label: 'Cash' },
      { value: 'credit', label: 'Credit' },
      { value: 'other', label: 'Other' },
    ], { defaultValue: 'checking', inList: true }),
    f.money('openingBalance', 'Opening balance', { defaultValue: 0 }),
    f.text('currency', 'Currency', { defaultValue: 'USD', maxLength: 8 }),
    f.color('color', 'Colour'),
    f.long('notes', 'Notes', { sensitive: true }),
    f.bool('archived', 'Archived'),
  ],
};

export const transactions: CollectionDef = {
  name: 'transactions',
  label: 'Transactions',
  singular: 'Transaction',
  icon: 'finance',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'description',
  sortField: 'occurredAt',
  sortDir: 'desc',
  indexes: [['systemId', 'occurredAt'], ['systemId', 'accountId']],
  neverPublic: true,
  fields: [
    f.text('description', 'Description', { required: true, inList: true, searchable: true }),
    f.money('amount', 'Amount', { required: true, inList: true, hint: 'Negative for spending.' }),
    f.datetime('occurredAt', 'Date', { required: true, inList: true }),
    f.ref('accountId', 'Account', 'financeAccounts', { inList: true }),
    f.text('category', 'Category', { inList: true, searchable: true }),
    f.enumOf('kind', 'Kind', [
      { value: 'expense', label: 'Expense' },
      { value: 'income', label: 'Income' },
      { value: 'transfer', label: 'Transfer' },
    ], { defaultValue: 'expense', inList: true }),
    f.text('recurrence', 'Repeats'),
    f.long('notes', 'Notes', { searchable: true, sensitive: true }),
    f.tags('tags', 'Tags'),
  ],
};

export const budgets: CollectionDef = {
  name: 'budgets',
  label: 'Budgets',
  singular: 'Budget',
  icon: 'finance',
  area: 'life',
  scope: 'system',
  titleField: 'category',
  sortField: 'category',
  sortDir: 'asc',
  neverPublic: true,
  fields: [
    f.text('category', 'Category', { required: true, inList: true, searchable: true }),
    f.money('limitAmount', 'Monthly limit', { required: true, inList: true }),
    f.text('period', 'Period', { defaultValue: 'monthly' }),
    f.color('color', 'Colour'),
    f.long('notes', 'Notes', { sensitive: true }),
  ],
};

export const savingsGoals: CollectionDef = {
  name: 'savingsGoals',
  label: 'Savings goals',
  singular: 'Goal',
  icon: 'finance',
  area: 'life',
  scope: 'system',
  titleField: 'name',
  sortField: 'targetDate',
  sortDir: 'asc',
  neverPublic: true,
  fields: [
    f.text('name', 'Goal', { required: true, inList: true, searchable: true }),
    f.money('targetAmount', 'Target', { required: true, inList: true }),
    f.money('savedAmount', 'Saved so far', { defaultValue: 0, inList: true }),
    f.date('targetDate', 'Target date'),
    f.color('color', 'Colour'),
    f.long('notes', 'Notes', { sensitive: true }),
  ],
};

export const contacts: CollectionDef = {
  name: 'contacts',
  label: 'Contacts',
  singular: 'Contact',
  icon: 'contact',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  neverPublic: true,
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.text('nickname', 'Nickname', { searchable: true }),
    f.text('relationship', 'Relationship', { inList: true, searchable: true }),
    f.phone('phone', 'Phone', { sensitive: true }),
    f.email('email', 'Email', { sensitive: true }),
    f.json('socialLinks', 'Social links'),
    f.enumOf('safety', 'Safety', OPTIONS.safety, { defaultValue: 'unset', inList: true }),
    f.bool('currentlyWith', 'Currently with them', { inList: true }),
    f.datetime('lastInteractionAt', 'Last interaction'),
    f.refs('knownByMemberIds', 'Known by', 'members'),
    f.long('notes', 'Notes', { searchable: true, sensitive: true }),
    f.tags('tags', 'Tags'),
    f.image('avatarUrl', 'Photo'),

    /*
     * A name in parts as well as whole. The single field above stays the one
     * that is displayed and searched, because that is what people type; these
     * are for the cases where the parts matter separately — sorting by
     * surname, or knowing that the name on their documents is not the name
     * you call them.
     */
    f.text('preferredName', 'Preferred name', { group: 'Name', searchable: true }),
    f.text('firstName', 'First name', { group: 'Name' }),
    f.text('lastName', 'Last name', { group: 'Name' }),
    f.text('pronouns', 'Pronouns', { group: 'Name', inList: true }),

    f.json('phoneNumbers', 'Other numbers', { group: 'Contact', sensitive: true }),
    f.json('emails', 'Other addresses', { group: 'Contact', sensitive: true }),
    f.text('address', 'Address', { group: 'Contact', sensitive: true }),

    f.text('organisation', 'Organisation', { group: 'Context', searchable: true }),
    f.text('occupation', 'Occupation', { group: 'Context' }),
    f.date('birthday', 'Birthday', { group: 'Dates' }),
    f.date('anniversary', 'Anniversary', { group: 'Dates' }),

    f.text('category', 'Category', {
      group: 'Organising',
      inList: true,
      hint: 'Family, work, medical, chosen family — whatever divides them usefully.',
    }),
    f.color('color', 'Colour', { group: 'Organising' }),
    f.bool('isFavourite', 'Favourite', { group: 'Organising' }),
    /*
     * Emergency roles rather than one emergency contact flag. Who to call is
     * rarely one person, and which of them to call depends on what happened.
     */
    f.tags('emergencyRoles', 'In an emergency', {
      group: 'Organising',
      hint: 'What they are the person to call about.',
    }),
    f.json('customFields', 'Custom fields', { group: 'Custom' }),
  ],
};

export const emergencyContacts: CollectionDef = {
  name: 'emergencyContacts',
  label: 'Emergency contacts',
  singular: 'Emergency contact',
  icon: 'emergency',
  area: 'life',
  scope: 'system',
  titleField: 'name',
  sortField: 'priority',
  sortDir: 'asc',
  neverPublic: true,
  description: 'Kept out of every public surface and every notification preview.',
  fields: [
    f.text('name', 'Name', { required: true, inList: true }),
    f.text('relationship', 'Relationship', { inList: true }),
    f.phone('phone', 'Phone', { inList: true, sensitive: true }),
    f.email('email', 'Email', { sensitive: true }),
    f.int('priority', 'Priority', { defaultValue: 1, min: 1, max: 20, inList: true }),
    f.text('availability', 'Availability', { hint: 'When they can usually be reached.' }),
    f.long('notes', 'Notes', { sensitive: true }),
  ],
};

export const playbackHistory: CollectionDef = {
  name: 'playbackHistory',
  label: 'Continue watching',
  singular: 'History entry',
  icon: 'media',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'playedAt',
  sortDir: 'desc',
  indexes: [['systemId', 'playedAt']],
  description:
    'Where you got to, and who got there. One history across video, music and reading rather than three that do not know about each other.',
  fields: [
    f.text('title', 'Title', { required: true, inList: true, searchable: true }),
    f.enumOf(
      'mediaType',
      'Kind',
      [
        { value: 'video', label: 'Video' },
        { value: 'music', label: 'Music' },
        { value: 'fic', label: 'Reading' },
        { value: 'other', label: 'Something else' },
      ],
      { required: true, inList: true },
    ),
    /*
     * A loose reference rather than a typed one: the thing being resumed can
     * live in videoItems, musicTracks or fics, and a column cannot point at
     * three tables. mediaType says which to look in.
     */
    f.text('itemId', 'Item'),
    f.text('channel', 'Channel or artist', { inList: true, searchable: true }),
    f.url('thumbnailUrl', 'Thumbnail'),
    f.url('url', 'Link'),

    f.int('positionSeconds', 'Stopped at', { min: 0 }),
    f.int('durationSeconds', 'Length', { min: 0 }),
    f.int('completionPercent', 'How far in', { min: 0, max: 100, inList: true }),
    f.bool('finished', 'Finished'),

    f.datetime('playedAt', 'Last opened', { required: true, inList: true }),
    f.int('playCount', 'Times opened', { defaultValue: 1, min: 0 }),
    /*
     * Who was watching. Two members part-way through the same thing is the
     * normal case, and a single resume point hands one of them the other's
     * place — the same problem as fic chapters, one layer up.
     */
    f.ref('memberId', 'Who', 'members', { inList: true }),
  ],
};

export const contactInteractions: CollectionDef = {
  name: 'contactInteractions',
  label: 'Contact log',
  singular: 'Interaction',
  icon: 'contact',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'summary',
  sortField: 'happenedAt',
  sortDir: 'desc',
  indexes: [['systemId', 'contactId', 'happenedAt']],
  neverPublic: true,
  description:
    'What happened, with whom, and who was out for it. Contacts carry a last-seen date; this is the record behind it.',
  fields: [
    f.ref('contactId', 'Who', 'contacts', { required: true, inList: true }),
    f.datetime('happenedAt', 'When', { required: true, inList: true }),
    f.text('summary', 'What happened', { inList: true, searchable: true }),
    f.enumOf(
      'channel',
      'How',
      [
        { value: 'inPerson', label: 'In person' },
        { value: 'call', label: 'Call' },
        { value: 'video', label: 'Video call' },
        { value: 'message', label: 'Message' },
        { value: 'email', label: 'Email' },
        { value: 'letter', label: 'Letter' },
        { value: 'other', label: 'Something else' },
      ],
      { inList: true },
    ),
    f.int('durationMinutes', 'How long', { min: 0 }),
    /*
     * Who was out for it. The point of a contact log in a system is often
     * exactly this: which of you has the relationship, and who they have
     * actually met. Without it the log says the system saw someone, which is
     * not the same fact.
     */
    f.refs('memberIds', 'Who was out', 'members'),
    f.int('howItWent', 'How it went', { min: 1, max: 5, inList: true }),
    f.int('energyCost', 'What it cost', {
      min: 1,
      max: 5,
      hint: 'How draining it was, separately from whether it went well.',
    }),
    f.long('notes', 'Notes', { searchable: true, sensitive: true }),
    f.bool('needsFollowUp', 'Needs following up'),
    f.date('followUpBy', 'Follow up by'),
    f.tags('tags', 'Tags'),
  ],
};

export const locationEntries: CollectionDef = {
  name: 'locationEntries',
  label: 'Locations',
  singular: 'Location',
  icon: 'location',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'name',
  sortField: 'visitedAt',
  sortDir: 'desc',
  neverPublic: true,
  description: 'Places recorded by hand. Nothing is captured automatically unless explicitly enabled.',
  fields: [
    f.text('name', 'Place', { required: true, inList: true, searchable: true }),
    f.datetime('visitedAt', 'When', { required: true, inList: true }),
    f.text('activity', 'Activity', { inList: true, searchable: true }),
    f.long('note', 'Note', { searchable: true }),
    f.real('latitude', 'Latitude', { sensitive: true }),
    f.real('longitude', 'Longitude', { sensitive: true }),
    f.text('address', 'Address', { sensitive: true }),
    f.tags('tags', 'Tags'),
    f.bool('favorite', 'Favourite'),

    f.datetime('arrivedAt', 'Arrived', { group: 'Time there' }),
    f.datetime('leftAt', 'Left', { group: 'Time there' }),
    f.int('durationMinutes', 'How long', { min: 0, group: 'Time there' }),
    f.bool('isCurrent', 'Still here', { group: 'Time there' }),

    /*
     * What the place was like, and what it did. For a lot of systems a
     * location log is really a record of which places are survivable — so the
     * sensory detail and the front are the useful columns, not the map pin.
     */
    f.ref('frontingMemberId', 'Who was out', 'members', { group: 'While there' }),
    f.refs('peoplePresentIds', 'Who else was there', 'contacts', {
      group: 'While there',
      sensitive: true,
    }),
    f.int('mood', 'Mood', { min: 1, max: 10, group: 'While there' }),
    f.tags('emotions', 'Emotions', { group: 'While there' }),
    f.tags('bodySensations', 'Body sensations', { group: 'While there' }),

    f.text('category', 'Kind of place', { group: 'The place', inList: true }),
    f.enumOf(
      'setting',
      'Indoors or out',
      [
        { value: 'indoor', label: 'Indoors' },
        { value: 'outdoor', label: 'Outdoors' },
        { value: 'both', label: 'Both' },
      ],
      { group: 'The place' },
    ),
    f.enumOf(
      'noiseLevel',
      'Noise',
      [
        { value: 'silent', label: 'Silent' },
        { value: 'quiet', label: 'Quiet' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'loud', label: 'Loud' },
        { value: 'overwhelming', label: 'Overwhelming' },
      ],
      { group: 'The place' },
    ),
    f.enumOf(
      'crowdedness',
      'How busy',
      [
        { value: 'empty', label: 'Empty' },
        { value: 'quiet', label: 'Quiet' },
        { value: 'busy', label: 'Busy' },
        { value: 'packed', label: 'Packed' },
      ],
      { group: 'The place' },
    ),
    f.int('safetyRating', 'Felt safe', { min: 1, max: 5, group: 'The place' }),
    f.long('accessibilityNotes', 'Accessibility', {
      group: 'The place',
      searchable: true,
      hint: 'Steps, lighting, seating, quiet corners — whatever you would want to know before going back.',
    }),
    f.text('weather', 'Weather', { group: 'The place' }),
  ],
};

export const vaultItems: CollectionDef = {
  name: 'vaultItems',
  label: 'Private vault',
  singular: 'Vault item',
  icon: 'vault',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  vault: true,
  neverPublic: true,
  titleField: 'title',
  sortField: 'updatedAt',
  sortDir: 'desc',
  description: 'Requires an unlocked vault session on the server for every read and write.',
  fields: [
    f.text('title', 'Title', { required: true, inList: true }),
    f.enumOf('kind', 'Kind', [
      { value: 'note', label: 'Note' },
      { value: 'journal', label: 'Journal entry' },
      { value: 'document', label: 'Document' },
      { value: 'media', label: 'Media' },
      { value: 'credential', label: 'Reference' },
    ], { defaultValue: 'note', inList: true }),
    f.long('body', 'Contents', { sensitive: true }),
    f.url('url', 'File', { sensitive: true }),
    f.tags('tags', 'Tags'),
    f.color('color', 'Colour'),
  ],
};

export const LIFE_COLLECTIONS = [
  playbackHistory,
  contactInteractions,
  noteFolders,
  notes,
  tasks,
  calendarFolders,
  calendarEvents,
  mediaItems,
  moodEntries,
  emotionEntries,
  bodySensations,
  wellnessEntries,
  sleepEntries,
  fitnessEntries,
  cycleEntries,
  financeAccounts,
  transactions,
  budgets,
  savingsGoals,
  contacts,
  emergencyContacts,
  locationEntries,
  vaultItems,
] as const;
