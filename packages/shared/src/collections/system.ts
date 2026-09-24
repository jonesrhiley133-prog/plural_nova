import { f, OPTIONS, type CollectionDef } from './schema.js';

const HISTORY_CATEGORIES = [
  { value: 'settings', label: 'Settings' },
  { value: 'theme', label: 'Theme' },
  { value: 'system', label: 'System' },
  { value: 'life', label: 'Life' },
  { value: 'social', label: 'Social' },
  { value: 'creative', label: 'Creative' },
  { value: 'work', label: 'Work' },
  { value: 'data', label: 'Data' },
  { value: 'other', label: 'Other' },
] as const;

const FRONT_STATUS = [
  { value: 'fronting', label: 'Fronting', color: '#8bd5ff', icon: '●' },
  { value: 'cofronting', label: 'Co-fronting', color: '#a78bfa', icon: '◐' },
  { value: 'nearby', label: 'Nearby', color: '#7aa2f7', icon: '◌' },
  { value: 'resting', label: 'Resting', color: '#6b7fa8', icon: '◦' },
  { value: 'dormant', label: 'Dormant', color: '#4a5a7a', icon: '·' },
  { value: 'unknown', label: 'Unknown', color: '#8a93a8', icon: '?' },
] as const;

/**
 * Members. Deliberately wide: a system decides which of these fields describe
 * them, and every one of them is optional. `customFields` exists so the app
 * never has to guess a vocabulary it does not have.
 */
export const members: CollectionDef = {
  name: 'members',
  label: 'Members',
  singular: 'Member',
  icon: 'member',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  audited: true,
  titleField: 'name',
  subtitleField: 'pronouns',
  sortField: 'name',
  sortDir: 'asc',
  indexes: [['systemId', 'name'], ['systemId', 'frontStatus']],
  description: 'Everyone in the system, with as much or as little detail as they want recorded.',
  fields: [
    f.text('name', 'Display name', { required: true, inList: true, searchable: true }),
    f.text('privateName', 'Private name', {
      group: 'Identity',
      sensitive: true,
      hint: 'Never shown on public profiles.',
    }),
    f.text('pronouns', 'Pronouns', { inList: true, searchable: true, group: 'Identity' }),
    f.tags('nicknames', 'Nicknames', {
      group: 'Identity',
      searchable: true,
      hint: 'Other names they answer to.',
    }),
    f.text('age', 'Age', { group: 'Identity', hint: 'Free text — "ageless", "teen", "27" all work.' }),
    /*
     * Three ages, because for a lot of systems they are three different
     * answers and collapsing them into one loses the distinction that
     * mattered. All free text: "ageless" and "somewhere around 8" are both
     * real answers, and a number picker would refuse them.
     */
    f.text('mentalAge', 'Mental age', { group: 'Identity' }),
    f.text('physicalAge', 'Physical age', {
      group: 'Identity',
      hint: 'How old they feel in the body, when that differs.',
    }),
    f.text('species', 'Species', {
      group: 'Identity',
      searchable: true,
      hint: 'For anyone who is not human, or not only human.',
    }),
    f.text('gender', 'Gender', { group: 'Identity', searchable: true }),
    f.text('sexuality', 'Sexuality', { group: 'Identity' }),
    f.text('nationality', 'Nationality', { group: 'Identity' }),
    f.text('ethnicity', 'Ethnicity', { group: 'Identity' }),
    f.text('race', 'Race', { group: 'Identity' }),
    f.tags('identityLabels', 'Identity labels', { group: 'Identity' }),
    f.date('birthday', 'Birthday', { group: 'Identity' }),
    f.image('avatarUrl', 'Avatar', { group: 'Appearance' }),
    f.image('bannerUrl', 'Banner', { group: 'Appearance' }),
    f.json('avatarFocus', 'Avatar focal point', { group: 'Appearance' }),
    f.json('bannerFocus', 'Banner focal point', { group: 'Appearance' }),
    f.color('color', 'Profile colour', { group: 'Appearance' }),
    /*
     * A second colour and a pair of gradient stops, so a member's card can be
     * theirs rather than a tinted copy of everyone else's. Empty means fall
     * back to the profile colour, which is what most people will leave it as.
     */
    f.color('accentColor', 'Accent colour', {
      group: 'Appearance',
      hint: 'A second colour for highlights. Optional.',
    }),
    f.color('gradientStart', 'Gradient from', { group: 'Appearance' }),
    f.color('gradientEnd', 'Gradient to', { group: 'Appearance' }),
    f.enumOf(
      'cardStyle',
      'Card style',
      [
        { value: 'default', label: 'Default' },
        { value: 'solid', label: 'Solid colour' },
        { value: 'gradient', label: 'Gradient' },
        { value: 'banner', label: 'Banner image' },
        { value: 'minimal', label: 'Minimal' },
      ],
      { group: 'Appearance', defaultValue: 'default' },
    ),
    f.text('icon', 'Symbol', { group: 'Appearance', maxLength: 8, hint: 'A short glyph or emoji.' }),
    f.long('bio', 'Biography', { group: 'About', searchable: true }),
    f.tags('roles', 'Roles', { group: 'About' }),
    f.ref('subsystemId', 'Subsystem', 'subsystems', { group: 'About' }),
    f.ref('groupId', 'Group', 'memberGroups', { group: 'About' }),
    f.text('source', 'Source / origin', { group: 'About', hint: 'Only if this concept applies to them.' }),
    f.tags('tags', 'Tags', { group: 'About' }),
    f.long('notes', 'Notes', { group: 'About', sensitive: true }),
    f.long('boundaries', 'Boundaries', { group: 'About' }),
    /*
     * Comforts and triggers are a pair, and the pair is the point: the first
     * is what helps, the second is what to avoid, and someone looking one up
     * in a bad moment should find the other beside it.
     *
     * Triggers are sensitive. It is the single most private thing on a member
     * profile and it never leaves the account on a shared or public view.
     */
    f.long('comforts', 'Comforts', {
      group: 'About',
      hint: 'What helps — people, places, objects, routines.',
    }),
    f.long('triggers', 'Triggers', {
      group: 'About',
      sensitive: true,
      hint: 'Never shown on a shared or public profile.',
    }),
    f.long('lore', 'Lore', {
      group: 'About',
      searchable: true,
      hint: 'Backstory or origin, separate from the short biography.',
    }),
    f.bool('isSubsystemParent', 'Holds a subsystem', {
      group: 'About',
      hint: 'They contain a system of their own.',
    }),
    f.long('likes', 'Likes', { group: 'Interests' }),
    f.long('dislikes', 'Dislikes', { group: 'Interests' }),
    f.tags('interests', 'Interests', { group: 'Interests' }),
    f.tags('hobbies', 'Hobbies', { group: 'Interests' }),
    f.long('personality', 'Personality', { group: 'Interests' }),
    f.enumOf('frontStatus', 'Front status', FRONT_STATUS, {
      defaultValue: 'nearby',
      inList: true,
      group: 'Fronting',
    }),
    f.text('customStatus', 'Custom status', { group: 'Fronting' }),
    f.datetime('lastFrontedAt', 'Last fronted', { group: 'Fronting' }),
    f.int('frontCount', 'Front count', { defaultValue: 0, group: 'Fronting' }),
    f.int('frontMinutes', 'Total fronting minutes', { defaultValue: 0, group: 'Fronting' }),
    f.int('orbitOrder', 'Orbit order', { defaultValue: 0, group: 'Fronting' }),
    /*
     * Pinned and favourite are not the same thing and a system that has both
     * will use both: pinned is "keep this at the top of the list", favourite
     * is "this one matters to me". One is about the ordering, the other is
     * about the person.
     */
    f.bool('isPinned', 'Pinned', { group: 'Fronting', hint: 'Kept at the top of the list.' }),
    f.bool('isFavourite', 'Favourite', { group: 'Fronting' }),
    f.bool('isDormant', 'Dormant', { group: 'Fronting' }),
    /*
     * Identity flags were a whole collection that nothing on a member could
     * reference, so a flag could be created and never worn. These are the
     * reference and the display choices that go with it.
     */
    f.refs('identityFlags', 'Identity flags', 'flags', { group: 'Flags' }),
    f.enumOf(
      'flagDisplayStyle',
      'Flag style',
      [
        { value: 'stripes', label: 'Stripes' },
        { value: 'badge', label: 'Badge' },
        { value: 'ring', label: 'Ring around the avatar' },
        { value: 'background', label: 'Card background' },
      ],
      { group: 'Flags', defaultValue: 'stripes' },
    ),
    f.enumOf(
      'flagDisplaySize',
      'Flag size',
      [
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' },
      ],
      { group: 'Flags', defaultValue: 'md' },
    ),
    f.bool('flagDisplayEnabled', 'Show flags on their profile', {
      group: 'Flags',
      defaultValue: true,
    }),
    f.json('customFields', 'Custom fields', { group: 'Custom' }),
    f.json('customSections', 'Custom profile sections', {
      group: 'Custom',
      hint: 'Headed blocks of their own, in the order they choose.',
    }),
    f.json('customBadges', 'Badges', { group: 'Custom' }),
    f.json('privacy', 'Member privacy', {
      group: 'Privacy',
      hint: 'Per-member control over what a shared profile reveals.',
    }),
    f.text('pinHash', 'Profile PIN', { sensitive: true, group: 'Privacy' }),
    f.json('preferences', 'Member preferences', { group: 'Privacy' }),
    f.bool('archived', 'Archived'),
  ],
};

export const subsystems: CollectionDef = {
  name: 'subsystems',
  label: 'Subsystems',
  singular: 'Subsystem',
  icon: 'subsystem',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  audited: true,
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  description: 'Nested structures inside the system. A subsystem may contain other subsystems.',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.long('description', 'Description', { searchable: true }),
    f.color('color', 'Colour'),
    f.text('icon', 'Symbol', { maxLength: 8 }),
    f.ref('parentId', 'Parent subsystem', 'subsystems', {
      hint: 'Leave empty for a top-level subsystem.',
    }),
    f.int('sortOrder', 'Order', { defaultValue: 0 }),
    f.tags('tags', 'Tags'),
  ],
};

export const memberGroups: CollectionDef = {
  name: 'memberGroups',
  label: 'Groups',
  singular: 'Group',
  icon: 'group',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  titleField: 'name',
  sortField: 'sortOrder',
  sortDir: 'asc',
  description: 'Free-form folders for organising members however the system likes.',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.long('description', 'Description'),
    f.color('color', 'Colour'),
    f.text('icon', 'Symbol', { maxLength: 8 }),
    f.ref('subsystemId', 'Inside subsystem', 'subsystems'),
    f.int('sortOrder', 'Order', { defaultValue: 0 }),
  ],
};

/**
 * A fronting event. `memberId` is the primary fronter and `coFronterIds` holds
 * everyone else present — an event with no primary and several co-fronters is
 * valid, and so is one with nobody at all (`unknown`).
 */
export const frontEvents: CollectionDef = {
  name: 'frontEvents',
  label: 'Front events',
  singular: 'Front event',
  icon: 'front',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  memberScoped: true,
  audited: true,
  titleField: 'activity',
  sortField: 'startedAt',
  sortDir: 'desc',
  indexes: [['systemId', 'startedAt'], ['systemId', 'endedAt'], ['systemId', 'memberId']],
  description: 'One period of fronting, open-ended until it is closed.',
  fields: [
    f.refs('coFronterIds', 'Co-fronters', 'members', { inList: true }),
    f.datetime('startedAt', 'Started', { required: true, inList: true }),
    f.datetime('endedAt', 'Ended', { inList: true, hint: 'Leave empty while this front is active.' }),
    f.int('durationMinutes', 'Duration', { hint: 'Derived when the front ends.' }),
    f.text('activity', 'Activity', { inList: true, searchable: true }),
    f.refs('locationIds', 'Locations', 'locationEntries', {
      hint: 'Pick from the places you\'ve set up.',
    }),
    f.text('mood', 'Mood', { inList: true }),
    f.long('note', 'Note', { searchable: true }),
    f.tags('tags', 'Tags'),
    f.enumOf('statusType', 'Status', [...FRONT_STATUS], { defaultValue: 'fronting' }),
    f.bool('unknownFronter', 'Fronter unknown', {
      hint: 'Records that someone was fronting without naming them.',
    }),
  ],
};

export const journalEntries: CollectionDef = {
  name: 'journalEntries',
  label: 'Journal',
  singular: 'Journal entry',
  icon: 'journal',
  area: 'system',
  scope: 'system',
  memberScoped: true,
  audited: true,
  titleField: 'title',
  sortField: 'entryDate',
  sortDir: 'desc',
  indexes: [['systemId', 'entryDate'], ['systemId', 'memberId']],
  fields: [
    f.text('title', 'Title', { inList: true, searchable: true }),
    f.long('body', 'Entry', { searchable: true }),
    f.datetime('entryDate', 'Date', { required: true, inList: true }),
    f.text('mood', 'Mood', { inList: true }),
    f.int('moodScore', 'Mood score', { min: 1, max: 10 }),
    f.tags('tags', 'Tags'),
    f.refs('attachmentIds', 'Attachments', 'mediaItems'),
    f.refs('locationIds', 'Locations', 'locationEntries', {
      hint: 'Pick from the places you\'ve set up.',
    }),
    f.bool('pinned', 'Pinned'),
    f.bool('inVault', 'Keep in vault', { hint: 'Moves this entry behind the vault lock.' }),

    /*
     * An entry can have more than one author. A co-written entry is ordinary
     * in a system, and recording only the member whose profile it was filed
     * under loses who was actually there for it — which is often the thing
     * somebody is looking for when they read it back.
     *
     * memberId above stays as the entry's owner; this is everyone involved.
     */
    f.refs('authorIds', 'Written by', 'members', {
      group: 'Authors',
      hint: 'Everyone who wrote this, if it was more than one of you.',
    }),

    f.enumOf(
      'privacy',
      'Who can see this',
      [
        { value: 'private', label: 'Only me' },
        { value: 'system', label: 'Everyone in the system' },
        { value: 'friends', label: 'Friends' },
        { value: 'public', label: 'Public' },
      ],
      { group: 'Privacy', defaultValue: 'private' },
    ),
    f.bool('isSensitive', 'Sensitive', {
      group: 'Privacy',
      hint: 'Collapsed behind a tap, so it is not read over your shoulder.',
    }),

    f.bool('isDraft', 'Draft', { group: 'Organisation' }),
    f.ref('folderId', 'Folder', 'noteFolders', { group: 'Organisation' }),
    f.text('collection', 'Series', {
      group: 'Organisation',
      searchable: true,
      hint: 'Group entries that belong together — a trip, a course of therapy, a year.',
    }),

    /* Check-ins are journal entries with a shape: the same prompts each time. */
    f.bool('isCheckIn', 'Check-in', { group: 'Check-in' }),
    f.json('checkInAnswers', 'Check-in answers', { group: 'Check-in' }),
  ],
};

export const systemHistory: CollectionDef = {
  name: 'systemHistory',
  label: 'System history',
  singular: 'History event',
  icon: 'history',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  memberScoped: true,
  titleField: 'summary',
  sortField: 'occurredAt',
  sortDir: 'desc',
  indexes: [['systemId', 'occurredAt'], ['systemId', 'eventType']],
  description: 'An append-only record of what changed in the system and when.',
  fields: [
    f.text('eventType', 'Event type', { required: true, inList: true, searchable: true }),
    f.text('summary', 'Summary', { required: true, inList: true, searchable: true }),
    f.enumOf('category', 'Category', HISTORY_CATEGORIES, { defaultValue: 'other', inList: true }),
    f.text('entityType', 'Record type'),
    f.text('entityId', 'Record id'),
    f.datetime('occurredAt', 'Occurred', { required: true, inList: true }),
    f.long('note', 'Note', { searchable: true }),
    f.json('meta', 'Details'),
    f.bool('automatic', 'Recorded automatically', { defaultValue: true }),
    /*
     * A change worth being able to undo records what it was and what it
     * became, not just that it happened. Both are serialised JSON of
     * whatever the field actually holds, so a restore can put the same
     * shape back rather than guessing at it from a sentence.
     */
    f.long('previousValue', 'Previous value'),
    f.long('newValue', 'New value'),
    f.text('location', 'Where this happened'),
    f.bool('restorable', 'Can be restored', { defaultValue: false }),
  ],
};

export const relationships: CollectionDef = {
  name: 'relationships',
  label: 'Relationships',
  singular: 'Relationship',
  icon: 'relationship',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  titleField: 'label',
  sortField: 'label',
  sortDir: 'asc',
  description: 'Connections between members, contacts, friends and outside systems.',
  fields: [
    f.text('fromType', 'From type', { defaultValue: 'member', required: true }),
    f.text('fromId', 'From', { required: true }),
    f.text('toType', 'To type', { defaultValue: 'member', required: true }),
    f.text('toId', 'To', { required: true }),
    f.text('label', 'Relationship', { required: true, inList: true, searchable: true }),
    f.text('reverseLabel', 'Reverse label', { hint: 'How the other side describes it.' }),
    f.enumOf('strength', 'Closeness', [
      { value: 'distant', label: 'Distant' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'close', label: 'Close' },
      { value: 'inseparable', label: 'Inseparable' },
    ], { defaultValue: 'neutral', inList: true }),
    f.color('color', 'Colour'),
    f.long('notes', 'Notes', { searchable: true }),
    f.bool('mutual', 'Mutual', { defaultValue: true }),
    f.bool('showOnMap', 'Show on relationship map', { defaultValue: true }),
  ],
};

export const flags: CollectionDef = {
  name: 'flags',
  label: 'Flags',
  singular: 'Flag',
  icon: 'flag',
  area: 'system',
  scope: 'system',
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  description: 'Reusable markers the system defines for itself.',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.long('description', 'What it means', { searchable: true }),
    f.color('color', 'Colour', { inList: true }),
    f.text('icon', 'Symbol', { maxLength: 8, inList: true }),
    f.enumOf('category', 'Category', [
      { value: 'warning', label: 'Warning' },
      { value: 'important', label: 'Important' },
      { value: 'boundary', label: 'Boundary' },
      { value: 'communication', label: 'Communication' },
      { value: 'fronting', label: 'Fronting' },
      { value: 'content', label: 'Content note' },
      { value: 'accessibility', label: 'Accessibility' },
      { value: 'custom', label: 'Custom' },
    ], { defaultValue: 'custom', inList: true }),
    f.bool('showOnProfile', 'Show on profiles', { defaultValue: true }),
  ],
};

export const flagAssignments: CollectionDef = {
  name: 'flagAssignments',
  label: 'Flag assignments',
  singular: 'Flag assignment',
  icon: 'flag',
  area: 'system',
  scope: 'system',
  titleField: 'targetId',
  sortField: 'createdAt',
  sortDir: 'desc',
  indexes: [['systemId', 'targetType', 'targetId']],
  fields: [
    f.ref('flagId', 'Flag', 'flags', { required: true }),
    f.text('targetType', 'Attached to type', { required: true }),
    f.text('targetId', 'Attached to', { required: true }),
    f.long('note', 'Note'),
  ],
};

export const systemChatMessages: CollectionDef = {
  name: 'systemChatMessages',
  label: 'System chat',
  singular: 'Message',
  icon: 'chat',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  memberScoped: true,
  titleField: 'body',
  sortField: 'sentAt',
  sortDir: 'asc',
  indexes: [['systemId', 'sentAt']],
  description: 'Internal, system-only conversation. Never leaves the account.',
  neverPublic: true,
  fields: [
    f.long('body', 'Message', { required: true, searchable: true }),
    f.datetime('sentAt', 'Sent', { required: true, inList: true }),
    f.ref('replyToId', 'In reply to', 'systemChatMessages'),
    f.text('channel', 'Channel', { defaultValue: 'general', inList: true }),
    f.json('reactions', 'Reactions'),
    f.refs('attachmentIds', 'Attachments', 'mediaItems'),
    f.bool('edited', 'Edited'),
  ],
};

export const bulletinPosts: CollectionDef = {
  name: 'bulletinPosts',
  label: 'Bulletin board',
  singular: 'Bulletin post',
  icon: 'bulletin',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  memberScoped: true,
  titleField: 'title',
  sortField: 'postedAt',
  sortDir: 'desc',
  neverPublic: true,
  fields: [
    f.text('title', 'Title', { inList: true, searchable: true }),
    f.long('body', 'Post', { searchable: true }),
    f.datetime('postedAt', 'Posted', { required: true }),
    f.enumOf('kind', 'Kind', [
      { value: 'announcement', label: 'Announcement' },
      { value: 'note', label: 'Note' },
      { value: 'reminder', label: 'Reminder' },
      { value: 'image', label: 'Image' },
      { value: 'update', label: 'System update' },
    ], { defaultValue: 'note', inList: true }),
    f.refs('attachmentIds', 'Images', 'mediaItems'),
    f.tags('tags', 'Tags'),
    f.bool('pinned', 'Pinned', { inList: true }),
    f.bool('archived', 'Archived'),
    f.json('reactions', 'Reactions'),
  ],
};

export const polls: CollectionDef = {
  name: 'polls',
  label: 'Polls',
  singular: 'Poll',
  icon: 'poll',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  memberScoped: true,
  titleField: 'title',
  sortField: 'createdAt',
  sortDir: 'desc',
  neverPublic: true,
  description: 'Internal decisions, put to the system.',
  fields: [
    f.text('title', 'Question', { required: true, inList: true, searchable: true }),
    f.long('description', 'Details', { searchable: true }),
    f.json('options', 'Options', { required: true, hint: 'Each option has an id and a label.' }),
    f.long('instructions', 'How to vote', {
      hint: 'Anything voters should know before they answer.',
    }),
    f.bool('anonymous', 'Anonymous voting'),
    f.bool('multipleChoice', 'Allow multiple answers'),
    f.datetime('closesAt', 'Closes', { inList: true }),
    f.bool('closed', 'Closed', { inList: true }),

    /*
     * A poll is not always a list of options. "How strongly, one to five" and
     * "yes or no" are the same question shape asked differently, and forcing
     * them all through a list of options makes the common ones tedious to set
     * up and awkward to read back.
     */
    f.enumOf(
      'pollType',
      'Kind of poll',
      [
        { value: 'choice', label: 'Pick an option' },
        { value: 'yesno', label: 'Yes or no' },
        { value: 'scale', label: 'A scale' },
        { value: 'ranked', label: 'Rank them' },
        { value: 'text', label: 'Open answer' },
      ],
      { defaultValue: 'choice', inList: true, group: 'Question' },
    ),
    f.int('maxSelections', 'Most answers allowed', { min: 1, max: 50, group: 'Question' }),
    f.int('scaleMin', 'Scale from', { group: 'Question' }),
    f.int('scaleMax', 'Scale to', { group: 'Question' }),

    /*
     * Who is being asked, and who has to answer for the result to mean
     * something. A decision that needed everybody but was settled by two
     * people is the failure this prevents — quietly, by naming it up front.
     */
    f.refs('requiredVoterIds', 'Must vote', 'members', { group: 'Who votes' }),
    f.refs('optionalVoterIds', 'May vote', 'members', { group: 'Who votes' }),
    f.ref('subsystemId', 'Only this subsystem', 'subsystems', { group: 'Who votes' }),
    f.text('roleRestriction', 'Only this role', { group: 'Who votes' }),
    f.text('ageRestriction', 'Age note', {
      group: 'Who votes',
      hint: 'For anything not everyone should be asked to weigh in on.',
    }),

    f.enumOf(
      'status',
      'Status',
      [
        { value: 'draft', label: 'Draft' },
        { value: 'scheduled', label: 'Scheduled' },
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' },
        { value: 'archived', label: 'Archived' },
      ],
      { defaultValue: 'open', inList: true, group: 'Status' },
    ),
    f.datetime('opensAt', 'Opens', { group: 'Status' }),
    f.bool('resultsRevealed', 'Results visible', {
      defaultValue: true,
      group: 'Status',
      hint: 'Off keeps the tally hidden until the poll closes.',
    }),
    f.bool('allowDiscussion', 'Allow discussion', { defaultValue: true, group: 'Status' }),

    f.enumOf('priority', 'Priority', OPTIONS.priority, { group: 'Organising' }),
    f.text('category', 'Category', { group: 'Organising', searchable: true }),
    f.tags('tags', 'Tags', { group: 'Organising' }),
    f.bool('isPinned', 'Pinned', { group: 'Organising' }),
    f.bool('isArchived', 'Archived', { group: 'Organising' }),
    f.color('color', 'Colour', { group: 'Appearance' }),
    f.text('icon', 'Symbol', { maxLength: 8, group: 'Appearance' }),
    f.image('bannerUrl', 'Banner', { group: 'Appearance' }),
  ],
};

export const pollVotes: CollectionDef = {
  name: 'pollVotes',
  label: 'Poll votes',
  singular: 'Vote',
  icon: 'poll',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  memberScoped: true,
  titleField: 'pollId',
  sortField: 'createdAt',
  sortDir: 'desc',
  indexes: [['systemId', 'pollId']],
  neverPublic: true,
  fields: [
    f.ref('pollId', 'Poll', 'polls', { required: true }),
    f.json('optionIds', 'Chosen options', { required: true, defaultValue: [] }),
    f.long('comment', 'Comment'),
  ],
};

export const achievements: CollectionDef = {
  name: 'achievements',
  label: 'Achievements',
  singular: 'Achievement',
  icon: 'achievement',
  area: 'system',
  scope: 'system',
  titleField: 'achievementKey',
  sortField: 'unlockedAt',
  sortDir: 'desc',
  indexes: [['systemId', 'achievementKey']],
  fields: [
    f.text('achievementKey', 'Achievement', { required: true, inList: true }),
    f.datetime('unlockedAt', 'Unlocked', { required: true, inList: true }),
    f.int('progress', 'Progress', { defaultValue: 0 }),
    f.bool('seen', 'Seen'),
  ],
};

export const headspaceMaps: CollectionDef = {
  name: 'headspaceMaps',
  label: 'Headspace maps',
  singular: 'Map',
  icon: 'headspace',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  titleField: 'name',
  sortField: 'sortOrder',
  sortDir: 'asc',
  description: 'A canvas of the inner world. The app supplies the surface, not the interpretation.',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.long('description', 'Description', { searchable: true }),
    f.json('viewport', 'Saved viewport'),
    f.json('layers', 'Layers'),
    f.color('background', 'Background'),
    f.int('sortOrder', 'Order', { defaultValue: 0 }),
    f.bool('isDefault', 'Default map'),
  ],
};

export const headspaceObjects: CollectionDef = {
  name: 'headspaceObjects',
  label: 'Headspace objects',
  singular: 'Object',
  icon: 'headspace',
  area: 'system',
  scope: 'system',
  systemOnly: true,
  memberScoped: true,
  titleField: 'label',
  sortField: 'z',
  sortDir: 'asc',
  indexes: [['systemId', 'mapId']],
  fields: [
    f.ref('mapId', 'Map', 'headspaceMaps', { required: true }),
    f.enumOf('kind', 'Kind', [
      { value: 'room', label: 'Room' },
      { value: 'region', label: 'Region' },
      { value: 'landmark', label: 'Landmark' },
      { value: 'object', label: 'Object' },
      { value: 'label', label: 'Label' },
      { value: 'member', label: 'Member marker' },
      { value: 'connection', label: 'Connection' },
      { value: 'decoration', label: 'Decoration' },
    ], { required: true, defaultValue: 'room', inList: true }),
    f.text('label', 'Label', { inList: true, searchable: true }),
    f.long('description', 'Description', { searchable: true }),
    f.real('x', 'X', { defaultValue: 0 }),
    f.real('y', 'Y', { defaultValue: 0 }),
    f.real('width', 'Width', { defaultValue: 160 }),
    f.real('height', 'Height', { defaultValue: 120 }),
    f.real('rotation', 'Rotation', { defaultValue: 0 }),
    f.int('z', 'Layer order', { defaultValue: 0 }),
    f.text('layer', 'Layer', { defaultValue: 'base' }),
    f.color('color', 'Colour'),
    f.text('icon', 'Symbol', { maxLength: 8 }),
    f.image('imageUrl', 'Image'),
    f.text('shape', 'Shape', { defaultValue: 'rounded' }),
    f.text('connectsToId', 'Connects to'),
    f.json('meta', 'Extra'),
  ],
};

export const templates: CollectionDef = {
  name: 'templates',
  label: 'My templates',
  singular: 'Template',
  icon: 'template',
  area: 'system',
  scope: 'system',
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  description: 'Reusable starting points for any record type.',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.text('targetCollection', 'For', { required: true, inList: true }),
    f.long('description', 'Description', { searchable: true }),
    f.json('payload', 'Template contents', { required: true }),
    f.text('icon', 'Symbol', { maxLength: 8 }),
    f.color('color', 'Colour'),
    f.int('useCount', 'Times used', { defaultValue: 0 }),
  ],
};

export const tags: CollectionDef = {
  name: 'tags',
  label: 'Tags',
  singular: 'Tag',
  icon: 'tag',
  area: 'system',
  scope: 'system',
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.color('color', 'Colour'),
    f.text('scopeCollection', 'Used for'),
    f.int('useCount', 'Uses', { defaultValue: 0 }),
  ],
};

export const SYSTEM_COLLECTIONS = [
  members,
  subsystems,
  memberGroups,
  frontEvents,
  journalEntries,
  systemHistory,
  relationships,
  flags,
  flagAssignments,
  systemChatMessages,
  bulletinPosts,
  polls,
  pollVotes,
  achievements,
  headspaceMaps,
  headspaceObjects,
  templates,
  tags,
] as const;

export { FRONT_STATUS, HISTORY_CATEGORIES, OPTIONS };
